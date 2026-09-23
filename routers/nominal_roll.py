import io
import os
import math
import re
import json
import base64
from datetime import datetime, date
from typing import Optional, List, Union
from urllib.parse import unquote

import numpy as np
import pandas as pd
import pytz
import pyzipper
import openpyxl
from openpyxl.styles import Alignment, PatternFill, Font

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from sqlalchemy.exc import IntegrityError

from app import models, schemas
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["Nominal Roll & HR"])

# ====================================================================
# GLOBAL HELPER FUNCTIONS (AGGRESSIVE SANITIZATION & SECURITY)
# ====================================================================

def require_export_privilege(current_user: models.Users = Depends(get_current_user)):
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}
        
    if (
        user_role not in ["ADMIN", "SUPER_ADMIN", "RPC"] and 
        not perms.get("export_data", False) and 
        not perms.get("global_observer", False) and
        not perms.get("view_global_roster", False)
    ):
        raise HTTPException(status_code=403, detail="Clearance Denied: Data Export Privileges Required.")
    return current_user

def aggressive_clean_text(val):
    """Vaporizes junk punctuation, extra spaces, and trailing dots."""
    if pd.isna(val) or val is None: return None
    s = str(val)
    if s.lower() in ['nan', 'nat', 'none', 'null', '']: return None
    
    s = re.sub(r"[,!?'\"]", "", s)
    s = re.sub(r'\s+', ' ', s)
    s = s.strip('. -/\\')
    
    if not s: return None
    return s.upper()

def clean_numeric(val):
    """Cleans numeric strings and removes trailing .0 from Excel floats."""
    if pd.isna(val) or val is None: return None
    s = str(val).strip()
    if s.lower() in ['nan', 'nat', 'none', 'null', '']: return None
    s = re.sub(r'[^\d.]', '', s) 
    if s.endswith('.0'): s = s[:-2]
    return s

def format_phone_number(val):
    """Extracts ALL valid numbers, formats to standard, recombines with a slash."""
    if pd.isna(val) or val is None: return None
    s = str(val).strip()
    if s.lower() in ['nan', 'nat', 'none', 'null', '']: return None
    
    parts = re.split(r'[,/&|;]|\band\b', s, flags=re.IGNORECASE)
    valid_numbers = []
    
    for part in parts:
        cleaned = re.sub(r'[^\d]', '', part)
        if not cleaned: continue
        
        if cleaned.startswith('256'):
            cleaned = '0' + cleaned[3:]
        elif cleaned.startswith('7') and len(cleaned) == 9:
            cleaned = '0' + cleaned
            
        if len(cleaned) >= 10:
            valid_numbers.append(cleaned)
            
    if not valid_numbers: return None
    return ' / '.join(valid_numbers)

def normalize_sex(val):
    clean_val = aggressive_clean_text(val)
    if not clean_val: return "MALE"
    if clean_val.startswith('F'): return "FEMALE"
    if clean_val.startswith('M'): return "MALE"
    return clean_val

def normalize_education_level(educ_str):
    cleaned = aggressive_clean_text(educ_str)
    if not cleaned: return None
    
    if any(term in cleaned for term in ['S.1', 'S1', 'S.2', 'S2', 'S.3', 'S3', 'SENIOR 1', 'SENIOR 2', 'SENIOR 3']): return cleaned
    if any(term in cleaned for term in ['UACE', 'A-LEVEL', 'A LEVEL', 'S.6', 'S6', 'SENIOR 6']): return "UACE"
    if any(term in cleaned for term in ['UCE', 'O-LEVEL', 'O LEVEL', 'S.4', 'S4', 'SENIOR 4', 'PLE', 'P.7', 'P7']): return "UCE"
        
    return cleaned

def is_uniformed_rank(rank_str: str) -> bool:
    if not rank_str: return False
    r = str(rank_str).strip().upper()
    uniformed_ranks = {
        'IGP', 'DIGP', 'AIGP', 'SCP', 'CP', 'ACP', 'SSP', 'SP', 'SASP', 'ASP',
        'IP', 'AIP', 'HCM', 'HC', 'S/SGT', 'SSGT', 'SGT', 'CPL', 'L/CPL', 'LCPL',
        'PC', 'PPC', 'SPC', 'DC', 'D/C'
    }
    return r in uniformed_ranks

def parse_safe_date(val) -> Optional[date]:
    if pd.isna(val) or val is None: return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val if 1900 <= val.year <= 2100 else None
    if isinstance(val, datetime):
        return val.date() if 1900 <= val.year <= 2100 else None
    if type(val).__name__ == 'Timestamp':
        try: return val.date() if 1900 <= val.year <= 2100 else None
        except Exception: return None

    val_str = str(val).strip()
    if val_str.lower() in ['nan', 'nat', 'none', 'null', '', '-', 'n/a', 'nil', '0', 'undefined']: return None

    if ' ' in val_str: val_str = val_str.split(' ')[0]
    if 'T' in val_str: val_str = val_str.split('T')[0]

    val_str = val_str.strip()
    if not val_str: return None

    try:
        if val_str.replace('.', '', 1).isdigit():
            float_val = float(val_str)
            if 1000 < float_val < 73050:
                try:
                    dt = pd.to_datetime(float_val, unit='D', origin='1899-12-30', errors='coerce')
                    if pd.notna(dt) and 1900 <= dt.year <= 2100: return dt.date()
                except Exception: pass
    except Exception: pass

    clean_str = re.sub(r'[\./\\]', '-', val_str)
    parts = clean_str.split('-')

    if len(parts) == 3:
        p0, p1, p2 = parts[0].strip(), parts[1].strip(), parts[2].strip()
        if p0.isdigit() and p1.isdigit() and p2.isdigit():
            if len(p0) == 4:
                try:
                    res_date = date(int(p0), int(p1), int(p2))
                    if 1900 <= res_date.year <= 2100: return res_date
                except Exception: pass
            elif len(p2) == 4:
                try:
                    res_date = date(int(p2), int(p1), int(p0))
                    if 1900 <= res_date.year <= 2100: return res_date
                except Exception: pass
            elif len(p0) <= 2 and len(p2) <= 2:
                for (day_val, month_val, year_val) in [(int(p0), int(p1), int(p2)), (int(p2), int(p1), int(p0))]:
                    y = year_val
                    if y < 100: y = 1900 + y if y > 40 else 2000 + y
                    try:
                        res_date = date(y, month_val, day_val)
                        if 1900 <= res_date.year <= 2100: return res_date
                    except Exception: continue

    for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%Y/%m/%d', '%d.%m.%Y', '%m/%d/%Y', '%m-%d-%Y'):
        try:
            d = datetime.strptime(val_str, fmt).date()
            if 1900 <= d.year <= 2100: return d
        except Exception: continue

    try:
        parsed = pd.to_datetime(val_str, dayfirst=True, errors='coerce')
        if pd.notna(parsed):
            py_dt = parsed.to_pydatetime()
            if 1900 <= py_dt.year <= 2100: return py_dt.date()
    except Exception: pass

    return None

