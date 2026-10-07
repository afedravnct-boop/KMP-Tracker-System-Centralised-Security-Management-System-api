import os
import uuid
import re
import boto3
from typing import Optional, List, Union
from datetime import datetime, date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, text
from botocore.exceptions import ClientError

from app import models
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1", tags=["Crime Registry"])

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION")
)
BUCKET_NAME = os.getenv("AWS_BUCKET_NAME")

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

def strip_html_tags(text_str: str) -> str:
    if not text_str:
        return ""
    return re.sub('<.*?>', '', str(text_str))

# 🟢 Backend Heavy-Lifting Intelligent Crime & Agricultural Parser
def parse_crime_incident_backend(offence_str: str, narrative_str: str):
    combined_text = f"{offence_str or ''} {narrative_str or ''}"
    plain_text = strip_html_tags(combined_text)
    lower_text = plain_text.lower()
    
    # 1. Automatic Agricultural / Livestock Security Tagging
    is_agric = False
    agric_keywords = ['cattle', 'cow', 'cows', 'livestock', 'farm', 'crop', 'crops', 'produce', 'coffee', 'vanilla', 'maize', 'beans', 'beasts', 'goat', 'goats', 'sheep', 'poultry', 'chicken']
    if any(kw in lower_text for kw in agric_keywords):
        is_agric = True

    # 2. Extract Suspects Count
    suspects_count = 0
    suspect_matches = [
        re.search(r'(\d+)\s*(?:suspects|suspect|person|persons|culprits|thieves|gang|arrested)', lower_text),
        re.search(r'(?:arrest(?:ed|ing)?|apprehend(?:ed)?)\s*(?:of)?\s*(\d+)', lower_text)
    ]
    for m in suspect_matches:
        if m and m.group(1):
            suspects_count = int(m.group(1))
            break

    # 3. Extract Recoveries
    recoveries_list = []
    recovery_matches = re.findall(r'(\d+)\s*([a-z\s]+(?:cows|cow|cattle|phones|phone|money|cash|shillings|computers|computer|chairs|chair|tables|table|shoes|shoe|motorcycles|motorcycle|vehicles|vehicle|birds|chicken|produce|maize|beans|items))', lower_text, re.IGNORECASE)
    for count_val, item_val in recovery_matches:
        recoveries_list.append(f"{count_val} {item_val.strip()}")

    if not recoveries_list and ('recovery' in lower_text or 'recovered' in lower_text or 'recover' in lower_text):
        recoveries_list.append('Recovered property / exhibit')

    return {
        "isAgriculturalCrime": is_agric,
        "parsedSuspects": suspects_count,
        "parsedRecoveries": ", ".join(recoveries_list) if recoveries_list else "None recorded"
    }

def is_station_equivalent(stat_a: Optional[str], stat_b: Optional[str]) -> bool:
    a = (stat_a or "").strip().upper()
    b = (stat_b or "").strip().upper()
    if not a or not b:
        return False
    if a == b:
        return True
    clean_a = re.sub(r'(\s+HEADQUARTERS|\s+HQ)$', '', a)
    clean_b = re.sub(r'(\s+HEADQUARTERS|\s+HQ)$', '', b)
    return clean_a == clean_b and len(clean_a) > 0

def get_officer_signature(user):
    if not user:
        return "UNKNOWN COMMANDER"
    fnum = (user.fnum or "").strip()
    rank = (user.rank or "").strip()
    name = (user.name or "").strip()
    return f"{fnum} {rank} {name}".strip().upper()

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
        if isinstance(v, (datetime, date)):
            clean[k] = v.isoformat()
        elif isinstance(v, Decimal):
            clean[k] = float(v)
        else:
            clean[k] = v
            
    ref_val = clean.get('sd_ref') or clean.get('sdRef') or ''
    clean['sd_ref'] = ref_val
    clean['sdRef'] = ref_val

    if 'date' not in clean or not clean['date']:
        clean['date'] = clean.get('created_at') or clean.get('timestamp') or ''

    return clean

