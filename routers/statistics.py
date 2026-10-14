# routers/statistics.py
import json
import csv
import io
import pytz
import pyzipper
import openpyxl
from openpyxl.styles import Alignment, PatternFill, Font, Border, Side
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text

from app import models
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1", tags=["Statistics & Operations"])

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

def get_model_safe(*names):
    for name in names:
        if hasattr(models, name):
            return getattr(models, name)
    return None

def clean_model_dict(obj):
    if not obj:
        return {}
    d = obj.__dict__.copy()
    d.pop('_sa_instance_state', None)
    clean = {}
    for k, v in d.items():
        if hasattr(v, 'isoformat'):
            clean[k] = v.isoformat()
        else:
            clean[k] = v
    return clean

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

    is_regional_command = (
        user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN", "DIVISION_ADMIN"] or
        "HR" in user_pos
    )

    if is_absolute_global or is_kmp_sys_mgr:
        return query
        
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
        
    elif hasattr(ModelClass, 'station'):
        return query.filter(func.upper(ModelClass.station) == user_stn)
        
    return query.filter(text("1=0"))

def build_filtered_query(query, ModelClass, region, station, start_date, end_date, search):
    if region and region.upper() not in ["ALL REGIONS", "ALL"]:
        if hasattr(ModelClass, 'region'):
            query = query.filter(func.upper(ModelClass.region) == region.upper())
            
    if station and station.upper() not in ["ALL STATIONS", "ALL"]:
        if hasattr(ModelClass, 'station'):
            clean_stn = station.upper().replace(' HEADQUARTERS', '').replace(' HQ', '')
            query = query.filter(
                or_(
                    func.upper(ModelClass.station) == station.upper(),
                    func.upper(ModelClass.station) == clean_stn,
                    func.upper(ModelClass.station) == f"{clean_stn} HEADQUARTERS"
                )
            )

    if start_date and hasattr(ModelClass, 'date'):
        query = query.filter(ModelClass.date >= start_date)
    
    if end_date and hasattr(ModelClass, 'date'):
        query = query.filter(ModelClass.date <= end_date)

    if search:
        term = f"%{search.strip().upper()}%"
        search_conds = []
        if hasattr(ModelClass, 'station'): search_conds.append(ModelClass.station.ilike(term))
        if hasattr(ModelClass, 'date'): search_conds.append(func.cast(ModelClass.date, text).ilike(term))
        if hasattr(ModelClass, 'id'): search_conds.append(func.cast(ModelClass.id, text).ilike(term))
        if hasattr(ModelClass, 'sn'): search_conds.append(func.cast(ModelClass.sn, text).ilike(term))
        if hasattr(ModelClass, 'agric_crime_report'): search_conds.append(ModelClass.agric_crime_report.ilike(term))
        if search_conds:
            query = query.filter(or_(*search_conds))
            
    return query


# ==========================================
# 1. DISRUPTIVE OPS STATS ENDPOINTS
# ==========================================
@router.get("/stats")
def get_stats(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=300),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
    if not StatsModel: return []
    
    query = db.query(StatsModel)
    query = apply_opsec_scope(current_user, query, StatsModel)
    query = build_filtered_query(query, StatsModel, region, station, start_date, end_date, search)
    
    records = query.order_by(StatsModel.id.desc()).limit(limit).all()
    return [clean_model_dict(r) for r in records]

