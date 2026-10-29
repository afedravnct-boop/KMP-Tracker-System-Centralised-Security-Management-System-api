import os
import asyncio
from urllib.parse import unquote
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from datetime import datetime, timedelta
import pytz
import json

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema

from app import models, database
from app.database import get_db, get_logs_db
from auth import get_current_user  
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1/admin", tags=["Admin Users"])

# Configure Mail (pulling from environment variables)
conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_PORT=465,               # 🟢 Switch to Port 465
    MAIL_SERVER="smtp.gmail.com",
    MAIL_STARTTLS=False,         # 🟢 Must be False for Port 465
    MAIL_SSL_TLS=True            # 🟢 Must be True for Port 465
)

async def send_email_notification(email_to: List[str], subject: str, html_body: str):
    if not email_to or not conf.MAIL_USERNAME or not conf.MAIL_PASSWORD:
        return
    message = MessageSchema(
        subject=subject,
        recipients=email_to,
        body=html_body,
        subtype="html"
    )
    fm = FastMail(conf)
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"❌ Failed to dispatch email notification: {e}")

async def notify_admins_of_signup(user_data, db: Session):
    admins = db.query(models.Users.email).filter(
        models.Users.email.isnot(None),
        models.Users.is_approved == True,
        or_(
            models.Users.role.in_(['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN']),
            and_(
                func.upper(models.Users.region) == str(user_data.get('region', '')).strip().upper(),
                models.Users.role.in_(['REGIONAL_ADMIN', 'STATION_ADMIN', 'SYSTEM_MANAGER'])
            )
        )
    ).all()
    
    admin_emails = [a[0] for a in admins if a[0] and '@' in a[0]]
    if not admin_emails:
        return

    subject = f"🚨 NEW SIGNUP PENDING APPROVAL: {user_data.get('rank')} {user_data.get('name')} ({user_data.get('fnum')})"
    html_body = f"""
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #cbd5e1; border-radius: 8px;">
        <h2 style="color: #2563eb; margin-top: 0;">New Officer Registration Request</h2>
        <p>A new user has submitted a signup request requiring your review and command authorization:</p>
        <ul style="line-height: 1.6;">
            <li><strong>Force Number (F/No):</strong> {user_data.get('fnum')}</li>
            <li><strong>Rank & Name:</strong> {user_data.get('rank')} {user_data.get('name')}</li>
            <li><strong>Station / Region:</strong> {user_data.get('station')} / {user_data.get('region')}</li>
            <li><strong>Position:</strong> {user_data.get('position')}</li>
            <li><strong>Email:</strong> {user_data.get('email')}</li>
        </ul>
        <p>Please log in to the <strong>KMP Centralised Security Data Management System</strong> under <em>Access & Command Approvals</em> to approve or reject this request.</p>
    </div>
    """
    await send_email_notification(admin_emails, subject, html_body)

