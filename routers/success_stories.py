# routers/success_stories.py
import json
import re
import io
import os
import requests
import pyzipper
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func, text

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

WORD_TO_NUM = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'fifteen': 15, 'twenty': 20,
    'a': 1, 'an': 1, 'several': 3, 'couple': 2, 'few': 3
}

def parse_word_number(val_str: str) -> int:
    if not val_str:
        return 0
    clean = val_str.strip().lower()
    if clean.isdigit():
        return int(clean)
    return WORD_TO_NUM.get(clean, 1)

def strip_html_tags(text_str: str) -> str:
    if not text_str: return ""
    return re.sub('<.*?>', '', str(text_str))

def get_officer_signature(user):
    if not user: return "UNKNOWN COMMANDER"
    fnum = (user.fnum or "").strip()
    rank = (user.rank or "").strip()
    name = (user.name or "").strip()
    return f"{fnum} {rank} {name}".strip().upper()

def get_base_station_name(stn: str) -> str:
    if not stn: return "UNKNOWN"
    val = str(stn).strip().upper()
    if val in ["OLD KLA", "OK", "OLD K", "O/K", "OLD KAMPALA DIVISION", "OLD KAMPALA"]:
        return "OLD KAMPALA"
    val = re.sub(r'\s+(P\.?S\.?|P/S|PS|P\s*STN|P/STN|POL\s*STN|POLICE\s*STATION|DIVISION|P\.?P\.?|P/P|P/POST|P\s*POST|PP|P|POLICE\s*POST|HEADQUARTERS|HQ)$', '', val)
    return val.strip()

