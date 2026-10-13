# routers/lockup_matrix.py
import json
import csv
import io
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text

from app import models, schemas
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1", tags=["Lockup Matrix & Operations"])

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
    for name in names:
        if hasattr(models, name):
            return getattr(models, name)
    return None

def is_station_equivalent(stat_a: str, stat_b: str) -> bool:
    a = (stat_a or "").strip().upper()
    b = (stat_b or "").strip().upper()
    if not a or not b:
        return False
    if a == b:
        return True
    clean_a = a.replace(" HEADQUARTERS", "").replace(" HQ", "")
    clean_b = b.replace(" HEADQUARTERS", "").replace(" HQ", "")
    return clean_a == clean_b and len(clean_a) > 0

# 🟢 Local serializer to prevent circular imports with api_backend
fn = lambda v: v.isoformat() if hasattr(v, 'isoformat') else v
def serialize_model_row(row):
    if not row:
        return {}
    if isinstance(row, dict):
        d = row.copy()
    elif hasattr(row, '__dict__'):
        d = row.__dict__.copy()
        d.pop('_sa_instance_state', None)
    else:
        return {}
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.strftime("%Y-%m-%d %H:%M:%S")
        elif hasattr(v, 'isoformat'):
            d[k] = v.isoformat()
        elif hasattr(v, '__float__') and not isinstance(v, (int, float, str, bool)):
            d[k] = float(v)
    return d

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
        user_role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN", "RPC", "DEPUTY COMMANDER"] or
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
            
            expanded_stns.add("HEADQUARTERS GENERAL TOTAL")
            expanded_stns.add("KMP HEADQUARTERS")
            
            conds.append(func.upper(ModelClass.station).in_(list(expanded_stns)))
            
        if conds:
            return query.filter(or_(*conds))
        return query.filter(text("1=0"))
        
    elif hasattr(ModelClass, 'station'):
        return query.filter(
            or_(
                func.upper(ModelClass.station) == user_stn,
                func.upper(ModelClass.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"])
            )
        )
        
    return query.filter(text("1=0"))

# ====================================================================
# 1. LOCKUP MATRIX ENDPOINTS
# ====================================================================
@router.post("/lockup-matrix")
def create_lockup_entry(
    data: dict, 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        station_val = data.get('station', '').strip().upper()
        date_val = data.get('date', date.today().isoformat())

        existing = db.query(models.LockupMatrix).filter(
            func.upper(models.LockupMatrix.station) == station_val,
            func.date(models.LockupMatrix.date) == date_val
        ).first()

        if existing:
            raise HTTPException(status_code=400, detail=f"Census for {station_val} on {date_val} already exists. Please update the existing entry.")

        new_entry = models.LockupMatrix(
            sd_ref=data.get('sd_ref', f"POP-{station_val[:3]}-{int(datetime.now().timestamp())}"),
            region=data.get('region', current_user.region),
            station=station_val,
            date=date_val,
            time=data.get('time', datetime.now().strftime("%H%M") + "Hrs"),
            suspects=data.get('suspects', 0),
            male_count=data.get('male_count', 0),
            male_juvenile_count=data.get('male_juvenile_count', 0),
            female_count=data.get('female_count', 0),
            female_juvenile_count=data.get('female_juvenile_count', 0),
            detention_1day=data.get('detention_1day', 0),
            detention_2days=data.get('detention_2days', 0),
            detention_3days_over=data.get('detention_3days_over', 0),
            last_updated_by=get_officer_signature(current_user)
        )

        db.add(new_entry)
        db.commit()
        db.refresh(new_entry)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="REGISTER",
            module="LOCKUP_MATRIX",
            target_id=str(new_entry.sn),
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} logged cell population for station [{new_entry.station}] on [{new_entry.date}] (Total Suspects: {new_entry.suspects})."
        )

        return serialize_model_row(new_entry)
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to log cell population: {str(e)}")