async def notify_user_approval_status(user_email, user_name, is_approved: bool, reason: str = ""):
    if not user_email or '@' not in user_email:
        return
    
    if is_approved:
        subject = "✅ UPF System Access Approved"
        html_body = f"""
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #cbd5e1; border-radius: 8px;">
            <h2 style="color: #16a34a; margin-top: 0;">Access Authorized</h2>
            <p>Dear {user_name},</p>
            <p>Your registration request for the <strong>KMP Centralised Security Data Management System</strong> has been <strong>APPROVED</strong> by command.</p>
            <p>You can now log in securely using your credentials.</p>
        </div>
        """
    else:
        subject = "⛔ UPF System Access Request Declined"
        html_body = f"""
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #cbd5e1; border-radius: 8px;">
            <h2 style="color: #dc2626; margin-top: 0;">Access Request Declined</h2>
            <p>Dear {user_name},</p>
            <p>Your registration request for the <strong>KMP Centralised Security Data Management System</strong> was reviewed and <strong>DECLINED</strong>.</p>
            <p><strong>Reason / Remarks:</strong> {reason}</p>
        </div>
        """
    await send_email_notification([user_email], subject, html_body)

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
        return {"is_global": False, "is_admin": False, "scope_level": "NONE", "region": None}
        
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
    active_scope = "STATION"
    
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
            if sup_role in ["RPC", "REGIONAL_ADMIN", "SYSTEM_MANAGER"] or "RPC" in (sup.position or "").upper():
                sup_perms = sup.permissions or {}
                if isinstance(sup_perms, str):
                    try: sup_perms = json.loads(sup_perms)
                    except: sup_perms = {}

                is_sup_offline = not sup.last_active_at or sup.last_active_at < one_hour_ago
                is_sup_manually_delegating = sup_perms.get("manual_delegation") is True

                if is_sup_offline or is_sup_manually_delegating:
                    inherited_delegation = True
                    active_scope = "REGIONAL" 
                    break

    is_delegated_admin = is_native_admin or inherited_delegation

    return {
        "is_global": is_global,
        "is_admin": is_delegated_admin,
        "scope_level": "GLOBAL" if is_global else (active_scope if inherited_delegation else ("REGIONAL" if is_native_admin else "STATION")),
        "region": current_user.region
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
    background_tasks: BackgroundTasks,
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

    append_user_audit_event(target_user, "ACCOUNT_APPROVED", current_user.fnum, f"Account successfully approved and authorized by {current_user.fnum}")

    db.commit()

    if target_user.email:
        background_tasks.add_task(
            lambda: asyncio.run(notify_user_approval_status(target_user.email, target_user.name, True))
        )

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


# 4. UPDATE USER ACCESS, ROLES & PERMISSIONS
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

        clearance_locks = current_perms.get("_clearance_locks", {})
        if not isinstance(clearance_locks, dict):
            clearance_locks = {}

        actor_tier = get_command_tier(current_user)
        actor_fnum = (current_user.fnum or "").strip().upper()
        is_principal_super_admin = "A/2408" in actor_fnum or actor_tier >= 5

        for perm_key, new_val in new_perms.items():
            if perm_key.startswith("_"):
                continue
            
            old_val = current_perms.get(perm_key, False)
            
            if old_val is True and new_val is False:
                clearance_locks[perm_key] = {
                    "revoked_by_fnum": actor_fnum,
                    "revoked_by_name": current_user.name,
                    "tier": actor_tier,
                    "timestamp": datetime.now(pytz.timezone('Africa/Nairobi')).isoformat()
                }
                append_user_audit_event(target_user, "PERMISSION_REVOKED", actor_fnum, f"Granular clearance '{perm_key}' was revoked/unchecked.")
            
            elif old_val is False and new_val is True:
                lock_info = clearance_locks.get(perm_key)
                if lock_info:
                    lock_tier = lock_info.get("tier", 0)
                    locked_by_fnum = lock_info.get("revoked_by_fnum", "")
                    
                    if "A/2408" in locked_by_fnum and not is_principal_super_admin:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Security Violation: Clearance '{perm_key}' was revoked by Principal Super Admin A/2408. No other administrator can reinstate it."
                        )
                    
                    if actor_tier < lock_tier and not is_principal_super_admin:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Security Violation: Clearance '{perm_key}' was locked by a superior command authority. You lack sufficient clearance rank to reinstate it."
                        )
                
                if perm_key in clearance_locks:
                    del clearance_locks[perm_key]
                append_user_audit_event(target_user, "PERMISSION_REINSTATED", actor_fnum, f"Granular clearance '{perm_key}' was checked/reinstated.")

        new_perms["_clearance_locks"] = clearance_locks
        new_perms["_audit_history"] = current_perms.get("_audit_history", [])

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
    background_tasks: BackgroundTasks,
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

    if target_user.email:
        background_tasks.add_task(
            lambda: asyncio.run(notify_user_approval_status(target_user.email, target_user.name, False, reason))
        )

    return {"status": "success", "message": f"Officer {clean_fnum} access revoked."}


# 7. PERMANENT DELETE USER RECORD
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


# 8. FORCE PASSWORD RESET
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


