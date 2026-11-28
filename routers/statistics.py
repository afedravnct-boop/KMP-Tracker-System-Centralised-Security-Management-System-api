# routers/statistics.py
import io
import os
import json
import re
import traceback
from datetime import datetime, date
from decimal import Decimal
from typing import Optional
import pytz
import pyzipper
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text

from app import models
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1", tags=["Operational Statistics"])

EAT_TZ = pytz.timezone("Africa/Nairobi")

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE", "FLYING SQUAD", "CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}


class SuspectStatsPayload(BaseModel):
    region: Optional[str] = None
    station: Optional[str] = None
    date: str
    arrested: int = 0
    given_bond: int = 0
    cautioned: int = 0
    pending_court_prev_ops: int = 0
    pending_court_today_ops: int = 0
    taken_to_court_prev_lockup: int = 0
    taken_to_court_today_ops: int = 0
    released: int = 0
    remanded: int = 0
    convicted: int = 0
    last_updated_by: Optional[str] = None


class AccidentStatsPayload(BaseModel):
    region: Optional[str] = None
    station: Optional[str] = None
    date: str
    nature_of_accident: str
    minor: int = 0
    serious: int = 0
    fatal: int = 0
    victims: int = 0
    total: Optional[int] = None
    last_updated_by: Optional[str] = None


class FireStatsPayload(BaseModel):
    region: Optional[str] = None
    station: Optional[str] = None
    date: str
    nature_of_fire: str
    minor_outbreaks: int = 0
    major_disasters: int = 0
    fatal_fires: int = 0
    victims: int = 0
    total: Optional[int] = None
    last_updated_by: Optional[str] = None


class AgricSummaryPayload(BaseModel):
    region: Optional[str] = None
    station: Optional[str] = None
    date: str
    agric_crime_report: str
    number_count: int = 0
    recoveries: int = 0
    status: Optional[str] = None


def now_eat() -> datetime:
    return datetime.now(EAT_TZ).replace(tzinfo=None)


def format_officer_sig(user) -> str:
    fnum = str(getattr(user, "fnum", "") or "").strip().upper()
    rank = str(getattr(user, "rank", "") or "").strip().upper()
    name = str(getattr(user, "name", "") or "").strip().upper()
    return " ".join(part for part in (fnum, rank, name) if part) or "UNKNOWN COMMANDER"


def get_model_safe(*names):
    for name in names:
        if hasattr(models, name):
            return getattr(models, name)
    return None


def get_record_pk(obj) -> str:
    if not obj:
        return ""
    for attr in ("id", "sn"):
        val = getattr(obj, attr, None)
        if val is not None:
            return str(val)
    return ""


def get_pk_filter(ModelClass, record_id: int):
    filters = []
    if hasattr(ModelClass, "id"):
        filters.append(ModelClass.id == record_id)
    if hasattr(ModelClass, "sn"):
        filters.append(ModelClass.sn == record_id)
    return filters


def safe_log_activity(logs_db: Optional[Session], **kwargs):
    if not logs_db:
        return
    try:
        record_neon_activity(logs_db=logs_db, **kwargs)
    except Exception as log_err:
        try:
            logs_db.rollback()
        except Exception:
            pass
        print(f"⚠️ Failed to record audit activity in statistics.py: {log_err}")


def clean_row(obj):
    if not obj:
        return {}
    if isinstance(obj, dict):
        d = obj.copy()
    elif hasattr(obj, "__dict__"):
        d = obj.__dict__.copy()
        d.pop("_sa_instance_state", None)
    else:
        return {}
    out = {}
    for k, v in d.items():
        if isinstance(v, (datetime, date)):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out


def is_station_eq(a: Optional[str], b: Optional[str]) -> bool:
    sa = (a or "").strip().upper()
    sb = (b or "").strip().upper()
    if not sa or not sb:
        return False
    if sa == sb:
        return True
    ca = re.sub(r"(\s+HEADQUARTERS|\s+HQ)$", "", sa)
    cb = re.sub(r"(\s+HEADQUARTERS|\s+HQ)$", "", sb)
    return ca == cb and len(ca) > 0


def get_user_perms(user) -> dict:
    perms = getattr(user, "permissions", None) or {}
    if isinstance(perms, str):
        try:
            return json.loads(perms)
        except Exception:
            return {}
    return perms if isinstance(perms, dict) else {}