@router.get("/lockup-matrix")
def get_lockup_entries(
    search: Optional[str] = Query(None, description="Search term for station, region, or update signature"),
    todays_only: bool = Query(False, description="Filter strictly for current 24-hour cycle"),
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    query = db.query(models.LockupMatrix)
    query = apply_opsec_scope(current_user, query, models.LockupMatrix)

    if todays_only:
        today_str = date.today().isoformat()
        query = query.filter(func.date(models.LockupMatrix.date) == today_str)

    if search:
        search_term = f"%{search.strip().upper()}%"
        query = query.filter(
            or_(
                func.upper(models.LockupMatrix.station).like(search_term),
                func.upper(models.LockupMatrix.region).like(search_term),
                func.upper(models.LockupMatrix.last_updated_by).like(search_term)
            )
        )

    entries = query.order_by(models.LockupMatrix.date.desc(), models.LockupMatrix.sn.desc()).all()
    return [serialize_model_row(r) for r in entries]

@router.put("/lockup-matrix/{sn}")
def update_lockup_entry(
    sn: int,
    data: dict,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    existing_entry = db.query(models.LockupMatrix).filter(models.LockupMatrix.sn == sn).first()
    if not existing_entry:
        raise HTTPException(status_code=404, detail="Lockup matrix entry not found.")
    
    user_role = (current_user.role or "").strip().upper()
    user_station = (current_user.station or "").strip().upper()
    perms = current_user.permissions or {}
    
    is_global = (
        user_role in ["SUPER_ADMIN", "ADMIN", "RPC", "DEPUTY COMMANDER"] or
        perms.get("global_observer", False) is True or 
        perms.get("global_open", False) is True or
        str(current_user.region).strip().upper() in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"]
    )
    
    if not is_global:
        entry_station = (data.get('station') or existing_entry.station or "").strip().upper()
        # 🟢 Use dual-equivalence engine check so station names match cleanly without 403 blocks
        if not is_stationEquivalent(entry_station, user_station) and entry_station != "HEADQUARTERS GENERAL TOTAL":
            raise HTTPException(status_code=403, detail="Clearance Denied: You can only update lockup records for your own station.")

    try:
        data.pop('sn', None)
        for key, value in data.items():
            if hasattr(existing_entry, key):
                setattr(existing_entry, key, value)

        existing_entry.last_updated_by = f"{get_officer_signature(current_user)} [EDITED]"
        
        db.commit()
        db.refresh(existing_entry)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="LOCKUP_MATRIX",
            target_id=str(sn),
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} updated cell lockup record ID [{sn}] for station [{existing_entry.station}]."
        )

        return serialize_model_row(existing_entry)
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update entry: {str(e)}")

