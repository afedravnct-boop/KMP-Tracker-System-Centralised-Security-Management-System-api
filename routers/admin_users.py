from urllib.parse import unquote
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime, timedelta
import pytz

from app import models
from app.database import get_db, get_logs_db
from auth import get_current_user  
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1/admin", tags=["Admin Users"])

# 🟢 STRICT HIERARCHY CHECKER
def is_high_command_admin(current_user: models.Users):
    if not current_user:
        return False
    user_role = (current_user.role or "").strip().upper()
    user_position = (current_user.position or "").strip().upper()
    
    return user_role in ["SUPER_ADMIN", "SYSTEM_ADMIN"] or "SYSTEM MANAGER" in user_position

@router.patch("/approve-user/{fnum:path}")
@router.put("/users/{fnum:path}/approve")
def approve_pending_user(
    fnum: str,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)  
):
    if not is_high_command_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: Only Super Admins and System Admins possess the authority to approve command accounts."
        )

    clean_fnum = unquote(fnum).strip().upper()
    
    target_user = db.query(models.Users).filter(
        func.trim(func.upper(models.Users.fnum)) == clean_fnum,
        models.Users.is_approved == False
    ).first()
    
    if not target_user:
        raise HTTPException(
            status_code=404, 
            detail=f"Officer '{clean_fnum}' was not found in system pending records."
        )

    target_user.is_approved = True
    if hasattr(target_user, 'status'):
        target_user.status = "ACTIVE"
    if hasattr(target_user, 'is_active'):
        target_user.is_active = True

    db.commit()

    # 🟢 Record precise forensic REGISTER/APPROVE action into NeonDB Activity Logs branch
    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="REGISTER",
        module="USER_ACCOUNTS",
        target_id=clean_fnum,
        changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} approved and authorized command account for officer {clean_fnum}."
    )

    return {"status": "success", "message": f"Officer {clean_fnum} successfully authorized."}

@router.get("/pending-users")
@router.get("/users/pending")
def get_pending_users(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)  
):
    if not is_high_command_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: Only Super Admins and System Admins can view the pending approval roster."
        )

    query = db.query(models.Users).filter(models.Users.is_approved == False)
    pending_users = query.order_by(models.Users.id.desc()).all()

    # 🟢 Record precise forensic VIEW activity into NeonDB Activity Logs branch
    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="VIEW",
        module="USER_ACCOUNTS",
        target_id="PENDING_ROSTER",
        changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} inspected pending user authorizations roster (Fetched {len(pending_users)} pending records)."
    )

    return pending_users


@router.get("/users")
def get_all_active_users(
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        query = db.query(models.Users).filter(models.Users.is_approved == True)
        perms = current_user.permissions or {}
        user_role = (current_user.role or "").upper()
        user_position = (current_user.position or "").upper()
        
        is_global = (
            user_role == "SUPER_ADMIN" or 
            perms.get("global_observer", False) == True or 
            perms.get("view_global_roster", False) or
            "KMP COMMANDER" in user_position or
            "DEPUTY KMP COMMANDER" in user_position or
            current_user.region in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"]
        )
        
        if not is_global:
            is_regional = (user_role == "RPC" or "RPC" in user_position or perms.get("view_regional_roster", False))
            if is_regional:
                query = query.filter(func.upper(models.Users.region) == func.upper(current_user.region))
            else:
                query = query.filter(func.upper(models.Users.station) == func.upper(current_user.station))
                
        # 🟢 Apply search filtering if search keyword is provided
        if search:
            term = f"%{search.strip().upper()}%"
            query = query.filter(or_(
                models.Users.name.ilike(term),
                models.Users.fnum.ilike(term),
                models.Users.rank.ilike(term),
                models.Users.station.ilike(term),
                models.Users.ipps.ilike(term)
            ))

        users = query.all()

        # 🟢 Precision forensic check: log search query vs regular active roster view
        if search:
            summary_text = f"{current_user.fnum} {current_user.rank} {current_user.name} searched active officers directory for query: \"{search}\" (Returned {len(users)} matches)."
        else:
            summary_text = f"{current_user.fnum} {current_user.rank} {current_user.name} accessed active users directory roster (Fetched {len(users)} profiles)."

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="VIEW",
            module="USER_ROSTER",
            target_id=search if search else "ACTIVE_USERS",
            changes_summary=summary_text
        )

        return [
            {
                "fnum": u.fnum, "name": u.name, "rank": u.rank, "role": u.role, 
                "station": u.station, "region": u.region, "division": u.division,
                "position": u.position, "email": u.email, "phone": u.phone,
                "ipps": u.ipps, "sex": u.sex, "profile_photo_path": u.profile_photo_path,
                "permissions": u.permissions
            } for u in users
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/users/heartbeat")
@router.post("/users/heartbeat/")
def heartbeat(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        eat_tz = pytz.timezone('Africa/Nairobi')
        current_time = datetime.now(eat_tz).replace(tzinfo=None)
        current_user.last_active_at = current_time
        db.commit()
        return {"status": "alive"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/online")
def get_online_users(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    eat_tz = pytz.timezone('Africa/Nairobi')
    now_eat = datetime.now(eat_tz).replace(tzinfo=None)
    threshold = now_eat - timedelta(minutes=2)
    
    active_users = db.query(models.Users).filter(
        models.Users.is_approved == True,
        models.Users.last_active_at >= threshold
    ).all()
    
    return [
        {
            "fnum": u.fnum,
            "name": u.name,
            "station": u.station,
            "profile_photo_path": u.profile_photo_path
        } for u in active_users
    ]