def apply_opsec_scope(current_user, query, ModelClass):
    import json
    import re
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
        clean_user_stn = user_stn.replace(' HEADQUARTERS', '').replace(' HQ', '')
        return query.filter(
            or_(
                func.upper(ModelClass.station) == user_stn,
                func.upper(ModelClass.station) == clean_user_stn,
                func.upper(ModelClass.station) == f"{clean_user_stn} HEADQUARTERS"
            )
        )
        
    return query.filter(text("1=0"))

# ====================================================================
# 1. RETRIEVE CRIME REPORTS
# ====================================================================
@router.get("/reports")
def get_reports(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=200, le=1000), 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    CrimeModel = get_model_safe('Crime_Reports', 'CrimeReports', 'crime_reports', 'Reports', 'reports')
    if not CrimeModel:
        return []

    query = db.query(CrimeModel)
    query = apply_opsec_scope(current_user, query, CrimeModel)

    if region and region.upper() not in ["ALL REGIONS", "ALL"]:
        if hasattr(CrimeModel, 'region'):
            query = query.filter(func.upper(CrimeModel.region) == region.upper())
        
    if station and station.upper() not in ["ALL STATIONS", "ALL"]:
        if hasattr(CrimeModel, 'station'):
            clean_stn = station.upper().replace(' HEADQUARTERS', '').replace(' HQ', '')
            query = query.filter(
                or_(
                    func.upper(CrimeModel.station) == station.upper(),
                    func.upper(CrimeModel.station) == clean_stn,
                    func.upper(CrimeModel.station) == f"{clean_stn} HEADQUARTERS"
                )
            )

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

    pk_col = getattr(CrimeModel, 'sn', getattr(CrimeModel, 'id', None))
    offence_col = getattr(CrimeModel, 'offence', None)
    
    if offence_col is not None and pk_col is not None:
        reports = query.order_by(offence_col.asc(), pk_col.desc()).limit(limit).all()
    elif pk_col is not None:
        reports = query.order_by(pk_col.desc()).limit(limit).all()
    else:
        reports = query.limit(limit).all()
    
    SuspectModel = get_model_safe('Suspect_Lockup', 'SuspectLockup', 'suspect_lockup')
    
    result = []
    for r in reports:
        c_dict = clean_model_dict(r)
        
        if SuspectModel and hasattr(r, 'id'):
            suspects = db.query(SuspectModel).filter(SuspectModel.report_id == r.id).all()
            c_dict['suspectDetails'] = [clean_model_dict(s) for s in suspects]
        else:
            c_dict['suspectDetails'] = getattr(r, 'suspect_details', getattr(r, 'suspectDetails', []))
            
        c_dict['sn'] = getattr(r, 'sn', getattr(r, 'id', 1))
        c_dict['sdRef'] = getattr(r, 'sd_ref', getattr(r, 'sdRef', ''))
        c_dict['region'] = getattr(r, 'region', 'KMP HEADQUARTERS')
        c_dict['station'] = getattr(r, 'station', 'HQ')
        c_dict['date'] = str(getattr(r, 'date', ''))
        c_dict['time'] = str(getattr(r, 'time', ''))
        c_dict['offence'] = str(getattr(r, 'offence', 'GENERAL CRIME')).strip().upper()
        c_dict['narrative'] = getattr(r, 'narrative', '')
        c_dict['status'] = getattr(r, 'status', 'PENDING')
        c_dict['suspects'] = getattr(r, 'suspects', 0)
        c_dict['lastUpdatedBy'] = getattr(r, 'last_updated_by', 'UNKNOWN COMMANDER')
        c_dict['daily_lock_up'] = getattr(r, 'daily_lock_up', 0)

        # 🟢 Backend Heavy Lifting: Attach intelligent parsing metrics on the fly
        parsed_crime = parse_crime_incident_backend(c_dict['offence'], c_dict['narrative'])
        c_dict['isAgriculturalCrime'] = parsed_crime['isAgriculturalCrime']
        c_dict['parsedSuspects'] = parsed_crime['parsedSuspects'] or c_dict['suspects']
        c_dict['parsedRecoveries'] = parsed_crime['parsedRecoveries']
        
        result.append(c_dict)

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="VIEW",
        module="CRIME_REGISTRY",
        target_id="ALL_REPORTS",
        changes_summary=f"Officer accessed Crime Registry reports ledger (Fetched {len(result)} entries)."
    )

    return result

