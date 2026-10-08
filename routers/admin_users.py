# routers/admin_users.py
from urllib.parse import unquote
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime, timedelta
import pytz
import json

from app import models
from app.database import get_db, get_logs_db
from auth import get_current_user  
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1/admin", tags=["Admin Users"])

# 🟢 DELEGATION & JURISDICTION CHECKER
def verify_admin_delegation(current_user: models.Users):
    if not current_user:
        return {"is_global": False, "is_admin": False}
        
    user_role = (current_user.role or "").strip().upper()
    user_position = (current_user.position or "").strip().upper()
    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}

    is_global = (
        user_role in ["SUPER_ADMIN", "SYSTEM_ADMIN", "ASSISTANT_SUPER_ADMIN"] or
        "SYSTEM MANAGER" in user_position or
        perms.get("view_global_roster") is True or
        current_user.region in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"]
    )

    is_delegated_admin = (
        is_global or
        user_role in ["ADMIN", "REGIONAL_ADMIN", "STATION_ADMIN", "RPC", "OC", "ADMIN_USER", "DIVISION_ADMIN"] or
        "RPC" in user_position or
        "OC" in user_position or
        perms.get("can_approve") is True or
        perms.get("view_regional_roster") is True or
        perms.get("manage_station_users") is True
    )

    return {
        "is_global": is_global,
        "is_admin": is_delegated_admin
    }

# 1. PENDING USERS ROSTER
@router.get("/pending-users")
@router.get("/users/pending")
def get_pending_users(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)  
):
    delegation = verify_admin_delegation(current_user)
    if not delegation["is_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: You lack administrative delegation to view pending authorizations."
        )

    query = db.query(models.Users).filter(models.Users.is_approved == False)

    if not delegation["is_global"]:
        user_role = (current_user.role or "").upper()
        user_pos = (current_user.position or "").upper()
        is_regional = user_role in ["REGIONAL_ADMIN", "RPC"] or "RPC" in user_pos

        if is_regional and current_user.region:
            query = query.filter(func.upper(models.Users.region) == func.upper(current_user.region))
        elif current_user.station:
            query = query.filter(func.upper(models.Users.station) == func.upper(current_user.station))

    pending_users = query.order_by(models.Users.id.desc()).all()

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="VIEW",
        module="USER_ACCOUNTS",
        target_id="PENDING_ROSTER",
        changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} inspected jurisdiction-scoped pending authorizations roster (Fetched {len(pending_users)} records)."
    )

    return pending_users


# 2. APPROVE PENDING USER
@router.patch("/approve-user/{fnum:path}")
@router.put("/users/{fnum:path}/approve")
def approve_pending_user(
    fnum: str,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)  
):
    delegation = verify_admin_delegation(current_user)
    if not delegation["is_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: You lack administrative delegation to approve command accounts."
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

    if not delegation["is_global"]:
        user_role = (current_user.role or "").upper()
        user_pos = (current_user.position or "").upper()
        is_regional = user_role in ["REGIONAL_ADMIN", "RPC"] or "RPC" in user_pos
        
        if is_regional:
            if not current_user.region or not target_user.region or target_user.region.upper() != current_user.region.upper():
                raise HTTPException(status_code=403, detail="Delegation Denied: Officer belongs outside your regional command scope.")
        else:
            if not current_user.station or not target_user.station or target_user.station.upper() != current_user.station.upper():
                raise HTTPException(status_code=403, detail="Delegation Denied: Officer belongs outside your station/division jurisdiction.")

    target_user.is_approved = True
    if hasattr(target_user, 'status'):
        target_user.status = "ACTIVE"
    if hasattr(target_user, 'is_active'):
        target_user.is_active = True

    db.commit()

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="REGISTER",
        module="USER_ACCOUNTS",
        target_id=clean_fnum,
        changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} approved and authorized command account for officer {clean_fnum} within delegated jurisdiction."
    )

    return {"status": "success", "message": f"Officer {clean_fnum} successfully authorized."}