def get_officer_signature(user):
    if not user: return "UNKNOWN COMMANDER"
    fnum = (user.fnum or "").strip()
    rank = (user.rank or "").strip()
    name = (user.name or "").strip()
    return f"{fnum} {rank} {name}".strip().upper()

def get_active_model():
    model = getattr(models, 'NominalRoll', getattr(models, 'Nominal_Roll', getattr(models, 'nominal_roll', None)))
    if not model: raise HTTPException(status_code=500, detail="Nominal Roll database model not configured.")
    return model

def get_archive_model():
    model = getattr(models, 'NominalRollArchive', getattr(models, 'Nominal_Roll_Archive', getattr(models, 'nominal_roll_archive', None)))
    if not model: raise HTTPException(status_code=500, detail="Nominal Roll Archive database model not configured.")
    return model

STATION_GEO_MAP = {
    "KAWEMPE": {"region": "KMP NORTH", "district": "KAMPALA"},
    "WANDEGEYA": {"region": "KMP NORTH", "district": "KAMPALA"},
    "OLD KAMPALA": {"region": "KMP NORTH", "district": "KAMPALA"},
    "MATUGGA": {"region": "KMP NORTH", "district": "WAKISO"},
    "NANSANA": {"region": "KMP NORTH", "district": "WAKISO"},
    "KASANGATI": {"region": "KMP NORTH", "district": "WAKISO"},
    "KAKIRI": {"region": "KMP NORTH", "district": "WAKISO"},
    "WAKISO": {"region": "KMP NORTH", "district": "WAKISO"},
    "NATEETE": {"region": "KMP SOUTH", "district": "WAKISO"},
    "CPS KAMPALA": {"region": "KMP SOUTH", "district": "KAMPALA"},
    "PARLIAMENT": {"region": "KMP SOUTH", "district": "KAMPALA"},
    "ENTEBBE": {"region": "KMP SOUTH", "district": "WAKISO"},
    "KABALAGALA": {"region": "KMP SOUTH", "district": "KAMPALA"},
    "KAJJANSI": {"region": "KMP SOUTH", "district": "KAMPALA"},
    "NSANGI": {"region": "KMP SOUTH", "district": "WAKISO"},
    "KASENYI": {"region": "KMP SOUTH", "district": "WAKISO"},
    "KYENGERA": {"region": "KMP SOUTH", "district": "WAKISO"},
    "JINJA ROAD": {"region": "KMP EAST", "district": "KAMPALA"},
    "MUKONO": {"region": "KMP EAST", "district": "MUKONO"},
    "KIRA ROAD": {"region": "KMP EAST", "district": "KAMPALA"},
    "KIRA DIV": {"region": "KMP EAST", "district": "WAKISO"},
    "NAGGALAMA": {"region": "KMP EAST", "district": "MUKONO"},
    "SEETA": {"region": "KMP EAST", "district": "MUKONO"},
}

def auto_infer_geography(station_name, current_region=None, current_district=None):
    if not station_name: return current_region or "KMP HEADQUARTERS", current_district or "KAMPALA"
    stat_upper = aggressive_clean_text(station_name)
    inferred_region = aggressive_clean_text(current_region)
    inferred_district = aggressive_clean_text(current_district)

    if stat_upper in STATION_GEO_MAP:
        geo_info = STATION_GEO_MAP[stat_upper]
        if not inferred_region or str(inferred_region).upper() in ["", "NONE", "NAN", "ALL REGIONS"]:
            inferred_region = geo_info["region"]
        if not inferred_district or str(inferred_district).upper() in ["", "NONE", "NAN", "ALL REGIONS"]:
            inferred_district = geo_info["district"]
    return inferred_region or "KMP HEADQUARTERS", inferred_district or "KAMPALA"

def getOfficialRegionForStation(station_name: str, current_region: Optional[str] = None) -> str:
    """Resolves the official region for a given station using the geo map."""
    if not station_name:
        return current_region or "KMP HEADQUARTERS"
    stat_upper = aggressive_clean_text(station_name)
    if stat_upper in STATION_GEO_MAP:
        return STATION_GEO_MAP[stat_upper]["region"]
    return current_region or "KMP HEADQUARTERS"

