# routers/statistics.py
import json
import csv
import io
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

def get_model_safe(*names):
    for name in names:
        if hasattr(models, name):
            return getattr(models, name)
    return None

def clean_model_dict(obj):
    if not obj:
        return {}
    d = obj.__dict__.copy()
    d.pop('_sa_instance_state', None)
    clean = {}
    for k, v in d.items():
        if hasattr(v, 'isoformat'):
            clean[k] = v.isoformat()
        else:
            clean[k] = v
    return clean

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
        user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN", "DIVISION_ADMIN"] or
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
        return query.filter(func.upper(ModelClass.station) == user_stn)
        
    return query.filter(text("1=0"))

def build_filtered_query(query, ModelClass, region, station, start_date, end_date, search):
    if region and region.upper() not in ["ALL REGIONS", "ALL"]:
        if hasattr(ModelClass, 'region'):
            query = query.filter(func.upper(ModelClass.region) == region.upper())
            
    if station and station.upper() not in ["ALL STATIONS", "ALL"]:
        if hasattr(ModelClass, 'station'):
            clean_stn = station.upper().replace(' HEADQUARTERS', '').replace(' HQ', '')
            query = query.filter(
                or_(
                    func.upper(ModelClass.station) == station.upper(),
                    func.upper(ModelClass.station) == clean_stn,
                    func.upper(ModelClass.station) == f"{clean_stn} HEADQUARTERS"
                )
            )

    if start_date and hasattr(ModelClass, 'date'):
        query = query.filter(ModelClass.date >= start_date)
    
    if end_date and hasattr(ModelClass, 'date'):
        query = query.filter(ModelClass.date <= end_date)

    if search:
        term = f"%{search.strip().upper()}%"
        search_conds = []
        if hasattr(ModelClass, 'station'): search_conds.append(ModelClass.station.ilike(term))
        if hasattr(ModelClass, 'date'): search_conds.append(func.cast(ModelClass.date, text).ilike(term))
        if hasattr(ModelClass, 'id'): search_conds.append(func.cast(ModelClass.id, text).ilike(term))
        if hasattr(ModelClass, 'sn'): search_conds.append(func.cast(ModelClass.sn, text).ilike(term))
        if hasattr(ModelClass, 'agric_crime_report'): search_conds.append(ModelClass.agric_crime_report.ilike(term))
        if search_conds:
            query = query.filter(or_(*search_conds))
            
    return query

# ==========================================
# 1. DISRUPTIVE OPS STATS ENDPOINTS
# ==========================================
@router.get("/stats")
def get_stats(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=300),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
    if not StatsModel: return []
    
    query = db.query(StatsModel)
    query = apply_opsec_scope(current_user, query, StatsModel)
    query = build_filtered_query(query, StatsModel, region, station, start_date, end_date, search)
    
    records = query.order_by(StatsModel.id.desc()).limit(limit).all()
    return [clean_model_dict(r) for r in records]

@router.get("/stats/export")
def export_stats_csv(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
    if not StatsModel: raise HTTPException(status_code=500, detail="Model not found")

    query = db.query(StatsModel)
    query = apply_opsec_scope(current_user, query, StatsModel)
    query = build_filtered_query(query, StatsModel, region, station, start_date, end_date, search)
    records = query.order_by(StatsModel.id.desc()).all()

    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["ID", "Date", "Region", "Station", "Arrested", "Given Bond", "Cautioned", "Pending Court", "Taken to Court", "Released by Court", "Remanded", "Convicted"])

    for r in records:
        writer.writerow([
            getattr(r, 'id', ''), getattr(r, 'date', ''), getattr(r, 'region', ''), getattr(r, 'station', ''),
            getattr(r, 'arrested', 0), getattr(r, 'given_bond', 0), getattr(r, 'cautioned', 0),
            getattr(r, 'pending_court', 0), getattr(r, 'taken_to_court', 0), getattr(r, 'released', 0),
            getattr(r, 'remanded', 0), getattr(r, 'convicted', 0)
        ])

    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    timestamp = datetime.now().strftime("%Y-%m-%d")
    response.headers["Content-Disposition"] = f"attachment; filename=KMP_DISRUPTIVE_OPS_STATS_{timestamp}.csv"
    return response

@router.post("/stats")
def create_stat(data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
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

@router.put("/stats/{record_id}")
def update_stat(record_id: int, data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
    if not StatsModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        record = db.query(StatsModel).filter(StatsModel.id == record_id).first()
        if not record: raise HTTPException(status_code=404, detail="Record not found.")
        data.pop('id', None); data.pop('sn', None)
        for key, value in data.items():
            if hasattr(record, key): setattr(record, key, value)
        db.commit(); db.refresh(record)
        return clean_model_dict(record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 2. AGRICULTURAL CRIME STATS (8-FIELD NUMERICS)
# ==========================================
@router.get("/agric-stats")
def get_agric_stats(
    region: Optional[str] = Query(default=None), station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None), end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None), limit: int = Query(default=300),
    db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)
):
    AgricStatsModel = get_model_safe('AgricStats', 'agric_stats', 'Agric_Stats')
    if not AgricStatsModel: return []
    query = db.query(AgricStatsModel)
    query = apply_opsec_scope(current_user, query, AgricStatsModel)
    query = build_filtered_query(query, AgricStatsModel, region, station, start_date, end_date, search)
    records = query.order_by(AgricStatsModel.id.desc()).limit(limit).all()
    return [clean_model_dict(r) for r in records]

