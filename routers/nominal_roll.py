from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timedelta
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
        return None
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

def auto_infer_geography(station_name, current_region, current_district):
    if not station_name:
        return current_region, current_district
    stat_upper = str(station_name).strip().upper()
    inferred_region = current_region
    inferred_district = current_district

    if stat_upper in STATION_GEO_MAP:
        geo_info = STATION_GEO_MAP[stat_upper]
        if not inferred_region or inferred_region in ["", "NONE", "NAN", "ALL REGIONS"]:
            inferred_region = geo_info["region"]
        if not inferred_district or inferred_district in ["", "NONE", "NAN", "ALL REGIONS"]:
            inferred_district = geo_info["district"]
    return inferred_region, inferred_district

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
        if 'dopost' in r_dict: r_dict['do_post'] = r_dict['dopost']
        if 'dopro' in r_dict: r_dict['do_pro'] = r_dict['dopro']
        if 'educlevel' in r_dict: r_dict['educ_level'] = r_dict['educlevel']
        if 'homedist' in r_dict: r_dict['home_dist'] = r_dict['homedist']
        if 'accno' in r_dict: r_dict['acc_no'] = r_dict['accno']
        if 'bankbranch' in r_dict: r_dict['bank_branch'] = r_dict['bankbranch']
        if 'id' in r_dict:
            r_dict['sn'] = r_dict['id']
            r_dict['dbAuditId'] = r_dict['id']
        r_dict['is_archived'] = False
        r_dict['status'] = r_dict.get('status') or 'ACTIVE'
        clean_results.append(r_dict)

    for r in archive_records:
        r_dict = r.__dict__.copy()
        r_dict.pop("_sa_instance_state", None)
        if 'dopost' in r_dict: r_dict['do_post'] = r_dict['dopost']
        if 'dopro' in r_dict: r_dict['do_pro'] = r_dict['dopro']
        if 'educlevel' in r_dict: r_dict['educ_level'] = r_dict['educlevel']
        if 'homedist' in r_dict: r_dict['home_dist'] = r_dict['homedist']
        if 'accno' in r_dict: r_dict['acc_no'] = r_dict['accno']
        if 'bankbranch' in r_dict: r_dict['bank_branch'] = r_dict['bankbranch']
        if 'id' in r_dict:
            r_dict['sn'] = r_dict['id']
            r_dict['dbAuditId'] = f"ARC-{r_dict['id']}"
        r_dict['is_archived'] = True
        r_dict['status'] = r_dict.get('status') or 'ARCHIVED'
        clean_results.append(r_dict)
        
    return clean_results

@router.post("/nominal-roll")
def create_Nominal_Roll(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        reintegration_reason = data.pop('reintegration_reason', None)
        previous_fnum = data.pop('previous_fnum', None)
        
        data.pop('sn', None) 
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data["region"] = current_user.region
            data["station"] = current_user.station
            
        key_map = {
            'f_num': 'fnum', 'do_post': 'dopost', 'do_pro': 'dopro', 
            'educ_level': 'educlevel', 'home_dist': 'homedist', 
            'acc_no': 'accno', 'bank_branch': 'bankbranch'
        }
            
        clean_data = {}
        for k, v in data.items():
            mapped_k = key_map.get(k, k)
            if v == "":
                clean_data[mapped_k] = None
            else:
                if mapped_k in ['dob', 'doe', 'dopost', 'dopro'] and v is not None:
                    if "/" in v:  
                        try:
                            date_obj = datetime.strptime(v, "%d/%m/%Y")
                            clean_data[mapped_k] = date_obj.strftime("%Y-%m-%d")
                        except ValueError:
                            clean_data[mapped_k] = v 
                    else:
                        clean_data[mapped_k] = v 
                else:
                    clean_data[mapped_k] = v

        if 'sex' in clean_data:
            clean_data['sex'] = normalize_sex(clean_data['sex'])

        target_fnum = clean_data.get('fnum')

        active_officer = db.query(models.NominalRoll).filter(models.NominalRoll.fnum == target_fnum).first()
        if active_officer:
            raise HTTPException(status_code=400, detail="Duplicate Entry: This F/NO or File Number is currently active.")

        search_fnum = previous_fnum if previous_fnum else target_fnum
        archived_officer = db.query(models.NominalRollArchive).filter(models.NominalRollArchive.fnum == search_fnum).first()
        
        if archived_officer:
            if not reintegration_reason:
                return JSONResponse(
                    status_code=409, 
                    content={
                        "detail": "Officer history found in the archive. Please authorize re-entry and map any F/NO changes.", 
                        "is_archived_returnee": True,
                        "old_rank": archived_officer.rank,
                        "old_fnum": archived_officer.fnum
                    }
                )
            
            clean_data['dob'] = archived_officer.dob
            clean_data['doe'] = archived_officer.doe
            clean_data['ipps'] = archived_officer.ipps
            clean_data['status'] = "ACTIVE"
            
            existing_new_notes = clean_data.get('notes') or ""
            clean_data['notes'] = f"Re-integrated on {datetime.utcnow().strftime('%Y-%m-%d')}. Reason: {reintegration_reason}. Prev: {archived_officer.rank} {archived_officer.fnum} | {existing_new_notes}"
            
            new_record = models.NominalRoll(**clean_data)
            new_record.last_updated_by = get_officer_signature(current_user)
            db.add(new_record)
            
            arch_notes = archived_officer.notes or ""
            archived_officer.notes = f"{arch_notes} | [STATUS UPDATE: Re-deployed to active duty on {datetime.utcnow().strftime('%Y-%m-%d')} as {clean_data.get('rank')} under F/NO: {target_fnum}]"
            
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

@router.put("/nominal-roll/{fnum:path}/archive")
def archive_personnel(
    fnum: str, 
    request_data: schemas.ArchiveRequest, 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    try:
        fnum_clean = unquote(fnum).strip().upper()
        fnum_attr = getattr(models.NominalRoll, 'f_num', getattr(models.NominalRoll, 'fnum', None))
        
        active_record = db.query(models.NominalRoll).filter(fnum_attr == fnum_clean).first()
        
        if not active_record:
            raise HTTPException(status_code=404, detail="Officer not found in active roll.")

        record_data = active_record.__dict__.copy()
        record_data.pop("_sa_instance_state", None) 
        record_data.pop("id", None) 
        record_data.pop("sn", None) 
        
        archive_translation_map = {
            "f_num": "fnum",
            "do_post": "dopost",
            "do_pro": "dopro",
            "educ_level": "educlevel",
            "home_dist": "homedist",
            "acc_no": "accno",
            "bank_branch": "bankbranch"
        }

        for active_key, archive_key in archive_translation_map.items():
            if active_key in record_data and not hasattr(models.NominalRollArchive, active_key):
                record_data[archive_key] = record_data.pop(active_key)

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

@router.get("/nominal-roll-archive")
def get_archived_personnel(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        archives = db.query(models.NominalRollArchive).all()
        return archives
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch archives: {str(e)}")