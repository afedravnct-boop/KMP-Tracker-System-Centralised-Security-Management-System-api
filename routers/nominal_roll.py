from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from datetime import datetime
import io
import pandas as pd
import numpy as np
from urllib.parse import unquote

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
    active_query = db.query(models.NominalRoll)
    archive_query = db.query(models.NominalRollArchive)
    
    user_role = (current_user.role or "").upper()
    user_region = (current_user.region or "").strip().upper()
    user_station = (current_user.station or "").strip().upper()

    if user_role in ["ADMIN", "SUPER_ADMIN", "RPC", "DEPUTY COMMANDER"] or user_region in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"]:
        pass 
    else:
        active_query = active_query.filter(func.upper(models.NominalRoll.station) == user_station)
        archive_query = archive_query.filter(func.upper(models.NominalRollArchive.station) == user_station)
        
    active_records = active_query.order_by(models.NominalRoll.id.desc()).all()
    archive_records = archive_query.order_by(models.NominalRollArchive.id.desc()).all()
    
    clean_results = []
    for r in active_records:
        r_dict = r.__dict__.copy()
        r_dict.pop("_sa_instance_state", None)
        
        # Standardize keys for React frontend
        r_dict['fnum'] = r_dict.get('f_num') or r_dict.get('fnum') or ''
        r_dict['f_num'] = r_dict['fnum']
        r_dict['do_post'] = r_dict.get('do_post') or r_dict.get('dopost') or ''
        r_dict['do_pro'] = r_dict.get('do_pro') or r_dict.get('dopro') or ''
        r_dict['educ_level'] = r_dict.get('educ_level') or r_dict.get('educlevel') or ''
        r_dict['home_dist'] = r_dict.get('home_dist') or r_dict.get('homedist') or ''
        r_dict['acc_no'] = r_dict.get('acc_no') or r_dict.get('accno') or ''
        r_dict['bank_branch'] = r_dict.get('bank_branch') or r_dict.get('bankbranch') or ''
        r_dict['sn'] = r_dict.get('id')
        r_dict['dbAuditId'] = r_dict.get('id')
        r_dict['is_archived'] = False
        r_dict['status'] = r_dict.get('status') or 'ACTIVE'
        clean_results.append(r_dict)

    for r in archive_records:
        r_dict = r.__dict__.copy()
        r_dict.pop("_sa_instance_state", None)
        r_dict['fnum'] = r_dict.get('fnum') or r_dict.get('f_num') or ''
        r_dict['f_num'] = r_dict['fnum']
        r_dict['do_post'] = r_dict.get('dopost') or r_dict.get('do_post') or ''
        r_dict['do_pro'] = r_dict.get('dopro') or r_dict.get('do_pro') or ''
        r_dict['educ_level'] = r_dict.get('educlevel') or r_dict.get('educ_level') or ''
        r_dict['home_dist'] = r_dict.get('homedist') or r_dict.get('home_dist') or ''
        r_dict['acc_no'] = r_dict.get('accno') or r_dict.get('acc_no') or ''
        r_dict['bank_branch'] = r_dict.get('bankbranch') or r_dict.get('bank_branch') or ''
        r_dict['sn'] = r_dict.get('id')
        r_dict['dbAuditId'] = f"ARC-{r_dict.get('id')}"
        r_dict['is_archived'] = True
        r_dict['status'] = r_dict.get('status') or 'ARCHIVED'
        clean_results.append(r_dict)
        
    return clean_results