@router.get("/stats/export")
def export_stats_secure_zip(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
    if not StatsModel: raise HTTPException(status_code=500, detail="Model not found")

    query = db.query(StatsModel)
    query = apply_opsec_scope(current_user, query, StatsModel)
    query = build_filtered_query(query, StatsModel, region, station, start_date, end_date, search)
    records = query.order_by(StatsModel.id.desc()).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Disruptive OPS Statistics"
    ws.views.sheetView[0].showGridLines = True

    eat_tz = pytz.timezone("Africa/Nairobi")
    eat_time = datetime.now(eat_tz).replace(tzinfo=None)
    
    officer_name = (current_user.name or "UNKNOWN").strip().upper()
    officer_fnum = (current_user.fnum or "UNKNOWN").strip().upper()
    officer_rank = (current_user.rank or "").strip().upper()
    officer_station = (current_user.station or "HQ").strip().upper()
    timestamp_str = eat_time.strftime("%Y-%m-%d %H:%M:%S EAT")

    wb.properties.creator = f"{officer_fnum} {officer_rank} {officer_name}"
    wb.properties.lastModifiedBy = f"KMP-CSDMS SECURITY AUDIT ENGINE [{officer_station}]"
    wb.properties.title = "Official Law Enforcement Restricted Disruptive OPS Statistics Export"
    wb.properties.subject = f"Operational Statistics Extract — Downloaded by {officer_fnum} at {timestamp_str}"
    wb.properties.description = f"SECURE OPSEC RECORD. Cryptographically keyed and audited to Force Number: {officer_fnum}."

    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell_font = Font(name="Calibri", size=10)
    thin_border = Border(
        left=Side(style='thin', color='D1D5DB'), right=Side(style='thin', color='D1D5DB'),
        top=Side(style='thin', color='D1D5DB'), bottom=Side(style='thin', color='D1D5DB')
    )

    ws.merge_cells("A1:L1")
    banner_cell = ws.cell(row=1, column=1)
    banner_cell.value = f"RESTRICTED LAW ENFORCEMENT RECORD — FORENSICALLY STAMPED TO OFFICER: {officer_fnum} {officer_rank} {officer_name} ({officer_station}) — TIMESTAMP: {timestamp_str}"
    banner_cell.font = Font(name="Calibri", size=9, bold=True, color="991B1B")
    banner_cell.fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    banner_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 22

    ws.cell(row=2, column=1, value="UGANDA POLICE FORCE - DISRUPTIVE OPS STATISTICS LEDGER").font = Font(bold=True, size=11)
    ws.row_dimensions[2].height = 18

    headers = ["ID", "Date", "Region", "Station", "Arrested", "Given Bond", "Cautioned", "Pending Court", "Taken to Court", "Released by Court", "Remanded", "Convicted"]
    ws.row_dimensions[4].height = 26
    for col_idx, h in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col_idx, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align
        cell.border = thin_border

    current_row = 5
    for r in records:
        row_data = [
            getattr(r, 'id', ''), getattr(r, 'date', ''), getattr(r, 'region', ''), getattr(r, 'station', ''),
            getattr(r, 'arrested', 0), getattr(r, 'given_bond', 0), getattr(r, 'cautioned', 0),
            getattr(r, 'pending_court', 0), getattr(r, 'taken_to_court', 0), getattr(r, 'released', 0),
            getattr(r, 'remanded', 0), getattr(r, 'convicted', 0)
        ]
        ws.append(row_data)
        ws.row_dimensions[current_row].height = 20
        for col_idx in range(1, len(row_data) + 1):
            cell = ws.cell(row=current_row, column=col_idx)
            cell.font = cell_font
            cell.border = thin_border
            if col_idx in [1, 2, 5, 6, 7, 8, 9, 10, 11, 12]:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")
        current_row += 1

    for col in ws.columns:
        col_letter = col[0].column_letter
        max_len = max([len(str(cell.value or '')) for cell in col], default=0)
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 35)

    excel_stream = io.BytesIO()
    wb.save(excel_stream)
    excel_stream.seek(0)

    zip_stream = io.BytesIO()
    zip_password = str(current_user.fnum).strip().encode('utf-8')
    fnum_clean = str(current_user.fnum).replace('/', '_').upper()
    excel_filename = f"{fnum_clean}_Disruptive_OPS_Stats_{eat_time.strftime('%Y%m%d')}.xlsx"
    zip_filename = f"SECURE_DISRUPTIVE_OPS_STATS_{eat_time.strftime('%Y%m%d')}.zip"

    with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
        zf.setpassword(zip_password)
        zf.writestr(excel_filename, excel_stream.getvalue())

    zip_stream.seek(0)

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="EXPORT",
        module="DISRUPTIVE_OPS_STATS",
        target_id="SECURE_ZIP_EXPORT",
        changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} securely generated AES-256 encrypted archive for Disruptive OPS Statistics."
    )

    return StreamingResponse(
        zip_stream,
        media_type="application/zip",
        headers={
            'Content-Disposition': f'attachment; filename="{zip_filename}"',
            'Access-Control-Expose-Headers': 'Content-Disposition'
        }
    )