# ====================================================================
# 2. FILE UPLOADS
# ====================================================================
@router.post("/investigation/upload")
def upload_investigation_file(file: UploadFile = File(...)):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file was provided.")

    file_extension = file.filename.split('.')[-1]
    unique_id = uuid.uuid4().hex[:8]
    s3_key = f"investigations/{unique_id}.{file_extension}"
    full_s3_url = None

    try:
        s3_client.upload_fileobj(
            file.file, BUCKET_NAME, s3_key,
            ExtraArgs={"ContentType": file.content_type, "ServerSideEncryption": "AES256"}
        )
        full_s3_url = f"https://{BUCKET_NAME}.s3.{os.getenv('AWS_REGION')}.amazonaws.com/{s3_key}"
        
        return {
            "status": "success", 
            "message": "Investigation file uploaded successfully!", 
            "cloud_storage_path": s3_key,
            "full_s3_url": full_s3_url
        }
    except ClientError as e:
        print(f"❌ S3 Error: {e}")
        raise HTTPException(status_code=500, detail="Cloud upload failed.")
    finally:
        file.file.close()

# ====================================================================
# 3. CREATE CRIME REPORT
# ====================================================================
@router.post("/reports")
def create_report(
    data: dict, 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
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

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="REGISTER",
            module="CRIME_REGISTRY",
            target_id=str(assigned_id),
            changes_summary=f"New crime report registered. SD Ref: [{data.get('sd_ref', 'N/A')}], Offence: [{data.get('offence', 'GENERAL')}]."
        )

        return {"status": "success", "id": assigned_id, "sn": assigned_id}
    except HTTPException as he:
        db.rollback()
        logs_db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ====================================================================
