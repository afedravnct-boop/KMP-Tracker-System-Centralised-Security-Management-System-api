# routers/statistics.py
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text

from app import models
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1", tags=["Statistics & Operations"])

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

# ==========================================
# 1. DISRUPTIVE OPS STATS ENDPOINTS
# ==========================================
@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
    if not StatsModel:
        return []
    records = db.query(StatsModel).order_by(StatsModel.id.desc()).all()
    return [clean_model_dict(r) for r in records]

@router.post("/stats")
def create_stat(
    data: dict,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
    if not StatsModel:
        raise HTTPException(status_code=500, detail="Operational Statistics model not configured.")
    try:
        data.pop('sn', None)
        data.pop('id', None)
        
        valid_cols = [c.key for c in StatsModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}
        
        new_record = StatsModel(**safe_data)
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        
        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="REGISTER",
            module="OPS_STATISTICS",
            target_id=str(new_record.id),
            changes_summary=f"Disruptive OPS statistics registered for station [{new_record.station}] on date [{new_record.date}]."
        )
        return clean_model_dict(new_record)
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/stats/{record_id}")
def update_stat(
    record_id: int,
    data: dict,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
    if not StatsModel:
        raise HTTPException(status_code=500, detail="Operational Statistics model not configured.")
    try:
        record = db.query(StatsModel).filter(StatsModel.id == record_id).first()
        if not record:
            raise HTTPException(status_code=404, detail="Statistics record not found.")

        data.pop('id', None)
        data.pop('sn', None)

        for key, value in data.items():
            if hasattr(record, key):
                setattr(record, key, value)

        db.commit()
        db.refresh(record)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="OPS_STATISTICS",
            target_id=str(record_id),
            changes_summary=f"Disruptive OPS statistics modified for record ID [{record_id}]."
        )
        return clean_model_dict(record)
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 2. AGRICULTURAL CRIME STATS ENDPOINTS
# ==========================================
@router.get("/agric-stats")
def get_agric_stats(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    AgricStatsModel = get_model_safe('AgricStats', 'agric_stats', 'Agric_Stats')
    if not AgricStatsModel:
        return []
    records = db.query(AgricStatsModel).order_by(AgricStatsModel.id.desc()).all()
    return [clean_model_dict(r) for r in records]

@router.post("/agric-stats")
def create_agric_stat(
    data: dict,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    AgricStatsModel = get_model_safe('AgricStats', 'agric_stats', 'Agric_Stats')
    if not AgricStatsModel:
        raise HTTPException(status_code=500, detail="Agric Stats model not configured.")
    try:
        data.pop('sn', None)
        data.pop('id', None)
        
        valid_cols = [c.key for c in AgricStatsModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}
        
        new_record = AgricStatsModel(**safe_data)
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        
        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="REGISTER",
            module="AGRIC_STATISTICS",
            target_id=str(new_record.id),
            changes_summary=f"Agricultural statistics registered for station [{new_record.station}]."
        )
        return clean_model_dict(new_record)
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/agric-stats/{record_id}")
def update_agric_stat(
    record_id: int,
    data: dict,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    AgricStatsModel = get_model_safe('AgricStats', 'agric_stats', 'Agric_Stats')
    if not AgricStatsModel:
        raise HTTPException(status_code=500, detail="Agric Stats model not configured.")
    try:
        record = db.query(AgricStatsModel).filter(AgricStatsModel.id == record_id).first()
        if not record:
            raise HTTPException(status_code=404, detail="Agricultural statistics record not found.")

        data.pop('id', None)
        data.pop('sn', None)

        for key, value in data.items():
            if hasattr(record, key):
                setattr(record, key, value)

        db.commit()
        db.refresh(record)
        return clean_model_dict(record)
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 3. AGRICULTURAL SUMMARY LEDGER ENDPOINTS
# ==========================================
@router.get("/agric-summary")
def get_agric_summary(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    SummaryModel = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary', 'agricultural_crime_summary')
    if not SummaryModel:
        return []
    records = db.query(SummaryModel).order_by(SummaryModel.id.desc()).all()
    return [clean_model_dict(r) for r in records]

@router.post("/agric-summary")
def create_agric_summary(
    data: dict,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    SummaryModel = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary', 'agricultural_crime_summary')
    if not SummaryModel:
        raise HTTPException(status_code=500, detail="Agricultural Summary model not configured.")
    try:
        data.pop('sn', None)
        data.pop('id', None)
        
        valid_cols = [c.key for c in SummaryModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}
        
        new_record = SummaryModel(**safe_data)
        db.add(new_record)
        db.commit()
        db.refresh(new_record)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="REGISTER",
            module="AGRIC_SUMMARY",
            target_id=str(new_record.id),
            changes_summary=f"Agricultural crime summary logged for station [{new_record.station}]."
        )
        return clean_model_dict(new_record)
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))