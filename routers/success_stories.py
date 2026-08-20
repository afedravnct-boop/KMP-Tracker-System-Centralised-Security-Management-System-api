from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["Success Stories"])

def get_officer_signature(user):
    if not user:
        return "UNKNOWN COMMANDER"
    fnum = (user.fnum or "").strip()
    rank = (user.rank or "").strip()
    name = (user.name or "").strip()
    return f"{fnum} {rank} {name}".strip().upper()

@router.get("/stories")
def get_stories(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Success_Stories)
    if current_user.role == "SUPER_ADMIN":
        pass
    elif current_user.role in ["ADMIN", "RPC"]:
        query = query.filter(models.Success_Stories.region == current_user.region)
    else:
        query = query.filter(models.Success_Stories.station == current_user.station)
    return query.order_by(models.Success_Stories.sn.desc()).all()

@router.post("/stories")
def create_story(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data["region"] = current_user.region
            data["station"] = current_user.station
            
        new_record = models.Success_Stories(**data)
        new_record.last_updated_by = get_officer_signature(current_user)
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        return {"status": "success", "sn": new_record.sn}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))