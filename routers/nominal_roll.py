import io
import os
import math
import re
from datetime import datetime, date
from typing import Optional, List, Union
from urllib.parse import unquote

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from sqlalchemy.exc import IntegrityError

from app import models, schemas
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["Nominal Roll & HR"])

# ====================================================================
# GLOBAL HELPER FUNCTIONS
# ====================================================================
def normalize_sex(val):
    if not val:
        return "MALE"
    cleaned = str(val).strip().upper()
    if cleaned.startswith('F'):
        return "FEMALE"
    elif cleaned.startswith('M'):
        return "MALE"
    return cleaned

def normalize_education_level(educ_str):
    """Normalizes high school levels: keeps uncertified s1-s3 as entered, maps others to UCE or UACE."""
    if not educ_str or str(educ_str).strip().lower() in ['nan', 'none', 'null', '']:
        return None
    cleaned = str(educ_str).strip().upper()
    
    if any(term in cleaned for term in ['S.1', 'S1', 'S.2', 'S2', 'S.3', 'S3', 'SENIOR 1', 'SENIOR 2', 'SENIOR 3']):
        return cleaned
        
    if any(term in cleaned for term in ['UACE', 'A-LEVEL', 'A LEVEL', 'S.6', 'S6', 'SENIOR 6']):
        return "UACE"
    if any(term in cleaned for term in ['UCE', 'O-LEVEL', 'O LEVEL', 'S.4', 'S4', 'SENIOR 4', 'PLE', 'P.7']):
        return "UCE"
        
    return cleaned

def clean_numeric(val):
    """Cleans numeric strings and removes trailing .0 from Excel floats."""
    if pd.isna(val) or val is None: return None
    s = str(val).strip()
    if s.lower() in ['nan', 'nat', 'none', 'null', '']: return None
    if s.endswith('.0'): s = s[:-2]
    return s

def format_phone_number(val):
    """Ensures phone numbers start with a 0 if they are 9 digits and start with 7."""
    cleaned = clean_numeric(val)
    if not cleaned: return None
    if cleaned.startswith('+'):
        cleaned = cleaned[1:]
    if cleaned.startswith('7') and len(cleaned) == 9:
        cleaned = '0' + cleaned
    return cleaned

def is_uniformed_rank(rank_str: str) -> bool:
    """Returns True if the rank falls within official UPF uniformed ranks (SPC to IGP)."""
    if not rank_str:
        return False
    r = rank_str.strip().upper()
    uniformed_ranks = {
        'IGP', 'DIGP', 'AIGP', 'SCP', 'CP', 'ACP', 'SSP', 'SP', 'SASP', 'ASP',
        'IP', 'AIP', 'HCM', 'HC', 'S/SGT', 'SSGT', 'SGT', 'CPL', 'L/CPL', 'LCPL',
        'PC', 'PPC', 'SPC'
    }
    return r in uniformed_ranks

def parse_safe_date(val) -> Optional[date]:
    """Strictly coerces incoming date values into a Python date object or None for SQL DATE compatibility."""
    if pd.isna(val) or val is None: return None
    if isinstance(val, date) and not isinstance(val, datetime): return val
    if isinstance(val, datetime): return val.date()
    if type(val).__name__ == 'Timestamp': return val.date()
    
    val_str = str(val).strip()
    if val_str.lower() in ['nan', 'nat', 'none', 'null', '', '-', 'n/a', 'nil']: return None
    
    if ' ' in val_str:
        val_str = val_str.split(' ')[0]
        
    try:
        if val_str.replace('.', '', 1).isdigit():
            float_val = float(val_str)
            if float_val > 1000:  
                return pd.to_datetime(float_val, unit='D', origin='1899-12-30').date()
    except Exception:
        pass

    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d', '%d.%m.%Y'):
        try:
            return datetime.strptime(val_str, fmt).date()
        except ValueError:
            continue

    try:
        parsed = pd.to_datetime(val_str, dayfirst=True, errors='coerce', format='mixed')
        if pd.notna(parsed): return parsed.date()
    except Exception:
        pass
        
    return None

def get_officer_signature(user):
    if not user:
        return "UNKNOWN COMMANDER"
    fnum = (user.fnum or "").strip()
    rank = (user.rank or "").strip()
    name = (user.name or "").strip()
    return f"{fnum} {rank} {name}".strip().upper()