@router.get("/agric-stats/export")
def export_agric_stats_csv(
    region: Optional[str] = Query(default=None), station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None), end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None), db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)
):
    AgricStatsModel = get_model_safe('AgricStats', 'agric_stats', 'Agric_Stats')
    if not AgricStatsModel: raise HTTPException(status_code=500, detail="Model not found")

    query = db.query(AgricStatsModel)
    query = apply_opsec_scope(current_user, query, AgricStatsModel)
    query = build_filtered_query(query, AgricStatsModel, region, station, start_date, end_date, search)
    records = query.order_by(AgricStatsModel.id.desc()).all()

    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["ID", "Date", "Region", "Station", "Arrested", "Given Bond", "Cautioned", "Pending Court", "Taken to Court", "Released by Court", "Remanded", "Convicted"])

    for r in records:
        writer.writerow([
            getattr(r, 'id', ''), getattr(r, 'date', ''), getattr(r, 'region', ''), getattr(r, 'station', ''),
            getattr(r, 'arrested', 0), getattr(r, 'given_bond', 0), getattr(r, 'cautioned', 0),
            getattr(r, 'pending_court', 0), getattr(r, 'taken_to_court', 0), getattr(r, 'released', 0),
            getattr(r, 'remanded', 0), getattr(r, 'convicted', 0)
        ])

    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    timestamp = datetime.now().strftime("%Y-%m-%d")
    response.headers["Content-Disposition"] = f"attachment; filename=KMP_AGRIC_STATS_{timestamp}.csv"
    return response

@router.post("/agric-stats")
def create_agric_stat(data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    AgricStatsModel = get_model_safe('AgricStats', 'agric_stats', 'Agric_Stats')
    if not AgricStatsModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        data.pop('sn', None); data.pop('id', None)
        valid_cols = [c.key for c in AgricStatsModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}
        new_record = AgricStatsModel(**safe_data)
        db.add(new_record); db.commit(); db.refresh(new_record)
        return clean_model_dict(new_record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))

@router.put("/agric-stats/{record_id}")
def update_agric_stat(record_id: int, data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    AgricStatsModel = get_model_safe('AgricStats', 'agric_stats', 'Agric_Stats')
    if not AgricStatsModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        record = db.query(AgricStatsModel).filter(AgricStatsModel.id == record_id).first()
        if not record: raise HTTPException(status_code=404, detail="Record not found.")
        data.pop('id', None); data.pop('sn', None)
        for key, value in data.items():
            if hasattr(record, key): setattr(record, key, value)
        db.commit(); db.refresh(record)
        return clean_model_dict(record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 3. AGRICULTURAL SUMMARY LEDGER ENDPOINTS
# ==========================================
@router.get("/agric-summary")
def get_agric_summary(
    region: Optional[str] = Query(default=None), station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None), end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None), limit: int = Query(default=300),
    db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)
):
    SummaryModel = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary', 'agricultural_crime_summary')
    if not SummaryModel: return []
    query = db.query(SummaryModel)
    query = apply_opsec_scope(current_user, query, SummaryModel)
    query = build_filtered_query(query, SummaryModel, region, station, start_date, end_date, search)
    records = query.order_by(SummaryModel.id.desc()).limit(limit).all()
    return [clean_model_dict(r) for r in records]

@router.get("/agric-summary/export")
def export_agric_summary_csv(
    region: Optional[str] = Query(default=None), station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None), end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None), db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)
):
    SummaryModel = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary', 'agricultural_crime_summary')
    if not SummaryModel: raise HTTPException(status_code=500, detail="Model not found")

    query = db.query(SummaryModel)
    query = apply_opsec_scope(current_user, query, SummaryModel)
    query = build_filtered_query(query, SummaryModel, region, station, start_date, end_date, search)
    records = query.order_by(SummaryModel.id.desc()).all()

    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["ID", "Date", "Region", "Station", "Agricultural Crime Report", "Count / Numbers", "Recoveries", "Status", "Last Updated By"])

    for r in records:
        writer.writerow([
            getattr(r, 'id', ''), getattr(r, 'date', ''), getattr(r, 'region', ''), getattr(r, 'station', ''),
            getattr(r, 'agric_crime_report', ''), getattr(r, 'number_count', 0), getattr(r, 'recoveries', 0),
            getattr(r, 'status', ''), getattr(r, 'last_updated_by', '')
        ])

    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    timestamp = datetime.now().strftime("%Y-%m-%d")
    response.headers["Content-Disposition"] = f"attachment; filename=KMP_AGRIC_CRIME_SUMMARY_{timestamp}.csv"
    return response

@router.post("/agric-summary")
def create_agric_summary(data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    SummaryModel = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary', 'agricultural_crime_summary')
    if not SummaryModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        data.pop('sn', None); data.pop('id', None)
        valid_cols = [c.key for c in SummaryModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}
        new_record = SummaryModel(**safe_data)
        db.add(new_record); db.commit(); db.refresh(new_record)
        return clean_model_dict(new_record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))