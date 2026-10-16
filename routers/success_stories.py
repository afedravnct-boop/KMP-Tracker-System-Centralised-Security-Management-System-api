import json
import re
import csv
import io
import os
import requests
import pyzipper
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
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

def strip_html_tags(text_str: str) -> str:
    if not text_str:
        return ""
    return re.sub('<.*?>', '', str(text_str))

def get_officer_signature(user):
    if not user:
        return "UNKNOWN COMMANDER"
    fnum = (user.fnum or "").strip()
    rank = (user.rank or "").strip()
    name = (user.name or "").strip()
    return f"{fnum} {rank} {name}".strip().upper()

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
        user_role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN"] or
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
        
    elif hasattr(ModelClass, 'station') and hasattr(ModelClass, 'region'):
        # 🟢 Station Users & Station Admins: strictly locked to their exact station and region (e.g. Old Kampala -> KMP North)
        clean_user_stn = user_stn.replace(' HEADQUARTERS', '').replace(' HQ', '')
        return query.filter(
            and_(
                func.upper(ModelClass.region) == user_reg,
                or_(
                    func.upper(ModelClass.station) == user_stn,
                    func.upper(ModelClass.station) == clean_user_stn,
                    func.upper(ModelClass.station) == f"{clean_user_stn} HEADQUARTERS"
                )
            )
        )
    elif hasattr(ModelClass, 'station'):
        return query.filter(func.upper(ModelClass.station) == user_stn)
        
    return query.filter(text("1=0"))

# ====================================================================
# 1. RETRIEVE SUCCESS STORIES (WITH BACKEND CASE LINKING)
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
    query = db.query(models.Success_Stories)
    query = apply_opsec_scope(current_user, query, models.Success_Stories)
    
    if region and region.upper() not in ["ALL REGIONS", "ALL"]:
        if hasattr(models.Success_Stories, 'region'):
            query = query.filter(func.upper(models.Success_Stories.region) == region.upper())
            
    if station and station.upper() not in ["ALL STATIONS", "ALL"]:
        if hasattr(models.Success_Stories, 'station'):
            clean_stn = station.upper().replace(' HEADQUARTERS', '').replace(' HQ', '')
            query = query.filter(
                or_(
                    func.upper(models.Success_Stories.station) == station.upper(),
                    func.upper(models.Success_Stories.station) == clean_stn,
                    func.upper(models.Success_Stories.station) == f"{clean_stn} HEADQUARTERS"
                )
            )

    if category and category.upper() not in ["ALL CATEGORIES", "ALL", ""]:
        if hasattr(models.Success_Stories, 'category'):
            query = query.filter(func.upper(models.Success_Stories.category) == category.upper())

    if agri_only and hasattr(models.Success_Stories, 'category'):
        query = query.filter(func.upper(models.Success_Stories.category) == 'AGRIC_CRIME')

    if start_date and hasattr(models.Success_Stories, 'date'):
        query = query.filter(models.Success_Stories.date >= start_date)
    
    if end_date and hasattr(models.Success_Stories, 'date'):
        query = query.filter(models.Success_Stories.date <= end_date)
    
    if search:
        term = f"%{search.strip().upper()}%"
        search_conds = []
        if hasattr(models.Success_Stories, 'title'): search_conds.append(models.Success_Stories.title.ilike(term))
        if hasattr(models.Success_Stories, 'narrative'): search_conds.append(models.Success_Stories.narrative.ilike(term))
        if hasattr(models.Success_Stories, 'station'): search_conds.append(models.Success_Stories.station.ilike(term))
        if hasattr(models.Success_Stories, 'region'): search_conds.append(models.Success_Stories.region.ilike(term))
        if hasattr(models.Success_Stories, 'category'): search_conds.append(models.Success_Stories.category.ilike(term))
        if hasattr(models.Success_Stories, 'last_updated_by'): search_conds.append(models.Success_Stories.last_updated_by.ilike(term))
        if search_conds:
            query = query.filter(or_(*search_conds))

    records = query.order_by(models.Success_Stories.sn.desc()).limit(limit).all()

    CrimeModel = getattr(models, 'Crime_Reports', getattr(models, 'CrimeReports', None))
    serialized_records = []
    
    for r in records:
        r_dict = r.__dict__.copy()
        r_dict.pop('_sa_instance_state', None)
        
        narrative_str = r_dict.get('narrative', '')
        linked_case = None

        if CrimeModel and narrative_str:
            ref_regex = re.compile(r'(sd\s*ref|crb|def|gef|tar|cid)\s*:?\s*([A-Z0-9/\-]+)', re.IGNORECASE)
            matches = ref_regex.findall(narrative_str)
            
            for prefix, ref_num in matches:
                search_num = ref_num.strip().upper()
                db_case = db.query(CrimeModel).filter(
                    or_(
                        func.upper(CrimeModel.sd_ref).like(f"%{search_num}%"),
                        func.upper(CrimeModel.sdRef).like(f"%{search_num}%") if hasattr(CrimeModel, 'sdRef') else text("1=0")
                    )
                ).first()
                
                if db_case:
                    linked_case = {
                        "sdRef": getattr(db_case, 'sd_ref', getattr(db_case, 'sdRef', '')),
                        "offence": getattr(db_case, 'offence', 'Unknown Offence'),
                        "date_reported": getattr(db_case, 'date_reported', getattr(db_case, 'date', '')),
                        "status": getattr(db_case, 'status', 'OPEN')
                    }
                    break

        r_dict['linked_case'] = linked_case
        serialized_records.append(r_dict)
        
    if search:
        summary_text = f"{current_user.fnum} {current_user.rank} {current_user.name} searched success stories ledger for query: \"{search}\" (Returned {len(serialized_records)} matches)."
    else:
        summary_text = f"{current_user.fnum} {current_user.rank} {current_user.name} accessed Success Stories ledger (Fetched {len(serialized_records)} records)."

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="VIEW",
        module="SUCCESS_STORIES",
        target_id=search if search else "ALL_STORIES",
        changes_summary=summary_text
    )

    return serialized_records