@router.get("/nominal-roll")
def get_Nominal_Rolls(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    ActiveModel = get_active_model()
    ArchiveModel = get_archive_model()
    
    active_query = db.query(ActiveModel)
    archive_query = db.query(ArchiveModel)
    
    user_role = (current_user.role or "").upper()
    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}
    
    is_global = (
        user_role in ["ADMIN", "SUPER_ADMIN", "RPC", "DEPUTY COMMANDER"] or
        (current_user.region or "").strip().upper() in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"] or
        perms.get("view_global_roster") is True or
        perms.get("global_observer") is True
    )

    if not is_global:
        # Check if explicitly cleared via admin approval
        has_explicit_access = perms.get("view_nominal_roll", False) or perms.get("acc_hr", False) or current_user.is_approved is True
        
        user_station = (current_user.station or "").strip().upper()
        user_region = (current_user.region or "").strip().upper()
        
        if user_role in ["REGIONAL_ADMIN", "REGIONAL_USER", "ASSISTANT_REGIONAL_ADMIN"] and user_region:
            active_query = active_query.filter(func.upper(ActiveModel.region) == user_region)
            archive_query = archive_query.filter(func.upper(ArchiveModel.region) == user_region)
        elif user_station:
            active_query = active_query.filter(func.upper(ActiveModel.station) == user_station)
            archive_query = archive_query.filter(func.upper(ArchiveModel.station) == user_station)
        elif not has_explicit_access:
            active_query = active_query.filter(ActiveModel.id == -1)
            archive_query = archive_query.filter(ArchiveModel.id == -1)
        
    sort_act = getattr(ActiveModel, 'created_at', getattr(ActiveModel, 'id', getattr(ActiveModel, 'sn', None)))
    if sort_act is not None:
        active_query = active_query.order_by(sort_act.asc())

    sort_arc = getattr(ArchiveModel, 'archive_date', getattr(ArchiveModel, 'created_at', getattr(ArchiveModel, 'id', getattr(ArchiveModel, 'sn', None))))
    if sort_arc is not None:
        archive_query = archive_query.order_by(sort_arc.desc())

    active_records = active_query.all()
    archive_records = archive_query.all()
    
    clean_results = []
    sequence_counter = 1

    for r in active_records:
        r_dict = r.__dict__.copy()
        r_dict.pop("_sa_instance_state", None)
        
        fnum_val = r_dict.get('f_num') or r_dict.get('fnum') or ''
        r_dict['fnum'] = fnum_val
        r_dict['f_num'] = fnum_val
        r_dict['do_post'] = r_dict.get('do_post') or r_dict.get('dopost') or ''
        r_dict['do_pro'] = r_dict.get('do_pro') or r_dict.get('dopro') or ''
        r_dict['educ_level'] = normalize_education_level(r_dict.get('educ_level') or r_dict.get('educlevel'))
        r_dict['home_dist'] = r_dict.get('home_dist') or r_dict.get('homedist') or ''
        r_dict['acc_no'] = r_dict.get('acc_no') or r_dict.get('accno') or ''
        r_dict['bank_branch'] = r_dict.get('bank_branch') or r_dict.get('bankbranch') or ''
        
        r_dict['sn'] = sequence_counter
        r_dict['dbAuditId'] = getattr(r, 'id', sequence_counter)
        r_dict['is_archived'] = False
        r_dict['status'] = r_dict.get('status') or 'ACTIVE'
        
        clean_results.append(r_dict)
        sequence_counter += 1

    for r in archive_records:
        r_dict = r.__dict__.copy()
        r_dict.pop("_sa_instance_state", None)
        
        fnum_val = r_dict.get('fnum') or r_dict.get('f_num') or ''
        r_dict['fnum'] = fnum_val
        r_dict['f_num'] = fnum_val
        r_dict['do_post'] = r_dict.get('dopost') or r_dict.get('do_post') or ''
        r_dict['do_pro'] = r_dict.get('dopro') or r_dict.get('do_pro') or ''
        r_dict['educ_level'] = normalize_education_level(r_dict.get('educlevel') or r_dict.get('educ_level'))
        r_dict['home_dist'] = r_dict.get('homedist') or r_dict.get('home_dist') or ''
        r_dict['acc_no'] = r_dict.get('accno') or r_dict.get('acc_no') or ''
        r_dict['bank_branch'] = r_dict.get('bankbranch') or r_dict.get('bank_branch') or ''
        
        r_dict['sn'] = sequence_counter
        r_dict['dbAuditId'] = f"ARC-{getattr(r, 'id', sequence_counter)}"
        r_dict['is_archived'] = True
        r_dict['status'] = r_dict.get('status') or 'ARCHIVED'
        
        clean_results.append(r_dict)
        sequence_counter += 1
        
    return clean_results