# ====================================================================
# 2. BULK NOMINAL ROLL IMPORT / EXCEL BATCH PROCESSING (Fixes 404)
# ====================================================================
@router.post("/nominal-roll/bulk-upload")
@router.post("/nominal-roll/upload")
async def bulk_upload_nominal_roll(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        contents = await file.read()
        filename = file.filename.lower()

        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        elif filename.endswith((".xls", ".xlsx")):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(status_code=400, detail="Invalid format. Upload a valid Excel (.xlsx) or CSV file.")

        df = df.replace({np.nan: None})
        
        # Standardize column headers to lowercase stripped
        df.columns = [str(col).strip().lower().replace(" ", "_").replace("/", "_") for col in df.columns]

        inserted_count = 0
        updated_count = 0
        officer_sig = get_officer_signature(current_user)

        for _, row in df.iterrows():
            fnum_val = row.get("f_num") or row.get("fnum") or row.get("force_number") or row.get("file_number")
            if not fnum_val:
                continue

            clean_fnum = str(fnum_val).strip().upper()
            stn_val = str(row.get("station") or current_user.station or "").strip().upper()
            reg_val, dist_val = auto_infer_geography(stn_val, row.get("region"), row.get("district"))

            officer_payload = {
                "f_num": clean_fnum,
                "fnum": clean_fnum,
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

            # Check for existing record to update or insert
            existing = db.query(models.NominalRoll).filter(
                or_(
                    models.NominalRoll.f_num == clean_fnum,
                    models.NominalRoll.fnum == clean_fnum
                )
            ).first()

            if existing:
                for k, v in officer_payload.items():
                    if hasattr(existing, k) and v is not None:
                        setattr(existing, k, v)
                updated_count += 1
            else:
                new_entry = models.NominalRoll(**officer_payload)
                db.add(new_entry)
                inserted_count += 1

        db.commit()
        return {
            "status": "success",
            "message": f"Batch process complete. {inserted_count} new personnel added, {updated_count} updated."
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Bulk Nominal Roll Upload Failed: {str(e)}")

# ====================================================================
# 3. SINGLE OFFICER REGISTRATION & RE-INTEGRATION
# ====================================================================
@router.post("/nominal-roll")
def create_Nominal_Roll(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        reintegration_reason = data.pop('reintegration_reason', None)
        previous_fnum = data.pop('previous_fnum', None)
        
        data.pop('sn', None) 
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data["region"] = current_user.region
            data["station"] = current_user.station
            
        clean_data = {}
        for k, v in data.items():
            if v == "":
                clean_data[k] = None
            else:
                clean_data[k] = v

        if 'sex' in clean_data:
            clean_data['sex'] = normalize_sex(clean_data['sex'])

        target_fnum = clean_data.get('f_num') or clean_data.get('fnum')
        if not target_fnum:
            raise HTTPException(status_code=400, detail="Force/File number is mandatory.")

        clean_data['f_num'] = str(target_fnum).strip().upper()
        clean_data['fnum'] = str(target_fnum).strip().upper()

        active_officer = db.query(models.NominalRoll).filter(
            or_(models.NominalRoll.f_num == clean_data['fnum'], models.NominalRoll.fnum == clean_data['fnum'])
        ).first()
        
        if active_officer:
            raise HTTPException(status_code=400, detail="Duplicate Entry: This F/NO or File Number is currently active.")

        search_fnum = previous_fnum if previous_fnum else clean_data['fnum']
        archived_officer = db.query(models.NominalRollArchive).filter(models.NominalRollArchive.fnum == search_fnum).first()
        
        if archived_officer:
            if not reintegration_reason:
                return JSONResponse(
                    status_code=409, 
                    content={
                        "detail": "Officer history found in the archive. Please authorize re-entry.", 
                        "is_archived_returnee": True,
                        "old_rank": archived_officer.rank,
                        "old_fnum": archived_officer.fnum
                    }
                )
            
            clean_data['dob'] = archived_officer.dob
            clean_data['doe'] = archived_officer.doe
            clean_data['ipps'] = archived_officer.ipps
            clean_data['status'] = "ACTIVE"
            
            new_record = models.NominalRoll(**clean_data)
            new_record.last_updated_by = get_officer_signature(current_user)
            db.add(new_record)
            db.delete(archived_officer)
            db.commit()
            return {"status": "success", "message": f"Officer re-integrated successfully as {clean_data.get('rank')}", "sn": new_record.id}

        new_record = models.NominalRoll(**clean_data)
        new_record.last_updated_by = get_officer_signature(current_user)
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        
        return {"status": "success", "message": "Officer added successfully", "sn": new_record.id}
        
    except IntegrityError:
        db.rollback() 
        raise HTTPException(status_code=400, detail="Duplicate Entry: Force Number or IPPS already exists.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# ====================================================================
# 4. ARCHIVE PERSONNEL
# ====================================================================
@router.put("/nominal-roll/{fnum:path}/archive")
def archive_personnel(
    fnum: str, 
    request_data: schemas.ArchiveRequest, 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    try:
        fnum_clean = unquote(fnum).strip().upper()
        active_record = db.query(models.NominalRoll).filter(
            or_(models.NominalRoll.f_num == fnum_clean, models.NominalRoll.fnum == fnum_clean)
        ).first()
        
        if not active_record:
            raise HTTPException(status_code=404, detail="Officer not found in active roll.")

        record_data = active_record.__dict__.copy()
        record_data.pop("_sa_instance_state", None) 
        record_data.pop("id", None) 
        record_data.pop("sn", None) 
        
        record_data["fnum"] = fnum_clean
        record_data["dopost"] = record_data.pop("do_post", None)
        record_data["dopro"] = record_data.pop("do_pro", None)
        record_data["educlevel"] = record_data.pop("educ_level", None)
        record_data["homedist"] = record_data.pop("home_dist", None)
        record_data["accno"] = record_data.pop("acc_no", None)
        record_data["bankbranch"] = record_data.pop("bank_branch", None)
        record_data["status"] = "ARCHIVED"
        record_data["archive_reason"] = request_data.archive_reason
        record_data["archive_date"] = datetime.now().date()
        record_data["last_updated_by"] = get_officer_signature(current_user)

        valid_archive_columns = [c.key for c in models.NominalRollArchive.__table__.columns]
        safe_record_data = {k: v for k, v in record_data.items() if k in valid_archive_columns}

        archived_record = models.NominalRollArchive(**safe_record_data)
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
# 5. GET ARCHIVED PERSONNEL
# ====================================================================
@router.get("/nominal-roll-archive")
def get_archived_personnel(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        archives = db.query(models.NominalRollArchive).all()
        clean_list = []
        for a in archives:
            d = a.__dict__.copy()
            d.pop("_sa_instance_state", None)
            clean_list.append(d)
        return clean_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch archives: {str(e)}")