def has_global_access(user) -> bool:
    role = str(getattr(user, "role", "") or "").strip().upper()
    pos = str(getattr(user, "position", "") or "").strip().upper()
    reg = str(getattr(user, "region", "") or "").strip().upper()
    perms = get_user_perms(user)
    is_kmp_mgr = role == "SYSTEM_MANAGER" and reg in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"] and "KMP" in pos
    is_kmp_spec = role == "ASSISTANT_SYSTEM_MANAGER" and reg in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"] and "KMP" in pos
    return (
        role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN"]
        or "KMP COMMANDER" in pos
        or "DEPUTY KMP COMMANDER" in pos
        or "KMP ADMIN" in pos
        or perms.get("view_global_roster") is True
        or perms.get("global_observer") is True
        or is_kmp_mgr
        or is_kmp_spec
    )


def has_regional_access(user) -> bool:
    role = str(getattr(user, "role", "") or "").strip().upper()
    pos = str(getattr(user, "position", "") or "").strip().upper()
    return (
        role in ["RPC", "DEPUTY_RPC", "DEPUTY COMMANDER", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN", "DIVISION_ADMIN"]
        or "RPC" in pos
        or "DEPUTY COMMANDER" in pos
    )


def can_mutate_target(user, target_station: str) -> bool:
    if has_global_access(user):
        return True
    user_reg = str(getattr(user, "region", "") or "").strip().upper()
    user_stn = str(getattr(user, "station", "") or "").strip().upper()
    stn_clean = (target_station or "").strip().upper()

    if has_regional_access(user):
        allowed = [s.upper() for s in REGIONAL_HIERARCHY.get(user_reg, [])]
        if stn_clean in allowed or any(is_station_eq(stn_clean, s) for s in allowed):
            return True

    return is_station_eq(user_stn, stn_clean)


def apply_scope_and_filters(query, ModelClass, current_user, region, station, start_date, end_date):
    if not ModelClass:
        return query

    if not has_global_access(current_user):
        user_reg = str(getattr(current_user, "region", "") or "").strip().upper()
        user_stn = str(getattr(current_user, "station", "") or "").strip().upper()

        if has_regional_access(current_user) and user_reg in REGIONAL_HIERARCHY:
            expanded = set()
            for s in REGIONAL_HIERARCHY[user_reg]:
                expanded.add(s)
                expanded.add(s.replace(" HEADQUARTERS", "").replace(" HQ", ""))
                expanded.add(s + " HEADQUARTERS")
                expanded.add(s + " HQ")
            conds = []
            if hasattr(ModelClass, "region"):
                conds.append(func.upper(ModelClass.region) == user_reg)
            if hasattr(ModelClass, "station"):
                conds.append(func.upper(ModelClass.station).in_(list(expanded)))
            if conds:
                query = query.filter(or_(*conds))
            else:
                query = query.filter(text("1=0"))
        elif hasattr(ModelClass, "station"):
            clean_stn = user_stn.replace(" HEADQUARTERS", "").replace(" HQ", "")
            query = query.filter(
                or_(
                    func.upper(ModelClass.station) == user_stn,
                    func.upper(ModelClass.station) == clean_stn,
                    func.upper(ModelClass.station) == f"{clean_stn} HEADQUARTERS",
                )
            )
        else:
            query = query.filter(text("1=0"))

    if region and region.strip().upper() not in ["ALL REGIONS", "ALL", ""]:
        if hasattr(ModelClass, "region"):
            query = query.filter(func.upper(ModelClass.region) == region.strip().upper())

    if station and station.strip().upper() not in ["ALL STATIONS", "ALL", ""]:
        if hasattr(ModelClass, "station"):
            s_up = station.strip().upper()
            s_clean = s_up.replace(" HEADQUARTERS", "").replace(" HQ", "")
            query = query.filter(
                or_(
                    func.upper(ModelClass.station) == s_up,
                    func.upper(ModelClass.station) == s_clean,
                    func.upper(ModelClass.station) == f"{s_clean} HEADQUARTERS",
                )
            )

    if start_date and hasattr(ModelClass, "date"):
        query = query.filter(ModelClass.date >= start_date)

    if end_date and hasattr(ModelClass, "date"):
        query = query.filter(ModelClass.date <= end_date)

    return query


def validate_suspect_balance(p: SuspectStatsPayload):
    total_in = (p.arrested or 0) + (p.pending_court_prev_ops or 0)
    total_out = (
        (p.given_bond or 0)
        + (p.cautioned or 0)
        + (p.taken_to_court_today_ops or 0)
        + (p.taken_to_court_prev_lockup or 0)
        + (p.pending_court_today_ops or 0)
    )
    if total_in != total_out:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Inconsistent suspects balance: Arrested ({p.arrested}) + Pending Prev ({p.pending_court_prev_ops}) "
                f"must equal Bond ({p.given_bond}) + Cautioned ({p.cautioned}) + Taken Today ({p.taken_to_court_today_ops}) "
                f"+ Taken Prev ({p.taken_to_court_prev_lockup}) + Pending Today ({p.pending_court_today_ops})."
            ),
        )
    if (p.taken_to_court_prev_lockup or 0) > (p.pending_court_prev_ops or 0):
        raise HTTPException(
            status_code=400,
            detail="Taken to court from previous lockup cannot exceed pending court from previous day.",
        )