# ====================================================================
# 2. REAL DAILY SUSPECT REGISTER
# ====================================================================
@router.get("/suspect-register")
def get_suspect_register(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    SuspectRegModel = get_model_safe('Daily_Suspect_Register', 'DailySuspectRegister', 'suspect_register')
    if not SuspectRegModel:
        return []

    query = db.query(SuspectRegModel)
    query = apply_opsec_scope(current_user, query, SuspectRegModel)

    if region and region.upper() not in ["ALL REGIONS", "ALL"]:
        if hasattr(SuspectRegModel, 'region'):
            query = query.filter(func.upper(SuspectRegModel.region) == region.upper())
            
    if station and station.upper() not in ["ALL STATIONS", "ALL"]:
        if hasattr(SuspectRegModel, 'station'):
            clean_stn = station.upper().replace(' HEADQUARTERS', '').replace(' HQ', '')
            query = query.filter(
                or_(
                    func.upper(SuspectRegModel.station) == station.upper(),
                    func.upper(SuspectRegModel.station) == clean_stn,
                    func.upper(SuspectRegModel.station) == f"{clean_stn} HEADQUARTERS"
                )
            )

    if status and status.upper() not in ["ALL"]:
        if hasattr(SuspectRegModel, 'status'):
            query = query.filter(func.upper(SuspectRegModel.status) == status.upper())

    if search:
        term = f"%{search.strip().upper()}%"
        search_conds = []
        if hasattr(SuspectRegModel, 'name'): search_conds.append(SuspectRegModel.name.ilike(term))
        if hasattr(SuspectRegModel, 'reference'): search_conds.append(SuspectRegModel.reference.ilike(term))
        if hasattr(SuspectRegModel, 'reason_for_detention'): search_conds.append(SuspectRegModel.reason_for_detention.ilike(term))
        if hasattr(SuspectRegModel, 'station'): search_conds.append(SuspectRegModel.station.ilike(term))
        if search_conds:
            query = query.filter(or_(*search_conds))

    pk_col = getattr(SuspectRegModel, 'id', getattr(SuspectRegModel, 'sn', None))
    records = query.order_by(pk_col.desc()).all() if pk_col else query.all()
    
    return [serialize_model_row(r) for r in records]

@router.post("/suspect-register")
def create_suspect_register_entry(
    data: dict,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    SuspectRegModel = get_model_safe('Daily_Suspect_Register', 'DailySuspectRegister', 'suspect_register')
    if not SuspectRegModel:
        raise HTTPException(status_code=500, detail="Daily Suspect Register model not initialized in database.")

    try:
        data.pop('id', None)
        data.pop('sn', None)

        user_role = str(current_user.role).strip().upper()
        if user_role not in ["SUPER_ADMIN", "RPC"]:
            data["region"] = current_user.region
            data["station"] = current_user.station

        data["entered_by"] = get_officer_signature(current_user)
        data["created_at"] = datetime.now().isoformat()

        valid_cols = [c.key for c in SuspectRegModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}

        new_record = SuspectRegModel(**safe_data)
        db.add(new_record)
        db.commit()
        db.refresh(new_record)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="REGISTER",
            module="SUSPECT_REGISTER",
            target_id=str(getattr(new_record, 'id', getattr(new_record, 'sn', 1))),
            changes_summary=f"Registered detailed suspect {data.get('name')} for station {data.get('station')}."
        )
        return serialize_model_row(new_record)
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/suspect-register/{record_id}")
def update_suspect_register_entry(
    record_id: int,
    data: dict,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    SuspectRegModel = get_model_safe('Daily_Suspect_Register', 'DailySuspectRegister', 'suspect_register')
    if not SuspectRegModel:
        raise HTTPException(status_code=500, detail="Model not initialized.")

    pk_col = getattr(SuspectRegModel, 'id', getattr(SuspectRegModel, 'sn', None))
    record = db.query(SuspectRegModel).filter(pk_col == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Suspect record not found.")

    try:
        data.pop('id', None)
        data.pop('sn', None)
        
        user_role = str(current_user.role).strip().upper()
        if user_role not in ["SUPER_ADMIN", "RPC"]:
            data.pop("region", None)
            data.pop("station", None)

        for key, value in data.items():
            if hasattr(record, key):
                setattr(record, key, value)

        if hasattr(record, 'last_updated_by'):
            record.last_updated_by = get_officer_signature(current_user)

        db.commit()
        db.refresh(record)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="SUSPECT_REGISTER",
            target_id=str(record_id),
            changes_summary=f"Updated suspect register record ID {record_id}."
        )
        return serialize_model_row(record)
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/suspect-register/export")
def export_suspect_register_csv(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    SuspectRegModel = get_model_safe('Daily_Suspect_Register', 'DailySuspectRegister', 'suspect_register')
    if not SuspectRegModel:
        raise HTTPException(status_code=500, detail="Model not found")

    query = db.query(SuspectRegModel)
    query = apply_opsec_scope(current_user, query, SuspectRegModel)

    if region and region.upper() not in ["ALL REGIONS", "ALL"]:
        if hasattr(SuspectRegModel, 'region'):
            query = query.filter(func.upper(SuspectRegModel.region) == region.upper())
            
    if station and station.upper() not in ["ALL STATIONS", "ALL"]:
        if hasattr(SuspectRegModel, 'station'):
            clean_stn = station.upper().replace(' HEADQUARTERS', '').replace(' HQ', '')
            query = query.filter(
                or_(
                    func.upper(SuspectRegModel.station) == station.upper(),
                    func.upper(SuspectRegModel.station) == clean_stn,
                    func.upper(SuspectRegModel.station) == f"{clean_stn} HEADQUARTERS"
                )
            )

    pk_col = getattr(SuspectRegModel, 'id', getattr(SuspectRegModel, 'sn', None))
    records = query.order_by(pk_col.desc()).all() if pk_col else query.all()

    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow([
        "ID", "Name", "Sex", "Age", "Tribe", "Nationality", "Residence", 
        "Contact", "Next of Kin", "Reason for Detention", "Reference", 
        "Date In", "Date Out", "Status", "Station", "Region", "Entered By"
    ])

    for r in records:
        writer.writerow([
            getattr(r, 'id', getattr(r, 'sn', '')),
            getattr(r, 'name', ''),
            getattr(r, 'sex', ''),
            getattr(r, 'age', ''),
            getattr(r, 'tribe', ''),
            getattr(r, 'nationality', ''),
            getattr(r, 'residence', ''),
            getattr(r, 'contact', ''),
            getattr(r, 'next_of_kin', ''),
            getattr(r, 'reason_for_detention', ''),
            getattr(r, 'reference', ''),
            getattr(r, 'date_in', ''),
            getattr(r, 'date_out', ''),
            getattr(r, 'status', ''),
            getattr(r, 'station', ''),
            getattr(r, 'region', ''),
            getattr(r, 'entered_by', '')
        ])

    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    timestamp = datetime.now().strftime("%Y-%m-%d")
    response.headers["Content-Disposition"] = f"attachment; filename=KMP_SUSPECT_REGISTER_{timestamp}.csv"
    return response

# ==========================================
# 3. OPS STATISTICS
# ==========================================
@router.get("/stats")
def get_stats(
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    query = db.query(models.Operational_Statistics)
    query = apply_opsec_scope(current_user, query, models.Operational_Statistics)
        
    if search:
        term = f"%{search.strip().upper()}%"
        query = query.filter(
            or_(
                func.upper(models.Operational_Statistics.station).like(term),
                func.upper(models.Operational_Statistics.region).like(term),
                func.upper(models.Operational_Statistics.last_updated_by).like(term)
            )
        )
    records = query.order_by(models.Operational_Statistics.sn.desc()).all()
    return records

@router.post("/stats")
def create_stat(
    data: dict, 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        data.pop('sn', None) 
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data["region"] = current_user.region
            data["station"] = current_user.station
            
        new_record = models.Operational_Statistics(**data)
        new_record.last_updated_by = get_officer_signature(current_user)
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/stats/{stat_id}")
def update_stat(
    stat_id: int, 
    data: dict, 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        existing_stat = db.query(models.Operational_Statistics).filter(
            or_(models.Operational_Statistics.id == stat_id, models.Operational_Statistics.sn == stat_id)
        ).first()
        
        if not existing_stat:
            raise HTTPException(status_code=404, detail="Operational Statistics record not found.")

        data.pop('sn', None)
        data.pop('id', None)

        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data.pop("region", None)
            data.pop("station", None)

        for key, value in data.items():
            if hasattr(existing_stat, key):
                setattr(existing_stat, key, value)

        existing_stat.last_updated_by = get_officer_signature(current_user)
        db.commit()
        db.refresh(existing_stat)
        
        return {"status": "success", "message": f"Statistics record {stat_id} updated successfully."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))