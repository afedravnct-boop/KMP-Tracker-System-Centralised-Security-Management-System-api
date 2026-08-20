from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app import models, schemas
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["Lockup Matrix & Operations"])

def get_officer_signature(user):
    if not user:
        return "UNKNOWN COMMANDER"
    fnum = (user.fnum or "").strip()
    rank = (user.rank or "").strip()
    name = (user.name or "").strip()
    return f"{fnum} {rank} {name}".strip().upper()

# --- LOCKUP MATRIX ---
@router.post("/lockup-matrix", response_model=schemas.LockupMatrixResponse)
def create_lockup_entry(
    entry: schemas.LockupMatrixCreate, 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    try:
        entry_data = entry.dict()
        entry_data['last_updated_by'] = get_officer_signature(current_user)
        new_entry = models.LockupMatrix(**entry_data)
        db.add(new_entry)
        db.commit()
        db.refresh(new_entry)
        return new_entry
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to log cell population: {str(e)}")

@router.get("/lockup-matrix", response_model=list[schemas.LockupMatrixResponse])
def get_lockup_entries(
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    position = (current_user.position or "").upper()
    role = (current_user.role or "").upper()
    user_region = (current_user.region or "").strip().upper()
    user_station = (current_user.station or "").strip().upper()
    
    perms = current_user.permissions or {}
    is_global = (
        role in ["SUPER_ADMIN", "ADMIN"] or
        perms.get("global_observer", False) == True or 
        "IGP" in position or 
        "DIRECTOR" in position or 
        "KMP COMMANDER" in position or
        user_region in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"]
    )
    
    is_regional = role == "RPC" or "RPC" in position or "DEPUTY" in position
    query = db.query(models.LockupMatrix)
    
    if is_global:
        pass
    elif is_regional:
        query = query.filter(
            or_(
                func.upper(models.LockupMatrix.region) == user_region,
                func.upper(models.LockupMatrix.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"])
            )
        )
    else:
        query = query.filter(
            or_(
                func.upper(models.LockupMatrix.station) == user_station,
                func.upper(models.LockupMatrix.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"])
            )
        )
        
    return query.order_by(models.LockupMatrix.date.desc(), models.LockupMatrix.sn.desc()).all()

@router.put("/lockup-matrix/{sn}", response_model=schemas.LockupMatrixResponse)
def update_lockup_entry(
    sn: int,
    entry: schemas.LockupMatrixCreate,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    existing_entry = db.query(models.LockupMatrix).filter(models.LockupMatrix.sn == sn).first()
    if not existing_entry:
        raise HTTPException(status_code=404, detail="Lockup matrix entry not found.")
    
    position = (current_user.position or "").upper()
    role = (current_user.role or "").upper()
    user_region = (current_user.region or "").strip().upper()
    user_station = (current_user.station or "").strip().upper()
    
    perms = current_user.permissions or {}
    is_global = (
        role in ["SUPER_ADMIN", "ADMIN"] or
        perms.get("global_observer", False) == True or 
        "IGP" in position or 
        "DIRECTOR" in position or 
        "KMP COMMANDER" in position or
        user_region in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"]
    )
    
    if not is_global:
        entry_station = (entry.station or "").strip().upper()
        if entry_station != user_station and entry_station != "HEADQUARTERS GENERAL TOTAL":
            raise HTTPException(status_code=403, detail="Clearance Denied: You can only update lockup records for your own station.")

    try:
        existing_entry.date = entry.date
        existing_entry.time = entry.time
        existing_entry.region = entry.region
        existing_entry.station = entry.station
        existing_entry.suspects = entry.suspects
        existing_entry.last_updated_by = f"{get_officer_signature(current_user)} [EDITED]"
        
        db.commit()
        db.refresh(existing_entry)
        return existing_entry
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update entry: {str(e)}")

# --- OPS STATISTICS ---
@router.get("/stats")
def get_stats(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Operational_Statistics)
    if current_user.role == "SUPER_ADMIN":
        pass
    elif current_user.role in ["ADMIN", "RPC"]:
        query = query.filter(models.Operational_Statistics.region == current_user.region)
    else:
        query = query.filter(models.Operational_Statistics.station == current_user.station)
        
    return query.order_by(models.Operational_Statistics.sn.desc()).all()

@router.post("/stats")
def create_stat(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data["region"] = current_user.region
            data["station"] = current_user.station
            
        new_record = models.Operational_Statistics(**data)
        new_record.last_updated_by = get_officer_signature(current_user)
        db.add(new_record)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/stats/{stat_id}")
def update_stat(stat_id: int, data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        existing_stat = db.query(models.Operational_Statistics).filter(
            or_(models.Operational_Statistics.id == stat_id, models.Operational_Statistics.sn == stat_id)
        ).first()
        
        if not existing_stat:
            raise HTTPException(status_code=404, detail="Operational Statistics record not found.")

        data.pop('sn', None)
        data.pop('id', None)

        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data.pop("region", None)
            data.pop("station", None)

        for key, value in data.items():
            if hasattr(existing_stat, key):
                setattr(existing_stat, key, value)

        existing_stat.last_updated_by = get_officer_signature(current_user)
        db.commit()
        db.refresh(existing_stat)
        
        return {"status": "success", "message": f"Statistics record {stat_id} updated successfully."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))