@router.post("/nominal-roll/bulk-upload")
@router.post("/nominal-roll/upload")
async def bulk_upload_nominal_roll(
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    ActiveModel = get_active_model()
    ArchiveModel = get_archive_model()
    
    file_list = []
    if files: file_list.extend(files)
    if file: file_list.append(file)

    if not file_list:
        raise HTTPException(status_code=400, detail="No valid file uploaded.")

    inserted_count = 0
    updated_count = 0
    skipped_archived = []
    skipped_blank = []
    officer_sig = get_officer_signature(current_user)

    try:
        for single_file in file_list:
            contents = await single_file.read()
            filename = (single_file.filename or "").lower()

            if filename.endswith(".csv"): df = pd.read_csv(io.BytesIO(contents))
            elif filename.endswith((".xls", ".xlsx")): df = pd.read_excel(io.BytesIO(contents))
            else: continue

            def standardize_header(h):
                h = str(h).lower().strip()
                h = h.replace("f/no", "fnum").replace("f-no", "fnum").replace("force no", "fnum")
                h = h.replace("d.o.b", "dob").replace("d.o.e", "doe").replace("d.o.p", "dopost")
                return re.sub(r'[^a-z0-9]', '', h)
                
            df.columns = [standardize_header(col) for col in df.columns]
            
            date_columns = ['dob', 'dateofbirth', 'doe', 'dateofenlistment', 'dopost', 'dop', 'dopro', 'dateofpromotion']
            for col in date_columns:
                if col in df.columns:
                    df[col] = df[col].apply(parse_safe_date)

            for idx, row in df.iterrows():
                fnum_val = aggressive_clean_text(row.get("fnum") or row.get("forceno") or row.get("forcenumber") or row.get("fileno") or row.get("fno"))
                ipps_val = clean_numeric(row.get("ipps") or row.get("ippsno") or row.get("ippsnumber"))
                nin_val = clean_numeric(row.get("nin") or row.get("nationalid") or row.get("ninno"))
                rank_val = aggressive_clean_text(row.get("rank"))
                name_val = aggressive_clean_text(row.get("name"))

                # 🟢 BULLETPROOF JUNK & PLACEHOLDER REJECTION FILTER
                row_text_signature = f"{fnum_val or ''} {rank_val or ''} {name_val or ''}".upper()

                # 1. Reject if missing a legitimate Force Number or has placeholder names like UNKNOWN/NIL
                if not fnum_val or not name_val or name_val in ["UNKNOWN", "N/A", "NIL", "NAN", "NONE", ""]:
                    skipped_blank.append(f"[{single_file.filename}] Row {idx+2}: Rejected (Missing valid Force Number or genuine Name)")
                    continue

                # 2. Reject section headers, station titles, or structural junk rows (e.g., "OC STATION")
                if any(term in row_text_signature for term in ["DEPARTMENT", "POL. POST", "POLICE POST", "SECTION", "DIV HEADQUARTERS", "OC STATION", "STATION"]):
                    skipped_blank.append(f"[{single_file.filename}] Row {idx+2}: Rejected structural section header [{name_val}]")
                    continue

                # 3. Ensure rank is either a recognized uniformed rank or a valid authorized category
                if not is_uniformed_rank(rank_val) and rank_val not in ["CIVILIAN", "DRV", "C/DRV", "CONSTABLE"]:
                    skipped_blank.append(f"[{single_file.filename}] Row {idx+2}: Rejected unrecognized rank category [{rank_val}]")
                    continue 

                clean_fnum = fnum_val
                stn_val = aggressive_clean_text(row.get("station") or current_user.station or "HQ")
                reg_val, dist_val = auto_infer_geography(stn_val, aggressive_clean_text(row.get("region")), aggressive_clean_text(row.get("district")))

                dob_val = row.get("dob") if isinstance(row.get("dob"), date) else parse_safe_date(row.get("dob") or row.get("dateofbirth"))
                doe_val = row.get("doe") if isinstance(row.get("doe"), date) else parse_safe_date(row.get("doe") or row.get("dateofenlistment"))
                dopost_val = row.get("dopost") if isinstance(row.get("dopost"), date) else parse_safe_date(row.get("dopost") or row.get("dop"))
                dopro_val = row.get("dopro") if isinstance(row.get("dopro"), date) else parse_safe_date(row.get("dopro") or row.get("dateofpromotion"))

                officer_payload = {
                    "rank": rank_val or "CIVILIAN",
                    "name": name_val or "UNKNOWN",
                    "sex": normalize_sex(row.get("sex") or row.get("gender")),
                    "position": aggressive_clean_text(row.get("position") or row.get("title") or "GENERAL DUTIES"),
                    "dob": dob_val,
                    "doe": doe_val,
                    "do_post": dopost_val,
                    "do_pro": dopro_val,
                    "contact": format_phone_number(row.get("contact") or row.get("phone") or row.get("phonenumber")),
                    "educ_level": normalize_education_level(row.get("educ_level") or row.get("educlevel") or row.get("education")),
                    "ipps": ipps_val,
                    "tin": clean_numeric(row.get("tin") or row.get("tinno") or row.get("tinnumber")),
                    "nin": nin_val,
                    "home_dist": aggressive_clean_text(row.get("homedist") or row.get("homedistrict")),
                    "tribe": aggressive_clean_text(row.get("tribe")),
                    "acc_no": clean_numeric(row.get("accno") or row.get("accountno") or row.get("accountnumber")),
                    "bank_branch": aggressive_clean_text(row.get("bankbranch") or row.get("bank")),
                    "station": stn_val,
                    "district": dist_val,
                    "region": reg_val,
                    "section": aggressive_clean_text(row.get("section")),
                    "dir": aggressive_clean_text(row.get("dir") or row.get("directorate")),
                    "status": aggressive_clean_text(row.get("status") or "ACTIVE"),
                    "last_updated_by": officer_sig
                }

                for key, value in list(officer_payload.items()):
                    if isinstance(value, str) and not value.strip():
                        officer_payload[key] = None
                    elif isinstance(value, float) and math.isnan(value):
                        officer_payload[key] = None

                if hasattr(ActiveModel, 'f_num'): officer_payload['f_num'] = clean_fnum
                if hasattr(ActiveModel, 'fnum'): officer_payload['fnum'] = clean_fnum

                fnum_filter = []
                if hasattr(ActiveModel, 'f_num'): fnum_filter.append(func.trim(func.upper(ActiveModel.f_num)) == clean_fnum)
                if hasattr(ActiveModel, 'fnum'): fnum_filter.append(func.trim(func.upper(ActiveModel.fnum)) == clean_fnum)

                existing = db.query(ActiveModel).filter(or_(*fnum_filter)).first()

                if existing:
                    for k, v in officer_payload.items():
                        if hasattr(existing, k) and v is not None:
                            setattr(existing, k, v)
                    updated_count += 1
                else:
                    arc_filter = []
                    if hasattr(ArchiveModel, 'f_num'): arc_filter.append(func.trim(func.upper(ArchiveModel.f_num)) == clean_fnum)
                    if hasattr(ArchiveModel, 'fnum'): arc_filter.append(func.trim(func.upper(ArchiveModel.fnum)) == clean_fnum)
                    
                    is_archived = db.query(ArchiveModel).filter(or_(*arc_filter)).first()
                    
                    if is_archived:
                        safe_payload_json = {}
                        for k, v in officer_payload.items():
                            if isinstance(v, (date, datetime)): safe_payload_json[k] = v.isoformat()
                            else: safe_payload_json[k] = v
                            
                        entry_obj = {
                            "display": f"{officer_payload['rank']} {officer_payload['name']} ({clean_fnum})",
                            "fnum": clean_fnum,
                            "payload": safe_payload_json
                        }
                        
                        if not any(isinstance(x, dict) and x.get('fnum') == clean_fnum for x in skipped_archived):
                            skipped_archived.append(entry_obj)
                        continue
                        
                    valid_cols = [c.key for c in ActiveModel.__table__.columns]
                    safe_payload = {k: v for k, v in officer_payload.items() if k in valid_cols}
                    new_entry = ActiveModel(**safe_payload)
                    db.add(new_entry)
                    inserted_count += 1
                
                db.flush()

        db.commit()
        return {
            "status": "warning" if (skipped_archived or skipped_blank) else "success",
            "message": f"Batch process complete across {len(file_list)} files. {inserted_count} new personnel recorded, {updated_count} updated.",
            "skipped": skipped_archived,
            "skipped_blank": skipped_blank
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Bulk Nominal Roll Upload Failed: {str(e)}")

@router.post("/nominal-roll")
def create_Nominal_Roll(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    ActiveModel = get_active_model()
    ArchiveModel = get_archive_model()
    
    try:
        reintegration_reason = data.pop('reintegration_reason', None)
        previous_fnum = data.pop('previous_fnum', None)
        
        data.pop('sn', None) 
        data.pop('id', None)
        
        clean_data = {}
        for k, v in data.items():
            clean_data[k] = None if v == "" else v

        perms = current_user.permissions or {}
        user_role = (current_user.role or "").upper()
        is_global_user = (
            user_role in ["SUPER_ADMIN", "ADMIN", "RPC", "DEPUTY COMMANDER"] or
            "HR" in (current_user.position or "").upper() or
            perms.get("view_global_roster") is True or
            perms.get("global_observer") is True
        )

        if not is_global_user:
            clean_data["region"] = current_user.region
            clean_data["station"] = current_user.station

        if 'contact' in clean_data and clean_data['contact']:
            clean_data['contact'] = format_phone_number(clean_data['contact'])
            
        if 'name' in clean_data and clean_data['name']:
            clean_data['name'] = aggressive_clean_text(clean_data['name'])

        if 'sex' in clean_data:
            clean_data['sex'] = normalize_sex(clean_data['sex'])
            
        if 'educ_level' in clean_data:
            clean_data['educ_level'] = normalize_education_level(clean_data['educ_level'])

        for text_field in ['position', 'home_dist', 'tribe', 'bank_branch', 'section', 'dir']:
            if text_field in clean_data and clean_data[text_field]:
                clean_data[text_field] = aggressive_clean_text(clean_data[text_field])

        for date_field in ['dob', 'doe', 'do_post', 'do_pro']:
            if date_field in clean_data and clean_data[date_field]:
                clean_data[date_field] = parse_safe_date(clean_data[date_field])

        target_fnum = clean_data.get('f_num') or clean_data.get('fnum')
        if not target_fnum:
            raise HTTPException(status_code=400, detail="Force/File number is mandatory.")

        clean_fnum = aggressive_clean_text(target_fnum)
        if hasattr(ActiveModel, 'f_num'): clean_data['f_num'] = clean_fnum
        if hasattr(ActiveModel, 'fnum'): clean_data['fnum'] = clean_fnum

        fnum_filter = []
        if hasattr(ActiveModel, 'f_num'): fnum_filter.append(func.trim(func.upper(ActiveModel.f_num)) == clean_fnum)
        if hasattr(ActiveModel, 'fnum'): fnum_filter.append(func.trim(func.upper(ActiveModel.fnum)) == clean_fnum)

        active_officer = db.query(ActiveModel).filter(or_(*fnum_filter)).first()
        if active_officer:
            raise HTTPException(status_code=400, detail="Duplicate Entry: This Force Number or File Number is currently active.")

        search_fnum = aggressive_clean_text(previous_fnum) if previous_fnum else clean_fnum
        arc_filter = []
        if hasattr(ArchiveModel, 'fnum'): arc_filter.append(func.trim(func.upper(ArchiveModel.fnum)) == search_fnum)
        if hasattr(ArchiveModel, 'f_num'): arc_filter.append(func.trim(func.upper(ArchiveModel.f_num)) == search_fnum)

        archived_officer = db.query(ArchiveModel).filter(or_(*arc_filter)).first()
        
        if archived_officer:
            if not reintegration_reason:
                return JSONResponse(
                    status_code=409, 
                    content={
                        "detail": "Officer history found in the archive. Please authorize re-entry.", 
                        "is_archived_returnee": True,
                        "old_rank": getattr(archived_officer, 'rank', 'N/A'),
                        "old_fnum": getattr(archived_officer, 'fnum', getattr(archived_officer, 'f_num', search_fnum))
                    }
                )
            
            clean_data['dob'] = getattr(archived_officer, 'dob', clean_data.get('dob'))
            clean_data['doe'] = getattr(archived_officer, 'doe', clean_data.get('doe'))
            clean_data['ipps'] = getattr(archived_officer, 'ipps', clean_data.get('ipps'))
            clean_data['status'] = "ACTIVE"
            
            valid_cols = [c.key for c in ActiveModel.__table__.columns]
            safe_payload = {k: v for k, v in clean_data.items() if k in valid_cols}
            
            new_record = ActiveModel(**safe_payload)
            new_record.last_updated_by = get_officer_signature(current_user)
            
            db.add(new_record)
            db.commit()
            
            assigned_id = getattr(new_record, 'id', getattr(new_record, 'sn', 1))
            return {"status": "success", "message": f"Officer re-integrated successfully as {clean_data.get('rank')}", "id": assigned_id}

        valid_cols = [c.key for c in ActiveModel.__table__.columns]
        safe_payload = {k: v for k, v in clean_data.items() if k in valid_cols}
        
        new_record = ActiveModel(**safe_payload)
        new_record.last_updated_by = get_officer_signature(current_user)
        
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        
        assigned_id = getattr(new_record, 'id', getattr(new_record, 'sn', 1))
        return {"status": "success", "message": "Officer recorded successfully.", "id": assigned_id}
        
    except IntegrityError:
        db.rollback() 
        raise HTTPException(status_code=400, detail="Duplicate Entry: Force Number or IPPS already exists in active database.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.put("/nominal-roll/archive-record")
def archive_personnel(
    payload: dict, 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    ActiveModel = get_active_model()
    ArchiveModel = get_archive_model()
    
    try:
        raw_fnum = payload.get("fnum") or payload.get("f_num")
        archive_reason = payload.get("archive_reason", "ADMINISTRATIVE")
        
        if not raw_fnum:
            raise HTTPException(status_code=400, detail="Missing Force Number identifier for archiving.")

        fnum_clean = str(raw_fnum).split('/ARCHIVE')[0].replace('/ARCHIVE', '').strip().upper()
        alt_fnum = fnum_clean.replace('/', '')
        
        query_filters = []
        if hasattr(ActiveModel, 'f_num'):
            query_filters.extend([
                func.trim(func.upper(ActiveModel.f_num)) == fnum_clean,
                func.trim(func.upper(ActiveModel.f_num)) == alt_fnum
            ])
        if hasattr(ActiveModel, 'fnum'):
            query_filters.extend([
                func.trim(func.upper(ActiveModel.fnum)) == fnum_clean,
                func.trim(func.upper(ActiveModel.fnum)) == alt_fnum
            ])
        if hasattr(ActiveModel, 'ipps'):
            query_filters.append(func.trim(func.upper(ActiveModel.ipps)) == fnum_clean)
            
        active_record = db.query(ActiveModel).filter(or_(*query_filters)).first()

        if not active_record:
            raise HTTPException(status_code=404, detail=f"Officer record '{fnum_clean}' not found in active roll.")

        record_data = active_record.__dict__.copy()
        record_data.pop("_sa_instance_state", None) 
        record_data.pop("id", None) 
        record_data.pop("sn", None) 
        
        if hasattr(ArchiveModel, 'fnum'): record_data["fnum"] = fnum_clean
        if hasattr(ArchiveModel, 'f_num'): record_data["f_num"] = fnum_clean
            
        record_data["status"] = "ARCHIVED"
        record_data["archive_reason"] = aggressive_clean_text(archive_reason)
        record_data["archive_date"] = datetime.now().date()
        record_data["last_updated_by"] = get_officer_signature(current_user)

        valid_archive_columns = [c.key for c in ArchiveModel.__table__.columns]
        safe_record_data = {k: v for k, v in record_data.items() if k in valid_archive_columns}

        archived_record = ArchiveModel(**safe_record_data)
        db.add(archived_record)
        db.delete(active_record)
        db.commit()
        
        return {"status": "success", "message": "Officer successfully moved to archives."}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to migrate record: {str(e)}")

@router.put("/nominal-roll/{identifier:path}")
def update_Nominal_Roll(
    identifier: str, 
    data: dict, 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    ActiveModel = get_active_model()
    clean_id = unquote(unquote(identifier)).strip().upper()
    
    query_filters = []
    
    if hasattr(ActiveModel, 'fnum'):
        query_filters.append(func.trim(func.upper(ActiveModel.fnum)) == clean_id)
    if hasattr(ActiveModel, 'f_num'):
        query_filters.append(func.trim(func.upper(ActiveModel.f_num)) == clean_id)
        
    alt_id = clean_id.replace('/', '')
    if hasattr(ActiveModel, 'fnum'):
        query_filters.append(func.trim(func.upper(ActiveModel.fnum)) == alt_id)
    if hasattr(ActiveModel, 'f_num'):
        query_filters.append(func.trim(func.upper(ActiveModel.f_num)) == alt_id)

    if clean_id.isdigit():
        pk_col = getattr(ActiveModel, 'id', getattr(ActiveModel, 'sn', None))
        if pk_col is not None:
            query_filters.append(pk_col == int(clean_id))

    officer = db.query(ActiveModel).filter(or_(*query_filters)).first()
    
    if not officer:
        raise HTTPException(status_code=404, detail=f"Officer record '{clean_id}' not found in active Nominal Roll.")

    data.pop('id', None)
    data.pop('sn', None)
    
    if 'educ_level' in data:
        data['educ_level'] = normalize_education_level(data['educ_level'])
        
    if 'contact' in data and data['contact']:
        data['contact'] = format_phone_number(data['contact'])
        
    if 'name' in data and data['name']:
        data['name'] = aggressive_clean_text(data['name'])

    for text_field in ['position', 'home_dist', 'tribe', 'bank_branch', 'section', 'dir']:
        if text_field in data and data[text_field]:
            data[text_field] = aggressive_clean_text(data[text_field])

    for date_field in ['dob', 'doe', 'do_post', 'do_pro']:
        if date_field in data and data[date_field]:
            data[date_field] = parse_safe_date(data[date_field])
    
    perms = current_user.permissions or {}
    user_role = (current_user.role or "").upper()
    is_global_user = (
        user_role in ["SUPER_ADMIN", "ADMIN", "RPC", "DEPUTY COMMANDER"] or
        "HR" in (current_user.position or "").upper() or
        perms.get("view_global_roster") is True or
        perms.get("global_observer") is True
    )

    if not is_global_user:
        data.pop('region', None)
        data.pop('station', None)

    for key, value in data.items():
        if hasattr(officer, key):
            setattr(officer, key, value if value != "" else None)

    officer.last_updated_by = get_officer_signature(current_user)
    
    try:
        db.commit()
        db.refresh(officer)
        return {"status": "success", "message": f"Officer record updated successfully."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update officer record: {str(e)}")

@router.get("/nominal-roll/archive")
@router.get("/nominal-roll-archive")
def get_archived_personnel(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        ArchiveModel = get_archive_model()
        
        sort_col = getattr(ArchiveModel, 'archive_date', getattr(ArchiveModel, 'id', None))
        query = db.query(ArchiveModel)
        if sort_col is not None:
            query = query.order_by(sort_col.desc())
            
        archives = query.all()
        clean_list = []
        for a in archives:
            d = a.__dict__.copy()
            d.pop("_sa_instance_state", None)
            d['educ_level'] = normalize_education_level(d.get('educlevel') or d.get('educ_level'))
            for k, v in d.items():
                if hasattr(v, 'isoformat'):
                    d[k] = str(v)
            clean_list.append(d)
        return clean_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch archives: {str(e)}")

@router.post("/nominal-roll/bulk-archive")
def bulk_archive_personnel(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    ActiveModel = get_active_model()
    ArchiveModel = get_archive_model()
    
    fnums = payload.get("fnums", [])
    archive_reason = payload.get("archive_reason", "ADMINISTRATIVE")
    
    if not fnums:
        raise HTTPException(status_code=400, detail="No officers specified for bulk archive.")
        
    success_count = 0
    fail_count = 0
    officer_sig = get_officer_signature(current_user)

    try:
        for fnum in fnums:
            fnum_clean = unquote(unquote(str(fnum))).strip().upper()
            
            query_filters = []
            if hasattr(ActiveModel, 'f_num'):
                query_filters.append(func.trim(func.upper(ActiveModel.f_num)) == fnum_clean)
            if hasattr(ActiveModel, 'fnum'):
                query_filters.append(func.trim(func.upper(ActiveModel.fnum)) == fnum_clean)
            if hasattr(ActiveModel, 'ipps'):
                query_filters.append(func.trim(func.upper(ActiveModel.ipps)) == fnum_clean)
                
            active_record = db.query(ActiveModel).filter(or_(*query_filters)).first()
            
            if not active_record:
                alt_fnum = fnum_clean.replace('/', '')
                query_filters_alt = []
                if hasattr(ActiveModel, 'f_num'): query_filters_alt.append(func.trim(func.upper(ActiveModel.f_num)) == alt_fnum)
                if hasattr(ActiveModel, 'fnum'): query_filters_alt.append(func.trim(func.upper(ActiveModel.fnum)) == alt_fnum)
                active_record = db.query(ActiveModel).filter(or_(*query_filters_alt)).first()

            if active_record:
                record_data = active_record.__dict__.copy()
                record_data.pop("_sa_instance_state", None)
                record_data.pop("id", None)
                record_data.pop("sn", None)
                
                if hasattr(ArchiveModel, 'fnum'): record_data["fnum"] = fnum_clean
                if hasattr(ArchiveModel, 'f_num'): record_data["f_num"] = fnum_clean
                
                record_data["status"] = "ARCHIVED"
                record_data["archive_reason"] = aggressive_clean_text(archive_reason)
                record_data["archive_date"] = datetime.now().date()
                record_data["last_updated_by"] = officer_sig

                valid_archive_columns = [c.key for c in ArchiveModel.__table__.columns]
                safe_record_data = {k: v for k, v in record_data.items() if k in valid_archive_columns}

                archived_record = ArchiveModel(**safe_record_data)
                db.add(archived_record)
                db.delete(active_record)
                success_count += 1
            else:
                fail_count += 1

        db.commit()
        return {
            "status": "success", 
            "success_count": success_count, 
            "fail_count": fail_count,
            "message": f"Bulk archive complete: {success_count} succeeded, {fail_count} failed."
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Bulk archive transaction failed: {str(e)}")


# ====================================================================
# 7. SECURE EXCEL EXPORTS (MISSING INFO AUDIT & STATION LEDGER)
# ====================================================================

@router.get("/nominal-roll/export-missing-audit")
def export_missing_info_audit(
    region: str = "ALL REGIONS",
    station: str = "ALL STATIONS",
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(require_export_privilege)
):
    try:
        ActiveModel = get_active_model()
        query = db.query(ActiveModel)
        
        region_clean = region.strip().upper()
        station_clean = station.strip().upper()

        records = query.all()
        missing_rows = []

        for r in records:
            r_stn = str(getattr(r, 'station', '')).strip().upper()
            r_reg = getOfficialRegionForStation(r_stn, str(getattr(r, 'region', '')).strip().upper())

            if region_clean != "ALL REGIONS" and r_reg != region_clean: continue
            if station_clean != "ALL STATIONS" and r_stn != station_clean: continue

            rank = str(getattr(r, 'rank', '')).strip().upper()
            is_constable_tier = rank in ['PC', 'DC', 'D/C', 'CONSTABLE', 'C/DRV', 'DRV'] or 'DRV' in rank

            dob = getattr(r, 'dob', None)
            doe = getattr(r, 'doe', None)
            contact = getattr(r, 'contact', None)
            nin = getattr(r, 'nin', None)
            ipps = getattr(r, 'ipps', None)
            dopro = getattr(r, 'do_pro', None)

            missing_fields = []
            if not dob: missing_fields.append("DOB")
            if not doe: missing_fields.append("DOE")
            if not contact: missing_fields.append("Contact")
            if not nin: missing_fields.append("NIN")
            if not ipps: missing_fields.append("IPPS")
            if not is_constable_tier and not dopro: missing_fields.append("DO_PRO")

            if missing_fields:
                missing_rows.append({
                    "Force Number": getattr(r, 'f_num', getattr(r, 'fnum', '')),
                    "Rank": rank,
                    "Name": getattr(r, 'name', ''),
                    "Region": r_reg,
                    "Station": r_stn,
                    "Missing Fields": " | ".join(missing_fields)
                })

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Missing Info Audit"

        eat_tz = pytz.timezone("Africa/Nairobi")
        eat_time = datetime.now(eat_tz).replace(tzinfo=None)
        
        ws.append([f"UGANDA POLICE FORCE - MANPOWER AUDIT: MISSING INFORMATION REPORT"])
        ws.append([f"Station / Unit: {station_clean} (Region: {region_clean})"])
        ws.append([f"Audit Timestamp: {eat_time.strftime('%Y-%m-%d %H:%M:%S EAT')} | Authorized By: {current_user.fnum}"])
        ws.append([]) 

        header_fill = PatternFill(start_color="002060", end_color="002060", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        
        ws.append(["SN", "Force Number", "Rank", "Name", "Region", "Station", "Missing Fields"])
        
        for cell in ws[5]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for idx, row in enumerate(missing_rows, 1):
            ws.append([
                idx,
                row["Force Number"],
                row["Rank"],
                row["Name"],
                row["Region"],
                row["Station"],
                row["Missing Fields"]
            ])

        for col in ws.columns:
            col_letter = col[0].column_letter
            max_len = max([len(str(cell.value or '')) for cell in col], default=0)
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 45)

        officer_fnum = (current_user.fnum or "HQ-UNKNOWN").strip().upper()
        stamp_id = f"KMP-STAMP-{officer_fnum}-{eat_time.strftime('%Y%m%d%H%M%S')}"
        encoded_token = base64.b64encode(json.dumps({"f": officer_fnum, "s": stamp_id}).encode('utf-8')).decode('utf-8')
        
        wb.properties.keywords = f"KMP_AUDIT;{encoded_token}"
        wb.properties.category = "RESTRICTED / FORENSIC POLICE RECORD"

        excel_stream = io.BytesIO()
        wb.save(excel_stream)
        excel_stream.seek(0)

        zip_stream = io.BytesIO()
        zip_password = str(current_user.fnum).strip().encode('utf-8')
        fnum_clean = str(current_user.fnum).replace('/', '_').upper()
        excel_filename = f"{fnum_clean}_Missing_Info_Audit_{eat_time.strftime('%Y%m%d')}.xlsx"
        zip_filename = f"SECURE_MISSING_AUDIT_{eat_time.strftime('%Y%m%d')}.zip"

        with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            zf.writestr(excel_filename, excel_stream.getvalue())

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
        raise HTTPException(status_code=500, detail=f"Audit Export Failed: {str(e)}")


@router.get("/nominal-roll/export-station-ledger")
def export_station_nominal_roll(
    region: str = "ALL REGIONS",
    station: str = "ALL STATIONS",
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(require_export_privilege)
):
    try:
        ActiveModel = get_active_model()
        query = db.query(ActiveModel)
        
        region_clean = region.strip().upper()
        station_clean = station.strip().upper()

        records = query.all()
        station_rows = []

        for r in records:
            r_stn = str(getattr(r, 'station', '')).strip().upper()
            r_reg = getOfficialRegionForStation(r_stn, str(getattr(r, 'region', '')).strip().upper())

            if region_clean != "ALL REGIONS" and r_reg != region_clean: continue
            if station_clean != "ALL STATIONS" and r_stn != station_clean: continue

            # 🟢 Extract ALL fields from the model instance dynamically
            station_rows.append({
                "Force Number": getattr(r, 'f_num', getattr(r, 'fnum', '')),
                "Rank": getattr(r, 'rank', ''),
                "Name": getattr(r, 'name', ''),
                "Sex": getattr(r, 'sex', ''),
                "Position": getattr(r, 'position', ''),
                "Contact": getattr(r, 'contact', ''),
                "IPPS": getattr(r, 'ipps', ''),
                "NIN": getattr(r, 'nin', ''),
                "TIN": getattr(r, 'tin', ''),
                "DOB": getattr(r, 'dob', ''),
                "DOE": getattr(r, 'doe', ''),
                "Date of Post": getattr(r, 'do_post', getattr(r, 'dopost', '')),
                "Date of Promotion": getattr(r, 'do_pro', getattr(r, 'dopro', '')),
                "Education Level": getattr(r, 'educ_level', getattr(r, 'educlevel', '')),
                "Home District": getattr(r, 'home_dist', getattr(r, 'homedist', '')),
                "Tribe": getattr(r, 'tribe', ''),
                "Bank Branch": getattr(r, 'bank_branch', getattr(r, 'bankbranch', '')),
                "Account Number": getattr(r, 'acc_no', getattr(r, 'accno', '')),
                "Section": getattr(r, 'section', ''),
                "Directorate": getattr(r, 'dir', ''),
                "Station": r_stn,
                "District": getattr(r, 'district', ''),
                "Region": r_reg,
                "Status": getattr(r, 'status', 'ACTIVE'),
                "Last Updated By": getattr(r, 'last_updated_by', '')
            })

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = f"Nominal Roll - {station_clean}"

        eat_tz = pytz.timezone("Africa/Nairobi")
        eat_time = datetime.now(eat_tz).replace(tzinfo=None)
        
        ws.append([f"UGANDA POLICE FORCE - MASTER NOMINAL ROLL LEDGER (FULL DETAILS)"])
        ws.append([f"Station / Unit: {station_clean} (Region: {region_clean})"])
        ws.append([f"Export Timestamp: {eat_time.strftime('%Y-%m-%d %H:%M:%S EAT')} | Authorized By: {current_user.fnum}"])
        ws.append([]) 

        header_fill = PatternFill(start_color="002060", end_color="002060", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        
        # 🟢 Full comprehensive list of column headers matching the dict keys above
        headers = [
            "SN", "Force Number", "Rank", "Name", "Sex", "Position", "Contact", 
            "IPPS", "NIN", "TIN", "DOB", "DOE", "Date of Post", "Date of Promotion", 
            "Education Level", "Home District", "Tribe", "Bank Branch", "Account Number", 
            "Section", "Directorate", "Station", "District", "Region", "Status", "Last Updated By"
        ]
        ws.append(headers)
        
        for cell in ws[5]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for idx, row in enumerate(station_rows, 1):
            ws.append([
                idx,
                row["Force Number"],
                row["Rank"],
                row["Name"],
                row["Sex"],
                row["Position"],
                row["Contact"],
                row["IPPS"],
                row["NIN"],
                row["TIN"],
                str(row["DOB"]) if row["DOB"] else "",
                str(row["DOE"]) if row["DOE"] else "",
                str(row["Date of Post"]) if row["Date of Post"] else "",
                str(row["Date of Promotion"]) if row["Date of Promotion"] else "",
                row["Education Level"],
                row["Home District"],
                row["Tribe"],
                row["Bank Branch"],
                row["Account Number"],
                row["Section"],
                row["Directorate"],
                row["Station"],
                row["District"],
                row["Region"],
                row["Status"],
                row["Last Updated By"]
            ])

        for col in ws.columns:
            col_letter = col[0].column_letter
            max_len = max([len(str(cell.value or '')) for cell in col], default=0)
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 40)

        officer_fnum = (current_user.fnum or "HQ-UNKNOWN").strip().upper()
        stamp_id = f"KMP-STAMP-{officer_fnum}-{eat_time.strftime('%Y%m%d%H%M%S')}"
        encoded_token = base64.b64encode(json.dumps({"f": officer_fnum, "s": stamp_id}).encode('utf-8')).decode('utf-8')
        
        wb.properties.keywords = f"KMP_AUDIT;{encoded_token}"
        wb.properties.category = "RESTRICTED / FORENSIC POLICE RECORD"

        excel_stream = io.BytesIO()
        wb.save(excel_stream)
        excel_stream.seek(0)

        zip_stream = io.BytesIO()
        zip_password = str(current_user.fnum).strip().encode('utf-8')
        fnum_clean = str(current_user.fnum).replace('/', '_').upper()
        excel_filename = f"{fnum_clean}_Full_Nominal_Roll_{station_clean.replace(' ', '_')}_{eat_time.strftime('%Y%m%d')}.xlsx"
        zip_filename = f"SECURE_FULL_STATION_LEDGER_{eat_time.strftime('%Y%m%d')}.zip"

        with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            zf.writestr(excel_filename, excel_stream.getvalue())

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
        raise HTTPException(status_code=500, detail=f"Full Station Ledger Export Failed: {str(e)}")