# 4. UPDATE CRIME REPORT
# ====================================================================
@router.put("/reports/{sn}")
def update_report(
    sn: int, 
    data: dict, 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
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
            
            db.query(SuspectModel).filter(SuspectModel.report_id == report_pk).delete()
            
            for s in suspects_data:
                valid_s_cols = [c.key for c in SuspectModel.__table__.columns]
                s_payload = {
                    "report_id": report_pk, 
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

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="CRIME_REGISTRY",
            target_id=str(sn),
            changes_summary=f"Crime report record modified. SD Ref: [{getattr(existing_report, 'sd_ref', 'N/A')}]."
        )

        return {"status": "success"}
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ====================================================================
# 5. CONSOLIDATED LEDGER ENDPOINT
# ====================================================================
@router.get("/reports/consolidated-ledger")
def get_consolidated_ledger(
    start_date: Optional[str] = Query(default=None), 
    end_date: Optional[str] = Query(default=None), 
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        CrimeModel = get_model_safe('Crime_Reports', 'CrimeReports', 'crime_reports', 'Reports', 'reports')
        StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
        StoryModel = get_model_safe('Success_Stories', 'SuccessStories', 'success_stories', 'Stories', 'stories')
        SuspectModel = get_model_safe('Suspect_Lockup', 'SuspectLockup', 'suspect_lockup')
        NomModel = get_model_safe('Nominal_Roll', 'NominalRoll', 'Users', 'nominal_roll')
        ExhibitModel = get_model_safe('Impounded_Exhibits', 'Exhibits', 'impounded_exhibits')
        
        crimes_data = []
        if CrimeModel:
            q_crimes = db.query(CrimeModel)
            q_crimes = apply_opsec_scope(current_user, q_crimes, CrimeModel)
            offence_col = getattr(CrimeModel, 'offence', None)
            pk_col = getattr(CrimeModel, 'sn', getattr(CrimeModel, 'id', None))
            
            if offence_col is not None and pk_col is not None:
                q_crimes = q_crimes.order_by(offence_col.asc(), pk_col.desc())
            
            for c in q_crimes.all():
                c_dict = clean_model_dict(c)
                c_dict['offence'] = str(c_dict.get('offence', 'GENERAL CRIME')).strip().upper()
                if SuspectModel and hasattr(c, 'id'):
                    suspects = db.query(SuspectModel).filter(SuspectModel.report_id == c.id).all()
                    c_dict['suspectDetails'] = [clean_model_dict(s) for s in suspects]
                
                parsed_c = parse_crime_incident_backend(c_dict['offence'], c_dict.get('narrative'))
                c_dict['isAgriculturalCrime'] = parsed_c['isAgriculturalCrime']
                c_dict['parsedSuspects'] = parsed_c['parsedSuspects']
                c_dict['parsedRecoveries'] = parsed_c['parsedRecoveries']
                
                crimes_data.append(c_dict)

        stories_data = []
        if StoryModel:
            q_stories = db.query(StoryModel)
            q_stories = apply_opsec_scope(current_user, q_stories, StoryModel)
            for st in q_stories.all():
                st_dict = clean_model_dict(st)
                parsed = parse_success_story_backend(st_dict.get('narrative') or st_dict.get('title'))
                st_dict['parsedSuspects'] = st_dict.get('suspects_arrested') or st_dict.get('suspects_arrested_count') or parsed['suspects']
                st_dict['parsedRecoveries'] = st_dict.get('suspected_stolen_properties_recovered') or st_dict.get('property_recovered') or parsed['recoveries']
                st_dict['parsedLegalStatus'] = st_dict.get('legal_status') or parsed['legalStatus']
                st_dict['parsedClassification'] = parsed['classification']
                stories_data.append(st_dict)

        exhibits_data = []
        if ExhibitModel:
            q_ex = db.query(ExhibitModel)
            q_ex = apply_opsec_scope(current_user, q_ex, ExhibitModel)
            ex_map = {}
            for ex in q_ex.all():
                cat = str(getattr(ex, 'category', 'GENERAL') or 'GENERAL').upper()
                reg = str(getattr(ex, 'region', 'KMP GENERAL') or 'KMP GENERAL').upper()
                div = str(getattr(ex, 'division', getattr(ex, 'station', 'N/A')) or 'N/A').upper()
                stn = str(getattr(ex, 'station', 'N/A') or 'N/A').upper()
                status = str(getattr(ex, 'status', 'IMPOUNDED') or 'IMPOUNDED').upper()
                key = (cat, reg, div, stn, status)
                ex_map[key] = ex_map.get(key, 0) + 1
            
            for k, total in ex_map.items():
                exhibits_data.append({
                    "category": k[0], "region": k[1], "division": k[2], "station": k[3], "status": k[4], "total": total
                })

        stats_data = [clean_model_dict(s) for s in db.query(StatsModel).all()] if StatsModel else []
        nom_data = [clean_model_dict(n) for n in db.query(NomModel).all()] if NomModel else []

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="VIEW",
            module="CONSOLIDATED_LEDGER",
            target_id="MASTER_SUMMARY",
            changes_summary=f"Officer accessed heavy-lift backend Consolidated Operations & Crime Ledger."
        )

        return {
            "status": "success",
            "crimes": crimes_data,
            "statistics": stats_data,
            "stories": stories_data,
            "exhibits_summary": exhibits_data,
            "manpower": nom_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Consolidated ledger compilation error: {str(e)}")