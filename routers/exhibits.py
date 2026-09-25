import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, text
from typing import Optional, List

from app import models
from app.database import get_db
from auth import get_current_user  # 🟢 Ensure get_current_user is imported

router = APIRouter(
    prefix="/api/v1/exhibits",
    tags=["Impounded Fleet & Exhibits Registry"]
)

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

def apply_opsec_scope(current_user, query, ModelClass):
    if not ModelClass or not current_user:
        return query.filter(text("1=0"))
    
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    user_pos = str(current_user.position).strip().upper() if current_user.position else ""
    user_reg = str(current_user.region).strip().upper() if current_user.region else ""
    user_stn = str(current_user.station).strip().upper() if current_user.station else ""

    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}

    is_absolute_global = (
        user_role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN", "RPC", "DEPUTY COMMANDER"] or
        "KMP COMMANDER" in user_pos or
        "DEPUTY KMP COMMANDER" in user_pos or
        "KMP ADMIN" in user_pos or
        perms.get("view_global_roster") is True or
        perms.get("global_observer") is True
    )

    is_kmp_sys_mgr = (
        user_role == "SYSTEM_MANAGER" and
        user_reg in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"] and
        "KMP" in user_pos
    )

    is_regional_command = (
        user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN", "DIVISION_ADMIN", "STATION_ADMIN"] or
        "HR" in user_pos
    )

    if is_absolute_global or is_kmp_sys_mgr:
        return query
        
    elif is_regional_command or user_reg in REGIONAL_HIERARCHY:
        conds = []
        if hasattr(ModelClass, 'region'):
            conds.append(func.upper(ModelClass.region) == user_reg)
        
        if hasattr(ModelClass, 'station') and user_reg in REGIONAL_HIERARCHY:
            expanded_stns = set()
            for s in REGIONAL_HIERARCHY[user_reg]:
                expanded_stns.add(s)
                expanded_stns.add(s.replace(' HEADQUARTERS', '').replace(' HQ', ''))
                expanded_stns.add(s + ' HEADQUARTERS')
                expanded_stns.add(s + ' HQ')
            
            conds.append(func.upper(ModelClass.station).in_(list(expanded_stns)))
            
        if conds:
            return query.filter(or_(*conds))
        return query.filter(text("1=0"))
        
    elif hasattr(ModelClass, 'station'):
        if perms.get("acc_documents") is True or perms.get("global_observer") is True:
            return query
        return query.filter(func.upper(ModelClass.station) == user_stn)
        
    return query.filter(text("1=0"))

@router.get("")
def get_exhibits(
    region: Optional[str] = None, 
    station: Optional[str] = None, 
    search: Optional[str] = None, 
    limit: int = 300, 
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)  # 🟢 Fixed to use real authentication
):
    from api_backend import serialize_model_row
    try:
        Model = getattr(models, 'Impounded_Exhibits', getattr(models, 'ImpoundedExhibits', None))
        if not Model: return []
        
        query = db.query(Model)
        
        # 🟢 Apply OPSEC Role & Dual-Equivalence Scoping with active user credentials
        query = apply_opsec_scope(current_user, query, Model)
            
        if region and region != 'ALL REGIONS':
            query = query.filter(func.upper(Model.region) == region.upper())
        if station and station != 'ALL STATIONS':
            query = query.filter(func.upper(Model.station) == station.upper())
            
        if search:
            term = f"%{search.strip().upper()}%"
            
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
    current_user = Depends(get_current_user)  # 🟢 Fixed to use real authentication
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
            "region": data.get("region") or getattr(current_user, 'region', 'KMP HEADQUARTERS'),
            "station": data.get("station") or getattr(current_user, 'station', 'KMP HEADQUARTERS'),
            "date_impounded": data.get("date_impounded"),
            "impounded_by_fnum": data.get("impounded_by_fnum"),
            "impounded_by_rank": data.get("impounded_by_rank"),
            "impounded_by_name": data.get("impounded_by_name"),
            "date_cleared": data.get("date_cleared"),
            "entered_by": data.get("entered_by")
        }

        cat = data.get("category", "MOTOR VEHICLE")
        if hasattr(Model, 'category'):
            model_kwargs['category'] = cat
        else:
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
    current_user = Depends(get_current_user)  # 🟢 Fixed to use real authentication
):
    from api_backend import serialize_model_row
    try:
        Model = getattr(models, 'Impounded_Exhibits', getattr(models, 'ImpoundedExhibits', None))
        item = db.query(Model).filter(Model.id == item_id).first()
        if not item: raise HTTPException(status_code=404, detail="Exhibit record not found.")
        
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