# 3. GET ALL ACTIVE USERS (DIRECTORY ROSTER / MATRIX)
@router.get("/users")
def get_all_active_users(
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        query = db.query(models.Users).filter(models.Users.is_approved == True)
        delegation = verify_admin_delegation(current_user)
        
        if not delegation["is_global"]:
            user_role = (current_user.role or "").upper()
            user_position = (current_user.position or "").upper()
            is_regional = (user_role == "RPC" or "RPC" in user_position or (current_user.permissions or {}).get("view_regional_roster", False))
            
            if is_regional and current_user.region:
                query = query.filter(func.upper(models.Users.region) == func.upper(current_user.region))
            elif current_user.station:
                query = query.filter(func.upper(models.Users.station) == func.upper(current_user.station))
                
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

        summary_text = f"{current_user.fnum} {current_user.rank} {current_user.name} accessed active users directory roster (Fetched {len(users)} profiles)."
        if search:
            summary_text = f"{current_user.fnum} {current_user.rank} {current_user.name} searched active officers directory for query: \"{search}\" (Returned {len(users)} matches)."

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


# 4. UPDATE USER ACCESS, ROLES & PERMISSIONS (CLEARANCE MATRIX / DELEGATION)
@router.put("/users/{fnum:path}/access")
def update_user_access(
    fnum: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    delegation = verify_admin_delegation(current_user)
    if not delegation["is_admin"]:
        raise HTTPException(status_code=403, detail="Clearance Denied: Unauthorized to modify user clearances.")

    clean_fnum = unquote(fnum).strip().upper()
    target_user = db.query(models.Users).filter(func.trim(func.upper(models.Users.fnum)) == clean_fnum).first()
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User {clean_fnum} not found.")

    if not delegation["is_global"]:
        if target_user.station and current_user.station and target_user.station.upper() != current_user.station.upper():
            raise HTTPException(status_code=403, detail="Delegation Denied: Officer is outside your station jurisdiction.")

    if "role" in payload:
        target_user.role = payload["role"]
    if "is_approved" in payload:
        target_user.is_approved = payload["is_approved"]
    if "permissions" in payload:
        target_user.permissions = payload["permissions"]

    db.commit()

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="UPDATE",
        module="USER_ACCESS",
        target_id=clean_fnum,
        changes_summary=f"{current_user.fnum} updated access matrix / role for officer {clean_fnum}."
    )

    return {"status": "success", "message": f"User {clean_fnum} updated successfully."}


# 5. REVOKE / REJECT USER ACCESS (MOVE TO VAULT)
@router.delete("/users/{fnum:path}/revoke")
def revoke_user_access(
    fnum: str,
    reason: Optional[str] = Query(default="Administrative Revocation"),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    delegation = verify_admin_delegation(current_user)
    if not delegation["is_admin"]:
        raise HTTPException(status_code=403, detail="Clearance Denied: Unauthorized to revoke user access.")

    clean_fnum = unquote(fnum).strip().upper()
    target_user = db.query(models.Users).filter(func.trim(func.upper(models.Users.fnum)) == clean_fnum).first()
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User {clean_fnum} not found.")

    target_user.role = "REVOKED"
    target_user.is_approved = False
    if hasattr(target_user, 'is_active'):
        target_user.is_active = False

    db.commit()

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="REVOKE",
        module="USER_ACCOUNTS",
        target_id=clean_fnum,
        changes_summary=f"{current_user.fnum} revoked access for officer {clean_fnum}. Reason: {reason}"
    )

    return {"status": "success", "message": f"Officer {clean_fnum} access revoked."}


# 6. PERMANENT DELETE USER RECORD (SUPER ADMIN ONLY)
@router.delete("/users/{fnum:path}/permanent-delete")
def permanent_delete_user(
    fnum: str,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    user_role = (current_user.role or "").strip().upper()
    if user_role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Security Restriction: Only Super Admins can permanently purge records.")

    clean_fnum = unquote(fnum).strip().upper()
    target_user = db.query(models.Users).filter(func.trim(func.upper(models.Users.fnum)) == clean_fnum).first()
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User {clean_fnum} not found.")

    db.delete(target_user)
    db.commit()

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="DELETE",
        module="USER_ACCOUNTS",
        target_id=clean_fnum,
        changes_summary=f"Super Admin {current_user.fnum} permanently purged record for {clean_fnum}."
    )

    return {"status": "success", "message": f"Record {clean_fnum} permanently purged."}


# 7. FORCE PASSWORD RESET (SUPER ADMIN ONLY)
@router.put("/users/{fnum:path}/force-password")
def force_password_reset(
    fnum: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    if (current_user.role or "").strip().upper() != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Security Restriction: Only Super Admins can force password resets.")

    clean_fnum = unquote(fnum).strip().upper()
    target_user = db.query(models.Users).filter(func.trim(func.upper(models.Users.fnum)) == clean_fnum).first()
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User {clean_fnum} not found.")

    new_password = payload.get("new_password")
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    target_user.hashed_password = pwd_context.hash(new_password)
    db.commit()

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="UPDATE",
        module="PASSWORD_RESET",
        target_id=clean_fnum,
        changes_summary=f"Super Admin {current_user.fnum} forced password reset for {clean_fnum}."
    )

    return {"status": "success", "message": f"Password successfully updated for {clean_fnum}."}


# 8. SYSTEM LOCKDOWN STATUS & MAINTENANCE TOGGLE
@router.get("/lockdown/status")
def get_lockdown_status(
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    # Allow all authenticated users to check lockdown status for warning banners
    return {
        "system_lockdown": False,
        "active_regions": [],
        "active_stations": []
    }

@router.post("/toggle-maintenance")
def toggle_maintenance(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    if (current_user.role or "").strip().upper() != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Security Restriction: Only Super Admins can manage system lockdowns.")
    return {"status": "success", "message": "Command maintenance executed."}


# 9. USER HEARTBEAT & ONLINE STATUS
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