def get_active_model():
    model = getattr(models, 'NominalRoll', getattr(models, 'Nominal_Roll', getattr(models, 'nominal_roll', None)))
    if not model:
        raise HTTPException(status_code=500, detail="Nominal Roll database model not configured.")
    return model

def get_archive_model():
    model = getattr(models, 'NominalRollArchive', getattr(models, 'Nominal_Roll_Archive', getattr(models, 'nominal_roll_archive', None)))
    if not model:
        raise HTTPException(status_code=500, detail="Nominal Roll Archive database model not configured.")
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
    if not station_name:
        return current_region or "KMP HEADQUARTERS", current_district or "KAMPALA"
    stat_upper = str(station_name).strip().upper()
    inferred_region = current_region
    inferred_district = current_district

    if stat_upper in STATION_GEO_MAP:
        geo_info = STATION_GEO_MAP[stat_upper]
        if not inferred_region or str(inferred_region).upper() in ["", "NONE", "NAN", "ALL REGIONS"]:
            inferred_region = geo_info["region"]
        if not inferred_district or str(inferred_district).upper() in ["", "NONE", "NAN", "ALL REGIONS"]:
            inferred_district = geo_info["district"]
    return inferred_region or "KMP HEADQUARTERS", inferred_district or "KAMPALA"


