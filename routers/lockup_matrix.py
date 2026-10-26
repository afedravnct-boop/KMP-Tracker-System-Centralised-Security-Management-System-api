import json
import csv
import io
import os
import tempfile
import zipfile
import pyzipper
import pandas as pd
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, text

from app import models, schemas
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1", tags=["Lockup Matrix & Operations"])

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
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

# Local serializer
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
        return query.filter(
            or_(
                func.upper(ModelClass.region) == user_reg,
                func.upper(ModelClass.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"])
            )
        )
        
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
        return query.filter(func.upper(ModelClass.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"]))
        
    elif hasattr(ModelClass, 'station') and hasattr(ModelClass, 'region'):
        clean_user_stn = user_stn.replace(' HEADQUARTERS', '').replace(' HQ', '')
        return query.filter(
            or_(
                func.upper(ModelClass.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"]),
                and_(
                    func.upper(ModelClass.region) == user_reg,
                    or_(
                        func.upper(ModelClass.station) == user_stn,
                        func.upper(ModelClass.station) == clean_user_stn,
                        func.upper(ModelClass.station) == f"{clean_user_stn} HEADQUARTERS"
                    )
                )
            )
        )
    elif hasattr(ModelClass, 'station'):
        return query.filter(
            or_(
                func.upper(ModelClass.station) == user_stn,
                func.upper(ModelClass.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"])
            )
        )
        
    return query.filter(text("1=0"))

@router.post("/compliance/trigger-1100hrs-sweep")
def execute_daily_compliance_sweep(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Automated execution endpoint. 
    Scans all expected stations, permanently logs defaulters, and dispatches UI alerts.
    """
    try:
        today_str = date.today().isoformat()
        
        # 🟢 FIX 1: Safely compare strings instead of forcing Postgres func.date() casts
        submitted_logs = db.query(models.LockupMatrix.station).filter(
            models.LockupMatrix.date == today_str
        ).all()
        
        submitted_stations = {log[0].strip().upper() for log in submitted_logs}
        defaulting_stations = []
        
        # Isolate physical stations missing from the submitted list
        for region, stations in REGIONAL_HIERARCHY.items():
            if region in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"]:
                continue 
                
            for stn in stations:
                if stn.upper() not in submitted_stations:
                    defaulting_stations.append({"region": region, "station": stn})

        if not defaulting_stations:
            return {"status": "success", "message": "100% System Compliance. No alerts dispatched."}

        # Write permanent disciplinary evidence to Daily_Compliance_Tracker
        for defaulter in defaulting_stations:
            existing_flag = db.query(models.DailyComplianceTracker).filter(
                models.DailyComplianceTracker.date == today_str,
                func.upper(models.DailyComplianceTracker.station) == defaulter["station"]
            ).first()
            
            if not existing_flag:
                new_default = models.DailyComplianceTracker(
                    date=today_str,
                    region=defaulter["region"],
                    station=defaulter["station"],
                    status="DEFAULTED"
                )
                db.add(new_default)
                
                # 🟢 FIX 2: Pass a raw Python list to the JSON column, DO NOT use json.dumps()
                alert = models.AdminCommunication(
                    msg_ref=f"WARN-{today_str.replace('-','')}-{defaulter['station'][:3]}",
                    sender_fnum="SYSTEM_AUTO",
                    sender_name="KMP COMPLIANCE ENGINE",
                    target_audience="STATION",
                    target_region=defaulter["region"],
                    target_fnum=[f"STATION:{defaulter['station']}"], # Fixed JSON insertion
                    message_type="COMPLIANCE_ALERT",
                    subject=f"🚨 URGENT: OVERDUE DAILY CENSUS SUBMISSION",
                    message=(
                        f"<p><strong>COMMAND COMPLIANCE ALERT:</strong> Your station <strong>({defaulter['station']})</strong> "
                        f"has failed to submit the Daily Suspect Lock-up Matrix by the 1100Hrs deadline for {today_str}. "
                        f"You have been officially recorded in the Headquarters Defaulters Ledger.</p>"
                        f"<p>Please submit your census immediately to clear the active violation.</p>"
                    ),
                    status="ACTIVE"
                )
                db.add(alert)

        db.commit()

        return {
            "status": "success", 
            "action": f"Compliance sweep completed. {len(defaulting_stations)} defaulting stations permanently logged and notified."
        }
        
    except Exception as e:
        db.rollback()
        # 🟢 FIX 3: Catch and report the error so it doesn't fail silently
        print(f"🚨 Compliance Sweep Failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Compliance sweep aborted: {str(e)}")

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
        req_region = data.get('region', current_user.region).strip().upper()
        user_reg = str(current_user.region or "").strip().upper()
        user_role = str(current_user.role or "").strip().upper()
        user_pos = str(current_user.position or "").strip().upper()

        if user_reg == "POLICE HEADQUARTERS" and user_role not in ["SUPER_ADMIN", "ADMIN"]:
            if req_region == "KMP HEADQUARTERS" or station_val in REGIONAL_HIERARCHY.get("KMP HEADQUARTERS", []) + ["KMP HEADQUARTERS", "HEADQUARTERS GENERAL TOTAL"]:
                raise HTTPException(status_code=403, detail="Clearance Denied: Police Headquarters personnel cannot log records on behalf of KMP Headquarters.")

        if station_val in ["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"]:
            valid_master_roles = ["SUPER_ADMIN", "ASSISTANT_SUPER_ADMIN", "ADMIN"]
            valid_master_positions = [
                "KMP COMMANDER", "KMP COMD", "KMP COMDR", "COMMANDER KMP", "COMD KMP", "COMDR KMP", 
                "DEPUTY KMP COMMANDER", "DEPUTY KMP COMD", "DEPUTY KMP COMDR", "DEPUTY COMMANDER KMP", 
                "DEPUTY COMD KMP", "DEPUTY COMDR KMP", "KMP ADMIN OFFICER", "KMP ADMIN", "ADMIN. KMP", "ADMIN", "KMP CID COMMANDER", "KMP CID COMD"
            ]
            has_master_clearance = user_role in valid_master_roles or any(p in user_pos for p in valid_master_positions) or user_role in valid_master_positions
            
            if not has_master_clearance:
                raise HTTPException(status_code=403, detail="Clearance Denied: Only the Office of the Commander KMP can log the Master Lockup.")

        # 🟢 REGIONAL LOGGING GATE (Backend 1100Hrs Check)
        is_regional_command = (
            user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN", "DIVISION_ADMIN"] and
            user_role not in ["SUPER_ADMIN", "ADMIN"]
        )
        
        if is_regional_command and station_val != str(current_user.station).strip().upper() and req_region != "KMP HEADQUARTERS":
            if datetime.now().hour < 11:
                raise HTTPException(status_code=403, detail="Clearance Denied: Regional Commanders can only log on behalf of defaulting stations after the 1100Hrs compliance deadline.")

        existing = db.query(models.LockupMatrix).filter(
            func.upper(models.LockupMatrix.station) == station_val,
            func.date(models.LockupMatrix.date) == date_val
        ).first()

        if existing:
            raise HTTPException(status_code=400, detail=f"Census for {station_val} on {date_val} already exists. Please update the existing entry.")

        new_entry = models.LockupMatrix(
            sd_ref=data.get('sd_ref', f"POP-{station_val[:3]}-{int(datetime.now().timestamp())}"),
            region=req_region,
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
            last_updated_by=data.get('last_updated_by', get_officer_signature(current_user))
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

@router.get("/lockup-matrix/master-history")
def get_master_lockup_history(
    period: str = Query("WEEK", description="Filter period: TODAY, WEEK, MONTH, YEAR, ALL"),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    today = date.today()
    days_to_generate = 7

    if period == "TODAY":
        days_to_generate = 1
    elif period == "WEEK":
        days_to_generate = 7
    elif period == "MONTH":
        days_to_generate = 30
    elif period == "YEAR":
        days_to_generate = 365
    else: 
        days_to_generate = 365 
        
    start_date = today - timedelta(days=days_to_generate - 1)
    
    if period == "ALL":
        earliest_record = db.query(func.min(models.LockupMatrix.date)).filter(
            func.upper(models.LockupMatrix.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"])
        ).scalar()
        if earliest_record:
            try:
                earliest_date = datetime.strptime(earliest_record, "%Y-%m-%d").date() if isinstance(earliest_record, str) else earliest_record
                start_date = earliest_date
                days_to_generate = (today - start_date).days + 1
            except Exception:
                pass

    records = db.query(models.LockupMatrix).filter(
        func.upper(models.LockupMatrix.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"]),
        func.date(models.LockupMatrix.date) >= start_date.isoformat(),
        func.date(models.LockupMatrix.date) <= today.isoformat()
    ).order_by(models.LockupMatrix.date.desc(), models.LockupMatrix.sn.desc()).all()
    
    # Take the latest submission for any given date if there are multiple master labels
    entries_by_date = {}
    for r in records:
        d_str = r.date if isinstance(r.date, str) else r.date.isoformat()
        if d_str not in entries_by_date:
            entries_by_date[d_str] = r
            
    results = []
    for i in range(days_to_generate):
        current_date = (today - timedelta(days=i)).isoformat()
        entry = entries_by_date.get(current_date)
        
        if entry:
            row = serialize_model_row(entry)
            row["is_nil"] = False
            results.append(row)
        else:
            results.append({
                "is_nil": True,
                "date": current_date,
                "time": "-",
                "station": "HEADQUARTERS GENERAL TOTAL",
                "sn": "-",
                "suspects": "NIL",
                "male_count": "-",
                "male_juvenile_count": "-",
                "female_count": "-",
                "female_juvenile_count": "-",
                "detention_1day": "-",
                "detention_2days": "-",
                "detention_3days_over": "-",
                "last_updated_by": "-",
                "marginStr": "0",
                "variation": 0
            })
            
    return results

@router.get("/lockup-matrix/station-summary")
def get_station_lockup_summary(
    station: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    target_station = (station or current_user.station or "").strip().upper()
    clean_stn = target_station.replace(' HEADQUARTERS', '').replace(' HQ', '')
    today_str = date.today().isoformat()

    # 1. Fetch Target Station Data
    query = db.query(models.LockupMatrix)
    query = apply_opsec_scope(current_user, query, models.LockupMatrix)
    
    target_query = query.filter(
        or_(
            func.upper(models.LockupMatrix.station) == target_station,
            func.upper(models.LockupMatrix.station) == clean_stn,
            func.upper(models.LockupMatrix.station) == f"{clean_stn} HEADQUARTERS"
        )
    )

    latest_log = target_query.order_by(models.LockupMatrix.date.desc(), models.LockupMatrix.sn.desc()).first()
    todays_log = target_query.filter(func.date(models.LockupMatrix.date) == today_str).first()
    todays_total = todays_log.suspects if todays_log else None

    # 2. 🟢 Decoupled Computed Sum Engine
    # Only sums actual stations in the user's jurisdiction (Excludes BOTH master labels)
    sum_query = db.query(func.sum(models.LockupMatrix.suspects)).filter(
        func.date(models.LockupMatrix.date) == today_str,
        ~func.upper(models.LockupMatrix.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"])
    )
    sum_query = apply_opsec_scope(current_user, sum_query, models.LockupMatrix)
    computed_sum = sum_query.scalar() or 0

    # 3. 🟢 Decoupled Master Total Engine
    # Looks directly at the physical SITREP logged by command via the specific master labels
    master_log = db.query(models.LockupMatrix.suspects).filter(
        func.date(models.LockupMatrix.date) == today_str,
        func.upper(models.LockupMatrix.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"])
    ).order_by(models.LockupMatrix.sn.desc()).first()
    master_total = master_log[0] if master_log else None

    return {
        "station": target_station,
        "todays_total": todays_total,
        "last_logged_date": latest_log.date if latest_log else "Never",
        "last_logged_time": latest_log.time if latest_log else "N/A",
        "last_logged_suspects": latest_log.suspects if latest_log else 0,
        "computed_sum_today": int(computed_sum),
        "master_total_today": int(master_total) if master_total is not None else None
    }

@router.get("/lockup-matrix")
def get_lockup_entries(
    search: Optional[str] = Query(None, description="Search term for station, region, or update signature"),
    todays_only: bool = Query(False, description="Filter strictly for current 24-hour cycle"),
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    query = db.query(models.LockupMatrix)
    query = apply_opsec_scope(current_user, query, models.LockupMatrix)

    user_role = str(current_user.role or "").strip().upper()
    user_pos = str(current_user.position or "").strip().upper()
    is_absolute_global = (
        user_role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN"] or
        current_user.permissions.get("view_global_roster") is True
    )
    is_regional_command = user_role in ["RPC", "DEPUTY_RPC", "REGIONAL_ADMIN"] or "RPC" in user_pos

    if not is_absolute_global and not is_regional_command:
        user_stn = str(current_user.station or "").strip().upper()
        clean_stn = user_stn.replace(' HEADQUARTERS', '').replace(' HQ', '')
        query = query.filter(
            or_(
                func.upper(models.LockupMatrix.station) == user_stn,
                func.upper(models.LockupMatrix.station) == clean_stn,
                func.upper(models.LockupMatrix.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"])
            )
        )
    else:
        if region and region.upper() not in ["ALL REGIONS", "ALL"]:
            query = query.filter(
                or_(
                    func.upper(models.LockupMatrix.region) == region.upper(),
                    func.upper(models.LockupMatrix.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"])
                )
            )
        if station and station.upper() not in ["ALL STATIONS", "ALL"]:
            clean_stn = station.upper().replace(' HEADQUARTERS', '').replace(' HQ', '')
            query = query.filter(
                or_(
                    func.upper(models.LockupMatrix.station) == station.upper(),
                    func.upper(models.LockupMatrix.station) == clean_stn,
                    func.upper(models.LockupMatrix.station).in_(["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"])
                )
            )

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
    user_pos = (current_user.position or "").strip().upper()
    user_station = (current_user.station or "").strip().upper()
    user_reg = str(current_user.region or "").strip().upper()
    perms = current_user.permissions or {}

    valid_master_roles = ["SUPER_ADMIN", "ASSISTANT_SUPER_ADMIN", "ADMIN"]
    valid_master_positions = [
        "KMP COMMANDER", "KMP COMD", "KMP COMDR", "COMMANDER KMP", "COMD KMP", "COMDR KMP", 
        "DEPUTY KMP COMMANDER", "DEPUTY KMP COMD", "DEPUTY KMP COMDR", "DEPUTY COMMANDER KMP", 
        "DEPUTY COMD KMP", "DEPUTY COMDR KMP", "KMP ADMIN OFFICER", "KMP ADMIN", "ADMIN. KMP", "ADMIN", "KMP CID COMMANDER", "KMP CID COMD"
    ]
    has_master_clearance = user_role in valid_master_roles or any(p in user_pos for p in valid_master_positions) or user_role in valid_master_positions

    entry_date = existing_entry.date
    if isinstance(entry_date, str):
        try:
            entry_date = datetime.strptime(entry_date, "%Y-%m-%d").date()
        except Exception:
            entry_date = None
            
    if entry_date:
        days_difference = (date.today() - entry_date).days
        if days_difference >= 1 and not has_master_clearance:
            raise HTTPException(status_code=403, detail="Clearance Denied: Cannot modify lockup records of the previous day without Command Level authorization.")
            
    entry_station = (data.get('station') or existing_entry.station or "").strip().upper()

    if user_reg == "POLICE HEADQUARTERS" and user_role not in ["SUPER_ADMIN", "ADMIN"]:
        if "KMP" in existing_entry.region.upper() or entry_station in REGIONAL_HIERARCHY.get("KMP HEADQUARTERS", []) + ["KMP HEADQUARTERS", "HEADQUARTERS GENERAL TOTAL"]:
            raise HTTPException(status_code=403, detail="Clearance Denied: Police Headquarters personnel are restricted from modifying KMP jurisdictional data.")

    if entry_station in ["HEADQUARTERS GENERAL TOTAL", "KMP HEADQUARTERS"]:
        if not has_master_clearance:
            raise HTTPException(status_code=403, detail="Clearance Denied: Only the Office of the Commander KMP can edit the Master Lockup.")
            
    else:
        is_global = (
            user_role in ["SUPER_ADMIN", "ADMIN", "RPC", "DEPUTY COMMANDER"] or
            perms.get("global_observer", False) is True or 
            perms.get("global_open", False) is True or
            user_reg in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"]
        )
        if not is_global and not is_station_equivalent(entry_station, user_station):
            raise HTTPException(status_code=403, detail="Clearance Denied: You can only update lockup records for your own station.")

    try:
        data.pop('sn', None)
        updated_by = data.pop('last_updated_by', f"{get_officer_signature(current_user)} [EDITED]")
        
        for key, value in data.items():
            if hasattr(existing_entry, key):
                setattr(existing_entry, key, value)

        existing_entry.last_updated_by = updated_by
        
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
def export_suspect_register_secure(
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

    data_rows = []
    for r in records:
        data_rows.append({
            "ID": getattr(r, 'id', getattr(r, 'sn', '')),
            "Name": getattr(r, 'name', ''),
            "Sex": getattr(r, 'sex', ''),
            "Age": getattr(r, 'age', ''),
            "Tribe": getattr(r, 'tribe', ''),
            "Nationality": getattr(r, 'nationality', ''),
            "Residence": getattr(r, 'residence', ''),
            "Contact": getattr(r, 'contact', ''),
            "Next of Kin": getattr(r, 'next_of_kin', ''),
            "Reason for Detention": getattr(r, 'reason_for_detention', ''),
            "Reference": getattr(r, 'reference', ''),
            "Date In": getattr(r, 'date_in', ''),
            "Date Out": getattr(r, 'date_out', ''),
            "Status": getattr(r, 'status', ''),
            "Station": getattr(r, 'station', ''),
            "Region": getattr(r, 'region', ''),
            "Entered By": getattr(r, 'entered_by', '')
        })

    df = pd.DataFrame(data_rows) if data_rows else pd.DataFrame(columns=["ID", "Name", "Sex", "Age", "Tribe", "Nationality", "Residence", "Contact", "Next of Kin", "Reason for Detention", "Reference", "Date In", "Date Out", "Status", "Station", "Region", "Entered By"])

    excel_buffer = io.BytesIO()
    with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name="Print Copy", index=False)
        df.to_excel(writer, sheet_name="Full NeonDB Copy", index=False)
        
        workbook = writer.book
        workbook.properties.creator = f"{current_user.fnum} - {current_user.rank} {current_user.name}".strip()
        workbook.properties.lastModifiedBy = f"KMP-CSDMS Audit Engine (F/No: {current_user.fnum})"
        workbook.properties.title = "KMP Secure Suspect Register Export"
        workbook.properties.subject = f"Restricted Law Enforcement Extract for Region: {current_user.region}"
        workbook.properties.category = "RESTRICTED / LAW ENFORCEMENT"
        workbook.properties.description = f"Generated via KMP-CSDMS Centralised Security System. Cryptographic Trace ID: {current_user.fnum}"

        for sheet in workbook.worksheets:
            for col in sheet.columns:
                max_length = 0
                column = col[0].column_letter
                for cell in col:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = (max_length + 2)
                sheet.column_dimensions[column].width = min(adjusted_width, 50)

    excel_buffer.seek(0)

    officer_fnum = str(current_user.fnum).strip()
    fnum_clean = officer_fnum.replace('/', '_').upper()
    zip_password = officer_fnum.encode('utf-8')
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    zip_filename = f"SECURE_SUSPECT_REGISTER_{timestamp}.zip"
    excel_filename = f"{fnum_clean}_Suspect_Register_{timestamp}.xlsx"

    zip_buffer = io.BytesIO()
    with pyzipper.AESZipFile(zip_buffer, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
        zf.setpassword(zip_password)
        zf.writestr(excel_filename, excel_buffer.getvalue())

    zip_buffer.seek(0)

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="EXPORT",
        module="SUSPECT_REGISTER",
        target_id="SECURE_ZIP_EXPORT",
        changes_summary=f"Officer {current_user.fnum} {current_user.rank} {current_user.name} securely exported AES-256 encrypted Suspect Register archive."
    )

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            'Content-Disposition': f'attachment; filename="{zip_filename}"',
            'Access-Control-Expose-Headers': 'Content-Disposition'
        }
    )

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