@router.post("/stats")
def create_stat(data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
    if not StatsModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        data.pop('sn', None); data.pop('id', None)
        valid_cols = [c.key for c in StatsModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}
        new_record = StatsModel(**safe_data)
        db.add(new_record); db.commit(); db.refresh(new_record)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="CREATE",
            module="DISRUPTIVE_OPS_STATS",
            target_id=str(new_record.id),
            changes_summary=f"{current_user.fnum} created Disruptive Ops Statistics record ID {new_record.id}."
        )

        return clean_model_dict(new_record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))

@router.put("/stats/{record_id}")
def update_stat(record_id: int, data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'OperationalStats', 'operational_stats', 'Stats', 'stats')
    if not StatsModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        record = db.query(StatsModel).filter(StatsModel.id == record_id).first()
        if not record: raise HTTPException(status_code=404, detail="Record not found.")
        data.pop('id', None); data.pop('sn', None)
        for key, value in data.items():
            if hasattr(record, key): setattr(record, key, value)
        db.commit(); db.refresh(record)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="DISRUPTIVE_OPS_STATS",
            target_id=str(record_id),
            changes_summary=f"{current_user.fnum} updated Disruptive Ops Statistics record ID {record_id}."
        )

        return clean_model_dict(record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 2. AGRICULTURAL CRIME STATS (8-FIELD NUMERICS)
# ==========================================
@router.get("/agric-stats")
def get_agric_stats(
    region: Optional[str] = Query(default=None), station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None), end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None), limit: int = Query(default=300),
    db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)
):
    AgricStatsModel = get_model_safe('AgricStats', 'agric_stats', 'Agric_Stats')
    if not AgricStatsModel: return []
    query = db.query(AgricStatsModel)
    query = apply_opsec_scope(current_user, query, AgricStatsModel)
    query = build_filtered_query(query, AgricStatsModel, region, station, start_date, end_date, search)
    records = query.order_by(AgricStatsModel.id.desc()).limit(limit).all()
    return [clean_model_dict(r) for r in records]

@router.get("/agric-stats/export")
def export_agric_stats_csv(
    region: Optional[str] = Query(default=None), station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None), end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None), db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)
):
    AgricStatsModel = get_model_safe('AgricStats', 'agric_stats', 'Agric_Stats')
    if not AgricStatsModel: raise HTTPException(status_code=500, detail="Model not found")

    query = db.query(AgricStatsModel)
    query = apply_opsec_scope(current_user, query, AgricStatsModel)
    query = build_filtered_query(query, AgricStatsModel, region, station, start_date, end_date, search)
    records = query.order_by(AgricStatsModel.id.desc()).all()

    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["ID", "Date", "Region", "Station", "Arrested", "Given Bond", "Cautioned", "Pending Court", "Taken to Court", "Released by Court", "Remanded", "Convicted"])

    for r in records:
        writer.writerow([
            getattr(r, 'id', ''), getattr(r, 'date', ''), getattr(r, 'region', ''), getattr(r, 'station', ''),
            getattr(r, 'arrested', 0), getattr(r, 'given_bond', 0), getattr(r, 'cautioned', 0),
            getattr(r, 'pending_court', 0), getattr(r, 'taken_to_court', 0), getattr(r, 'released', 0),
            getattr(r, 'remanded', 0), getattr(r, 'convicted', 0)
        ])

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="EXPORT",
        module="AGRIC_STATS",
        target_id="CSV_EXPORT",
        changes_summary=f"{current_user.fnum} exported Agricultural Statistics CSV report."
    )

    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    timestamp = datetime.now().strftime("%Y-%m-%d")
    response.headers["Content-Disposition"] = f"attachment; filename=KMP_AGRIC_STATS_{timestamp}.csv"
    return response

@router.post("/agric-stats")
def create_agric_stat(data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    AgricStatsModel = get_model_safe('AgricStats', 'agric_stats', 'Agric_Stats')
    if not AgricStatsModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        data.pop('sn', None); data.pop('id', None)
        valid_cols = [c.key for c in AgricStatsModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}
        new_record = AgricStatsModel(**safe_data)
        db.add(new_record); db.commit(); db.refresh(new_record)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="CREATE",
            module="AGRIC_STATS",
            target_id=str(new_record.id),
            changes_summary=f"{current_user.fnum} created Agricultural Statistics record ID {new_record.id}."
        )

        return clean_model_dict(new_record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))

