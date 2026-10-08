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

# 🟢 MUTATION GUARD FOR READ-ONLY GLOBAL OBSERVERS
def enforce_mutation_clearance(current_user: models.Users):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    
    user_role = (current_user.role or "").strip().upper()
    is_super_admin = user_role == "SUPER_ADMIN"
    
    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except: perms = {}
        
    is_readonly_observer = perms.get("global_observer") is True and perms.get("global_open") is not True and not is_super_admin
    
    if is_readonly_observer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Read-only global observer clearance strictly prohibits data mutation, file downloads, or administrative approvals."
        )

# 🟢 DELEGATION, JURISDICTION & INTELLIGENT FAILOVER CHECKER
def verify_admin_delegation(current_user: models.Users, db: Session):
    if not current_user:
        return {"is_global": False, "is_admin": False}
        
    user_role = (current_user.role or "").strip().upper()
    user_position = (current_user.position or "").strip().upper()
    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}

    # 🟢 ENSURE GLOBAL OBSERVER & OPEN FLAGS GRANT GLOBAL SCOPE
    is_global = (
        user_role in ["SUPER_ADMIN", "SYSTEM_ADMIN", "ASSISTANT_SUPER_ADMIN"] or
        "SYSTEM MANAGER" in user_position or
        perms.get("view_global_roster") is True or
        perms.get("global_observer") is True or
        perms.get("global_open") is True or
        current_user.region in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"]
    )

    is_native_admin = (
        is_global or
        user_role in ["ADMIN", "REGIONAL_ADMIN", "STATION_ADMIN", "RPC", "OC", "DIVISION_ADMIN"] or
        "RPC" in user_position or
        "OC" in user_position or
        perms.get("can_approve") is True or
        perms.get("view_regional_roster") is True or
        perms.get("manage_station_users") is True
    )

    # Intelligent Failover (RPC downwards): If superior in jurisdiction is offline > 1 hour or manually delegating proxy
    inherited_delegation = False
    if not is_global and not is_native_admin:
        eat_tz = pytz.timezone('Africa/Nairobi')
        now_eat = datetime.now(eat_tz).replace(tzinfo=None)
        one_hour_ago = now_eat - timedelta(hours=1)

        superiors = db.query(models.Users).filter(
            models.Users.is_approved == True,
            models.Users.fnum != current_user.fnum
        )
        if current_user.region:
            superiors = superiors.filter(func.upper(models.Users.region) == func.upper(current_user.region))

        for sup in superiors.all():
            sup_role = (sup.role or "").upper()
            if sup_role in ["RPC", "REGIONAL_ADMIN", "STATION_ADMIN", "SYSTEM_MANAGER"]:
                sup_perms = sup.permissions or {}
                if isinstance(sup_perms, str):
                    try: sup_perms = json.loads(sup_perms)
                    except: sup_perms = {}

                is_sup_offline = not sup.last_active_at or sup.last_active_at < one_hour_ago
                is_sup_manually_delegating = sup_perms.get("manual_delegation") is True

                if is_sup_offline or is_sup_manually_delegating:
                    inherited_delegation = True
                    break

    is_delegated_admin = is_native_admin or inherited_delegation

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
    delegation = verify_admin_delegation(current_user, db)
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
        changes_summary=f"{current_user.fnum} inspected pending authorizations roster."
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
    enforce_mutation_clearance(current_user)
    delegation = verify_admin_delegation(current_user, db)
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
                raise HTTPException(status_code=403, detail="Delegation Denied: Officer belongs outside your station jurisdiction.")

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
        changes_summary=f"{current_user.fnum} authorized command account for officer {clean_fnum}."
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
        delegation = verify_admin_delegation(current_user, db)
        
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
    enforce_mutation_clearance(current_user)
    delegation = verify_admin_delegation(current_user, db)
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
        new_perms = payload["permissions"]
        if isinstance(new_perms, str):
            try: new_perms = json.loads(new_perms)
            except: new_perms = {}
            
        # 🟢 RING-FENCE GLOBAL OPEN / FULL ACCESS TO SUPER ADMINS ONLY
        if new_perms.get("global_open") is True:
            current_role = (current_user.role or "").strip().upper()
            if current_role != "SUPER_ADMIN":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Security Violation: Only Super Admins can grant Global Full Access (Open/Editable)."
                )
        target_user.permissions = new_perms

    db.commit()

    record_neon_activity(
        logs_db=logs_db, fnum=current_user.fnum, action_type="UPDATE", module="USER_ACCESS",
        target_id=clean_fnum, changes_summary=f"{current_user.fnum} updated access matrix for {clean_fnum}."
    )

    return {"status": "success", "message": f"User {clean_fnum} updated successfully."}


# 5. MANUAL DELEGATION TOGGLE ENDPOINT FOR COMMANDERS
@router.post("/toggle-my-delegation")
def toggle_my_delegation(
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    enforce_mutation_clearance(current_user)
    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except: perms = {}
    
    current_state = perms.get("manual_delegation", False)
    perms["manual_delegation"] = not current_state
    current_user.permissions = perms
    db.commit()
    return {
        "status": "success", 
        "manual_delegation": perms["manual_delegation"], 
        "message": f"Delegation mode {'activated' if perms['manual_delegation'] else 'deactivated'}."
    }


# 6. REVOKE / REJECT USER ACCESS (MOVE TO VAULT)
@router.delete("/users/{fnum:path}/revoke")
def revoke_user_access(
    fnum: str,
    reason: Optional[str] = Query(default="Administrative Revocation"),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    enforce_mutation_clearance(current_user)
    delegation = verify_admin_delegation(current_user, db)
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
    return {"status": "success", "message": f"Officer {clean_fnum} access revoked."}


# 7. PERMANENT DELETE USER RECORD (SUPER ADMIN ONLY)
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
    return {"status": "success", "message": f"Record {clean_fnum} permanently purged."}


# 8. FORCE PASSWORD RESET (SUPER ADMIN ONLY)
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
    return {"status": "success", "message": f"Password successfully updated for {clean_fnum}."}


# 9. SYSTEM LOCKDOWN STATUS & MAINTENANCE TOGGLE
@router.get("/lockdown/status")
def get_lockdown_status(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    return {"system_lockdown": False, "active_regions": [], "active_stations": []}

@router.post("/toggle-maintenance")
def toggle_maintenance(payload: dict = Body(...), db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    if (current_user.role or "").strip().upper() != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Security Restriction: Only Super Admins can manage system lockdowns.")
    return {"status": "success", "message": "Command maintenance executed."}


# 10. USER HEARTBEAT & ONLINE STATUS
@router.post("/users/heartbeat")
@router.post("/users/heartbeat/")
def heartbeat(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        eat_tz = pytz.timezone('Africa/Nairobi')
        current_user.last_active_at = datetime.now(eat_tz).replace(tzinfo=None)
        db.commit()
        return {"status": "alive"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/online")
def get_online_users(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    eat_tz = pytz.timezone('Africa/Nairobi')
    threshold = datetime.now(eat_tz).replace(tzinfo=None) - timedelta(minutes=2)
    active_users = db.query(models.Users).filter(models.Users.is_approved == True, models.Users.last_active_at >= threshold).all()
    return [{"fnum": u.fnum, "name": u.name, "station": u.station, "profile_photo_path": u.profile_photo_path} for u in active_users]