# ====================================================================
# 1. RETRIEVE ACTIVE AND ARCHIVED NOMINAL ROLL
# ====================================================================
@router.get("/nominal-roll")
def get_Nominal_Rolls(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    ActiveModel = get_active_model()
    ArchiveModel = get_archive_model()
    
    active_query = db.query(ActiveModel)
    archive_query = db.query(ArchiveModel)
    
    user_role = (current_user.role or "").upper()
    perms = current_user.permissions or {}
    
    is_global = (
        user_role in ["ADMIN", "SUPER_ADMIN", "RPC", "DEPUTY COMMANDER"] or
        (current_user.region or "").strip().upper() in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"] or
        perms.get("view_global_roster") is True or
        perms.get("global_observer") is True
    )

    if not is_global:
        user_station = (current_user.station or "").strip().upper()
        active_query = active_query.filter(func.upper(ActiveModel.station) == user_station)
        archive_query = archive_query.filter(func.upper(ArchiveModel.station) == user_station)
        
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

# ====================================================================
# 2. BULK NOMINAL ROLL IMPORT / EXCEL BATCH PROCESSING 
# ====================================================================
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
    if files:
        file_list.extend(files)
    if file:
        file_list.append(file)

    if not file_list:
        raise HTTPException(status_code=400, detail="No valid file uploaded. Please supply at least one Excel or CSV file.")

    inserted_count = 0
    updated_count = 0
    skipped_archived = []
    skipped_blank = []
    officer_sig = get_officer_signature(current_user)

    try:
        for single_file in file_list:
            contents = await single_file.read()
            filename = single_file.filename.lower()

            if filename.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(contents))
            elif filename.endswith((".xls", ".xlsx")):
                df = pd.read_excel(io.BytesIO(contents))
            else:
                continue

            def standardize_header(h):
                h = str(h).lower().strip()
                h = h.replace("f/no", "fnum").replace("f-no", "fnum").replace("force no", "fnum")
                h = h.replace("d.o.b", "dob").replace("d.o.e", "doe").replace("d.o.p", "dopost")
                return re.sub(r'[^a-z0-9]', '', h)
                
            df.columns = [standardize_header(col) for col in df.columns]
            
            date_columns = ['dob', 'dateofbirth', 'doe', 'dateofenlistment', 'dopost', 'dop', 'dopro', 'dateofpromotion']
            for col in date_columns:
                if col in df.columns:
                    series = df[col].replace(r'^\s*[-–—]?\s*$', np.nan, regex=True)
                    is_numeric = pd.to_numeric(series, errors='coerce').notnull()
                    parsed = pd.Series(pd.NaT, index=df.index)
                    
                    if is_numeric.any():
                        numeric_vals = pd.to_numeric(series[is_numeric], errors='coerce')
                        valid_mask = (numeric_vals > 1) & (numeric_vals < 73050)
                        parsed[is_numeric & valid_mask] = pd.to_datetime(numeric_vals[valid_mask], unit='D', origin='1899-12-30', errors='coerce')
                    
                    non_numeric = ~is_numeric & series.notnull()
                    if non_numeric.any():
                        parsed[non_numeric] = pd.to_datetime(series[non_numeric], errors='coerce', format='mixed', dayfirst=True)
                        
                    valid_dates = parsed.dt.year.between(1900, 2100, inclusive='both')
                    df[col] = parsed.where(valid_dates, None).dt.date

            for idx, row in df.iterrows():
                fnum_val = row.get("fnum") or row.get("forceno") or row.get("forcenumber") or row.get("fileno") or row.get("fno")
                ipps_val = clean_numeric(row.get("ipps") or row.get("ippsno") or row.get("ippsnumber"))
                nin_val = clean_numeric(row.get("nin") or row.get("nationalid") or row.get("ninno"))
                rank_val = str(row.get("rank") or "").strip().upper()
                name_val = str(row.get("name") or "").strip().upper()

                if not fnum_val or str(fnum_val).strip().lower() in ['nan', 'nat', 'none', 'null', '']:
                    if is_uniformed_rank(rank_val):
                        skipped_blank.append(f"Row {idx+2}: {rank_val} {name_val} (Uniformed rank missing F/No. Cannot assign civilian number)")
                        continue
                    elif ipps_val: fnum_val = f"CIV-IPPS-{ipps_val}"
                    elif nin_val: fnum_val = f"CIV-NIN-{nin_val}"
                    else: 
                        skipped_blank.append(f"Row {idx+2}: {name_val or 'Unknown Person'} (Missing F/No, IPPS, & NIN)")
                        continue 

                clean_fnum = str(fnum_val).strip().upper()
                stn_val = str(row.get("station") or current_user.station or "HQ").strip().upper()
                reg_val, dist_val = auto_infer_geography(stn_val, row.get("region"), row.get("district"))

                dob_val = parse_safe_date(row.get("dob") or row.get("dateofbirth"))
                doe_val = parse_safe_date(row.get("doe") or row.get("dateofenlistment"))
                dopost_val = parse_safe_date(row.get("dopost") or row.get("dop"))
                dopro_val = parse_safe_date(row.get("dopro") or row.get("dateofpromotion"))

                officer_payload = {
                    "rank": rank_val or "CIVILIAN",
                    "name": name_val or "UNKNOWN",
                    "sex": normalize_sex(row.get("sex") or row.get("gender")),
                    "position": str(row.get("position") or row.get("title") or "GENERAL DUTIES").strip().upper(),
                    "dob": dob_val,
                    "doe": doe_val,
                    "do_post": dopost_val,
                    "do_pro": dopro_val,
                    "contact": format_phone_number(row.get("contact") or row.get("phone") or row.get("phonenumber")),
                    "educ_level": normalize_education_level(row.get("educ_level") or row.get("educlevel") or row.get("education")),
                    "ipps": ipps_val,
                    "tin": clean_numeric(row.get("tin") or row.get("tinno") or row.get("tinnumber")),
                    "nin": nin_val,
                    "home_dist": str(row.get("homedist") or row.get("homedistrict") or "") or None,
                    "tribe": str(row.get("tribe") or "") or None,
                    "acc_no": clean_numeric(row.get("accno") or row.get("accountno") or row.get("accountnumber")),
                    "bank_branch": str(row.get("bankbranch") or row.get("bank") or "") or None,
                    "station": stn_val,
                    "district": dist_val,
                    "region": reg_val,
                    "section": str(row.get("section") or "") or None,
                    "dir": str(row.get("dir") or row.get("directorate") or "") or None,
                    "status": str(row.get("status") or "ACTIVE").strip().upper(),
                    "last_updated_by": officer_sig
                }

                for key, value in list(officer_payload.items()):
                    if isinstance(value, str) and value.strip().lower() in ['nan', 'nat', 'none', 'null', '']:
                        officer_payload[key] = None
                    elif isinstance(value, float) and math.isnan(value):
                        officer_payload[key] = None

                if hasattr(ActiveModel, 'f_num'):
                    officer_payload['f_num'] = clean_fnum
                if hasattr(ActiveModel, 'fnum'):
                    officer_payload['fnum'] = clean_fnum

                fnum_filter = []
                if hasattr(ActiveModel, 'f_num'):
                    fnum_filter.append(func.trim(func.upper(ActiveModel.f_num)) == clean_fnum)
                if hasattr(ActiveModel, 'fnum'):
                    fnum_filter.append(func.trim(func.upper(ActiveModel.fnum)) == clean_fnum)

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
                            if isinstance(v, (date, datetime)):
                                safe_payload_json[k] = v.isoformat()
                            else:
                                safe_payload_json[k] = v
                                
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
            "message": f"Batch process complete. {inserted_count} new personnel recorded, {updated_count} updated.",
            "skipped": skipped_archived,
            "skipped_blank": skipped_blank
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Bulk Nominal Roll Upload Failed: {str(e)}")