@router.put("/agric-stats/{record_id}")
def update_agric_stat(record_id: int, data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    AgricStatsModel = get_model_safe('AgricStats', 'agric_stats', 'Agric_Stats')
    if not AgricStatsModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        record = db.query(AgricStatsModel).filter(AgricStatsModel.id == record_id).first()
        if not record: raise HTTPException(status_code=404, detail="Record not found.")
        data.pop('id', None); data.pop('sn', None)
        for key, value in data.items():
            if hasattr(record, key): setattr(record, key, value)
        db.commit(); db.refresh(record)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="AGRIC_STATS",
            target_id=str(record_id),
            changes_summary=f"{current_user.fnum} updated Agricultural Statistics record ID {record_id}."
        )

        return clean_model_dict(record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 3. AGRICULTURAL SUMMARY LEDGER ENDPOINTS
# ==========================================
@router.get("/agric-summary")
def get_agric_summary(
    region: Optional[str] = Query(default=None), station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None), end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None), limit: int = Query(default=300),
    db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)
):
    SummaryModel = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary', 'agricultural_crime_summary')
    if not SummaryModel: return []
    query = db.query(SummaryModel)
    query = apply_opsec_scope(current_user, query, SummaryModel)
    query = build_filtered_query(query, SummaryModel, region, station, start_date, end_date, search)
    records = query.order_by(SummaryModel.id.desc()).limit(limit).all()
    return [clean_model_dict(r) for r in records]

@router.get("/agric-summary/export")
def export_agric_summary_csv(
    region: Optional[str] = Query(default=None), station: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None), end_date: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None), db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)
):
    SummaryModel = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary', 'agricultural_crime_summary')
    if not SummaryModel: raise HTTPException(status_code=500, detail="Model not found")

    query = db.query(SummaryModel)
    query = apply_opsec_scope(current_user, query, SummaryModel)
    query = build_filtered_query(query, SummaryModel, region, station, start_date, end_date, search)
    records = query.order_by(SummaryModel.id.desc()).all()

    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["ID", "Date", "Region", "Station", "Agricultural Crime Report", "Count / Numbers", "Recoveries", "Status", "Last Updated By"])

    for r in records:
        writer.writerow([
            getattr(r, 'id', ''), getattr(r, 'date', ''), getattr(r, 'region', ''), getattr(r, 'station', ''),
            getattr(r, 'agric_crime_report', ''), getattr(r, 'number_count', 0), getattr(r, 'recoveries', 0),
            getattr(r, 'status', ''), getattr(r, 'last_updated_by', '')
        ])

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="EXPORT",
        module="AGRIC_SUMMARY",
        target_id="CSV_EXPORT",
        changes_summary=f"{current_user.fnum} exported Agricultural Crime Summary CSV report."
    )

    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    timestamp = datetime.now().strftime("%Y-%m-%d")
    response.headers["Content-Disposition"] = f"attachment; filename=KMP_AGRIC_CRIME_SUMMARY_{timestamp}.csv"
    return response

@router.post("/agric-summary")
def create_agric_summary(data: dict, db: Session = Depends(get_db), logs_db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    SummaryModel = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary', 'agricultural_crime_summary')
    if not SummaryModel: raise HTTPException(status_code=500, detail="Model not configured.")
    try:
        data.pop('sn', None); data.pop('id', None)
        valid_cols = [c.key for c in SummaryModel.__table__.columns]
        safe_data = {k: v for k, v in data.items() if k in valid_cols}
        new_record = SummaryModel(**safe_data)
        db.add(new_record); db.commit(); db.refresh(new_record)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="CREATE",
            module="AGRIC_SUMMARY",
            target_id=str(new_record.id),
            changes_summary=f"{current_user.fnum} created Agricultural Crime Summary record ID {new_record.id}."
        )

        return clean_model_dict(new_record)
    except Exception as e:
        db.rollback(); logs_db.rollback(); raise HTTPException(status_code=500, detail=str(e))