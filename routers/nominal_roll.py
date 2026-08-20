import io
import os
from datetime import datetime
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

def normalize_sex(val):
    if not val:
        return "MALE"
    cleaned = str(val).strip().upper()
    if cleaned.startswith('F'):
        return "FEMALE"
    elif cleaned.startswith('M'):
        return "MALE"
    return cleaned

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
        
    pk_act = getattr(ActiveModel, 'id', getattr(ActiveModel, 'sn', None))
    pk_arc = getattr(ArchiveModel, 'id', getattr(ArchiveModel, 'sn', None))

    active_records = active_query.order_by(pk_act.desc()).all() if pk_act is not None else active_query.all()
    archive_records = archive_query.order_by(pk_arc.desc()).all() if pk_arc is not None else archive_query.all()
    
    clean_results = []
    for r in active_records:
        r_dict = r.__dict__.copy()
        r_dict.pop("_sa_instance_state", None)
        
        fnum_val = r_dict.get('f_num') or r_dict.get('fnum') or ''
        r_dict['fnum'] = fnum_val
        r_dict['f_num'] = fnum_val
        r_dict['do_post'] = r_dict.get('do_post') or r_dict.get('dopost') or ''
        r_dict['do_pro'] = r_dict.get('do_pro') or r_dict.get('dopro') or ''
        r_dict['educ_level'] = r_dict.get('educ_level') or r_dict.get('educlevel') or ''
        r_dict['home_dist'] = r_dict.get('home_dist') or r_dict.get('homedist') or ''
        r_dict['acc_no'] = r_dict.get('acc_no') or r_dict.get('accno') or ''
        r_dict['bank_branch'] = r_dict.get('bank_branch') or r_dict.get('bankbranch') or ''
        r_dict['sn'] = getattr(r, 'id', getattr(r, 'sn', 1))
        r_dict['dbAuditId'] = getattr(r, 'id', getattr(r, 'sn', 1))
        r_dict['is_archived'] = False
        r_dict['status'] = r_dict.get('status') or 'ACTIVE'
        clean_results.append(r_dict)

    for r in archive_records:
        r_dict = r.__dict__.copy()
        r_dict.pop("_sa_instance_state", None)
        
        fnum_val = r_dict.get('fnum') or r_dict.get('f_num') or ''
        r_dict['fnum'] = fnum_val
        r_dict['f_num'] = fnum_val
        r_dict['do_post'] = r_dict.get('dopost') or r_dict.get('do_post') or ''
        r_dict['do_pro'] = r_dict.get('dopro') or r_dict.get('do_pro') or ''
        r_dict['educ_level'] = r_dict.get('educlevel') or r_dict.get('educ_level') or ''
        r_dict['home_dist'] = r_dict.get('homedist') or r_dict.get('home_dist') or ''
        r_dict['acc_no'] = r_dict.get('accno') or r_dict.get('acc_no') or ''
        r_dict['bank_branch'] = r_dict.get('bankbranch') or r_dict.get('bank_branch') or ''
        r_dict['sn'] = getattr(r, 'id', getattr(r, 'sn', 1))
        r_dict['dbAuditId'] = f"ARC-{getattr(r, 'id', getattr(r, 'sn', 1))}"
        r_dict['is_archived'] = True
        r_dict['status'] = r_dict.get('status') or 'ARCHIVED'
        clean_results.append(r_dict)
        
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
    file_list = []
    if files:
        file_list.extend(files)
    if file:
        file_list.append(file)

    if not file_list:
        raise HTTPException(status_code=400, detail="No valid file uploaded. Please supply at least one Excel or CSV file.")

    inserted_count = 0
    updated_count = 0
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

            df = df.replace({np.nan: None})
            df.columns = [str(col).strip().lower().replace(" ", "_").replace("/", "_") for col in df.columns]

            for _, row in df.iterrows():
                fnum_val = row.get("f_num") or row.get("fnum") or row.get("force_number") or row.get("file_number")
                if not fnum_val:
                    continue

                clean_fnum = str(fnum_val).strip().upper()
                stn_val = str(row.get("station") or current_user.station or "HQ").strip().upper()
                reg_val, dist_val = auto_infer_geography(stn_val, row.get("region"), row.get("district"))

                officer_payload = {
                    "rank": str(row.get("rank") or "PC").strip().upper(),
                    "name": str(row.get("name") or "UNKNOWN").strip().title(),
                    "sex": normalize_sex(row.get("sex") or row.get("gender")),
                    "position": str(row.get("position") or row.get("title") or "GENERAL DUTIES").strip().upper(),
                    "dob": str(row.get("dob") or row.get("date_of_birth") or "") or None,
                    "doe": str(row.get("doe") or row.get("date_of_enlistment") or "") or None,
                    "do_post": str(row.get("do_post") or row.get("dopost") or "") or None,
                    "do_pro": str(row.get("do_pro") or row.get("dopro") or "") or None,
                    "contact": str(row.get("contact") or row.get("phone") or "") or None,
                    "educ_level": str(row.get("educ_level") or row.get("educlevel") or row.get("education") or "") or None,
                    "ipps": str(row.get("ipps") or "") or None,
                    "tin": str(row.get("tin") or "") or None,
                    "nin": str(row.get("nin") or "") or None,
                    "home_dist": str(row.get("home_dist") or row.get("homedist") or "") or None,
                    "tribe": str(row.get("tribe") or "") or None,
                    "acc_no": str(row.get("acc_no") or row.get("accno") or "") or None,
                    "bank_branch": str(row.get("bank_branch") or row.get("bankbranch") or "") or None,
                    "station": stn_val,
                    "district": dist_val,
                    "region": reg_val,
                    "section": str(row.get("section") or "") or None,
                    "dir": str(row.get("dir") or "") or None,
                    "status": str(row.get("status") or "ACTIVE").strip().upper(),
                    "last_updated_by": officer_sig
                }

                if hasattr(ActiveModel, 'f_num'):
                    officer_payload['f_num'] = clean_fnum
                if hasattr(ActiveModel, 'fnum'):
                    officer_payload['fnum'] = clean_fnum

                # Filter for existing records
                fnum_filter = []
                if hasattr(ActiveModel, 'f_num'):
                    fnum_filter.append(ActiveModel.f_num == clean_fnum)
                if hasattr(ActiveModel, 'fnum'):
                    fnum_filter.append(ActiveModel.fnum == clean_fnum)

                existing = db.query(ActiveModel).filter(or_(*fnum_filter)).first()

                if existing:
                    for k, v in officer_payload.items():
                        if hasattr(existing, k) and v is not None:
                            setattr(existing, k, v)
                    updated_count += 1
                else:
                    valid_cols = [c.key for c in ActiveModel.__table__.columns]
                    safe_payload = {k: v for k, v in officer_payload.items() if k in valid_cols}
                    new_entry = ActiveModel(**safe_payload)
                    db.add(new_entry)
                    inserted_count += 1

        db.commit()
        return {
            "status": "success",
            "message": f"Batch process complete. {inserted_count} new personnel recorded, {updated_count} updated."
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
        
        perms = current_user.permissions or {}
        if current_user.role not in ["SUPER_ADMIN", "RPC", "ADMIN"] and not perms.get("global_observer"):
            data["region"] = current_user.region
            data["station"] = current_user.station
            
        clean_data = {}
        for k, v in data.items():
            clean_data[k] = None if v == "" else v

        if 'sex' in clean_data:
            clean_data['sex'] = normalize_sex(clean_data['sex'])

        target_fnum = clean_data.get('f_num') or clean_data.get('fnum')
        if not target_fnum:
            raise HTTPException(status_code=400, detail="Force/File number is mandatory.")

        clean_fnum = str(target_fnum).strip().upper()
        if hasattr(ActiveModel, 'f_num'):
            clean_data['f_num'] = clean_fnum
        if hasattr(ActiveModel, 'fnum'):
            clean_data['fnum'] = clean_fnum

        # Check Active Duplicate
        fnum_filter = []
        if hasattr(ActiveModel, 'f_num'):
            fnum_filter.append(ActiveModel.f_num == clean_fnum)
        if hasattr(ActiveModel, 'fnum'):
            fnum_filter.append(ActiveModel.fnum == clean_fnum)

        active_officer = db.query(ActiveModel).filter(or_(*fnum_filter)).first()
        if active_officer:
            raise HTTPException(status_code=400, detail="Duplicate Entry: This Force Number or File Number is currently active.")

        # Check Archive History
        search_fnum = str(previous_fnum).strip().upper() if previous_fnum else clean_fnum
        arc_filter = []
        if hasattr(ArchiveModel, 'fnum'):
            arc_filter.append(ArchiveModel.fnum == search_fnum)
        if hasattr(ArchiveModel, 'f_num'):
            arc_filter.append(ArchiveModel.f_num == search_fnum)

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
            db.delete(archived_officer)
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
    clean_id = unquote(identifier).strip().upper()
    
    # Try finding officer by fnum, f_num, or primary key id/sn
    query_filters = []
    if hasattr(ActiveModel, 'fnum'):
        query_filters.append(ActiveModel.fnum == clean_id)
    if hasattr(ActiveModel, 'f_num'):
        query_filters.append(ActiveModel.f_num == clean_id)
        
    if clean_id.isdigit():
        pk_col = getattr(ActiveModel, 'id', getattr(ActiveModel, 'sn', None))
        if pk_col is not None:
            query_filters.append(pk_col == int(clean_id))

    officer = db.query(ActiveModel).filter(or_(*query_filters)).first()
    
    if not officer:
        raise HTTPException(status_code=404, detail=f"Officer record '{clean_id}' not found in active Nominal Roll.")

    data.pop('id', None)
    data.pop('sn', None)
    
    perms = current_user.permissions or {}
    if current_user.role not in ["SUPER_ADMIN", "RPC", "ADMIN"] and not perms.get("global_observer"):
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
        fnum_clean = unquote(fnum).strip().upper()
        
        fnum_filter = []
        if hasattr(ActiveModel, 'f_num'):
            fnum_filter.append(ActiveModel.f_num == fnum_clean)
        if hasattr(ActiveModel, 'fnum'):
            fnum_filter.append(ActiveModel.fnum == fnum_clean)
            
        active_record = db.query(ActiveModel).filter(or_(*fnum_filter)).first()
        
        if not active_record:
            raise HTTPException(status_code=404, detail="Officer not found in active roll.")

        record_data = active_record.__dict__.copy()
        record_data.pop("_sa_instance_state", None) 
        record_data.pop("id", None) 
        record_data.pop("sn", None) 
        
        if hasattr(ArchiveModel, 'fnum'):
            record_data["fnum"] = fnum_clean
        if hasattr(ArchiveModel, 'f_num'):
            record_data["f_num"] = fnum_clean
            
        record_data["status"] = "ARCHIVED"
        record_data["archive_reason"] = request_data.archive_reason
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
# 6. GET ARCHIVED PERSONNEL
# ====================================================================
@router.get("/nominal-roll-archive")
def get_archived_personnel(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        ArchiveModel = get_archive_model()
        archives = db.query(ArchiveModel).all()
        clean_list = []
        for a in archives:
            d = a.__dict__.copy()
            d.pop("_sa_instance_state", None)
            clean_list.append(d)
        return clean_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch archives: {str(e)}")