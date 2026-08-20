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
from auth import get_current_user  # Adjust to match your actual authentication import path

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
    # Insert create logic here...
    pass