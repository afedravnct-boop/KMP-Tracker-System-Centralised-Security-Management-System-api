import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, text

from app import models
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1", tags=["Success Stories"])

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

@router.get("/stories")
def get_stories(
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    query = db.query(models.Success_Stories)
    query = apply_opsec_scope(current_user, query, models.Success_Stories)
    
    # 🟢 Apply search filtering if search term provided
    if search:
        term = f"%{search.strip().upper()}%"
        search_conds = []
        if hasattr(models.Success_Stories, 'title'): search_conds.append(models.Success_Stories.title.ilike(term))
        if hasattr(models.Success_Stories, 'narrative'): search_conds.append(models.Success_Stories.narrative.ilike(term))
        if hasattr(models.Success_Stories, 'station'): search_conds.append(models.Success_Stories.station.ilike(term))
        if hasattr(models.Success_Stories, 'region'): search_conds.append(models.Success_Stories.region.ilike(term))
        if hasattr(models.Success_Stories, 'last_updated_by'): search_conds.append(models.Success_Stories.last_updated_by.ilike(term))
        if search_conds:
            query = query.filter(or_(*search_conds))

    records = query.order_by(models.Success_Stories.sn.desc()).all()
        
    # 🟢 Precision forensic check: Log search query vs regular view
    if search:
        summary_text = f"{current_user.fnum} {current_user.rank} {current_user.name} searched success stories ledger for query: \"{search}\" (Returned {len(records)} matches)."
    else:
        summary_text = f"{current_user.fnum} {current_user.rank} {current_user.name} accessed Success Stories ledger (Fetched {len(records)} records)."

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="VIEW",
        module="SUCCESS_STORIES",
        target_id=search if search else "ALL_STORIES",
        changes_summary=summary_text
    )

    return records

@router.post("/stories")
def create_story(
    data: dict, 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        data.pop('sn', None) 
        
        data["region"] = current_user.region
        data["station"] = current_user.station
            
        new_record = models.Success_Stories(**data)
        new_record.last_updated_by = get_officer_signature(current_user)
        db.add(new_record)
        db.commit()
        db.refresh(new_record)

        # 🟢 Record precise forensic REGISTER action to NeonDB activity branch
        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="REGISTER",
            module="SUCCESS_STORIES",
            target_id=str(new_record.sn),
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} registered new success story for station {current_user.station}."
        )

        return {"status": "success", "sn": new_record.sn}
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/stories/{sn}")
def update_story(
    sn: int, 
    data: dict, 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        record = db.query(models.Success_Stories).filter(models.Success_Stories.sn == sn).first()
        if not record:
            raise HTTPException(status_code=404, detail="Success story record not found.")

        user_role = (current_user.role or "").upper()
        is_national_admin = user_role in ["SUPER_ADMIN", "ADMIN"] or (current_user.permissions or {}).get("system_admin") is True

        if not is_national_admin:
            data.pop('region', None)
            data.pop('station', None)

        for key, value in data.items():
            if key not in ['sn', 'id']:
                setattr(record, key, value)

        record.last_updated_by = get_officer_signature(current_user)
        db.commit()
        db.refresh(record)
        
        # 🟢 Record precise forensic UPDATE action to NeonDB activity branch
        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="SUCCESS_STORIES",
            target_id=str(sn),
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} modified success story record SN [{sn}]."
        )

        return {"status": "success", "sn": record.sn, "message": "Success story updated successfully."}
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))