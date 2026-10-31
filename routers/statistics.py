# routers/statistics.py
import json
import csv
import io
import pytz
import pyzipper
import openpyxl
from openpyxl.styles import Alignment, PatternFill, Font, Border, Side
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text

from app import models
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1", tags=["Statistics & Operations"])

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

def safe_int(val) -> int:
    try:
        return int(float(val)) if val else 0
    except (ValueError, TypeError):
        return 0

def get_model_safe(*names):
    for name in names:
        if hasattr(models, name):
            return getattr(models, name)
    target_slugs = [n.lower() for n in names]
    for attr_name, cls in models.__dict__.items():
        if isinstance(cls, type) and hasattr(cls, '__tablename__'):
            if cls.__tablename__.lower() in target_slugs or attr_name.lower() in target_slugs:
                return cls
    return None

def clean_model_dict(obj):
    if not obj: return {}
    if isinstance(obj, dict): return obj
    d = obj.__dict__.copy()
    d.pop('_sa_instance_state', None)
    clean = {}
    for k, v in d.items():
        if hasattr(v, 'isoformat'): clean[k] = v.isoformat()
        else: clean[k] = v
    return clean

def get_officer_signature(user):
    if not user: return "UNKNOWN COMMANDER"
    return f"{user.fnum or ''} {user.rank or ''} {user.name or ''}".strip().upper()

def is_user_global_tier(current_user) -> bool:
    if not current_user: return False
    user_role = str(getattr(current_user, 'role', '')).strip().upper().replace(' ', '_')
    user_pos = str(getattr(current_user, 'position', '')).strip().upper()
    user_reg = str(getattr(current_user, 'region', '')).strip().upper()
    perms = getattr(current_user, 'permissions', {})
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}

    return (
        user_role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN", "RPC", "DEPUTY COMMANDER", "SUPERVISOR"] or
        "KMP COMMANDER" in user_pos or "DEPUTY KMP COMMANDER" in user_pos or
        "KMP ADMIN" in user_pos or "SYSTEM_MANAGER" in user_role or
        perms.get("view_global_roster") is True or perms.get("global_observer") is True or
        user_reg in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"]
    )

def apply_opsec_scope(current_user, query, ModelClass):
    if not ModelClass or not current_user:
        return query.filter(text("1=0"))
    
    if is_user_global_tier(current_user):
        return query
    
    user_role = str(current_user.role or "").strip().upper()
    user_pos = str(current_user.position or "").strip().upper()
    user_reg = str(current_user.region or "").strip().upper()
    user_stn = str(current_user.station or "").strip().upper()
    clean_stn = user_stn.replace(" HEADQUARTERS", "").replace(" HQ", "")

    is_regional_command = (
        user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN", "DIVISION_ADMIN"] or
        "HR" in user_pos or user_reg in REGIONAL_HIERARCHY
    )
        
    if is_regional_command or user_reg in REGIONAL_HIERARCHY:
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
        if conds: return query.filter(or_(*conds))
        return query.filter(text("1=0"))
        
    elif hasattr(ModelClass, 'station') and user_stn:
        return query.filter(
            or_(
                func.upper(ModelClass.station) == user_stn,
                func.upper(ModelClass.station) == f"{clean_stn} HEADQUARTERS",
                func.upper(ModelClass.station) == f"{clean_stn} HQ"
            )
        )
    return query.filter(text("1=0"))

def build_filtered_query(query, ModelClass, region, station, start_date, end_date, search):
    clean_stn = ""
    if region and region.upper() not in ["ALL REGIONS", "ALL"]:
        if hasattr(ModelClass, 'region'):
            query = query.filter(func.upper(ModelClass.region) == region.upper())
            
    if station and station.upper() not in ["ALL STATIONS", "ALL STATIONS / DIVISIONS", "ALL"]:
        if hasattr(ModelClass, 'station'):
            clean_stn = station.upper().replace(' HEADQUARTERS', '').replace(' HQ', '')
            query = query.filter(
                or_(
                    func.upper(ModelClass.station) == station.upper(),
                    func.upper(ModelClass.station) == clean_stn,
                    func.upper(ModelClass.station) == f"{clean_stn} HEADQUARTERS"
                )
            )

    invalid_date_strings = ["ALL TIME", "ALL", "UNDEFINED", "NULL", ""]
    try:
        if start_date and str(start_date).strip().upper() not in invalid_date_strings and hasattr(ModelClass, 'date'):
            query = query.filter(func.cast(ModelClass.date, text("VARCHAR")) >= start_date)
        if end_date and str(end_date).strip().upper() not in invalid_date_strings and hasattr(ModelClass, 'date'):
            query = query.filter(func.cast(ModelClass.date, text("VARCHAR")) <= end_date)
    except Exception:
        pass

    if search:
        term = f"%{search.strip().upper()}%"
        search_conds = []
        for col_name in ['station', 'date', 'id', 'sn', 'nature_of_accident', 'nature_of_fire']:
            if hasattr(ModelClass, col_name):
                col = getattr(ModelClass, col_name)
                search_conds.append(func.cast(col, text("VARCHAR")).ilike(term))
        if search_conds:
            query = query.filter(or_(*search_conds))
    return query


