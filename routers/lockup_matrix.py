from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text
from datetime import datetime

from app import models, schemas
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["Lockup Matrix & Operations"])

# 🟢 Enriched hierarchy ensuring both "REGION HEADQUARTERS" and "REGION" designations exist
REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

def get_officer_signature(user):
    if not user:
        return "UNKNOWN COMMANDER"
    fnum = (user.fnum or "").strip()
    rank = (user.rank or "").strip()
    name = (user.name or "").strip()
    return f"{fnum} {rank} {name}".strip().upper()

# 🟢 CORE OPSEC SCOPING ENGINE
def apply_opsec_scope(current_user, query, ModelClass):
    if not ModelClass:
        return query
    
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

    is_kmp_specialist = (
        user_role == "ASSISTANT_SYSTEM_MANAGER" and
        user_reg in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"] and
        "KMP" in user_pos
    )

    is_regional_command = (
        user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN", "DIVISION_ADMIN"] and
        not is_kmp_sys_mgr and
        not is_kmp_specialist
    )

    if is_absolute_global or is_kmp_sys_mgr:
        return query
        
    elif is_kmp_specialist and hasattr(ModelClass, 'region'):
        return query.filter(func.upper(ModelClass.region) == user_reg)
        
    elif is_regional_command or user_reg in REGIONAL_HIERARCHY:
        conds = []
        if hasattr(ModelClass, 'region'):
            conds.append(func.upper(ModelClass.region) == user_reg)
        
        # 🟢 Station Dual-Equivalence Check for missing regional tags (plus Headquarters totals)
        if hasattr(ModelClass, 'station') and user_reg in REGIONAL_HIERARCHY:
            expanded_stns = set()
            for s in REGIONAL_HIERARCHY[user_reg]:
                expanded_stns.add(s)
                expanded_stns.add(s.replace(' HEADQUARTERS', '').replace(' HQ', ''))
                expanded_stns.add(s + ' HEADQUARTERS')
                expanded_stns.add(s + ' HQ')
            
            expanded_stns.add("HEADQUARTERS GENERAL TOTAL")
            expanded_stns.add("KMP HEADQUARTERS")
            
            conds.append(func.upper(ModelClass.station).in_(list(expanded_stns)))
            
        if conds:
            return query.filter(or_(*conds))
        return query.filter(text("1=0"))
        
    elif hasattr(ModelClass, 'station'):
        return query.filter(
            or_(
                func.upper(ModelClass.station) == user_stn,
                func.upper(ModelClass.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"])
            )
        )
        
    return query.filter(text("1=0"))

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
    query = db.query(models.LockupMatrix)
    query = apply_opsec_scope(current_user, query, models.LockupMatrix)
        
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
    
    user_role = (current_user.role or "").strip().upper()
    user_station = (current_user.station or "").strip().upper()
    perms = current_user.permissions or {}
    
    is_global = (
        user_role in ["SUPER_ADMIN", "ADMIN"] or
        perms.get("global_observer", False) is True or 
        user_role in ["RPC", "DEPUTY COMMANDER"] or
        str(current_user.region).strip().upper() in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"]
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
        existing_entry.male_count = entry.male_count
        existing_entry.male_juvenile_count = entry.male_juvenile_count       
        existing_entry.female_count = entry.female_count
        existing_entry.female_juvenile_count = entry.female_juvenile_count     
        existing_entry.detention_1day = entry.detention_1day
        existing_entry.detention_2days = entry.detention_2days
        existing_entry.detention_3days_over = entry.detention_3days_over
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
    query = apply_opsec_scope(current_user, query, models.Operational_Statistics)
        
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