from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["Establishments"])

def get_officer_signature(user):
    if not user:
        return "UNKNOWN COMMANDER"
    fnum = (user.fnum or "").strip()
    rank = (user.rank or "").strip()
    name = (user.name or "").strip()
    return f"{fnum} {rank} {name}".strip().upper()

@router.get("/establishments")
def get_all_establishments(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Establishments)
    if current_user.role == "SUPER_ADMIN":
        pass
    elif current_user.role in ["ADMIN", "RPC"]:
        query = query.filter(models.Establishments.region == current_user.region)
    else:
        query = query.filter(models.Establishments.station == current_user.station)
    return query.order_by(models.Establishments.id.desc()).all()

@router.post("/establishments")
def create_establishment(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data["region"] = current_user.region
            data["division"] = current_user.division
            data["station"] = current_user.station
            
        new_est = models.Establishments(**data)
        new_est.last_updated_by = get_officer_signature(current_user)
        db.add(new_est)
        db.commit()
        db.refresh(new_est)
        return {"status": "success", "sn": new_est.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/establishments/{est_id}")
def update_establishment(est_id: int, est_update: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    existing_est = db.query(models.Establishments).filter(
        (models.Establishments.id == est_id) if hasattr(models.Establishments, 'id') else (models.Establishments.sn == est_id)
    ).first()
    
    if not existing_est:
        raise HTTPException(status_code=404, detail="Establishment not found.")

    est_update.pop('sn', None) 
    est_update.pop('id', None) 
    
    if current_user.role not in ["SUPER_ADMIN", "RPC"]:
        est_update.pop("region", None)
        est_update.pop("division", None)
        est_update.pop("station", None)

    for key, value in est_update.items():
        if hasattr(existing_est, key):
            setattr(existing_est, key, value)

    existing_est.last_updated_by = get_officer_signature(current_user)
    db.commit()
    return {"status": "success"}