# ==========================================
# 1. DISRUPTIVE OPS STATS (`operational_statistics`)
# ==========================================
@router.get("/stats")
def get_stats(
    region: Optional[str] = Query(default=None), station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None), end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None), limit: int = Query(default=300),
    db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user = Depends(get_current_user)
):
    try:
        StatsModel = get_model_safe('operational_statistics', 'OperationalStatistics', 'Stats')
        if not StatsModel: return []
        query = db.query(StatsModel)
        query = apply_opsec_scope(current_user, query, StatsModel)
        query = build_filtered_query(query, StatsModel, region, station, start_date, end_date, search)
        
        pk_col = getattr(StatsModel, 'id', getattr(StatsModel, 'sn', None))
        records = query.order_by(pk_col.desc()).limit(limit).all() if pk_col and hasattr(pk_col, 'desc') else query.limit(limit).all()
        
        return [{
            "id": getattr(r, 'id', getattr(r, 'sn', 0)),
            "date": str(getattr(r, 'date', '') or ''),
            "region": str(getattr(r, 'region', '') or ''),
            "station": str(getattr(r, 'station', '') or ''),
            "arrested": safe_int(getattr(r, 'arrested', 0)),
            "given_bond": safe_int(getattr(r, 'given_bond', 0)),
            "cautioned": safe_int(getattr(r, 'cautioned', 0)),
            "pending_court": safe_int(getattr(r, 'pending_court', 0)),
            "taken_to_court": safe_int(getattr(r, 'taken_to_court', 0)),
            "released": safe_int(getattr(r, 'released', 0)),
            "remanded": safe_int(getattr(r, 'remanded', 0)),
            "convicted": safe_int(getattr(r, 'convicted', 0))
        } for r in records]
    except Exception as e:
        print(f"Stats Error: {e}")
        return []

@router.post("/stats")
def create_stat(data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user = Depends(get_current_user)):
    StatsModel = get_model_safe('operational_statistics', 'OperationalStatistics', 'Stats')
    if not StatsModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        data.pop('sn', None); data.pop('id', None)
        valid_cols = [c.key for c in StatsModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}
        new_record = StatsModel(**safe_data)
        db.add(new_record); db.commit(); db.refresh(new_record)
        return clean_model_dict(new_record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 2. AGRICULTURAL CRIMES STATS (`agric_crimes_statistics`) - MATCHING DISRUPTIVE OPS METRICS
# ==========================================
@router.get("/agric-stats")
def get_agric_stats(
    region: Optional[str] = Query(default=None), station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None), end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None), limit: int = Query(default=300),
    db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user = Depends(get_current_user)
):
    try:
        AgricModel = get_model_safe('agric_crimes_statistics', 'AgricStats')
        if not AgricModel: return []
        query = db.query(AgricModel)
        query = apply_opsec_scope(current_user, query, AgricModel)
        query = build_filtered_query(query, AgricModel, region, station, start_date, end_date, search)
        
        pk_col = getattr(AgricModel, 'id', getattr(AgricModel, 'sn', None))
        records = query.order_by(pk_col.desc()).limit(limit).all() if pk_col else query.limit(limit).all()
        
        return [{
            "id": getattr(r, 'id', getattr(r, 'sn', 0)),
            "date": str(getattr(r, 'date', '') or ''),
            "region": str(getattr(r, 'region', '') or ''),
            "station": str(getattr(r, 'station', '') or ''),
            "arrested": safe_int(getattr(r, 'arrested', 0)),
            "given_bond": safe_int(getattr(r, 'given_bond', 0)),
            "cautioned": safe_int(getattr(r, 'cautioned', 0)),
            "pending_court": safe_int(getattr(r, 'pending_court', 0)),
            "taken_to_court": safe_int(getattr(r, 'taken_to_court', 0)),
            "released": safe_int(getattr(r, 'released', 0)),
            "remanded": safe_int(getattr(r, 'remanded', 0)),
            "convicted": safe_int(getattr(r, 'convicted', 0))
        } for r in records]
    except Exception as e:
        print(f"Agric Stats Error: {e}")
        return []

