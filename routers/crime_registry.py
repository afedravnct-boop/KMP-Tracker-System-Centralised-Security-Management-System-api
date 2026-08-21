from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from app import models
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["Crime Registry"])

def get_officer_signature(user):
    if not user:
        return "UNKNOWN COMMANDER"
    fnum = (user.fnum or "").strip()
    rank = (user.rank or "").strip()
    name = (user.name or "").strip()
    return f"{fnum} {rank} {name}".strip().upper()

def get_model_safe(*names):
    """Safely retrieves a SQLAlchemy model handling naming variants."""
    for name in names:
        if hasattr(models, name):
            return getattr(models, name)
    return None

def clean_model_dict(obj):
    """Safely converts a SQLAlchemy instance to a clean JSON-serializable dictionary with mapped aliases."""
    if not obj:
        return {}
    d = obj.__dict__.copy()
    d.pop('_sa_instance_state', None)
    
    clean = {}
    for k, v in d.items():
        if isinstance(v, (datetime, date)):
            clean[k] = v.isoformat()
        elif isinstance(v, Decimal):
            clean[k] = float(v)
        else:
            clean[k] = v
            
    # Normalize common field aliases for ledger tables
    ref_val = clean.get('sd_ref') or clean.get('sdRef') or ''
    clean['sd_ref'] = ref_val
    clean['sdRef'] = ref_val

    if 'date' not in clean or not clean['date']:
        clean['date'] = clean.get('created_at') or clean.get('timestamp') or ''

    return clean

