from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List

from app import models
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/exhibits",
    tags=["Impounded Fleet & Exhibits Registry"]
)

@router.get("")
def get_exhibits(
    region: Optional[str] = None, 
    station: Optional[str] = None, 
    search: Optional[str] = None, 
    limit: int = 300, 
    db: Session = Depends(get_db), 
    current_user = Depends(lambda: None) # Lazy evaluation placeholder to bypass import loop
):
    # Local import to avoid circular dependency
    from api_backend import get_current_user, serialize_model_row
    return _get_exhibits_impl(region, station, search, limit, db, current_user)

def _get_exhibits_impl(region, station, search, limit, db, current_user):
    from api_backend import serialize_model_row
    try:
        Model = getattr(models, 'Impounded_Exhibits', getattr(models, 'ImpoundedExhibits', None))
        if not Model: return []
        
        query = db.query(Model)
        user_role = (getattr(current_user, 'role', '') or "").upper()
        perms = getattr(current_user, 'permissions', {}) or {}
        is_global = (
            user_role in ['SUPER_ADMIN', 'ADMIN', 'RPC', 'DEPUTY COMMANDER', 'ASSISTANT_SUPER_ADMIN'] or 
            perms.get("view_global_roster") is True or 
            perms.get("global_observer") is True
        )
        
        if not is_global and hasattr(Model, 'region') and hasattr(current_user, 'region'):
            query = query.filter(Model.region == current_user.region)
            
        if region and region != 'ALL REGIONS':
            query = query.filter(Model.region == region)
        if station and station != 'ALL STATIONS':
            query = query.filter(Model.station == station)
            
        if search:
            term = f"%{search.strip().upper()}%"
            
            # 🟢 Check if category column exists for querying
            if hasattr(Model, 'category'):
                query = query.filter(or_(
                    Model.reg_no.ilike(term),
                    Model.category.ilike(term),
                    Model.type_make.ilike(term),
                    Model.case_no.ilike(term),
                    Model.reason.ilike(term),
                    Model.status.ilike(term)
                ))
            else:
                query = query.filter(or_(
                    Model.reg_no.ilike(term),
                    Model.type_make.ilike(term),
                    Model.case_no.ilike(term),
                    Model.reason.ilike(term),
                    Model.status.ilike(term)
                ))
            
        records = query.order_by(Model.id.desc()).limit(limit).all()
        return [serialize_model_row(r) for r in records]
    except Exception as e:
        print(f"Error fetching exhibits: {e}")
        return []

@router.post("")
def create_exhibit(
    data: dict, 
    db: Session = Depends(get_db), 
    current_user = Depends(lambda: None)
):
    from api_backend import serialize_model_row
    try:
        Model = getattr(models, 'Impounded_Exhibits', getattr(models, 'ImpoundedExhibits', None))
        if not Model: raise HTTPException(status_code=500, detail="Exhibits model not initialized.")
        
        model_kwargs = {
            "reg_no": data.get("reg_no", "NIL"),
            "type_make": data.get("type_make", "UNKNOWN"),
            "colour": data.get("colour"),
            "case_no": data.get("case_no"),
            "reason": data.get("reason"),
            "status": data.get("status", "COURT"),
            "unit_responsible": data.get("unit_responsible", "CID"),
            "assorted_items": data.get("assorted_items", "NIL"),
            "comment": data.get("comment", "NIL"),
            "region": data.get("region"),
            "station": data.get("station"),
            "date_impounded": data.get("date_impounded"),
            "impounded_by_fnum": data.get("impounded_by_fnum"),
            "impounded_by_rank": data.get("impounded_by_rank"),
            "impounded_by_name": data.get("impounded_by_name"),
            "date_cleared": data.get("date_cleared"),
            "entered_by": data.get("entered_by")
        }

        # 🟢 Graceful Category Injection
        cat = data.get("category", "MOTOR VEHICLE")
        if hasattr(Model, 'category'):
            model_kwargs['category'] = cat
        else:
            # If the database doesn't have a category column yet, safely prepend it to the description
            model_kwargs["type_make"] = f"{cat} - {model_kwargs['type_make']}"

        new_item = Model(**model_kwargs)
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return serialize_model_row(new_item)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{item_id}")
def update_exhibit(
    item_id: int, 
    data: dict, 
    db: Session = Depends(get_db), 
    current_user = Depends(lambda: None)
):
    from api_backend import serialize_model_row
    try:
        Model = getattr(models, 'Impounded_Exhibits', getattr(models, 'ImpoundedExhibits', None))
        item = db.query(Model).filter(Model.id == item_id).first()
        if not item: raise HTTPException(status_code=404, detail="Exhibit record not found.")
        
        # 🟢 Graceful Category Injection for Updates
        cat = data.get("category", "MOTOR VEHICLE")
        if hasattr(Model, 'category'):
            setattr(item, 'category', cat)
        else:
            data['type_make'] = f"{cat} - {data.get('type_make', 'UNKNOWN')}"
        
        for k, v in data.items():
            if hasattr(item, k) and k not in ['id', 'category']:
                setattr(item, k, v)
                
        db.commit()
        db.refresh(item)
        return serialize_model_row(item)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))