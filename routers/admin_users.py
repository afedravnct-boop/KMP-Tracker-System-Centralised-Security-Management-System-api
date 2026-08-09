from urllib.parse import unquote
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models
from app.database import get_db
# 🟢 Import the real authentication dependency from your auth module
from auth import get_current_user 

router = APIRouter(prefix="/api/v1/admin", tags=["Admin Users"])

def verify_admin_clearance(current_user: models.Users, target_region: str = None):
    if not current_user:
        return False
        
    user_role = (current_user.role or "").upper().strip()
    user_region = (current_user.region or "").strip().upper()
    
    # 🟢 Super Admin, IGP, DIGP, AIGP or HQ staff have global access
    if user_role in ["SUPER_ADMIN", "IGP", "DIGP", "AIGP"] or "HEADQUARTERS" in user_region:
        return True

    # 🟢 Regional Admin / HR / Command Check (e.g. KMP North Admin managing KMP North)
    if user_role in ["ADMIN", "HR", "RPC", "DPC"]:
        if target_region and user_region == target_region.strip().upper():
            return True

    return False

# 🟢 FIX: Route uses {fnum:path} so force numbers like A/2408 or Q/1 do not break URL routing
@router.patch("/approve-user/{fnum:path}")
@router.put("/users/{fnum:path}/approve")
def approve_pending_user(
    fnum: str,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)  # 🟢 Uses real auth dependency
):
    # Decode URL encoding (e.g., A%2F2408 -> A/2408)
    clean_fnum = unquote(fnum).strip().upper()
    
    # Case-insensitive & trimmed database lookup
    target_user = db.query(models.Users).filter(
        func.trim(func.upper(models.Users.fnum)) == clean_fnum
    ).first()
    
    if not target_user:
        raise HTTPException(
            status_code=404, 
            detail=f"Officer '{clean_fnum}' was not found in system pending records."
        )

    # Clearance check
    if not verify_admin_clearance(current_user, target_region=target_user.region):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail=f"Authorization Blocked: Your regional clearance [{current_user.region}] cannot authorize users in [{target_user.region}]."
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
    user_role = (current_user.role or "").upper().strip()
    user_region = (current_user.region or "").strip().upper()

    query = db.query(models.Users).filter(models.Users.is_approved == False)

    # Super Admin / HQ gets a 360° view of ALL pending requests
    if user_role in ["SUPER_ADMIN", "IGP", "DIGP", "AIGP"] or "HEADQUARTERS" in user_region:
        pending_users = query.order_by(models.Users.id.desc()).all()
    else:
        # Regional Admins / HR only see signups within their exact region
        pending_users = query.filter(
            func.trim(func.upper(models.Users.region)) == user_region
        ).order_by(models.Users.id.desc()).all()

    return pending_users