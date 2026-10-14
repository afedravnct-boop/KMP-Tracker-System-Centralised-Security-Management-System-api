import io
import json
import re
from datetime import datetime, date, timedelta
from typing import Optional, List, Union
from urllib.parse import unquote

import pandas as pd
import openpyxl
from openpyxl.styles import Alignment, PatternFill, Font, Border, Side

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_

from app import models, schemas
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1", tags=["Consolidated Ledger"])

def clean_str(val) -> str:
    if not val: return ''
    return str(val).strip().upper()

def normalize_region_name(region_str) -> str:
    if not region_str: return "KMP HEADQUARTERS"
    r = clean_str(region_str)
    if r in ["KMPN", "KMP/N", "KMP NORTH"]: return "KMP NORTH"
    if r in ["KMPS", "KMP/S", "KMP SOUTH"]: return "KMP SOUTH"
    if r in ["KMPE", "KMP/E", "KMP EAST"]: return "KMP EAST"
    if r in ["KMP HQ", "KMP HEADQUARTERS"]: return "KMP HEADQUARTERS"
    if r in ["POLICE HQ", "POLICE HEADQUARTERS", "NAGURU"]: return "POLICE HEADQUARTERS"
    return r

def normalize_station_name(station_str) -> str:
    if not station_str: return "UNKNOWN"
    val = clean_str(station_str)
    if val in ["OLD KLA", "OK", "OLD K", "O/K", "OLD KAMPALA DIVISION"]:
        return "OLD KAMPALA"
    val = val.replace(" POLICE STATION", "").replace(" POL STN", "").replace(" P/STN", "").replace(" DIVISION", "")
    if val.endswith(" P") and len(val) > 2:  
        val = val[:-2].strip()
    return val

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

def is_station_equivalent(stat_a, stat_b) -> bool:
    a = clean_str(stat_a)
    b = clean_str(stat_b)
    if not a or not b: return False
    if a == b: return True
    clean_a = re.sub(r'(\s+HEADQUARTERS|\s+HQ)$', '', a)
    clean_b = re.sub(r'(\s+HEADQUARTERS|\s+HQ)$', '', b)
    return clean_a == clean_b and len(clean_a) > 0

def get_official_region_for_station(station_name: str, db_region: Optional[str] = None) -> str:
    clean_station = clean_str(station_name)
    clean_db_region = normalize_region_name(db_region)

    if REGIONAL_HIERARCHY.get(clean_db_region) and clean_station in REGIONAL_HIERARCHY[clean_db_region]:
        return clean_db_region

    for region_name, stations_list in REGIONAL_HIERARCHY.items():
        if clean_station in stations_list or any(is_station_equivalent(s, clean_station) for s in stations_list):
            return region_name

    return clean_db_region or 'KMP GENERAL'

def get_model_safe(*names):
    for name in names:
        if hasattr(models, name):
            return getattr(models, name)
    return None

@router.get("/reports/consolidated-ledger")
def get_consolidated_ledger(
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    region: Optional[str] = Query("ALL REGIONS"),
    station: Optional[str] = Query("ALL STATIONS"),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        crime_model = get_model_safe('CrimeIncident', 'Crime_Incident', 'Crime_Reports', 'CrimeReports', 'reports')
        stats_model = get_model_safe('OperationalStats', 'Operational_Stats', 'Operational_Statistics', 'operational_stats', 'stats')
        stories_model = get_model_safe('SuccessStories', 'Success_Stories', 'stories')
        
        # 🟢 Corrected to exactly match your models.py
        agric_model = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary')

        today = date.today()
        default_start = today - timedelta(days=6)
        
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else default_start
        except ValueError:
            start_dt = default_start

        try:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else today
        except ValueError:
            end_dt = today

        # Standard Crimes
        if crime_model and hasattr(crime_model, 'date'):
            crimes = db.query(crime_model).filter(crime_model.date >= str(start_dt), crime_model.date <= str(end_dt)).all()
        else:
            crimes = db.query(crime_model).all() if crime_model else []

        # Operational Statistics
        if stats_model and hasattr(stats_model, 'date'):
            statistics = db.query(stats_model).filter(stats_model.date >= str(start_dt), stats_model.date <= str(end_dt)).all()
        else:
            statistics = db.query(stats_model).all() if stats_model else []

        # Success Stories
        if stories_model and hasattr(stories_model, 'date'):
            stories = db.query(stories_model).filter(stories_model.date >= str(start_dt), stories_model.date <= str(end_dt)).all()
        else:
            stories = db.query(stories_model).all() if stories_model else []

        # Agricultural Crimes
        if agric_model and hasattr(agric_model, 'date'):
            agric = db.query(agric_model).filter(agric_model.date >= str(start_dt), agric_model.date <= str(end_dt)).all()
        else:
            agric = db.query(agric_model).all() if agric_model else []

        def serialize_list(items):
            result = []
            for item in items:
                if not item:
                    continue
                d = item.__dict__.copy()
                d.pop("_sa_instance_state", None)
                for k, v in d.items():
                    if hasattr(v, 'isoformat'):
                        d[k] = v.isoformat()
                result.append(d)
            return result

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="VIEW",
            module="CONSOLIDATED_LEDGER",
            target_id="MASTER_SUMMARY",
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} compiled consolidated ledger ({start_dt} to {end_dt})."
        )

        return {
            "status": "success",
            "crimes": serialize_list(crimes),
            "statistics": serialize_list(statistics),
            "stories": serialize_list(stories),
            "agricSummary": serialize_list(agric)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Consolidated Ledger Data Fetch Failed: {str(e)}")