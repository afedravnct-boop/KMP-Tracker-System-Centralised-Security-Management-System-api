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

# 🟢 HELPER: APPEND AUDIT TIMELINE EVENT TO USER PROFILE
def append_user_audit_event(target_user: models.Users, action_type: str, actor_fnum: str, details: str):
    eat_tz = pytz.timezone('Africa/Nairobi')
    now_str = datetime.now(eat_tz).strftime("%A, %d %b %Y @ %H:%M:%S EAT")
    
    current_perms = target_user.permissions or {}
    if isinstance(current_perms, str):
        try: current_perms = json.loads(current_perms)
        except: current_perms = {}
        
    audit_history = current_perms.get("_audit_history", [])
    if not isinstance(audit_history, list):
        audit_history = []
        
    audit_history.insert(0, {
        "timestamp": now_str,
        "action": action_type,
        "actor": actor_fnum,
        "details": details
    })
    
    current_perms["_audit_history"] = audit_history
    target_user.permissions = current_perms

# 🟢 STRICT HIGH COMMAND CLEARANCE CHECK FOR MASTER BYPASS / GLOBAL OPEN
def check_master_clearance(current_user: models.Users) -> bool:
    if not current_user:
        return False
    role = (current_user.role or "").strip().upper()
    pos = (current_user.position or "").strip().upper()

    allowed_roles = ["SUPER_ADMIN", "ASSISTANT_SUPER_ADMIN"]
    allowed_position_keywords = [
        "PRINCIPAL SUPER ADMIN",
        "SUPER ADMIN",
        "ASSISTANT SUPER ADMIN",
        "KMP COMMANDER",
        "DEPUTY KMP COMMANDER",
        "KMP ADMIN OFFICER"
    ]

    if role in allowed_roles:
        return True

    for keyword in allowed_position_keywords:
        if keyword in pos:
            return True

    return False

# 🟢 COMMAND SENIORITY RANKING FOR HIERARCHICAL LOCKS
def get_command_tier(user: models.Users) -> int:
    if not user:
        return 0
    fnum = (user.fnum or "").strip().upper()
    role = (user.role or "").strip().upper()
    pos = (user.position or "").strip().upper()

    # Principal Super Admin (Apex Tier 5)
    if "A/2408" in fnum or "PRINCIPAL" in pos:
        return 5
    if role == "SUPER_ADMIN" or "SUPER ADMIN" in pos:
        return 4
    if role == "ASSISTANT_SUPER_ADMIN" or "KMP COMMANDER" in pos:
        return 3
    if "DEPUTY KMP COMMANDER" in pos or "KMP ADMIN OFFICER" in pos:
        return 2
    if role in ["ADMIN", "REGIONAL_ADMIN", "RPC"]:
        return 1
    return 0

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

    # Append approval event to embedded profile audit trail
    append_user_audit_event(target_user, "ACCOUNT_APPROVED", current_user.fnum, f"Account successfully approved and authorized by {current_user.fnum}")

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