def build_aes_zip_export(
    rows: list,
    sheet_title: str,
    file_prefix: str,
    current_user,
) -> StreamingResponse:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]
    ws.views.sheetView[0].showGridLines = True

    eat_now = now_eat()
    officer_fnum = str(getattr(current_user, "fnum", "") or "UPF").strip().upper()
    fnum_clean = officer_fnum.replace("/", "_")
    officer_rank = str(getattr(current_user, "rank", "") or "").strip().upper()
    officer_name = str(getattr(current_user, "name", "") or "").strip().upper()
    officer_station = str(getattr(current_user, "station", "") or "").strip().upper()
    officer_region = str(getattr(current_user, "region", "") or "").strip().upper()
    officer_role = str(getattr(current_user, "role", "") or "").strip().upper()
    timestamp_eat = eat_now.strftime("%Y-%m-%d %H:%M:%S EAT")

    officer_sig = format_officer_sig(current_user)
    wb.properties.creator = officer_sig
    wb.properties.lastModifiedBy = f"KMP-CSDMS [{officer_station or 'HQ'}]"
    wb.properties.title = f"{sheet_title} — Restricted Export"
    wb.properties.subject = f"Keyed to Force/File No: {officer_fnum} | Generated: {timestamp_eat}"
    wb.properties.description = json.dumps({
        "fnum": officer_fnum,
        "rank": officer_rank,
        "name": officer_name,
        "station": officer_station,
        "region": officer_region,
        "role": officer_role,
        "exported_at_eat": timestamp_eat,
    })

    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
    thin_border = Border(
        left=Side(style="thin", color="D1D5DB"),
        right=Side(style="thin", color="D1D5DB"),
        top=Side(style="thin", color="D1D5DB"),
        bottom=Side(style="thin", color="D1D5DB"),
    )

    clean_rows = [clean_row(r) for r in rows]
    headers = list(clean_rows[0].keys()) if clean_rows else ["id", "region", "station", "date"]

    for col_idx, h in enumerate(headers, 1):
        c = ws.cell(row=1, column=col_idx, value=h.upper())
        c.font = header_font
        c.fill = header_fill
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = thin_border

    for r_idx, row_dict in enumerate(clean_rows, 2):
        for c_idx, h in enumerate(headers, 1):
            val = row_dict.get(h, "")
            cell = ws.cell(row=r_idx, column=c_idx, value=val)
            cell.border = thin_border

    for col in ws.columns:
        col_letter = col[0].column_letter
        ws.column_dimensions[col_letter].width = 18

    excel_buf = io.BytesIO()
    wb.save(excel_buf)
    wb.close()
    excel_buf.seek(0)

    encrypted_metadata_json = json.dumps(
        {
            "exported_by": {
                "fnum": officer_fnum,
                "rank": officer_rank,
                "name": officer_name,
                "station": officer_station,
                "region": officer_region,
                "role": officer_role,
            },
            "export_scope": sheet_title,
            "record_count": len(clean_rows),
            "exported_at_eat": timestamp_eat,
        },
        indent=2,
    ).encode("utf-8")

    today_str = eat_now.strftime("%Y-%m-%d")
    xlsx_name = f"{fnum_clean}_{file_prefix}_{today_str}.xlsx"
    zip_name = f"{file_prefix}_SECURE_EXPORT_{today_str}.zip"

    zip_buf = io.BytesIO()
    with pyzipper.AESZipFile(
        zip_buf,
        "w",
        compression=pyzipper.ZIP_DEFLATED,
        encryption=pyzipper.WZ_AES,
    ) as zf:
        zf.setpassword(officer_fnum.encode("utf-8"))
        zf.writestr(xlsx_name, excel_buf.getvalue())
        zf.writestr("AUDIT_METADATA.json", encrypted_metadata_json)
    excel_buf.close()
    zip_buf.seek(0)

    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_name}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


