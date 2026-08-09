from urllib.parse import unquote
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models
from app.database import get_db
# 🟢 Import the real authentication dependency from your auth module
from auth import get_current_user 

router = APIRouter(prefix="/api/v1/admin", tags=["Admin Users"])

# 🟢 NEW: STRICT HIERARCHY CHECKER
# Locks approvals exclusively to the top two admin tiers
def is_high_command_admin(current_user: models.Users):
    if not current_user:
        return False
    user_role = (current_user.role or "").strip().upper()
    user_position = (current_user.position or "").strip().upper()
    
    # Only Super Admin, System Admin, or explicit System Managers have this clearance
    return user_role in ["SUPER_ADMIN", "SYSTEM_ADMIN"] or "SYSTEM MANAGER" in user_position


# 🟢 FIX: Route uses {fnum:path} so force numbers like A/2408 or Q/1 do not break URL routing
@router.patch("/approve-user/{fnum:path}")
@router.put("/users/{fnum:path}/approve")
def approve_pending_user(
    fnum: str,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)  # 🟢 Uses real auth dependency
):
    # 🟢 1. STRICT COMMAND APPROVAL LOCKDOWN
    if not is_high_command_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: Only Super Admins and System Admins possess the authority to approve command accounts."
        )

    # Decode URL encoding (e.g., A%2F2408 -> A/2408)
    clean_fnum = unquote(fnum).strip().upper()
    
    # Case-insensitive & trimmed database lookup
    target_user = db.query(models.Users).filter(
        func.trim(func.upper(models.Users.fnum)) == clean_fnum,
        models.Users.is_approved == False
    ).first()
    
    if not target_user:
        raise HTTPException(
            status_code=404, 
            detail=f"Officer '{clean_fnum}' was not found in system pending records."
        )

    # Execute Approval
    target_user.is_approved = True
    if hasattr(target_user, 'status'):
        target_user.status = "ACTIVE"
    if hasattr(target_user, 'is_active'):
        target_user.is_active = True

    db.commit()
    return {"status": "success", "message": f"Officer {clean_fnum} successfully authorized."}


@router.get("/pending-users")
@router.get("/users/pending")
def get_pending_users(
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)  # 🟢 Uses real auth dependency
):
    # 🟢 1. STRICT COMMAND VIEW LOCKDOWN
    if not is_high_command_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: Only Super Admins and System Admins can view the pending approval roster."
        )

    # Since only high admins can reach this block, they get a 360° global view of all pending users
    query = db.query(models.Users).filter(models.Users.is_approved == False)
    pending_users = query.order_by(models.Users.id.desc()).all()

    return pending_users