# 4. UPDATE USER ACCESS, ROLES & PERMISSIONS (CLEARANCE MATRIX / DELEGATION WITH HIERARCHICAL LOCK)
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
        old_role = target_user.role
        target_user.role = payload["role"]
        if old_role != payload["role"]:
            append_user_audit_event(target_user, "ROLE_CHANGE", current_user.fnum, f"Role changed from {old_role} to {payload['role']}")

    if "is_approved" in payload:
        target_user.is_approved = payload["is_approved"]

    if "permissions" in payload:
        new_perms = payload["permissions"]
        if isinstance(new_perms, str):
            try: new_perms = json.loads(new_perms)
            except: new_perms = {}

        current_perms = target_user.permissions or {}
        if isinstance(current_perms, str):
            try: current_perms = json.loads(current_perms)
            except: current_perms = {}

        # 🟢 EXTRACT METADATA LOCKS (TRACKING WHO REVOKED/LOCKED PERMISSIONS)
        clearance_locks = current_perms.get("_clearance_locks", {})
        if not isinstance(clearance_locks, dict):
            clearance_locks = {}

        actor_tier = get_command_tier(current_user)
        actor_fnum = (current_user.fnum or "").strip().upper()
        is_principal_super_admin = "A/2408" in actor_fnum or actor_tier >= 5

        # 🟢 HIERARCHICAL LOCK VALIDATION: PREVENT LOWER-TIER ADMINS FROM REINSTATING SUPERIOR REVOCATIONS
        for perm_key, new_val in new_perms.items():
            if perm_key.startswith("_"):
                continue
            
            old_val = current_perms.get(perm_key, False)
            
            # If permission was previously true and is now being turned off (revoked/unchecked)
            if old_val is True and new_val is False:
                clearance_locks[perm_key] = {
                    "revoked_by_fnum": actor_fnum,
                    "revoked_by_name": current_user.name,
                    "tier": actor_tier,
                    "timestamp": datetime.now(pytz.timezone('Africa/Nairobi')).isoformat()
                }
                append_user_audit_event(target_user, "PERMISSION_REVOKED", actor_fnum, f"Granular clearance '{perm_key}' was revoked/unchecked.")
            
            # If permission was previously false (or revoked) and is now being turned on (reinstated/checked)
            elif old_val is False and new_val is True:
                lock_info = clearance_locks.get(perm_key)
                if lock_info:
                    lock_tier = lock_info.get("tier", 0)
                    locked_by_fnum = lock_info.get("revoked_by_fnum", "")
                    
                    # Strict restriction: If revoked by Principal Super Admin (A/2408), ONLY A/2408 can reinstate it
                    if "A/2408" in locked_by_fnum and not is_principal_super_admin:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Security Violation: Clearance '{perm_key}' was revoked by Principal Super Admin A/2408. No other administrator can reinstate it."
                        )
                    
                    # General hierarchical lock: If revoked by an equal or superior tier, current actor cannot override unless higher tier
                    if actor_tier < lock_tier and not is_principal_super_admin:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Security Violation: Clearance '{perm_key}' was locked by a superior command authority. You lack sufficient clearance rank to reinstate it."
                        )
                
                # If successfully reinstated by authorized tier, clear the lock record
                if perm_key in clearance_locks:
                    del clearance_locks[perm_key]
                append_user_audit_event(target_user, "PERMISSION_REINSTATED", actor_fnum, f"Granular clearance '{perm_key}' was checked/reinstated.")

        new_perms["_clearance_locks"] = clearance_locks
        # Preserve existing audit history across permission payloads
        new_perms["_audit_history"] = current_perms.get("_audit_history", [])

        # 🟢 RING-FENCE GLOBAL OPEN / BYPASS CLEARANCE TO AUTHORIZED HIGH COMMAND ONLY
        if new_perms.get("global_open") is True or new_perms.get("bypass_jurisdiction") is True:
            if not check_master_clearance(current_user):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Security Violation: Only Principal Super Admins, Super Admins, Assistant Super Admins, KMP Commanders, Deputy KMP Commanders, and KMP Admin Officers can grant Global Full Access / Bypass Clearance."
                )
        target_user.permissions = new_perms

    db.commit()

    record_neon_activity(
        logs_db=logs_db, fnum=current_user.fnum, action_type="UPDATE", module="USER_ACCESS",
        target_id=clean_fnum, changes_summary=f"{current_user.fnum} updated access matrix and granular clearances for {clean_fnum}."
    )

    return {"status": "success", "message": f"User {clean_fnum} access updated successfully."}


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

    append_user_audit_event(target_user, "ACCOUNT_REVOKED", current_user.fnum, f"Account access revoked. Reason: {reason}")

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
    
    append_user_audit_event(target_user, "PASSWORD_RESET", current_user.fnum, "Administrative force password reset executed.")
    
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