# ====================================================================
# 1. RETRIEVE CRIME REPORTS
# ====================================================================
@router.get("/reports")
def get_reports(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    CrimeModel = get_model_safe('Crime_Reports', 'CrimeReports', 'crime_reports', 'Reports', 'reports')
    if not CrimeModel:
        return []

    query = db.query(CrimeModel)
    if current_user.role == "SUPER_ADMIN" or (current_user.permissions or {}).get("view_all_reports", False):
        pass 
    elif current_user.role in ["ADMIN", "RPC"]:
        if hasattr(CrimeModel, 'region'):
            query = query.filter(CrimeModel.region == current_user.region)
    else:
        if hasattr(CrimeModel, 'station'):
            query = query.filter(CrimeModel.station == current_user.station)
        
    pk_col = getattr(CrimeModel, 'sn', getattr(CrimeModel, 'id', None))
    reports = query.order_by(pk_col.desc()).all() if pk_col is not None else query.all()
    
    return [{
        "sn": getattr(r, 'sn', getattr(r, 'id', 1)), 
        "sdRef": getattr(r, 'sd_ref', getattr(r, 'sdRef', '')), 
        "sd_ref": getattr(r, 'sd_ref', getattr(r, 'sdRef', '')), 
        "region": getattr(r, 'region', 'KMP HEADQUARTERS'), 
        "station": getattr(r, 'station', 'HQ'),
        "date": str(getattr(r, 'date', '')), 
        "time": str(getattr(r, 'time', '')), 
        "offence": getattr(r, 'offence', 'GENERAL CRIME'), 
        "narrative": getattr(r, 'narrative', ''), 
        "status": getattr(r, 'status', 'PENDING'), 
        "suspects": getattr(r, 'suspects', 0), 
        "lastUpdatedBy": getattr(r, 'last_updated_by', 'UNKNOWN COMMANDER'),
        "daily_lock_up": getattr(r, 'daily_lock_up', 0), 
        "suspectDetails": [{
            "name": getattr(s, 'name', ''), 
            "sex": getattr(s, 'sex', ''), 
            "age": getattr(s, 'age', ''),
            "tribe": getattr(s, 'tribe', ''),
            "residence": getattr(s, 'residence', ''),
            "contact": getattr(s, 'contact', ''),
            "mental_health_status": getattr(s, 'mental_health_status', ''), 
            "photo_url": getattr(s, 'photo_url', '')
        } for s in getattr(r, 'suspect_details', [])]
    } for r in reports] 

# ====================================================================
# 2. CREATE CRIME REPORT
# ====================================================================
@router.post("/reports")
def create_report(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    CrimeModel = get_model_safe('Crime_Reports', 'CrimeReports', 'crime_reports', 'Reports', 'reports')
    SuspectModel = get_model_safe('Suspect_Lockup', 'SuspectLockup', 'suspect_lockup')
    
    if not CrimeModel:
        raise HTTPException(status_code=500, detail="Crime Reports database model not configured.")

    try:
        data.pop('sn', None) 
        
        user_station = (current_user.station or "").strip().upper()
        user_region = (current_user.region or "").strip().upper()
        is_hq_admin = current_user.role in ["SUPER_ADMIN", "ADMIN"] or "HEADQUARTERS" in user_station or "HEADQUARTERS" in user_region or "999" in (current_user.position or "").upper()

        is_hq_general_total = data.pop('is_hq_general_total', False)

        if is_hq_general_total:
            if not is_hq_admin:
                raise HTTPException(status_code=403, detail="Clearance Denied.")
            data["region"] = "KMP HEADQUARTERS"
            data["station"] = "HEADQUARTERS GENERAL TOTAL"
            data["offence"] = data.get("offence", "HQ GENERAL SUSPECT LOCK-UP TOTAL")
        else:
            if current_user.role not in ["SUPER_ADMIN", "RPC"]:
                data["region"] = current_user.region
                data["station"] = current_user.station

        # Duplicate check
        incoming_sd_ref = (data.get("sd_ref") or "").strip().lower()
        incoming_station = (data.get("station") or "").strip().lower()
        if incoming_sd_ref and hasattr(CrimeModel, 'station') and hasattr(CrimeModel, 'sd_ref'):
            existing_ref = db.query(CrimeModel).filter(
                func.lower(CrimeModel.station) == incoming_station,
                func.lower(CrimeModel.sd_ref) == incoming_sd_ref
            ).first()
            if existing_ref:
                raise HTTPException(status_code=400, detail=f"Duplicate Rejection: Reference '{data.get('sd_ref')}' already exists for this station.")

        suspects_data = data.pop('suspectDetails', []) 
        valid_cols = [c.key for c in CrimeModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}

        new_record = CrimeModel(**safe_data)
        if hasattr(new_record, 'last_updated_by'):
            new_record.last_updated_by = get_officer_signature(current_user)
        
        db.add(new_record)
        db.flush() 
        
        if hasattr(new_record, 'sn') and hasattr(new_record, 'id'):
            new_record.sn = new_record.id 
        
        if SuspectModel and hasattr(new_record, 'id'):
            for s in suspects_data:
                valid_s_cols = [c.key for c in SuspectModel.__table__.columns]
                s_payload = {
                    "report_id": new_record.id, 
                    "name": s.get('name'), 
                    "sex": s.get('sex'), 
                    "age": str(s.get('age')) if s.get('age') else None,
                    "tribe": s.get('tribe'),
                    "nationality": s.get('nationality'),
                    "residence": s.get('residence'), 
                    "contact": s.get('contact'),
                    "mental_health_status": s.get('mental_health_status'),
                    "photo_url": s.get('photo_url') 
                }
                safe_s_payload = {k: v for k, v in s_payload.items() if k in valid_s_cols}
                db.add(SuspectModel(**safe_s_payload))
            
        db.commit()
        db.refresh(new_record)
        assigned_id = getattr(new_record, 'id', getattr(new_record, 'sn', 1))
        return {"status": "success", "id": assigned_id, "sn": assigned_id}
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ====================================================================
# 3. UPDATE CRIME REPORT
# ====================================================================
@router.put("/reports/{sn}")
def update_report(sn: int, data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    CrimeModel = get_model_safe('Crime_Reports', 'CrimeReports', 'crime_reports', 'Reports', 'reports')
    SuspectModel = get_model_safe('Suspect_Lockup', 'SuspectLockup', 'suspect_lockup')
    
    if not CrimeModel:
        raise HTTPException(status_code=500, detail="Crime Reports model not configured.")

    try:
        query_filter = []
        if hasattr(CrimeModel, 'sn'):
            query_filter.append(CrimeModel.sn == sn)
        if hasattr(CrimeModel, 'id'):
            query_filter.append(CrimeModel.id == sn)
            
        existing_report = db.query(CrimeModel).filter(or_(*query_filter)).first()
        if not existing_report:
            raise HTTPException(status_code=404, detail="Crime Report not found")

        suspects_data = data.pop('suspectDetails', [])
        data.pop('sn', None)
        data.pop('id', None)
        
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data.pop("region", None)
            data.pop("station", None)
        
        for key, value in data.items():
            if hasattr(existing_report, key):
                setattr(existing_report, key, value)
                
        if hasattr(existing_report, 'last_updated_by'):
            existing_report.last_updated_by = get_officer_signature(current_user)
        
        if SuspectModel and hasattr(existing_report, 'id'):
            report_pk = existing_report.id
            existing_lockups = db.query(SuspectModel).filter(SuspectModel.report_id == report_pk).all()
            existing_names = [getattr(lockup, 'name', '') for lockup in existing_lockups]
            
            for s in suspects_data:
                if s.get('name') not in existing_names:
                    valid_s_cols = [c.key for c in SuspectModel.__table__.columns]
                    s_payload = {
                        "report_id": report_pk, 
                        "name": s.get('name'), 
                        "sex": s.get('sex'), 
                        "age": str(s.get('age')) if s.get('age') else None,
                        "tribe": s.get('tribe'), 
                        "residence": s.get('residence'), 
                        "contact": s.get('contact'),
                        "mental_health_status": s.get('mental_health_status'),
                        "photo_url": s.get('photo_url') 
                    }
                    safe_s_payload = {k: v for k, v in s_payload.items() if k in valid_s_cols}
                    db.add(SuspectModel(**safe_s_payload))

        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ====================================================================
# 4. CONSOLIDATED LEDGER ENDPOINT WITH FULL POPULATION & FILTERING
# ====================================================================
@router.get("/reports/consolidated-ledger")
def get_consolidated_ledger(
    start_date: Optional[str] = Query(default=None), 
    end_date: Optional[str] = Query(default=None), 
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    try:
        CrimeModel = get_model_safe('Crime_Reports', 'CrimeReports', 'crime_reports', 'Reports', 'reports')
        StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
        StoryModel = get_model_safe('Success_Stories', 'SuccessStories', 'success_stories', 'Stories', 'stories')
        SuspectModel = get_model_safe('Suspect_Lockup', 'SuspectLockup', 'suspect_lockup')
        
        # 1. Fetch & Filter Crime Reports
        crimes_data = []
        if CrimeModel:
            q_crimes = db.query(CrimeModel)
            date_col = getattr(CrimeModel, 'date', getattr(CrimeModel, 'created_at', None))
            if date_col is not None:
                if start_date:
                    q_crimes = q_crimes.filter(func.cast(date_col, models.database.String if hasattr(models, 'database') else models.String) >= start_date if hasattr(models, 'String') else date_col >= start_date)
                if end_date:
                    q_crimes = q_crimes.filter(date_col <= end_date)
            if region and region.upper() not in ['ALL REGIONS', 'ALL']:
                if hasattr(CrimeModel, 'region'):
                    q_crimes = q_crimes.filter(func.upper(CrimeModel.region) == region.upper())
            if station and station.upper() not in ['ALL STATIONS', 'ALL']:
                if hasattr(CrimeModel, 'station'):
                    q_crimes = q_crimes.filter(func.upper(CrimeModel.station) == station.upper())
                    
            crimes = q_crimes.all()
            
            for c in crimes:
                c_dict = clean_model_dict(c)
                # Attach nested suspect details if present
                if SuspectModel and hasattr(c, 'id'):
                    suspects = db.query(SuspectModel).filter(SuspectModel.report_id == c.id).all()
                    c_dict['suspectDetails'] = [clean_model_dict(s) for s in suspects]
                crimes_data.append(c_dict)

        # 2. Fetch & Filter Operational Statistics
        stats_data = []
        if StatsModel:
            q_stats = db.query(StatsModel)
            date_col_st = getattr(StatsModel, 'date', getattr(StatsModel, 'timestamp', getattr(StatsModel, 'created_at', None)))
            if date_col_st is not None:
                if start_date:
                    q_stats = q_stats.filter(date_col_st >= start_date)
                if end_date:
                    q_stats = q_stats.filter(date_col_st <= end_date)
            if region and region.upper() not in ['ALL REGIONS', 'ALL']:
                if hasattr(StatsModel, 'region'):
                    q_stats = q_stats.filter(func.upper(StatsModel.region) == region.upper())
            if station and station.upper() not in ['ALL STATIONS', 'ALL']:
                if hasattr(StatsModel, 'station'):
                    q_stats = q_stats.filter(func.upper(StatsModel.station) == station.upper())
                    
            stats = q_stats.all()
            stats_data = [clean_model_dict(s) for s in stats]

        # 3. Fetch & Filter Success Stories
        stories_data = []
        if StoryModel:
            q_stories = db.query(StoryModel)
            date_col_story = getattr(StoryModel, 'date', getattr(StoryModel, 'timestamp', getattr(StoryModel, 'created_at', None)))
            if date_col_story is not None:
                if start_date:
                    q_stories = q_stories.filter(date_col_story >= start_date)
                if end_date:
                    q_stories = q_stories.filter(date_col_story <= end_date)
            if region and region.upper() not in ['ALL REGIONS', 'ALL']:
                if hasattr(StoryModel, 'region'):
                    q_stories = q_stories.filter(func.upper(StoryModel.region) == region.upper())
            if station and station.upper() not in ['ALL STATIONS', 'ALL']:
                if hasattr(StoryModel, 'station'):
                    q_stories = q_stories.filter(func.upper(StoryModel.station) == station.upper())
                    
            stories = q_stories.all()
            stories_data = [clean_model_dict(st) for st in stories]

        return {
            "status": "success",
            "crimes": crimes_data,
            "statistics": stats_data,
            "stories": stories_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Consolidated ledger compilation error: {str(e)}")