# ====================================================================
# 3. SINGLE OFFICER REGISTRATION & RE-INTEGRATION
# ====================================================================
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
            clean_data['name'] = str(clean_data['name']).strip().upper()

        if 'sex' in clean_data:
            clean_data['sex'] = normalize_sex(clean_data['sex'])
            
        if 'educ_level' in clean_data:
            clean_data['educ_level'] = normalize_education_level(clean_data['educ_level'])

        for date_field in ['dob', 'doe', 'do_post', 'do_pro']:
            if date_field in clean_data and clean_data[date_field]:
                clean_data[date_field] = parse_safe_date(clean_data[date_field])

        target_fnum = clean_data.get('f_num') or clean_data.get('fnum')
        if not target_fnum:
            raise HTTPException(status_code=400, detail="Force/File number is mandatory.")

        clean_fnum = str(target_fnum).strip().upper()
        if hasattr(ActiveModel, 'f_num'):
            clean_data['f_num'] = clean_fnum
        if hasattr(ActiveModel, 'fnum'):
            clean_data['fnum'] = clean_fnum

        fnum_filter = []
        if hasattr(ActiveModel, 'f_num'):
            fnum_filter.append(func.trim(func.upper(ActiveModel.f_num)) == clean_fnum)
        if hasattr(ActiveModel, 'fnum'):
            fnum_filter.append(func.trim(func.upper(ActiveModel.fnum)) == clean_fnum)

        active_officer = db.query(ActiveModel).filter(or_(*fnum_filter)).first()
        if active_officer:
            raise HTTPException(status_code=400, detail="Duplicate Entry: This Force Number or File Number is currently active.")

        search_fnum = str(previous_fnum).strip().upper() if previous_fnum else clean_fnum
        arc_filter = []
        if hasattr(ArchiveModel, 'fnum'):
            arc_filter.append(func.trim(func.upper(ArchiveModel.fnum)) == search_fnum)
        if hasattr(ArchiveModel, 'f_num'):
            arc_filter.append(func.trim(func.upper(ArchiveModel.f_num)) == search_fnum)

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

# ====================================================================
# 4. SINGLE OFFICER UPDATE ENDPOINT
# ====================================================================
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
        data['name'] = str(data['name']).strip().upper()

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

# ====================================================================
# 5. ARCHIVE PERSONNEL
# ====================================================================
@router.put("/nominal-roll/{fnum:path}/archive")
def archive_personnel(
    fnum: str, 
    request_data: schemas.ArchiveRequest, 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    ActiveModel = get_active_model()
    ArchiveModel = get_archive_model()
    
    try:
        raw_fnum = unquote(unquote(fnum)).strip().upper()
        if raw_fnum.endswith("/ARCHIVE"):
            raw_fnum = raw_fnum[:-8].strip()
        
        fnum_clean = raw_fnum
        
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
            
            if hasattr(ActiveModel, 'f_num'):
                query_filters_alt.append(func.trim(func.upper(ActiveModel.f_num)) == alt_fnum)
            if hasattr(ActiveModel, 'fnum'):
                query_filters_alt.append(func.trim(func.upper(ActiveModel.fnum)) == alt_fnum)
            if hasattr(ActiveModel, 'ipps'):
                query_filters_alt.append(func.trim(func.upper(ActiveModel.ipps)) == alt_fnum)
                
            active_record = db.query(ActiveModel).filter(or_(*query_filters_alt)).first()

        if not active_record:
            raise HTTPException(status_code=404, detail=f"Officer '{fnum_clean}' not found in active roll.")

        record_data = active_record.__dict__.copy()
        record_data.pop("_sa_instance_state", None) 
        record_data.pop("id", None) 
        record_data.pop("sn", None) 
        
        if hasattr(ArchiveModel, 'fnum'):
            record_data["fnum"] = fnum_clean
        if hasattr(ArchiveModel, 'f_num'):
            record_data["f_num"] = fnum_clean
            
        record_data["status"] = "ARCHIVED"
        record_data["archive_reason"] = request_data.archive_reason if request_data and request_data.archive_reason else "ADMINISTRATIVE"
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

# ====================================================================
# 6. GET ARCHIVED PERSONNEL (DESCENDING ORDER)
# ====================================================================
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
                record_data["archive_reason"] = archive_reason
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