# 9. SYSTEM LOCKDOWN STATUS & MAINTENANCE TOGGLE (FULL DATABASE PERSISTENCE)
@router.get("/lockdown/status")
def get_lockdown_status(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        # Use SystemConfig to store system lockdowns since System_Lockdowns table does not exist
        ConfigModel = getattr(models, 'SystemConfig', None)
        if not ConfigModel:
            return {"system_lockdown": False, "active_regions": [], "active_stations": []}
            
        active_locks = db.query(ConfigModel).filter(ConfigModel.config_key.like("LOCKDOWN_%")).all()
        
        system_down = any(l.config_key == 'LOCKDOWN_SYSTEM' and l.config_value == 'ACTIVE' for l in active_locks)
        regions = [l.config_key.replace('LOCKDOWN_REGION_', '') for l in active_locks if l.config_key.startswith('LOCKDOWN_REGION_') and l.config_value == 'ACTIVE']
        stations = [l.config_key.replace('LOCKDOWN_STATION_', '') for l in active_locks if l.config_key.startswith('LOCKDOWN_STATION_') and l.config_value == 'ACTIVE']
        
        return {
            "system_lockdown": system_down, 
            "active_regions": regions, 
            "active_stations": stations
        }
    except Exception:
        return {"system_lockdown": False, "active_regions": [], "active_stations": []}

@router.post("/toggle-maintenance")
def toggle_maintenance(
    payload: dict = Body(...), 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    if (current_user.role or "").strip().upper() != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Security Restriction: Only Super Admins can manage system lockdowns.")
    
    lockdown_type = payload.get("lockdown_type", "SYSTEM").upper()
    target_name = payload.get("target_name", "GLOBAL").upper()
    reason = payload.get("reason", "Command Maintenance")

    ConfigModel = getattr(models, 'SystemConfig', None)
    if not ConfigModel:
        raise HTTPException(status_code=500, detail="System Config database model not configured.")

    config_key = f"LOCKDOWN_{lockdown_type}" if lockdown_type == "SYSTEM" else f"LOCKDOWN_{lockdown_type}_{target_name}"

    try:
        existing = db.query(ConfigModel).filter(ConfigModel.config_key == config_key).first()

        action_performed = ""
        if existing and existing.config_value == 'ACTIVE':
            db.delete(existing)
            action_performed = "LIFTED"
        else:
            new_lock = ConfigModel(config_key=config_key, config_value="ACTIVE")
            db.merge(new_lock)
            action_performed = "ACTIVATED"

        db.commit()

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="SYSTEM_LOCKDOWN",
            target_id=config_key,
            changes_summary=f"Super Admin {current_user.fnum} {action_performed} lockdown for [{lockdown_type}: {target_name}]. Reason: {reason}."
        )

        return {"status": "success", "message": f"Command lockdown successfully {action_performed.lower()}."}

    except Exception as e:
        db.rollback()
        print(f"❌ DATABASE ERROR in toggle_maintenance: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="A secure database error occurred while updating system lockdown status. Please try again."
        )


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


# ==========================================
# 11. HR MODIFICATION & TRANSFER REQUESTS (GET & POST)
# ==========================================
@router.get("/requests")
@router.get("/transfer-requests")
def get_admin_transfer_requests(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    delegation = verify_admin_delegation(current_user, db)
    if not delegation["is_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: You lack administrative delegation to view transfer requests."
        )

    try:
        TransferModel = getattr(models, 'Modification_Requests', getattr(models, 'HR_Requests', getattr(models, 'Transfer_Requests', None)))
        
        if not TransferModel:
            return [] 

        query = db.query(TransferModel)

        user_role = (current_user.role or "").strip().upper()
        is_god_mode = user_role == "SUPER_ADMIN" or check_master_clearance(current_user)

        if not is_god_mode and not delegation["is_global"]:
            user_pos = (current_user.position or "").upper()
            is_regional = user_role in ["REGIONAL_ADMIN", "RPC"] or "RPC" in user_pos

            if is_regional and current_user.region:
                query = query.filter(
                    or_(
                        func.upper(TransferModel.requested_region) == func.upper(current_user.region),
                        func.upper(TransferModel.fnum) == func.upper(current_user.fnum)
                    )
                )
            elif current_user.station:
                query = query.filter(
                    or_(
                        func.upper(TransferModel.requested_station) == func.upper(current_user.station),
                        func.upper(TransferModel.fnum) == func.upper(current_user.fnum)
                    )
                )

        requests = query.order_by(TransferModel.id.desc()).all()

        # 🟢 INDUSTRY STANDARD BATCH LOADING: Gather all force numbers in one sweep
        fnums = []
        for req in requests:
            f = (getattr(req, "fnum", None) or getattr(req, "requested_fnum", "")).strip().upper()
            if f:
                fnums.append(f)

        # Execute ONE single query to pull all corresponding user records into memory
        users_map = {}
        if fnums:
            matched_users = db.query(models.Users).filter(func.upper(models.Users.fnum).in_(fnums)).all()
            users_map = {u.fnum.strip().upper(): u for u in matched_users if u and u.fnum}

        # Scan and format records sequentially from memory with zero database lag
        formatted_requests = []
        for req in requests:
            target_fnum = (getattr(req, "fnum", None) or getattr(req, "requested_fnum", "")).strip().upper()
            usr = users_map.get(target_fnum)

            rank = usr.rank if (usr and usr.rank) else (getattr(req, "requested_rank", None) or "UNKNOWN")
            name = usr.name if (usr and usr.name) else (getattr(req, "requested_name", None) or f"OFFICER {target_fnum}")
            station = usr.station if (usr and usr.station) else "N/A"
            region = usr.region if (usr and usr.region) else "N/A"

            req_dict = {
                "id": req.id,
                "fnum": target_fnum,
                "requested_fnum": target_fnum,
                "requested_rank": rank,
                "requested_name": f"{rank} {name}".strip(),
                "current_station": station,
                "current_region": region,
                "requested_station": getattr(req, "requested_station", "N/A"),
                "requested_region": getattr(req, "requested_region", "N/A"),
                "status": getattr(req, "status", "PENDING"),
                "created_at": getattr(req, "created_at", None)
            }
            formatted_requests.append(req_dict)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="VIEW",
            module="ADMIN_APPROVALS",
            target_id="HR_TRANSFERS_TAB",
            changes_summary=f"{current_user.fnum} accessed the HR Transfer Requests command queue."
        )

        return formatted_requests

    except Exception as e:
        print(f"❌ CRITICAL ERROR in get_admin_transfer_requests: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database fetch failed: {str(e)}")


@router.post("/requests")
@router.post("/transfer-requests")
def create_admin_transfer_request(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    delegation = verify_admin_delegation(current_user, db)
    if not delegation["is_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: You lack administrative delegation to submit requests."
        )

    try:
        TransferModel = getattr(models, 'Modification_Requests', getattr(models, 'HR_Requests', getattr(models, 'Transfer_Requests', None)))
        if not TransferModel:
            raise HTTPException(status_code=500, detail="Transfer model not configured.")

        target_fnum = payload.get("fnum", current_user.fnum)
        target_user = db.query(models.Users).filter(func.upper(models.Users.fnum) == func.upper(target_fnum)).first()

        new_req = TransferModel(
            fnum=target_fnum,
            requested_fnum=target_fnum,
            requested_rank=payload.get("requested_rank", target_user.rank if target_user else current_user.rank),
            requested_name=payload.get("requested_name", target_user.name if target_user else current_user.name),
            requested_station=payload.get("requested_station"),
            requested_region=payload.get("requested_region"),
            status="PENDING"
        )
        db.add(new_req)
        db.commit()
        db.refresh(new_req)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="CREATE",
            module="ADMIN_APPROVALS",
            target_id=f"TRANSFER_REQ_{new_req.id}",
            changes_summary=f"{current_user.fnum} submitted a new transfer/HR request for {target_fnum}."
        )

        return {"status": "success", "message": "Request submitted successfully.", "id": new_req.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to submit request: {str(e)}")


# 12. APPROVE / CLEAR HR TRANSFER REQUEST
@router.patch("/transfer-requests/{request_id}/approve")
@router.put("/transfer-requests/{request_id}/approve")
def approve_hr_transfer_request(
    request_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    # Enforce strict command tier or admin delegation check
    delegation = verify_admin_delegation(current_user, db)
    actor_tier = get_command_tier(current_user)
    
    if not delegation["is_admin"] and actor_tier < 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: You lack command authorization to approve transfers."
        )

    try:
        TransferModel = getattr(models, 'Modification_Requests', getattr(models, 'HR_Requests', getattr(models, 'Transfer_Requests', None)))
        if not TransferModel:
            raise HTTPException(status_code=500, detail="System model for transfers is unavailable.")

        target_request = db.query(TransferModel).filter(TransferModel.id == request_id).first()
        
        if not target_request:
            raise HTTPException(status_code=404, detail="Transfer request not found or already purged.")

        # Explicitly set status to APPROVED and log the reviewing commander
        target_request.status = "APPROVED"
        target_request.reviewed_by = f"{current_user.rank} {current_user.name} ({current_user.fnum})"
        target_request.reviewed_at = datetime.now(pytz.timezone('Africa/Nairobi')).replace(tzinfo=None)
        
        db.commit()

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="ADMIN_APPROVALS",
            target_id=f"TRANSFER_REQ_{request_id}",
            changes_summary=f"Command authority {current_user.fnum} explicitly approved transfer request #{request_id}."
        )

        return {"status": "success", "message": f"Transfer request #{request_id} successfully authorized and cleared."}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to authorize transfer request: {str(e)}")


# 13. PENDING PASSWORD RESET REQUESTS
@router.get("/reset-requests")
def get_pending_password_resets(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    delegation = verify_admin_delegation(current_user, db)
    if not delegation["is_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: You lack administrative delegation to view reset requests."
        )

    try:
        ResetModel = getattr(models, 'Password_Reset_Requests', getattr(models, 'PasswordResetRequests', None))
        
        if not ResetModel:
            return []

        query = db.query(ResetModel).filter(func.upper(ResetModel.status) == "PENDING")

        if not delegation["is_global"]:
            user_role = (current_user.role or "").upper()
            user_pos = (current_user.position or "").upper()
            is_regional = user_role in ["REGIONAL_ADMIN", "RPC"] or "RPC" in user_pos

            if is_regional and current_user.region:
                query = query.filter(func.upper(ResetModel.region) == func.upper(current_user.region))
            elif current_user.station:
                query = query.filter(func.upper(ResetModel.station) == func.upper(current_user.station))

        requests = query.order_by(ResetModel.id.desc()).all()

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="VIEW",
            module="ADMIN_APPROVALS",
            target_id="PASSWORD_RESETS_TAB",
            changes_summary=f"{current_user.fnum} accessed the Password Resets command queue."
        )

        return requests

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database fetch failed: {str(e)}")


# 14. CLEAR / RESOLVE PASSWORD RESET REQUEST
@router.patch("/reset-requests/{request_id}/clear")
@router.put("/reset-requests/{request_id}/clear")
def clear_password_reset_request(
    request_id: int,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    delegation = verify_admin_delegation(current_user, db)
    if not delegation["is_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: You lack administrative delegation to clear reset requests."
        )

    try:
        ResetModel = getattr(models, 'Password_Reset_Requests', getattr(models, 'PasswordResetRequests', None))
        if not ResetModel:
            raise HTTPException(status_code=500, detail="System model for password resets is unavailable.")

        target_request = db.query(ResetModel).filter(ResetModel.id == request_id).first()
        
        if not target_request:
            raise HTTPException(status_code=404, detail="Password reset request not found or already purged.")

        if not delegation["is_global"]:
            user_role = (current_user.role or "").upper()
            user_pos = (current_user.position or "").upper()
            is_regional = user_role in ["REGIONAL_ADMIN", "RPC"] or "RPC" in user_pos
            
            if is_regional and current_user.region:
                if target_request.region and target_request.region.upper() != current_user.region.upper():
                    raise HTTPException(status_code=403, detail="Delegation Denied: Request is outside your regional scope.")
            elif current_user.station:
                if target_request.station and target_request.station.upper() != current_user.station.upper():
                    raise HTTPException(status_code=403, detail="Delegation Denied: Request is outside your station scope.")

        target_request.status = "CLEARED" 
        db.commit()

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="ADMIN_APPROVALS",
            target_id=f"RESET_REQ_{request_id}",
            changes_summary=f"{current_user.fnum} cleared and resolved password reset request for officer {target_request.fnum}."
        )

        return {"status": "success", "message": f"Password reset request for {target_request.fnum} successfully cleared."}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear reset request: {str(e)}")

# 15. TRIGGER TACTICAL BRIEFINGS (MANUAL & AUTOMATED CRON)
@router.post("/trigger-briefs")
@router.post("/cron/trigger-briefs")
def trigger_tactical_briefs(
    background_tasks: BackgroundTasks,
    payload: Optional[dict] = Body(None),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: Optional[models.Users] = Depends(get_current_user)
):
    try:
        brief_type = payload.get("brief_type", "ALL") if payload else "ALL"
        is_automated = current_user is None
        origin_note = "Automated Monday Dispatch" if is_automated else f"Manually triggered by {current_user.fnum} {current_user.rank} {current_user.name}"

        actor_fnum = current_user.fnum if current_user else "CRON_SCHEDULER"

        # Extract High Command Emails for Dispatch
        high_command_users = db.query(models.Users.email).filter(
            models.Users.is_approved == True,
            models.Users.email.isnot(None),
            models.Users.role != 'REVOKED',
            or_(
                models.Users.role.in_(['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN', 'RPC']),
                func.upper(models.Users.position).like('%KMP COMMANDER%'),
                func.upper(models.Users.position).like('%DEPUTY KMP COMMANDER%')
            )
        ).all()
        
        target_emails = [u[0] for u in high_command_users if u[0] and "@" in u[0]]

        # 🟢 TESTING INCLUSION: Always append the current dispatching user's email if they are logged in and have an email
        if current_user and current_user.email and "@" in current_user.email:
            if current_user.email not in target_emails:
                target_emails.append(current_user.email)

        if target_emails:
            subject = f"TACTICAL ALERT: {brief_type.replace('_', ' ')} REPORT" if brief_type != "ALL" else "Weekly Command Briefing & Situation Report"
            html_body = f"""
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #1e3a8a; margin-top: 0;">{subject}</h2>
                <p>This is an automated tactical dispatch generated by the KMP Centralised Security Data Management System.</p>
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
                    <p><strong>Briefing Focus:</strong> {brief_type}</p>
                    <p><strong>Dispatch Origin:</strong> {origin_note}</p>
                    <p><strong>Timestamp:</strong> {datetime.now(pytz.timezone("Africa/Nairobi")).strftime("%Y-%m-%d %H:%M:%S EAT")}</p>
                </div>
                <p>Please log in to the administrative dashboard to review the full metrics and granular data.</p>
            </div>
            """
            
            def send_brief_sync():
                asyncio.run(send_email_notification(target_emails, subject, html_body))
            
            background_tasks.add_task(send_brief_sync)

        record_neon_activity(
            logs_db=logs_db,
            fnum=actor_fnum,
            action_type="DISPATCH",
            module="TACTICAL_BRIEFING",
            target_id="EMAIL_SITREP",
            changes_summary=f"Tactical briefings ({brief_type}) compiled and dispatched successfully. Origin: {origin_note}."
        )

        return {
            "status": "success",
            "message": f"Tactical briefings ({brief_type}) dispatched successfully to {len(target_emails)} recipients ( including your account ). Origin: {origin_note}."
        }
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=f"Briefing dispatch failed: {str(e)}")

