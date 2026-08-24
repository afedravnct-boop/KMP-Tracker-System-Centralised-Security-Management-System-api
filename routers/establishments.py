from datetime import datetime
from typing import Optional, List, Union
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

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

def get_est_model():
    model = getattr(models, 'Establishments', getattr(models, 'establishments', None))
    if not model:
        raise HTTPException(status_code=500, detail="Establishments database model not configured.")
    return model

def serialize_row(row):
    if not row:
        return {}
    d = row.__dict__.copy()
    d.pop('_sa_instance_state', None)
    # Ensure standardized 'id' field is always present for frontend mapping
    if 'sn' in d and 'id' not in d:
        d['id'] = d['sn']
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.strftime("%Y-%m-%d %H:%M:%S")
        elif hasattr(v, 'isoformat'):
            d[k] = v.isoformat()
    return d

@router.get("/establishments")
def get_all_establishments(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    EstModel = get_est_model()
    query = db.query(EstModel)
    
    perms = current_user.permissions or {}
    is_global_viewer = (
        current_user.role in ["SUPER_ADMIN", "ADMIN", "RPC", "Deputy Commander"] or
        perms.get("view_global_roster") is True or
        perms.get("global_observer") is True
    )

    if is_global_viewer:
        pass
    elif current_user.role in ["REGIONAL_ADMIN", "DIVISION_ADMIN"] or "HR" in (current_user.position or "").upper():
        query = query.filter(func.upper(EstModel.region) == str(current_user.region).strip().upper())
    else:
        query = query.filter(func.upper(EstModel.station) == str(current_user.station).strip().upper())
    
    pk_col = getattr(EstModel, 'id', getattr(EstModel, 'sn', None))
    if pk_col is not None:
        records = query.order_by(pk_col.desc()).all()
    else:
        records = query.all()
        
    return [serialize_row(r) for r in records]

@router.post("/establishments")
def create_establishment(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    EstModel = get_est_model()
    try:
        data.pop('sn', None)
        data.pop('id', None)
        
        # Sanitize numeric fields to prevent database type rejection (fixed !== to !=)
        numeric_fields = ['personnel_in_station', 'personnel_in_sub_station', 'personnel_in_post', 'booths', 'personnel_in_booth']
        for field in numeric_fields:
            if field in data:
                try:
                    data[field] = int(data[field]) if data[field] != "" and data[field] is not None else 0
                except (ValueError, TypeError):
                    data[field] = 0

        perms = current_user.permissions or {}
        can_assign_jurisdiction = (
            current_user.role in ["SUPER_ADMIN", "RPC", "ADMIN"] or
            perms.get("global_observer") is True
        )
        
        if not can_assign_jurisdiction:
            data["region"] = current_user.region
            data["division"] = getattr(current_user, 'division', current_user.region)
            data["station"] = current_user.station
            
        new_est = EstModel(**data)
        new_est.last_updated_by = get_officer_signature(current_user)
        
        db.add(new_est)
        db.commit()
        db.refresh(new_est)
        
        return serialize_row(new_est)
    except Exception as e:
        db.rollback()
        print(f"Establishment creation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to record establishment: {str(e)}")

@router.put("/establishments/{est_id}")
def update_establishment(est_id: int, est_update: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    EstModel = get_est_model()
    
    pk_col = getattr(EstModel, 'id', getattr(EstModel, 'sn', None))
    existing_est = db.query(EstModel).filter(pk_col == est_id).first()
    
    if not existing_est:
        raise HTTPException(status_code=404, detail="Establishment record not found.")

    est_update.pop('sn', None) 
    est_update.pop('id', None) 
    
    # Sanitize numeric fields (fixed !== to !=)
    numeric_fields = ['personnel_in_station', 'personnel_in_sub_station', 'personnel_in_post', 'booths', 'personnel_in_booth']
    for field in numeric_fields:
        if field in est_update:
            try:
                est_update[field] = int(est_update[field]) if est_update[field] != "" and est_update[field] is not None else 0
            except (ValueError, TypeError):
                est_update[field] = 0

    perms = current_user.permissions or {}
    can_reassign = (
        current_user.role in ["SUPER_ADMIN", "RPC", "ADMIN"] or
        perms.get("global_observer") is True
    )
    
    if not can_reassign:
        est_update.pop("region", None)
        est_update.pop("division", None)
        est_update.pop("station", None)

    for key, value in est_update.items():
        if hasattr(existing_est, key):
            setattr(existing_est, key, value)

    existing_est.last_updated_by = get_officer_signature(current_user)
    
    try:
        db.commit()
        db.refresh(existing_est)
        return serialize_row(existing_est)
    except Exception as e:
        db.rollback()
        print(f"Establishment update error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update establishment: {str(e)}")

@router.delete("/establishments/{est_id}")
def delete_establishment(est_id: int, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    EstModel = get_est_model()
    
    pk_col = getattr(EstModel, 'id', getattr(EstModel, 'sn', None))
    existing_est = db.query(EstModel).filter(pk_col == est_id).first()
    
    if not existing_est:
        raise HTTPException(status_code=404, detail="Establishment record not found.")
        
    perms = current_user.permissions or {}
    if current_user.role not in ["SUPER_ADMIN", "ADMIN", "RPC"] and not perms.get("delete_records", False):
        raise HTTPException(status_code=403, detail="Clearance Denied: Record deletion requires admin authorization.")

    try:
        db.delete(existing_est)
        db.commit()
        return {"status": "success", "message": f"Establishment record {est_id} deleted successfully."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete establishment: {str(e)}")