def _list_suspect_domain_records(db: Session, ModelClass, current_user, region, station, start_date, end_date):
    if not ModelClass:
        return []
    q = apply_scope_and_filters(db.query(ModelClass), ModelClass, current_user, region, station, start_date, end_date)
    order_col = getattr(ModelClass, "date", getattr(ModelClass, "id", getattr(ModelClass, "sn", None)))
    if order_col is not None:
        q = q.order_by(order_col.desc())
    return [clean_row(r) for r in q.all()]


def _create_suspect_domain_record(
    db: Session,
    logs_db: Session,
    ModelClass,
    payload: SuspectStatsPayload,
    current_user,
    module_name: str,
):
    if not ModelClass:
        raise HTTPException(status_code=500, detail=f"{module_name} model not configured.")
    validate_suspect_balance(payload)

    target_region = (payload.region or getattr(current_user, "region", "") or "KMP HEADQUARTERS").strip().upper()
    target_station = (payload.station or getattr(current_user, "station", "") or "HQ").strip().upper()
    if not can_mutate_target(current_user, target_station):
        raise HTTPException(status_code=403, detail="Jurisdiction Denied: Cannot submit statistics for this station.")

    actor_sig = format_officer_sig(current_user)
    data = payload.model_dump()
    data["region"] = target_region
    data["station"] = target_station
    data["pending_court"] = (payload.pending_court_prev_ops or 0) + (payload.pending_court_today_ops or 0)
    data["taken_to_court"] = (payload.taken_to_court_prev_lockup or 0) + (payload.taken_to_court_today_ops or 0)
    data["last_updated_by"] = payload.last_updated_by or actor_sig

    valid_cols = {c.key for c in ModelClass.__table__.columns}
    safe_data = {k: v for k, v in data.items() if k in valid_cols}

    try:
        obj = ModelClass(**safe_data)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        safe_log_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="CREATE",
            module=module_name,
            target_id=get_record_pk(obj),
            changes_summary=f"Logged {module_name} statistics for {target_station} on {payload.date} (Arrested: {payload.arrested}).",
        )
        return clean_row(obj)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        try:
            logs_db.rollback()
        except Exception:
            pass
        print(f"❌ [{module_name}] Create error: {repr(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create statistics record: {str(e)}")


def _update_suspect_domain_record(
    db: Session,
    logs_db: Session,
    ModelClass,
    record_id: int,
    payload: SuspectStatsPayload,
    current_user,
    module_name: str,
):
    if not ModelClass:
        raise HTTPException(status_code=500, detail=f"{module_name} model not configured.")
    validate_suspect_balance(payload)

    pk_filters = get_pk_filter(ModelClass, record_id)
    if not pk_filters:
        raise HTTPException(status_code=500, detail=f"{module_name} primary key not configured.")

    obj = db.query(ModelClass).filter(or_(*pk_filters)).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Statistics record not found.")

    existing_station = str(getattr(obj, "station", "") or "").strip().upper()
    if not can_mutate_target(current_user, existing_station):
        raise HTTPException(status_code=403, detail="Jurisdiction Denied: Cannot update statistics for this station.")

    actor_sig = format_officer_sig(current_user)
    data = payload.model_dump(exclude_unset=True)
    data["pending_court"] = (payload.pending_court_prev_ops or 0) + (payload.pending_court_today_ops or 0)
    data["taken_to_court"] = (payload.taken_to_court_prev_lockup or 0) + (payload.taken_to_court_today_ops or 0)
    data["last_updated_by"] = actor_sig

    valid_cols = {c.key for c in ModelClass.__table__.columns}
    try:
        for k, v in data.items():
            if k in valid_cols and k not in ("id", "sn"):
                setattr(obj, k, v)
        db.commit()
        db.refresh(obj)
        safe_log_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module=module_name,
            target_id=str(record_id),
            changes_summary=f"Updated {module_name} statistics record {record_id} for {existing_station}.",
        )
        return clean_row(obj)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        try:
            logs_db.rollback()
        except Exception:
            pass
        print(f"❌ [{module_name}] Update error: {repr(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to update statistics record: {str(e)}")