# ====================================================================
# 1B. GET UNIQUE STORY CATEGORIES (LIGHTWEIGHT)
# ====================================================================
@router.get("/stories/categories")
def get_unique_categories(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    if not hasattr(models.Success_Stories, 'category'):
        return []

    query = db.query(models.Success_Stories.category).distinct()
    query = apply_opsec_scope(current_user, query, models.Success_Stories)

    if region and region.upper() not in ["ALL REGIONS", "ALL"]:
        if hasattr(models.Success_Stories, 'region'):
            query = query.filter(func.upper(models.Success_Stories.region) == region.upper())
            
    if station and station.upper() not in ["ALL STATIONS", "ALL"]:
        if hasattr(models.Success_Stories, 'station'):
            clean_stn = station.upper().replace(' HEADQUARTERS', '').replace(' HQ', '')
            query = query.filter(
                or_(
                    func.upper(models.Success_Stories.station) == station.upper(),
                    func.upper(models.Success_Stories.station) == clean_stn,
                    func.upper(models.Success_Stories.station) == f"{clean_stn} HEADQUARTERS"
                )
            )

    categories = [row[0].strip().upper() for row in query.all() if row[0]]
    return sorted(list(set(categories)))

# ====================================================================
# 1C. SECURE AES-256 ZIP EXPORT (PHYSICAL PHOTOS, EXHIBITS & EXCEL DATA)
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
    query = db.query(models.Success_Stories)
    query = apply_opsec_scope(current_user, query, models.Success_Stories)

    if region and region.upper() not in ["ALL REGIONS", "ALL"]:
        if hasattr(models.Success_Stories, 'region'):
            query = query.filter(func.upper(models.Success_Stories.region) == region.upper())
            
    if station and station.upper() not in ["ALL STATIONS", "ALL"]:
        if hasattr(models.Success_Stories, 'station'):
            clean_stn = station.upper().replace(' HEADQUARTERS', '').replace(' HQ', '')
            query = query.filter(
                or_(
                    func.upper(models.Success_Stories.station) == station.upper(),
                    func.upper(models.Success_Stories.station) == clean_stn,
                    func.upper(models.Success_Stories.station) == f"{clean_stn} HEADQUARTERS"
                )
            )

    if category and category.upper() not in ["ALL CATEGORIES", "ALL", ""]:
        if hasattr(models.Success_Stories, 'category'):
            query = query.filter(func.upper(models.Success_Stories.category) == category.upper())

    if agri_only and hasattr(models.Success_Stories, 'category'):
        query = query.filter(func.upper(models.Success_Stories.category) == 'AGRIC_CRIME')

    if start_date and hasattr(models.Success_Stories, 'date'):
        query = query.filter(models.Success_Stories.date >= start_date)
    
    if end_date and hasattr(models.Success_Stories, 'date'):
        query = query.filter(models.Success_Stories.date <= end_date)

    if search:
        term = f"%{search.strip().upper()}%"
        search_conds = []
        if hasattr(models.Success_Stories, 'title'): search_conds.append(models.Success_Stories.title.ilike(term))
        if hasattr(models.Success_Stories, 'narrative'): search_conds.append(models.Success_Stories.narrative.ilike(term))
        if hasattr(models.Success_Stories, 'station'): search_conds.append(models.Success_Stories.station.ilike(term))
        if hasattr(models.Success_Stories, 'region'): search_conds.append(models.Success_Stories.region.ilike(term))
        if hasattr(models.Success_Stories, 'category'): search_conds.append(models.Success_Stories.category.ilike(term))
        if hasattr(models.Success_Stories, 'last_updated_by'): search_conds.append(models.Success_Stories.last_updated_by.ilike(term))
        if search_conds:
            query = query.filter(or_(*search_conds))

    records = query.order_by(models.Success_Stories.sn.desc()).all()

    # 1. Generate Excel Document Data
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

    df = pd.DataFrame(data_rows) if data_rows else pd.DataFrame(columns=["SN", "Date", "Category", "Title", "Region", "Station", "Narrative", "Photo/Exhibit Links", "Last Updated By"])

    excel_buffer = io.BytesIO()
    with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name="Success Stories", index=False)
        workbook = writer.book
        workbook.properties.creator = get_officer_signature(current_user)
        workbook.properties.title = "KMP Secure Success Stories Export"
        workbook.properties.subject = "Restricted Law Enforcement Extract"

    excel_buffer.seek(0)

    # 2. Create Secure ZIP Archive
    zip_stream = io.BytesIO()
    zip_password = str(current_user.fnum).strip().encode('utf-8')
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_filename = f"SECURE_SUCCESS_STORIES_ARCHIVE_{timestamp}.zip"

    with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
        zf.setpassword(zip_password)

        # Write the Excel summary document to the root of the ZIP
        zf.writestr(f"Success_Stories_Report_{timestamp}.xlsx", excel_buffer.getvalue())

        # Write the physical photo exhibits into the ZIP
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

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="EXPORT",
        module="SUCCESS_STORIES",
        target_id="SECURE_FULL_ARCHIVE_EXPORT",
        changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} securely exported combined Excel report and physical photo exhibits archive for Success Stories ({len(records)} records processed)."
    )

    return StreamingResponse(
        zip_stream,
        media_type="application/zip",
        headers={
            'Content-Disposition': f'attachment; filename="{zip_filename}"',
            'Access-Control-Expose-Headers': 'Content-Disposition'
        }
    )

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