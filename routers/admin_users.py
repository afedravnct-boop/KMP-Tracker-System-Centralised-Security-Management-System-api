from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import models
from app.database import get_db

router = APIRouter(prefix="/api/v1/users", tags=["Admin Users"])

def verify_admin_clearance(current_user, target_region: str = None):
    user_role = (current_user.role or "").upper()
    user_region = (current_user.region or "").strip().upper()
    
    # Super Admin, IGP, DIGP, AIGP or HQ staff have global 360-degree access
    if user_role in ["SUPER_ADMIN", "IGP", "DIGP", "AIGP"] or "HEADQUARTERS" in user_region:
        return True

    # Regional Admin / HR / Command Check (e.g. KMP North Admin managing KMP North)
    if user_role in ["ADMIN", "HR", "RPC", "DPC"]:
        if target_region and user_region == target_region.strip().upper():
            return True

    return False

@router.put("/{fnum}/approve")
def approve_pending_user(
    fnum: str,
    db: Session = Depends(get_db),
    current_user = Depends(lambda: None) # Will use your app's get_current_user dependency or leave as needed
):
    target_user = db.query(models.Users).filter(models.Users.fnum == fnum).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found.")

    if not verify_admin_clearance(current_user, target_region=target_user.region):
        raise HTTPException(
            status_code=403, 
            detail=f"Authorization Blocked: Your regional clearance [{current_user.region}] cannot authorize users in [{target_user.region}]."
        )

    target_user.is_approved = True
    db.commit()
    return {"status": "success", "message": f"User {fnum} successfully authorized."}

@router.get("/pending")
def get_pending_users(
    db: Session = Depends(get_db),
    current_user = Depends(lambda: None)
):
    user_role = (current_user.role or "").upper()
    user_region = (current_user.region or "").strip().upper()

    query = db.query(models.Users).filter(models.Users.is_approved == False)

    # Super Admin / HQ gets a 360° view of ALL pending requests across Uganda
    if user_role in ["SUPER_ADMIN", "IGP", "DIGP", "AIGP"] or "HEADQUARTERS" in user_region:
        pending_users = query.all()
    else:
        # Regional Admins / HR (e.g. KMP North) only see signups within their exact region
        pending_users = query.filter(models.Users.region == user_region).all()

    return pending_users