# ==========================================
# 16. COMMANDER ABSENCE & LEAVE BROADCAST ROUTE
# ==========================================
@router.get("/commander-status")
def get_commander_status(current_user: models.Users = Depends(get_current_user)):
    """Provides the active delegation state to bind the frontend modal toggle on load."""
    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}
    
    return {
        "is_away": perms.get("manual_delegation", False),
        "absence_reason": perms.get("absence_reason", ""),
        "delegatee_fnum": perms.get("delegatee_fnum", ""),
        "delegation_start": perms.get("delegation_start", ""),
        "delegation_end": perms.get("delegation_end", "")
    }

@router.post("/set-commander-status")
def set_commander_status(
    payload: dict = Body(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    enforce_mutation_clearance(current_user)
    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}
    
    is_away = payload.get("is_away", False)
    absence_reason = payload.get("absence_reason", "Annual Leave")
    delegatee_fnum = payload.get("delegatee_fnum", "").strip().upper()
    start_date = payload.get("delegation_start", "")
    end_date = payload.get("delegation_end", "")
    
    old_delegatee_fnum = perms.get("delegatee_fnum")
    
    perms["manual_delegation"] = is_away
    perms["absence_reason"] = absence_reason if is_away else None
    perms["delegatee_fnum"] = delegatee_fnum if is_away else None
    perms["delegation_start"] = start_date if is_away else None
    perms["delegation_end"] = end_date if is_away else None
    current_user.permissions = perms
    
    status_text = f"Away ({absence_reason})" if is_away else "Active (Normal Command)"
    audit_detail = f"Command absence status set to {status_text}."
    
    delegatee = None
    if is_away and delegatee_fnum:
        delegatee = db.query(models.Users).filter(func.trim(func.upper(models.Users.fnum)) == delegatee_fnum).first()
        if not delegatee:
            raise HTTPException(status_code=404, detail=f"Delegatee Officer {delegatee_fnum} not found.")
            
        del_perms = delegatee.permissions or {}
        if isinstance(del_perms, str):
            try: del_perms = json.loads(del_perms)
            except Exception: del_perms = {}
            
        # Save snapshot before delegation if not already saved
        if "_pre_delegation_snapshot" not in del_perms:
            del_perms["_pre_delegation_snapshot"] = {k: v for k, v in del_perms.items()}

        del_perms["acting_for_fnum"] = current_user.fnum
        del_perms["can_approve"] = True
        del_perms["global_open"] = True  # Provide open/write clearance as requested
        delegatee.permissions = del_perms
        
        audit_detail += f" Delegated command authority to {delegatee.rank} {delegatee.name} ({delegatee_fnum}) from {start_date} to {end_date}."
        
        append_user_audit_event(
            delegatee, 
            "COMMAND_DELEGATION_RECEIVED", 
            current_user.fnum, 
            f"Granted acting command powers for {current_user.fnum} ({absence_reason}) from {start_date} to {end_date}."
        )

    # 🟢 REVERSAL LOGIC: When delegation is turned off, restore delegatee to pre-delegation state
    if not is_away and old_delegatee_fnum:
        delegatee = db.query(models.Users).filter(func.trim(func.upper(models.Users.fnum)) == old_delegatee_fnum).first()
        if delegatee:
            del_perms = delegatee.permissions or {}
            if isinstance(del_perms, str):
                try: del_perms = json.loads(del_perms)
                except Exception: del_perms = {}
            
            # Restore from snapshot if available
            snapshot = del_perms.pop("_pre_delegation_snapshot", None)
            if snapshot:
                delegatee.permissions = snapshot
            else:
                # Fallback: Strip out acting flags explicitly
                del_perms.pop("acting_for_fnum", None)
                del_perms["can_approve"] = False
                delegatee.permissions = del_perms

            append_user_audit_event(
                delegatee, 
                "COMMAND_DELEGATION_REVOKED", 
                current_user.fnum, 
                "Acting command powers and temporary delegations have been revoked and restored to baseline."
            )
        audit_detail = "Officer resumed active command. Delegation privileges revoked and delegatee restored."

    append_user_audit_event(current_user, "COMMAND_STATUS_UPDATED", current_user.fnum, audit_detail)
    db.commit()
    
    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="UPDATE",
        module="COMMAND_DELEGATION",
        target_id=current_user.fnum,
        changes_summary=audit_detail
    )
    
    if delegatee:
        background_tasks.add_task(
            lambda: asyncio.run(notify_delegation_status(current_user, delegatee, is_away, absence_reason, start_date, end_date))
        )
    
    return {
        "status": "success",
        "manual_delegation": is_away,
        "absence_reason": perms.get("absence_reason"),
        "delegatee_fnum": delegatee_fnum,
        "message": f"Command status broadcast updated successfully: {status_text}."
    }