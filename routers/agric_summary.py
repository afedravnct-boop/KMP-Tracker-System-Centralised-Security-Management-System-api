import json
from datetime import datetime
from typing import Optional, List, Union
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text

from app import models
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1/agric-summary", tags=["Agricultural Summary Ledger"])

# 🟢 Enriched hierarchy ensuring both "REGION HEADQUARTERS" and "REGION" designations exist
REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

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
        
        # 🟢 Station Dual-Equivalence Check for missing regional tags
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
        return query.filter(func.upper(ModelClass.station) == user_stn)
        
    return query.filter(text("1=0"))

@router.get("/")
def get_agric_summaries(
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(get_current_user)
):
    Model = getattr(models, 'Agricultural_Crime_Summary', None)
    if not Model: return []
    
    query = db.query(Model)
    
    # 🟢 Apply OPSEC Role & Dual-Equivalence Scoping
    query = apply_opsec_scope(current_user, query, Model)
        
    # 🟢 Apply search filtering if search term provided
    if search:
        term = f"%{search.strip().upper()}%"
        search_conds = []
        if hasattr(Model, 'agric_crime_report'): search_conds.append(Model.agric_crime_report.ilike(term))
        if hasattr(Model, 'status'): search_conds.append(Model.status.ilike(term))
        if hasattr(Model, 'station'): search_conds.append(Model.station.ilike(term))
        if hasattr(Model, 'region'): search_conds.append(Model.region.ilike(term))
        if hasattr(Model, 'last_updated_by'): search_conds.append(Model.last_updated_by.ilike(term))
        if search_conds:
            query = query.filter(or_(*search_conds))

    records = query.order_by(Model.id.desc()).all()
    
    serialized_records = [{
        "id": r.id, 
        "sn": getattr(r, 'sn', None) or idx + 1, 
        "region": r.region, 
        "station": r.station, 
        "date": str(r.date), 
        "agric_crime_report": r.agric_crime_report, 
        "number_count": r.number_count,
        "recoveries": r.recoveries, 
        "status": r.status, 
        "last_updated_by": r.last_updated_by
    } for idx, r in enumerate(records)]

    # 🟢 Precision forensic check: Log search query vs regular view
    if search:
        summary_text = f"{current_user.fnum} {current_user.rank} {current_user.name} searched agricultural crime ledger for query: \"{search}\" (Returned {len(serialized_records)} matches)."
    else:
        summary_text = f"{current_user.fnum} {current_user.rank} {current_user.name} accessed Agricultural Crime Summary Ledger (Fetched {len(serialized_records)} records)."

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="VIEW",
        module="AGRIC_SUMMARY_LEDGER",
        target_id=search if search else "ALL_RECORDS",
        changes_summary=summary_text
    )

    return serialized_records

@router.post("/")
def create_agric_summary(
    data: dict, 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(get_current_user)
):
    Model = getattr(models, 'Agricultural_Crime_Summary', None)
    if not Model: raise HTTPException(status_code=500, detail="Model not initialized.")
    
    try:
        new_record = Model(
            region=data.get("region") or current_user.region,
            station=data.get("station") or current_user.station,
            date=data.get("date") or datetime.now().strftime("%Y-%m-%d"),
            agric_crime_report=str(data.get("agric_crime_report", "")).upper(),
            number_count=int(data.get("number_count", 0)),
            recoveries=int(data.get("recoveries", 0)),
            status=str(data.get("status", "UNDER INVESTIGATION")),
            last_updated_by=f"{current_user.fnum} {current_user.rank} {current_user.name}"
        )
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        
        # 🟢 Record precise forensic REGISTER activity into NeonDB Activity Logs branch
        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="REGISTER",
            module="AGRIC_SUMMARY_LEDGER",
            target_id=str(new_record.id),
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} registered new agricultural crime summary [{new_record.agric_crime_report}] for station {new_record.station}."
        )

        return {"status": "success", "id": new_record.id}
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))