from typing import Optional, List, Union
from datetime import datetime, date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, text

from app import models
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["Crime Registry"])

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
        perms.get("global_observer") is True or
        perms.get("view_all_reports", False) is True
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
        
    elif is_kmp_specialist:
        specs = []
        if "CID" in user_pos: specs.append("CID")
        if "CI" in user_pos or "CRIME INT" in user_pos: specs.append("CI")
        if "TRAFFIC" in user_pos: specs.append("TRAFFIC")
        
        if specs and hasattr(ModelClass, 'section'):
            conds = []
            for spec in specs:
                conds.append(func.upper(ModelClass.section).ilike(f"%{spec}%"))
                if hasattr(ModelClass, 'dir'):
                    conds.append(func.upper(ModelClass.dir).ilike(f"%{spec}%"))
            return query.filter(or_(*conds))
        elif hasattr(ModelClass, 'region'):
            return query.filter(func.upper(ModelClass.region) == user_reg)
        return query
        
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

# ====================================================================
# 1. RETRIEVE CRIME REPORTS (UPGRADED ENTERPRISE SQL FILTERING)
# ====================================================================
@router.get("/reports")
def get_reports(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=200, le=1000), 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    CrimeModel = get_model_safe('Crime_Reports', 'CrimeReports', 'crime_reports', 'Reports', 'reports')
    if not CrimeModel:
        return []

    # 1. Start the Base Database Query
    query = db.query(CrimeModel)
    
    # 2. Enforce Strict OPSEC Security Clearances
    query = apply_opsec_scope(current_user, query, CrimeModel)

    # 3. APPLY DYNAMIC UI FILTERS (Memory Optimization)
    if region and region.upper() not in ["ALL REGIONS", "ALL"]:
        if hasattr(CrimeModel, 'region'):
            query = query.filter(func.upper(CrimeModel.region) == region.upper())
        
    if station and station.upper() not in ["ALL STATIONS", "ALL"]:
        if hasattr(CrimeModel, 'station'):
            query = query.filter(func.upper(CrimeModel.station) == station.upper())

    if search:
        search_term = f"%{search.strip()}%"
        search_conditions = []
        if hasattr(CrimeModel, 'sd_ref'): search_conditions.append(CrimeModel.sd_ref.ilike(search_term))
        if hasattr(CrimeModel, 'sdRef'): search_conditions.append(CrimeModel.sdRef.ilike(search_term))
        if hasattr(CrimeModel, 'offence'): search_conditions.append(CrimeModel.offence.ilike(search_term))
        if hasattr(CrimeModel, 'narrative'): search_conditions.append(CrimeModel.narrative.ilike(search_term))
        if hasattr(CrimeModel, 'station'): search_conditions.append(CrimeModel.station.ilike(search_term))
        
        if search_conditions:
            query = query.filter(or_(*search_conditions))

    # 4. Execute Query with Limit & Order By
    pk_col = getattr(CrimeModel, 'sn', getattr(CrimeModel, 'id', None))
    if pk_col is not None:
        reports = query.order_by(pk_col.desc()).limit(limit).all()
    else:
        reports = query.limit(limit).all()
    
    # 5. Format and return data
    SuspectModel = get_model_safe('Suspect_Lockup', 'SuspectLockup', 'suspect_lockup')
    
    result = []
    for r in reports:
        c_dict = clean_model_dict(r)
        
        # Attach nested suspects natively
        if SuspectModel and hasattr(r, 'id'):
            suspects = db.query(SuspectModel).filter(SuspectModel.report_id == r.id).all()
            c_dict['suspectDetails'] = [clean_model_dict(s) for s in suspects]
        else:
            c_dict['suspectDetails'] = getattr(r, 'suspect_details', getattr(r, 'suspectDetails', []))
            
        # Standardize strictly typed keys for the React frontend
        c_dict['sn'] = getattr(r, 'sn', getattr(r, 'id', 1))
        c_dict['sdRef'] = getattr(r, 'sd_ref', getattr(r, 'sdRef', ''))
        c_dict['region'] = getattr(r, 'region', 'KMP HEADQUARTERS')
        c_dict['station'] = getattr(r, 'station', 'HQ')
        c_dict['date'] = str(getattr(r, 'date', ''))
        c_dict['time'] = str(getattr(r, 'time', ''))
        c_dict['offence'] = getattr(r, 'offence', 'GENERAL CRIME')
        c_dict['narrative'] = getattr(r, 'narrative', '')
        c_dict['status'] = getattr(r, 'status', 'PENDING')
        c_dict['suspects'] = getattr(r, 'suspects', 0)
        c_dict['lastUpdatedBy'] = getattr(r, 'last_updated_by', 'UNKNOWN COMMANDER')
        c_dict['daily_lock_up'] = getattr(r, 'daily_lock_up', 0)
        
        result.append(c_dict)

    return result

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
            q_crimes = apply_opsec_scope(current_user, q_crimes, CrimeModel)

            date_col = getattr(CrimeModel, 'date', getattr(CrimeModel, 'created_at', None))
            if date_col is not None:
                if start_date:
                    q_crimes = q_crimes.filter(date_col >= start_date)
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
                if SuspectModel and hasattr(c, 'id'):
                    suspects = db.query(SuspectModel).filter(SuspectModel.report_id == c.id).all()
                    c_dict['suspectDetails'] = [clean_model_dict(s) for s in suspects]
                crimes_data.append(c_dict)

        # 2. Fetch & Filter Operational Statistics
        stats_data = []
        if StatsModel:
            q_stats = db.query(StatsModel)
            q_stats = apply_opsec_scope(current_user, q_stats, StatsModel)

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
            q_stories = apply_opsec_scope(current_user, q_stories, StoryModel)

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