@router.post("/agric-stats")
def create_agric_stat(data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user = Depends(get_current_user)):
    AgricModel = get_model_safe('agric_crimes_statistics', 'AgricStats')
    if not AgricModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        data.pop('sn', None); data.pop('id', None)
        valid_cols = [c.key for c in AgricModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}
        new_record = AgricModel(**safe_data)
        db.add(new_record); db.commit(); db.refresh(new_record)
        return clean_model_dict(new_record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 3. ACCIDENTS STATISTICS (`accidents_statistics`)
# ==========================================
@router.get("/accidents")
def get_accidents_stats(
    region: Optional[str] = Query(default=None), station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None), end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None), limit: int = Query(default=300),
    db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user = Depends(get_current_user)
):
    try:
        AccidentsModel = get_model_safe('accidents_statistics', 'AccidentsStatistics')
        if not AccidentsModel: return []
        query = db.query(AccidentsModel)
        query = apply_opsec_scope(current_user, query, AccidentsModel)
        query = build_filtered_query(query, AccidentsModel, region, station, start_date, end_date, search)
        
        pk_col = getattr(AccidentsModel, 'id', getattr(AccidentsModel, 'sn', None))
        records = query.order_by(pk_col.desc()).limit(limit).all() if pk_col else query.limit(limit).all()
        
        return [{
            "id": getattr(r, 'id', getattr(r, 'sn', 0)),
            "date": str(getattr(r, 'date', '') or ''),
            "region": str(getattr(r, 'region', '') or ''),
            "station": str(getattr(r, 'station', '') or ''),
            "nature_of_accident": str(getattr(r, 'nature_of_accident', '') or ''),
            "minor": safe_int(getattr(r, 'minor', 0)),
            "serious": safe_int(getattr(r, 'serious', 0)),
            "fatal": safe_int(getattr(r, 'fatal', 0)),
            "victims": safe_int(getattr(r, 'victims', 0)),
            "total": safe_int(getattr(r, 'total', 0))
        } for r in records]
    except Exception as e:
        print(f"Accidents Error: {e}")
        return []

@router.post("/accidents")
def create_accidents_stat(data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user = Depends(get_current_user)):
    AccidentsModel = get_model_safe('accidents_statistics', 'AccidentsStatistics')
    if not AccidentsModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        data.pop('sn', None); data.pop('id', None)
        valid_cols = [c.key for c in AccidentsModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}
        safe_data['total'] = safe_int(safe_data.get('minor', 0)) + safe_int(safe_data.get('serious', 0)) + safe_int(safe_data.get('fatal', 0))
        new_record = AccidentsModel(**safe_data)
        db.add(new_record); db.commit(); db.refresh(new_record)
        return clean_model_dict(new_record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 4. FIRE STATISTICS (`fire_statistics`)
# ==========================================
@router.get("/fires")
def get_fires_stats(
    region: Optional[str] = Query(default=None), station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None), end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None), limit: int = Query(default=300),
    db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user = Depends(get_current_user)
):
    try:
        FiresModel = get_model_safe('fire_statistics', 'FireStatistics')
        if not FiresModel: return []
        query = db.query(FiresModel)
        query = apply_opsec_scope(current_user, query, FiresModel)
        query = build_filtered_query(query, FiresModel, region, station, start_date, end_date, search)
        
        pk_col = getattr(FiresModel, 'id', getattr(FiresModel, 'sn', None))
        records = query.order_by(pk_col.desc()).limit(limit).all() if pk_col else query.limit(limit).all()
        
        return [{
            "id": getattr(r, 'id', getattr(r, 'sn', 0)),
            "date": str(getattr(r, 'date', '') or ''),
            "region": str(getattr(r, 'region', '') or ''),
            "station": str(getattr(r, 'station', '') or ''),
            "nature_of_fire": str(getattr(r, 'nature_of_fire', '') or ''),
            "minor_outbreaks": safe_int(getattr(r, 'minor_outbreaks', 0)),
            "major_disasters": safe_int(getattr(r, 'major_disasters', 0)),
            "fatal_fires": safe_int(getattr(r, 'fatal_fires', 0)),
            "victims": safe_int(getattr(r, 'victims', 0)),
            "total": safe_int(getattr(r, 'total', 0))
        } for r in records]
    except Exception as e:
        print(f"Fires Error: {e}")
        return []

@router.post("/fires")
def create_fires_stat(data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user = Depends(get_current_user)):
    FiresModel = get_model_safe('fire_statistics', 'FireStatistics')
    if not FiresModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        data.pop('sn', None); data.pop('id', None)
        valid_cols = [c.key for c in FiresModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}
        safe_data['total'] = safe_int(safe_data.get('minor_outbreaks', 0)) + safe_int(safe_data.get('major_disasters', 0)) + safe_int(safe_data.get('fatal_fires', 0))
        new_record = FiresModel(**safe_data)
        db.add(new_record); db.commit(); db.refresh(new_record)
        return clean_model_dict(new_record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))