def is_user_global_tier(current_user) -> bool:
    if not current_user:
        return False
    user_role = str(getattr(current_user, 'role', '')).strip().upper().replace(' ', '_')
    user_pos = str(getattr(current_user, 'position', '')).strip().upper()
    user_reg = str(getattr(current_user, 'region', '')).strip().upper()

    perms = getattr(current_user, 'permissions', {})
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}

    return (
        user_role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN", "RPC", "DEPUTY COMMANDER", "SUPERVISOR"] or
        "KMP COMMANDER" in user_pos or
        "DEPUTY KMP COMMANDER" in user_pos or
        "KMP ADMIN" in user_pos or
        "SYSTEM_MANAGER" in user_role or
        perms.get("view_global_roster") is True or
        perms.get("global_observer") is True or
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

    is_kmp_sys_mgr = (user_role == "SYSTEM_MANAGER" and user_reg in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"] and "KMP" in user_pos)
    is_kmp_specialist = (user_role == "ASSISTANT_SYSTEM_MANAGER" and user_reg in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"] and "KMP" in user_pos)
    
    is_regional_command = (
        user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN", "DIVISION_ADMIN"] and
        not is_kmp_sys_mgr and not is_kmp_specialist
    )

    if is_kmp_specialist and hasattr(ModelClass, 'region'):
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
            
        if conds: return query.filter(or_(*conds))
        return query.filter(text("1=0"))
        
    elif hasattr(ModelClass, 'station') and hasattr(ModelClass, 'region') and user_stn:
        clean_user_stn = get_base_station_name(user_stn)
        return query.filter(
            and_(
                func.upper(ModelClass.region) == user_reg,
                or_(
                    func.upper(ModelClass.station) == user_stn,
                    func.upper(ModelClass.station).ilike(f"{clean_user_stn}%")
                )
            )
        )
    return query.filter(text("1=0"))

def parse_success_story_backend(raw_narrative: str):
    if not raw_narrative:
        return {
            "suspects": 0,
            "recoveries": "NONE RECORDED",
            "legalStatus": "UNDER INVESTIGATION",
            "classification": "OPERATIONAL BREAKTHROUGH"
        }

    raw_narrative_str = str(raw_narrative)
    headline_match = re.search(r'<strong>(.*?)<\/strong>', raw_narrative_str, re.IGNORECASE)
    if headline_match:
        classification = strip_html_tags(headline_match.group(1)).strip().upper()
    else:
        classification = "OPERATIONAL BREAKTHROUGH & SUSPECT APPREHENSION"

    plain_text = strip_html_tags(raw_narrative_str)
    lower_text = plain_text.lower()
    
    suspects_count = 0
    word_num_pattern = r'(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s*(?:suspects|suspect|person|persons|culprits|thieves|gang|individuals)'
    suspect_match = re.search(word_num_pattern, lower_text)
    if suspect_match:
        suspects_count = parse_word_number(suspect_match.group(1))
    
    if suspects_count == 0 and any(k in lower_text for k in ['suspect', 'arrest', 'apprehend', 'detain', 'culprit']):
        suspects_count = 1 

    legal_status = 'UNDER INVESTIGATION'
    if 'remand' in lower_text or 'remanded' in lower_text:
        legal_status = 'REMANDED'
    elif 'convict' in lower_text or 'sentenced' in lower_text:
        legal_status = 'CONVICTED'
    elif 'acquit' in lower_text:
        legal_status = 'ACQUITTED'
    elif 'court' in lower_text or 'trial' in lower_text or 'magistrate' in lower_text or 'arraign' in lower_text:
        legal_status = 'UNDERGOING COURT TRIAL'

    recoveries_list = []
    recovery_word_pattern = r'(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s*([a-z\s]+(?:cows|cow|cattle|phones|phone|pistol|pistols|gun|guns|firearm|firearms|cash|money|shillings|computers|computer|chairs|chair|tables|table|shoes|shoe|motorcycles|motorcycle|vehicles|vehicle|pangas|panga|weapons|weapon|items))'
    recovery_matches = re.findall(recovery_word_pattern, lower_text, re.IGNORECASE)
    
    for count_val, item_val in recovery_matches:
        num_val = parse_word_number(count_val)
        formatted_count = str(num_val).zfill(2)
        recoveries_list.append(f"{formatted_count} | {item_val.strip().upper()}")

    if not recoveries_list:
        if 'motorcycle' in lower_text or 'boda' in lower_text: recoveries_list.append('01 | MOTORCYCLE RECOVERED')
        elif 'vehicle' in lower_text or 'car' in lower_text: recoveries_list.append('01 | MOTOR VEHICLE RECOVERED')
        elif 'phone' in lower_text or 'mobile' in lower_text: recoveries_list.append('01 | MOBILE PHONE RECOVERED')
        elif 'cattle' in lower_text or 'cow' in lower_text: recoveries_list.append('01 | STOLEN CATTLE RECOVERED')
        elif 'cash' in lower_text or 'money' in lower_text or 'shillings' in lower_text: recoveries_list.append('01 | CASH / FUNDS RECOVERED')
        elif 'gun' in lower_text or 'pistol' in lower_text or 'firearm' in lower_text: recoveries_list.append('01 | FIREARM RECOVERED')
        elif 'uniform' in lower_text or 'stores' in lower_text: recoveries_list.append('01 | GOVERNMENT STORES')
        else: recoveries_list.append('NONE RECORDED')

    classification_str = str(classification)
    formatted_classification = (classification_str[:52] + '...') if len(classification_str) > 55 else classification_str

    return {
        "suspects": suspects_count,
        "recoveries": " || ".join(recoveries_list),
        "legalStatus": legal_status,
        "classification": formatted_classification
    }

# ====================================================================
# 1. RETRIEVE SUCCESS STORIES
# ====================================================================
@router.get("/stories")
def get_stories(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    agri_only: bool = Query(default=False),
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        query = db.query(models.Success_Stories)
        query = apply_opsec_scope(current_user, query, models.Success_Stories)
        
        if region and region.upper() not in ["ALL REGIONS", "ALL", "UNDEFINED", "NULL", ""]:
            if hasattr(models.Success_Stories, 'region'):
                query = query.filter(func.upper(models.Success_Stories.region) == region.upper())
                
        if station and station.upper() not in ["ALL STATIONS", "ALL", "UNDEFINED", "NULL", ""]:
            if hasattr(models.Success_Stories, 'station'):
                clean_stn = get_base_station_name(station.upper())
                query = query.filter(
                    or_(
                        func.upper(models.Success_Stories.station) == station.upper(),
                        func.upper(models.Success_Stories.station).ilike(f"{clean_stn}%")
                    )
                )

        if category and category.upper() not in ["ALL CATEGORIES", "ALL", "UNDEFINED", "NULL", ""]:
            if hasattr(models.Success_Stories, 'category'):
                query = query.filter(func.upper(models.Success_Stories.category) == category.upper())

        if agri_only and hasattr(models.Success_Stories, 'category'):
            query = query.filter(func.upper(models.Success_Stories.category) == 'AGRIC_CRIME')

        invalid_date_strings = ["ALL TIME", "ALL", "UNDEFINED", "NULL", ""]
        if start_date and start_date.upper() not in invalid_date_strings and hasattr(models.Success_Stories, 'date'):
            query = query.filter(models.Success_Stories.date >= start_date)
        
        if end_date and end_date.upper() not in invalid_date_strings and hasattr(models.Success_Stories, 'date'):
            query = query.filter(models.Success_Stories.date <= end_date)
        
        if search and search.upper() not in ["UNDEFINED", "NULL", ""]:
            term = f"%{search.strip().upper()}%"
            search_conds = []
            if hasattr(models.Success_Stories, 'title'): search_conds.append(models.Success_Stories.title.ilike(term))
            if hasattr(models.Success_Stories, 'narrative'): search_conds.append(models.Success_Stories.narrative.ilike(term))
            if hasattr(models.Success_Stories, 'station'): search_conds.append(models.Success_Stories.station.ilike(term))
            if hasattr(models.Success_Stories, 'region'): search_conds.append(models.Success_Stories.region.ilike(term))
            if hasattr(models.Success_Stories, 'category'): search_conds.append(models.Success_Stories.category.ilike(term))
            if search_conds:
                query = query.filter(or_(*search_conds))

        records = query.order_by(models.Success_Stories.sn.desc()).limit(limit).all()

        CrimeModel = getattr(models, 'Crime_Reports', getattr(models, 'CrimeReports', None))
        serialized_records = []
        
        for r in records:
            r_dict = r.__dict__.copy()
            r_dict.pop('_sa_instance_state', None)
            
            # 🟢 Automatically inject auto-parsed metrics for UI & Analytics sync
            narrative_str = r_dict.get('narrative', '') or r_dict.get('title', '')
            parsed = parse_success_story_backend(narrative_str)

            r_dict['suspects'] = r_dict.get('suspects_arrested') or parsed['suspects']
            r_dict['recoveries'] = r_dict.get('suspected_stolen_properties_recovered') or parsed['recoveries']
            r_dict['legalStatus'] = r_dict.get('legal_status') or parsed['legalStatus']
            r_dict['classification'] = r_dict.get('category') or parsed['classification']

            linked_case = None

            if CrimeModel and narrative_str:
                try:
                    ref_regex = re.compile(r'(sd\s*ref|crb|def|gef|tar|cid)\s*:?\s*([A-Z0-9/\-]+)', re.IGNORECASE)
                    matches = ref_regex.findall(narrative_str)
                    
                    has_sd_ref = hasattr(CrimeModel, 'sd_ref')
                    has_sdRef = hasattr(CrimeModel, 'sdRef')

                    for prefix, ref_num in matches:
                        search_num = ref_num.strip().upper()
                        
                        or_conditions = []
                        if has_sd_ref: or_conditions.append(func.upper(CrimeModel.sd_ref).like(f"%{search_num}%"))
                        if has_sdRef: or_conditions.append(func.upper(CrimeModel.sdRef).like(f"%{search_num}%"))
                        
                        if or_conditions:
                            db_case = db.query(CrimeModel).filter(or_(*or_conditions)).first()
                            if db_case:
                                linked_case = {
                                    "sdRef": getattr(db_case, 'sd_ref', getattr(db_case, 'sdRef', '')),
                                    "offence": getattr(db_case, 'offence', 'Unknown Offence'),
                                    "date_reported": getattr(db_case, 'date_reported', getattr(db_case, 'date', '')),
                                    "status": getattr(db_case, 'status', 'OPEN')
                                }
                                break
                except Exception:
                    pass

            r_dict['linked_case'] = linked_case
            serialized_records.append(r_dict)
            
        return serialized_records
    
    except Exception as e:
        print(f"🔥 FATAL ERROR FETCHING STORIES: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database Query Failed: {str(e)}")

# ====================================================================
# 1B. GET UNIQUE STORY CATEGORIES
# ====================================================================
@router.get("/stories/categories")
def get_unique_categories(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        if not hasattr(models.Success_Stories, 'category'):
            return []

        query = db.query(models.Success_Stories.category).distinct()
        query = apply_opsec_scope(current_user, query, models.Success_Stories)

        if region and region.upper() not in ["ALL REGIONS", "ALL", "UNDEFINED", "NULL", ""]:
            if hasattr(models.Success_Stories, 'region'):
                query = query.filter(func.upper(models.Success_Stories.region) == region.upper())
                
        if station and station.upper() not in ["ALL STATIONS", "ALL", "UNDEFINED", "NULL", ""]:
            if hasattr(models.Success_Stories, 'station'):
                clean_stn = get_base_station_name(station.upper())
                query = query.filter(
                    or_(
                        func.upper(models.Success_Stories.station) == station.upper(),
                        func.upper(models.Success_Stories.station).ilike(f"{clean_stn}%")
                    )
                )

        categories = [row[0].strip().upper() for row in query.all() if row[0]]
        return sorted(list(set(categories)))
    except Exception as e:
        print(f"🔥 FATAL ERROR FETCHING CATEGORIES: {str(e)}")
        return []

# ====================================================================
# 1C. SECURE AES-256 ZIP EXPORT
# ====================================================================
@router.get("/stories/export")
def export_stories_archive(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    agri_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        query = db.query(models.Success_Stories)
        query = apply_opsec_scope(current_user, query, models.Success_Stories)

        if region and region.upper() not in ["ALL REGIONS", "ALL", "UNDEFINED", "NULL", ""]:
            if hasattr(models.Success_Stories, 'region'):
                query = query.filter(func.upper(models.Success_Stories.region) == region.upper())
                
        if station and station.upper() not in ["ALL STATIONS", "ALL", "UNDEFINED", "NULL", ""]:
            if hasattr(models.Success_Stories, 'station'):
                clean_stn = get_base_station_name(station.upper())
                query = query.filter(
                    or_(
                        func.upper(models.Success_Stories.station) == station.upper(),
                        func.upper(models.Success_Stories.station).ilike(f"{clean_stn}%")
                    )
                )

        if category and category.upper() not in ["ALL CATEGORIES", "ALL", "UNDEFINED", "NULL", ""]:
            if hasattr(models.Success_Stories, 'category'):
                query = query.filter(func.upper(models.Success_Stories.category) == category.upper())

        if agri_only and hasattr(models.Success_Stories, 'category'):
            query = query.filter(func.upper(models.Success_Stories.category) == 'AGRIC_CRIME')

        invalid_date_strings = ["ALL TIME", "ALL", "UNDEFINED", "NULL", ""]
        if start_date and start_date.upper() not in invalid_date_strings and hasattr(models.Success_Stories, 'date'):
            query = query.filter(models.Success_Stories.date >= start_date)
        
        if end_date and end_date.upper() not in invalid_date_strings and hasattr(models.Success_Stories, 'date'):
            query = query.filter(models.Success_Stories.date <= end_date)

        if search and search.upper() not in ["UNDEFINED", "NULL", ""]:
            term = f"%{search.strip().upper()}%"
            search_conds = []
            if hasattr(models.Success_Stories, 'title'): search_conds.append(models.Success_Stories.title.ilike(term))
            if hasattr(models.Success_Stories, 'narrative'): search_conds.append(models.Success_Stories.narrative.ilike(term))
            if hasattr(models.Success_Stories, 'station'): search_conds.append(models.Success_Stories.station.ilike(term))
            if hasattr(models.Success_Stories, 'region'): search_conds.append(models.Success_Stories.region.ilike(term))
            if hasattr(models.Success_Stories, 'category'): search_conds.append(models.Success_Stories.category.ilike(term))
            if search_conds:
                query = query.filter(or_(*search_conds))

        records = query.order_by(models.Success_Stories.sn.desc()).all()

        data_rows = []
        for r in records:
            data_rows.append({
                "SN": getattr(r, 'sn', getattr(r, 'id', '')),
                "Date": getattr(r, 'date', ''),
                "Category": getattr(r, 'category', ''),
                "Title": getattr(r, 'title', ''),
                "Region": getattr(r, 'region', ''),
                "Station": getattr(r, 'station', ''),
                "Narrative": strip_html_tags(getattr(r, 'narrative', '')),
                "Photo/Exhibit Links": getattr(r, 'photo_url', ''),
                "Last Updated By": getattr(r, 'last_updated_by', '')
            })

        import pandas as pd
        df = pd.DataFrame(data_rows) if data_rows else pd.DataFrame(columns=["SN", "Date", "Category", "Title", "Region", "Station", "Narrative", "Photo/Exhibit Links", "Last Updated By"])

        excel_buffer = io.BytesIO()
        with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name="Success Stories", index=False)
            workbook = writer.book
            workbook.properties.creator = get_officer_signature(current_user)
            workbook.properties.title = "KMP Secure Success Stories Export"

        excel_buffer.seek(0)

        zip_stream = io.BytesIO()
        zip_password = str(current_user.fnum).strip().encode('utf-8')
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        zip_filename = f"SECURE_SUCCESS_STORIES_ARCHIVE_{timestamp}.zip"

        with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            zf.writestr(f"Success_Stories_Report_{timestamp}.xlsx", excel_buffer.getvalue())

            for r in records:
                sn = getattr(r, 'sn', getattr(r, 'id', 'UNKNOWN'))
                station_name = strip_html_tags(getattr(r, 'station', 'STATION')).replace('/', '_').replace(' ', '_')
                photo_urls = getattr(r, 'photo_url', '')

                if not photo_urls:
                    continue

                urls = [u.strip() for u in photo_urls.split(',') if u.strip()]
                for idx, url in enumerate(urls):
                    try:
                        if url.startswith('http://') or url.startswith('https://'):
                            img_response = requests.get(url, timeout=10)
                            if img_response.status_code == 200:
                                file_ext = url.split('.')[-1].split('?')[0].lower()
                                if file_ext not in ['jpg', 'jpeg', 'png', 'webp', 'pdf']:
                                    file_ext = 'jpg'
                                filename = f"Exhibits/SN_{sn}_{station_name}_Exhibit_{idx + 1}.{file_ext}"
                                zf.writestr(filename, img_response.content)
                        elif os.path.exists(url):
                            with open(url, 'rb') as f:
                                file_ext = url.split('.')[-1].lower()
                                filename = f"Exhibits/SN_{sn}_{station_name}_Exhibit_{idx + 1}.{file_ext}"
                                zf.writestr(filename, f.read())
                    except Exception as ex:
                        print(f"Failed to bundle exhibit for SN {sn}: {str(ex)}")

        zip_stream.seek(0)
        return StreamingResponse(
            zip_stream,
            media_type="application/zip",
            headers={
                'Content-Disposition': f'attachment; filename="{zip_filename}"',
                'Access-Control-Expose-Headers': 'Content-Disposition'
            }
        )
    except Exception as e:
        print(f"🔥 FATAL ERROR EXPORTING STORIES: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Export Failed: {str(e)}")

# ====================================================================
# 2. CREATE SUCCESS STORY
# ====================================================================
@router.post("/stories")
def create_story(
    data: dict, 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        data.pop('sn', None) 
        
        user_role = str(current_user.role or "").upper()
        user_pos = str(current_user.position or "").upper()
        is_global = user_role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN"] or "KMP COMMANDER" in user_pos

        if not is_global:
            data["region"] = current_user.region
            data["station"] = current_user.station

        if not data.get("category"):
            data["category"] = "GENERAL CRIMES"

        incoming_narrative = (data.get("narrative") or "").strip()

        existing_story = db.query(models.Success_Stories).filter(
            func.lower(models.Success_Stories.narrative) == func.lower(incoming_narrative)
        ).first()

        if existing_story:
            raise HTTPException(status_code=400, detail="Error: This exact success story has already been logged in the system.")
            
        new_record = models.Success_Stories(**data)
        new_record.last_updated_by = get_officer_signature(current_user)
        db.add(new_record)
        db.commit()
        db.refresh(new_record)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="REGISTER",
            module="SUCCESS_STORIES",
            target_id=str(new_record.sn),
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} registered new success story [{new_record.category}] for region [{new_record.region}] station [{new_record.station}]."
        )

        return {"status": "success", "sn": new_record.sn, "category": new_record.category}
    except HTTPException as he:
        db.rollback()
        logs_db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ====================================================================
# 3. UPDATE SUCCESS STORY
# ====================================================================
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

        if "category" not in data or not data["category"]:
            data["category"] = record.category or "GENERAL CRIMES"

        for key, value in data.items():
            if key not in ['sn', 'id']:
                setattr(record, key, value)

        record.last_updated_by = get_officer_signature(current_user)
        db.commit()
        db.refresh(record)
        
        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="SUCCESS_STORIES",
            target_id=str(sn),
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} modified success story record SN [{sn}] to category [{record.category}]."
        )

        return {"status": "success", "sn": record.sn, "category": record.category, "message": "Success story updated successfully."}
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))