# ====================================================================
# 1. DISRUPTIVE OPS STATISTICS (/api/v1/stats)
# ====================================================================
@router.get("/stats")
def list_disruptive_stats(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user),
):
    StatsModel = get_model_safe("Operational_Statistics", "OperationalStatistics", "OperationalStats", "operational_stats", "Stats", "stats")
    return _list_suspect_domain_records(db, StatsModel, current_user, region, station, start_date, end_date)


@router.post("/stats")
def create_disruptive_stats(
    payload: SuspectStatsPayload,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    StatsModel = get_model_safe("Operational_Statistics", "OperationalStatistics", "OperationalStats", "operational_stats", "Stats", "stats")
    return _create_suspect_domain_record(db, logs_db, StatsModel, payload, current_user, "OPERATIONAL_STATISTICS")


@router.put("/stats/{record_id}")
def update_disruptive_stats(
    record_id: int,
    payload: SuspectStatsPayload,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    StatsModel = get_model_safe("Operational_Statistics", "OperationalStatistics", "OperationalStats", "operational_stats", "Stats", "stats")
    return _update_suspect_domain_record(db, logs_db, StatsModel, record_id, payload, current_user, "OPERATIONAL_STATISTICS")


@router.post("/stats/export")
def export_disruptive_stats(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    StatsModel = get_model_safe("Operational_Statistics", "OperationalStatistics", "OperationalStats", "operational_stats", "Stats", "stats")
    rows = apply_scope_and_filters(db.query(StatsModel), StatsModel, current_user, region, station, start_date, end_date).all() if StatsModel else []
    safe_log_activity(logs_db=logs_db, fnum=current_user.fnum, action_type="EXPORT", module="OPERATIONAL_STATISTICS", target_id="STATS_EXPORT", changes_summary=f"Exported {len(rows)} disruptive ops records.")
    return build_aes_zip_export(rows, "Disruptive OPS Stats", "KMP_DISRUPTIVE_OPS", current_user)


# ====================================================================
# 2. AGRICULTURAL CRIMES SUSPECTS STATS (/api/v1/agric-stats)
# ====================================================================
@router.get("/agric-stats")
def list_agric_stats(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user),
):
    AgricStatsModel = get_model_safe("Agricultural_Statistics", "AgriculturalStatistics", "Agric_Stats", "AgricStats", "agric_stats")
    return _list_suspect_domain_records(db, AgricStatsModel, current_user, region, station, start_date, end_date)


@router.post("/agric-stats")
def create_agric_stats(
    payload: SuspectStatsPayload,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    AgricStatsModel = get_model_safe("Agricultural_Statistics", "AgriculturalStatistics", "Agric_Stats", "AgricStats", "agric_stats")
    return _create_suspect_domain_record(db, logs_db, AgricStatsModel, payload, current_user, "AGRICULTURAL_STATISTICS")


@router.put("/agric-stats/{record_id}")
def update_agric_stats(
    record_id: int,
    payload: SuspectStatsPayload,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    AgricStatsModel = get_model_safe("Agricultural_Statistics", "AgriculturalStatistics", "Agric_Stats", "AgricStats", "agric_stats")
    return _update_suspect_domain_record(db, logs_db, AgricStatsModel, record_id, payload, current_user, "AGRICULTURAL_STATISTICS")


@router.post("/agric-stats/export")
def export_agric_stats(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    AgricStatsModel = get_model_safe("Agricultural_Statistics", "AgriculturalStatistics", "Agric_Stats", "AgricStats", "agric_stats")
    rows = apply_scope_and_filters(db.query(AgricStatsModel), AgricStatsModel, current_user, region, station, start_date, end_date).all() if AgricStatsModel else []
    safe_log_activity(logs_db=logs_db, fnum=current_user.fnum, action_type="EXPORT", module="AGRICULTURAL_STATISTICS", target_id="AGRIC_STATS_EXPORT", changes_summary=f"Exported {len(rows)} agricultural stats records.")
    return build_aes_zip_export(rows, "Agric Crimes Stats", "KMP_AGRIC_STATS", current_user)


# ====================================================================
# 3. AGRICULTURAL PRODUCE & RECOVERIES SUMMARY (/api/v1/agric-summary)
# ====================================================================
@router.get("/agric-summary")
def list_agric_summary(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user),
):
    AgricSummaryModel = get_model_safe("Agricultural_Summary", "AgriculturalSummary", "Agric_Summary", "AgricSummary", "agric_summary")
    if not AgricSummaryModel:
        return []
    q = apply_scope_and_filters(db.query(AgricSummaryModel), AgricSummaryModel, current_user, region, station, start_date, end_date)
    order_col = getattr(AgricSummaryModel, "date", getattr(AgricSummaryModel, "id", getattr(AgricSummaryModel, "sn", None)))
    if order_col is not None:
        q = q.order_by(order_col.desc())

    records = []
    for r in q.all():
        d = clean_row(r)
        raw_status = d.get("status")
        if isinstance(raw_status, str) and raw_status.strip().startswith("{"):
            try:
                parsed = json.loads(raw_status)
                d.setdefault("number_count_label", parsed.get("numLabel", str(d.get("number_count", ""))))
                d.setdefault("recovery_report", parsed.get("recReport", ""))
                d.setdefault("recoveries_label", parsed.get("recLabel", str(d.get("recoveries", ""))))
            except Exception:
                pass
        d.setdefault("number_count_label", str(d.get("number_count", "")))
        d.setdefault("recovery_report", d.get("recovery_report") or d.get("action") or "RECOVERED")
        d.setdefault("recoveries_label", str(d.get("recoveries", "")))
        records.append(d)
    return records


@router.post("/agric-summary")
def create_agric_summary(
    payload: AgricSummaryPayload,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    AgricSummaryModel = get_model_safe("Agricultural_Summary", "AgriculturalSummary", "Agric_Summary", "AgricSummary", "agric_summary")
    if not AgricSummaryModel:
        raise HTTPException(status_code=500, detail="Agricultural summary model not configured.")

    target_region = (payload.region or getattr(current_user, "region", "") or "KMP HEADQUARTERS").strip().upper()
    target_station = (payload.station or getattr(current_user, "station", "") or "HQ").strip().upper()
    if not can_mutate_target(current_user, target_station):
        raise HTTPException(status_code=403, detail="Jurisdiction Denied: Cannot submit produce entries for this station.")

    actor_sig = format_officer_sig(current_user)
    data = payload.model_dump()
    data["region"] = target_region
    data["station"] = target_station
    data["last_updated_by"] = actor_sig
    valid_cols = {c.key for c in AgricSummaryModel.__table__.columns}
    safe_data = {k: v for k, v in data.items() if k in valid_cols}

    try:
        obj = AgricSummaryModel(**safe_data)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        safe_log_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="CREATE",
            module="AGRICULTURAL_STATISTICS",
            target_id=get_record_pk(obj),
            changes_summary=f"Logged agricultural produce entry ({payload.agric_crime_report}) for {target_station}.",
        )
        return clean_row(obj)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        try:
            logs_db.rollback()
        except Exception:
            pass
        print(f"❌ [AGRICULTURAL_STATISTICS] Create error: {repr(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save agricultural summary: {str(e)}")


# ====================================================================
# 4. TRAFFIC & ACCIDENTS STATISTICS (/api/v1/accidents)
# ====================================================================
@router.get("/accidents")
def list_accident_stats(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user),
):
    AccidentModel = get_model_safe("Accident_Statistics", "AccidentStatistics", "Accidents", "accidents")
    return _list_suspect_domain_records(db, AccidentModel, current_user, region, station, start_date, end_date)


@router.post("/accidents")
def create_accident_stats(
    payload: AccidentStatsPayload,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    AccidentModel = get_model_safe("Accident_Statistics", "AccidentStatistics", "Accidents", "accidents")
    if not AccidentModel:
        raise HTTPException(status_code=500, detail="Accident statistics model not configured.")

    target_region = (payload.region or getattr(current_user, "region", "") or "KMP HEADQUARTERS").strip().upper()
    target_station = (payload.station or getattr(current_user, "station", "") or "HQ").strip().upper()
    if not can_mutate_target(current_user, target_station):
        raise HTTPException(status_code=403, detail="Jurisdiction Denied: Cannot submit accident statistics for this station.")

    actor_sig = format_officer_sig(current_user)
    data = payload.model_dump()
    data["region"] = target_region
    data["station"] = target_station
    data["nature_of_accident"] = (payload.nature_of_accident or "UNSPECIFIED").strip().upper()
    data["total"] = (payload.minor or 0) + (payload.serious or 0) + (payload.fatal or 0)
    data["last_updated_by"] = payload.last_updated_by or actor_sig
    data["entered_by"] = actor_sig

    valid_cols = {c.key for c in AccidentModel.__table__.columns}
    safe_data = {k: v for k, v in data.items() if k in valid_cols}

    try:
        obj = AccidentModel(**safe_data)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        safe_log_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="CREATE",
            module="ACCIDENT_STATISTICS",
            target_id=get_record_pk(obj),
            changes_summary=f"Logged accident statistics ({data['nature_of_accident']}) for {target_station} on {payload.date}.",
        )
        return clean_row(obj)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        try:
            logs_db.rollback()
        except Exception:
            pass
        print(f"❌ [ACCIDENT_STATISTICS] Create error: {repr(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save accident statistics: {str(e)}")


@router.put("/accidents/{record_id}")
def update_accident_stats(
    record_id: int,
    payload: AccidentStatsPayload,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    AccidentModel = get_model_safe("Accident_Statistics", "AccidentStatistics", "Accidents", "accidents")
    if not AccidentModel:
        raise HTTPException(status_code=500, detail="Accident statistics model not configured.")

    pk_filters = get_pk_filter(AccidentModel, record_id)
    obj = db.query(AccidentModel).filter(or_(*pk_filters)).first() if pk_filters else None
    if not obj:
        raise HTTPException(status_code=404, detail="Accident record not found.")

    existing_station = str(getattr(obj, "station", "") or "").strip().upper()
    if not can_mutate_target(current_user, existing_station):
        raise HTTPException(status_code=403, detail="Jurisdiction Denied: Cannot update accident statistics for this station.")

    actor_sig = format_officer_sig(current_user)
    data = payload.model_dump(exclude_unset=True)
    if "nature_of_accident" in data and data["nature_of_accident"]:
        data["nature_of_accident"] = data["nature_of_accident"].strip().upper()
    data["total"] = (payload.minor or 0) + (payload.serious or 0) + (payload.fatal or 0)
    data["last_updated_by"] = actor_sig

    valid_cols = {c.key for c in AccidentModel.__table__.columns}
    try:
        for k, v in data.items():
            if k in valid_cols and k not in ("id", "sn"):
                setattr(obj, k, v)
        db.commit()
        db.refresh(obj)
        safe_log_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="ACCIDENT_STATISTICS",
            target_id=str(record_id),
            changes_summary=f"Updated accident record {record_id} for {existing_station}.",
        )
        return clean_row(obj)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        try:
            logs_db.rollback()
        except Exception:
            pass
        print(f"❌ [ACCIDENT_STATISTICS] Update error: {repr(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to update accident record: {str(e)}")


@router.post("/accidents/export")
def export_accident_stats(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    AccidentModel = get_model_safe("Accident_Statistics", "AccidentStatistics", "Accidents", "accidents")
    rows = apply_scope_and_filters(db.query(AccidentModel), AccidentModel, current_user, region, station, start_date, end_date).all() if AccidentModel else []
    safe_log_activity(logs_db=logs_db, fnum=current_user.fnum, action_type="EXPORT", module="ACCIDENT_STATISTICS", target_id="ACCIDENTS_EXPORT", changes_summary=f"Exported {len(rows)} accident records.")
    return build_aes_zip_export(rows, "Traffic Accidents Stats", "KMP_ACCIDENTS_STATS", current_user)


# ====================================================================
# 5. FIRE & RESCUE STATISTICS (/api/v1/fires)
# ====================================================================
@router.get("/fires")
def list_fire_stats(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user),
):
    FireModel = get_model_safe("Fire_Statistics", "FireStatistics", "Fires", "fires")
    return _list_suspect_domain_records(db, FireModel, current_user, region, station, start_date, end_date)


@router.post("/fires")
def create_fire_stats(
    payload: FireStatsPayload,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    FireModel = get_model_safe("Fire_Statistics", "FireStatistics", "Fires", "fires")
    if not FireModel:
        raise HTTPException(status_code=500, detail="Fire statistics model not configured.")

    target_region = (payload.region or getattr(current_user, "region", "") or "KMP HEADQUARTERS").strip().upper()
    target_station = (payload.station or getattr(current_user, "station", "") or "HQ").strip().upper()
    if not can_mutate_target(current_user, target_station):
        raise HTTPException(status_code=403, detail="Jurisdiction Denied: Cannot submit fire statistics for this station.")

    actor_sig = format_officer_sig(current_user)
    data = payload.model_dump()
    data["region"] = target_region
    data["station"] = target_station
    data["nature_of_fire"] = (payload.nature_of_fire or "UNSPECIFIED").strip().upper()
    data["total"] = (payload.minor_outbreaks or 0) + (payload.major_disasters or 0) + (payload.fatal_fires or 0)
    data["last_updated_by"] = payload.last_updated_by or actor_sig
    data["entered_by"] = actor_sig

    valid_cols = {c.key for c in FireModel.__table__.columns}
    safe_data = {k: v for k, v in data.items() if k in valid_cols}

    try:
        obj = FireModel(**safe_data)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        safe_log_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="CREATE",
            module="FIRE_STATISTICS",
            target_id=get_record_pk(obj),
            changes_summary=f"Logged fire statistics ({data['nature_of_fire']}) for {target_station} on {payload.date}.",
        )
        return clean_row(obj)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        try:
            logs_db.rollback()
        except Exception:
            pass
        print(f"❌ [FIRE_STATISTICS] Create error: {repr(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save fire statistics: {str(e)}")


@router.put("/fires/{record_id}")
def update_fire_stats(
    record_id: int,
    payload: FireStatsPayload,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    FireModel = get_model_safe("Fire_Statistics", "FireStatistics", "Fires", "fires")
    if not FireModel:
        raise HTTPException(status_code=500, detail="Fire statistics model not configured.")

    pk_filters = get_pk_filter(FireModel, record_id)
    obj = db.query(FireModel).filter(or_(*pk_filters)).first() if pk_filters else None
    if not obj:
        raise HTTPException(status_code=404, detail="Fire record not found.")

    existing_station = str(getattr(obj, "station", "") or "").strip().upper()
    if not can_mutate_target(current_user, existing_station):
        raise HTTPException(status_code=403, detail="Jurisdiction Denied: Cannot update fire statistics for this station.")

    actor_sig = format_officer_sig(current_user)
    data = payload.model_dump(exclude_unset=True)
    if "nature_of_fire" in data and data["nature_of_fire"]:
        data["nature_of_fire"] = data["nature_of_fire"].strip().upper()
    data["total"] = (payload.minor_outbreaks or 0) + (payload.major_disasters or 0) + (payload.fatal_fires or 0)
    data["last_updated_by"] = actor_sig

    valid_cols = {c.key for c in FireModel.__table__.columns}
    try:
        for k, v in data.items():
            if k in valid_cols and k not in ("id", "sn"):
                setattr(obj, k, v)
        db.commit()
        db.refresh(obj)
        safe_log_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="FIRE_STATISTICS",
            target_id=str(record_id),
            changes_summary=f"Updated fire record {record_id} for {existing_station}.",
        )
        return clean_row(obj)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        try:
            logs_db.rollback()
        except Exception:
            pass
        print(f"❌ [FIRE_STATISTICS] Update error: {repr(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to update fire record: {str(e)}")


@router.post("/fires/export")
def export_fire_stats(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user),
):
    FireModel = get_model_safe("Fire_Statistics", "FireStatistics", "Fires", "fires")
    rows = apply_scope_and_filters(db.query(FireModel), FireModel, current_user, region, station, start_date, end_date).all() if FireModel else []
    safe_log_activity(logs_db=logs_db, fnum=current_user.fnum, action_type="EXPORT", module="FIRE_STATISTICS", target_id="FIRES_EXPORT", changes_summary=f"Exported {len(rows)} fire records.")
    return build_aes_zip_export(rows, "Fire & Rescue Stats", "KMP_FIRES_STATS", current_user)