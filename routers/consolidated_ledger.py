import io
import json
import re
from datetime import datetime, date, timedelta
from typing import Optional, List, Union
from urllib.parse import unquote

import openpyxl
from openpyxl.styles import Alignment, PatternFill, Font, Border, Side
import pyzipper

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, text

from app import models, schemas
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1", tags=["Consolidated Ledger"])

def clean_str(val) -> str:
    if not val: return ''
    return str(val).strip().upper()

def normalize_region_name(region_str) -> str:
    if not region_str: return "KMP HEADQUARTERS"
    r = clean_str(region_str)
    if r in ["KMPN", "KMP/N", "KMP NORTH"]: return "KMP NORTH"
    if r in ["KMPS", "KMP/S", "KMP SOUTH"]: return "KMP SOUTH"
    if r in ["KMPE", "KMP/E", "KMP EAST"]: return "KMP EAST"
    if r in ["KMP HQ", "KMP HEADQUARTERS"]: return "KMP HEADQUARTERS"
    if r in ["POLICE HQ", "POLICE HEADQUARTERS", "NAGURU"]: return "POLICE HEADQUARTERS"
    return r

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

def normalize_station_name(station_str) -> str:
    if not station_str: return "UNKNOWN"
    val = clean_str(station_str)
    if val in ["OLD KLA", "OK", "OLD K", "O/K", "OLD KAMPALA DIVISION", "OLD KAMPALA"]:
        return "OLD KAMPALA"
    val = val.replace(" POLICE STATION", "").replace(" POL STN", "").replace(" P/STN", "").replace(" DIVISION", "")
    if val.endswith(" P") and len(val) > 2:  
        val = val[:-2].strip()
    return val

def is_station_equivalent(stat_a, stat_b) -> bool:
    a = clean_str(stat_a)
    b = clean_str(stat_b)
    if not a or not b: return False
    if a == b: return True
    clean_a = re.sub(r'(\s+HEADQUARTERS|\s+HQ)$', '', a)
    clean_b = re.sub(r'(\s+HEADQUARTERS|\s+HQ)$', '', b)
    return clean_a == clean_b and len(clean_a) > 0

def get_official_region_for_station(station_name: str, db_region: Optional[str] = None) -> str:
    clean_station = normalize_station_name(station_name)
    clean_db_region = normalize_region_name(db_region)

    for region_name, stations_list in REGIONAL_HIERARCHY.items():
        norm_stations = [normalize_station_name(s) for s in stations_list]
        if clean_station in norm_stations or clean_db_region in norm_stations:
            return region_name

    if REGIONAL_HIERARCHY.get(clean_db_region) and clean_station in REGIONAL_HIERARCHY[clean_db_region]:
        return clean_db_region

    for region_name, stations_list in REGIONAL_HIERARCHY.items():
        if clean_station in stations_list or any(is_station_equivalent(s, clean_station) for s in stations_list):
            return region_name

    return clean_db_region if clean_db_region in REGIONAL_HIERARCHY else (clean_db_region or 'KMP GENERAL')

def get_ledger_aggregated_data(db: Session, start_dt: date, end_dt: date, filter_region: str, filter_station: str):
    region_order = ["KMP NORTH", "KMP EAST", "KMP SOUTH", "KMP HEADQUARTERS", "POLICE HEADQUARTERS"]
    start_str = str(start_dt)
    end_str = str(end_dt) + " 23:59:59"

    crime_regional, crime_general = {}, {}
    crime_regional_totals = {}
    grand_crime_cases, grand_crime_suspects = 0, 0
    ops_regional = {}
    ops_general = {k: 0 for k in ['arrested', 'given_bond', 'cautioned', 'pending_court', 'taken_to_court', 'released', 'remanded', 'convicted']}
    story_regional = {}
    grand_stories = 0

    station_cache = {}
    def fast_get_region(stn_str, db_reg_str):
        key = f"{stn_str}_{db_reg_str}"
        if key not in station_cache:
            station_cache[key] = get_official_region_for_station(stn_str, db_reg_str)
        return station_cache[key]

    # --- 1. CRIME REPORTS ---
    try:
        crime_sql = """
            SELECT region, station, COALESCE(NULLIF(TRIM(offence), ''), NULLIF(TRIM(category), ''), 'UNSPECIFIED') as offence_col, 
                   COUNT(id) as cases, SUM(COALESCE(suspects, 0)) as suspects
            FROM crime_reports
            WHERE date >= :start AND date <= :end
            GROUP BY region, station, offence_col
        """
        crime_rows = db.execute(text(crime_sql), {"start": start_str, "end": end_str}).fetchall()
        for row in crime_rows:
            stn = clean_str(row[1])
            reg = fast_get_region(stn, row[0])

            if filter_region and filter_region != "ALL REGIONS" and reg != filter_region: continue
            if filter_station and filter_station != "ALL STATIONS" and not is_station_equivalent(stn, filter_station): continue

            off = clean_str(row[2])
            cases = int(row[3] or 0)
            suspects = int(row[4] or 0)

            if reg not in crime_regional: crime_regional[reg] = {}
            if off not in crime_regional[reg]: crime_regional[reg][off] = {"cases": 0, "suspects": 0}
            crime_regional[reg][off]["cases"] += cases
            crime_regional[reg][off]["suspects"] += suspects

            if reg not in crime_regional_totals: crime_regional_totals[reg] = {"cases": 0, "suspects": 0}
            crime_regional_totals[reg]["cases"] += cases
            crime_regional_totals[reg]["suspects"] += suspects

            if off not in crime_general: crime_general[off] = {"cases": 0, "suspects": 0}
            crime_general[off]["cases"] += cases
            crime_general[off]["suspects"] += suspects

            grand_crime_cases += cases
            grand_crime_suspects += suspects
    except Exception as e:
        print(f"CRITICAL ERROR in crime_reports query: {e}")

    # --- 2. OPERATIONAL STATISTICS ---
    try:
        stats_sql = """
            SELECT region, station, 
                   SUM(COALESCE(arrested, 0)), SUM(COALESCE(given_bond, 0)), 
                   SUM(COALESCE(cautioned, 0)), SUM(COALESCE(pending_court, 0)), 
                   SUM(COALESCE(taken_to_court, 0)), SUM(COALESCE(released, 0)), 
                   SUM(COALESCE(remanded, 0)), SUM(COALESCE(convicted, 0))
            FROM operational_statistics
            WHERE date >= :start AND date <= :end
            GROUP BY region, station
        """
        stats_rows = db.execute(text(stats_sql), {"start": start_str, "end": end_str}).fetchall()
        for row in stats_rows:
            stn = clean_str(row[1])
            reg = fast_get_region(stn, row[0])

            if filter_region and filter_region != "ALL REGIONS" and reg != filter_region: continue
            if filter_station and filter_station != "ALL STATIONS" and not is_station_equivalent(stn, filter_station): continue

            if reg not in ops_regional: 
                ops_regional[reg] = {k: 0 for k in ops_general.keys()}
            
            vals = [row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9]]
            keys = list(ops_general.keys())
            for idx, key in enumerate(keys):
                val = int(vals[idx] or 0)
                ops_regional[reg][key] += val
                ops_general[key] += val
    except Exception as e:
        print(f"CRITICAL ERROR in operational_statistics query: {e}")

    # --- 3. SUCCESS STORIES ---
    try:
        story_sql = """
            SELECT region, station, COUNT(sn) as story_count
            FROM success_stories
            WHERE date >= :start AND date <= :end
            GROUP BY region, station
        """
        story_rows = db.execute(text(story_sql), {"start": start_str, "end": end_str}).fetchall()
        for row in story_rows:
            stn = clean_str(row[1])
            reg = fast_get_region(stn, row[0])

            if filter_region and filter_region != "ALL REGIONS" and reg != filter_region: continue
            if filter_station and filter_station != "ALL STATIONS" and not is_station_equivalent(stn, filter_station): continue

            count = int(row[2] or 0)
            story_regional[reg] = story_regional.get(reg, 0) + count
            grand_stories += count
    except Exception as e:
        print(f"CRITICAL ERROR in success_stories query: {e}")

    for reg in region_order:
        if reg not in crime_regional: crime_regional[reg] = {}
        if reg not in crime_regional_totals: crime_regional_totals[reg] = {"cases": 0, "suspects": 0}
        if reg not in ops_regional: ops_regional[reg] = {k: 0 for k in ops_general.keys()}
        if reg not in story_regional: story_regional[reg] = 0

    return {
        "crimeRegional": crime_regional,
        "crimeRegionalTotals": crime_regional_totals,
        "crimeGeneral": crime_general,
        "sortedCrimeRegions": region_order,
        "grandCrimeCases": grand_crime_cases,
        "grandCrimeSuspects": grand_crime_suspects,
        "opsRegional": ops_regional,
        "opsGeneral": ops_general,
        "sortedOpsRegions": region_order,
        "storyRegional": story_regional,
        "sortedStoryRegions": region_order,
        "grandStories": grand_stories
    }

@router.get("/reports/consolidated-ledger")
def get_consolidated_ledger(
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    region: Optional[str] = Query("ALL REGIONS"),
    station: Optional[str] = Query("ALL STATIONS"),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        today = date.today()
        default_start = today - timedelta(days=6)
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else default_start
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else today
        except ValueError:
            start_dt = default_start
            end_dt = today

        data = get_ledger_aggregated_data(db, start_dt, end_dt, region, station)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="VIEW",
            module="CONSOLIDATED_LEDGER",
            target_id="MASTER_SUMMARY",
            changes_summary=f"{current_user.fnum} {current_user.rank} compiled consolidated ledger ({start_dt} to {end_dt})."
        )

        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Consolidated Ledger Data Fetch Failed: {str(e)}")

@router.get("/reports/consolidated-ledger/export")
def export_consolidated_ledger(
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    region: Optional[str] = Query("ALL REGIONS"),
    station: Optional[str] = Query("ALL STATIONS"),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        today = date.today()
        default_start = today - timedelta(days=6)
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else default_start
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else today
        except ValueError:
            start_dt = default_start
            end_dt = today

        data = get_ledger_aggregated_data(db, start_dt, end_dt, region, station)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Consolidated Ledger"
        ws.views.sheetView[0].showGridLines = True

        wb.properties.creator = f"{current_user.rank} {current_user.name} (FNUM: {current_user.fnum})"
        wb.properties.title = "KMP Consolidated Master Ledger"
        wb.properties.subject = f"Jurisdiction: {region} / {station} ({start_dt} to {end_dt})"
        wb.properties.company = "Uganda Police Force - Kampala Metropolitan Police"

        thin_border = Border(
            left=Side(style='thin', color='A6A6A6'),
            right=Side(style='thin', color='A6A6A6'),
            top=Side(style='thin', color='A6A6A6'),
            bottom=Side(style='thin', color='A6A6A6')
        )

        row_idx = 1

        # --- SECTION 1: CRIMES & AGRICULTURAL THEFTS ---
        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=5)
        cell = ws.cell(row=row_idx, column=1, value=f"SUMMARY OF CRIMES & AGRICULTURAL THEFTS REGISTERED FROM {start_dt.strftime('%d %b %Y').upper()} TO {end_dt.strftime('%d %b %Y').upper()}")
        cell.fill = PatternFill(start_color="B4C6E7", end_color="B4C6E7", fill_type="solid")
        cell.font = Font(bold=True, size=11, color="000000")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        row_idx += 1

        headers_s1 = ["REGION", "NO", "OFFENCE / PRODUCE THEFT", "NUMBER OF CASES / QTY", "SUSPECTS IN CUSTODY"]
        for col_num, h in enumerate(headers_s1, 1):
            c = ws.cell(row=row_idx, column=col_num, value=h)
            c.fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
            c.font = Font(bold=True, size=10)
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.border = thin_border
        row_idx += 1

        romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv']
        for reg in data["sortedCrimeRegions"]:
            offences = list(data["crimeRegional"][reg].keys())
            reg_cases, reg_suspects = 0, 0

            if not offences:
                ws.cell(row=row_idx, column=1, value=reg).border = thin_border
                ws.cell(row=row_idx, column=2, value="-").border = thin_border
                ws.cell(row=row_idx, column=3, value="NO RECORDS").border = thin_border
                ws.cell(row=row_idx, column=4, value=0).border = thin_border
                ws.cell(row=row_idx, column=5, value=0).border = thin_border
                row_idx += 1
            else:
                for idx, off in enumerate(offences):
                    item = data["crimeRegional"][reg][off]
                    reg_cases += item["cases"]
                    reg_suspects += item["suspects"]

                    ws.cell(row=row_idx, column=1, value=reg if idx == 0 else "").border = thin_border
                    ws.cell(row=row_idx, column=2, value=f"{romans[idx]}." if idx < len(romans) else f"{idx+1}.").alignment = Alignment(horizontal="center")
                    ws.cell(row=row_idx, column=2).border = thin_border
                    
                    c_off = ws.cell(row=row_idx, column=3, value=off)
                    c_off.alignment = Alignment(horizontal="left")
                    c_off.border = thin_border

                    c_cases = ws.cell(row=row_idx, column=4, value=item["cases"])
                    c_cases.alignment = Alignment(horizontal="center")
                    c_cases.border = thin_border

                    c_susp = ws.cell(row=row_idx, column=5, value=item["suspects"])
                    c_susp.alignment = Alignment(horizontal="center")
                    c_susp.border = thin_border
                    row_idx += 1

            ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=3)
            sub_lbl = ws.cell(row=row_idx, column=1, value="SUB-TOTAL")
            sub_lbl.alignment = Alignment(horizontal="left", indent=2)
            sub_lbl.font = Font(bold=True)
            for c_i in range(1, 4): ws.cell(row=row_idx, column=c_i).border = thin_border

            c_sub_c = ws.cell(row=row_idx, column=4, value=reg_cases)
            c_sub_c.font = Font(bold=True)
            c_sub_c.alignment = Alignment(horizontal="center")
            c_sub_c.border = thin_border

            c_sub_s = ws.cell(row=row_idx, column=5, value=reg_suspects)
            c_sub_s.font = Font(bold=True)
            c_sub_s.alignment = Alignment(horizontal="center")
            c_sub_s.border = thin_border
            for c_i in range(1, 6): ws.cell(row=row_idx, column=c_i).fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
            row_idx += 2

        # --- SECTION 2: GENERAL CRIME & AGGREGATE SUMMARY ---
        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=4)
        cell = ws.cell(row=row_idx, column=1, value="GENERAL CRIME & AGRICULTURAL PRODUCE SUMMARY")
        cell.fill = PatternFill(start_color="C6E0B4", end_color="C6E0B4", fill_type="solid")
        cell.font = Font(bold=True, size=11)
        cell.alignment = Alignment(horizontal="center", vertical="center")
        row_idx += 1

        headers_s2 = ["NO", "OFFENCES / AGRICULTURAL THEFTS", "TOTAL CASES / QTY", "SUSPECTS IN CUSTODY"]
        for col_num, h in enumerate(headers_s2, 1):
            c = ws.cell(row=row_idx, column=col_num, value=h)
            c.fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
            c.font = Font(bold=True, size=10)
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = thin_border
        row_idx += 1

        if data["crimeGeneral"]:
            for idx, (off, item) in enumerate(data["crimeGeneral"].items(), 1):
                ws.cell(row=row_idx, column=1, value=idx).alignment = Alignment(horizontal="center")
                ws.cell(row=row_idx, column=1).border = thin_border
                ws.cell(row=row_idx, column=2, value=off).border = thin_border
                ws.cell(row=row_idx, column=3, value=item["cases"]).alignment = Alignment(horizontal="center")
                ws.cell(row=row_idx, column=3).border = thin_border
                ws.cell(row=row_idx, column=4, value=item["suspects"]).alignment = Alignment(horizontal="center")
                ws.cell(row=row_idx, column=4).border = thin_border
                row_idx += 1
        else:
            ws.cell(row=row_idx, column=1, value=1).border = thin_border
            ws.cell(row=row_idx, column=2, value="NO GENERAL CRIMES RECORDED").border = thin_border
            ws.cell(row=row_idx, column=3, value=0).border = thin_border
            ws.cell(row=row_idx, column=4, value=0).border = thin_border
            row_idx += 1

        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=2)
        gt_lbl = ws.cell(row=row_idx, column=1, value="GRAND TOTAL")
        gt_lbl.font = Font(bold=True)
        for c_i in range(1, 3): ws.cell(row=row_idx, column=c_i).border = thin_border

        gt_c = ws.cell(row=row_idx, column=3, value=data["grandCrimeCases"])
        gt_c.font = Font(bold=True)
        gt_c.alignment = Alignment(horizontal="center")
        gt_c.border = thin_border

        gt_s = ws.cell(row=row_idx, column=4, value=data["grandCrimeSuspects"])
        gt_s.font = Font(bold=True)
        gt_s.alignment = Alignment(horizontal="center")
        gt_s.border = thin_border
        for c_i in range(1, 5): ws.cell(row=row_idx, column=c_i).fill = PatternFill(start_color="A9D08E", end_color="A9D08E", fill_type="solid")
        row_idx += 2

        # --- SECTION 3: DISRUPTIVE OPERATIONS ---
        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=9)
        cell = ws.cell(row=row_idx, column=1, value=f"SUMMARY OF DISRUPTIVE OPERATIONS FROM {start_dt.strftime('%d %b %Y').upper()} TO {end_dt.strftime('%d %b %Y').upper()}")
        cell.fill = PatternFill(start_color="FFD966", end_color="FFD966", fill_type="solid")
        cell.font = Font(bold=True, size=11)
        cell.alignment = Alignment(horizontal="center", vertical="center")
        row_idx += 1

        headers_ops = ["REGION", "ARRESTED", "GIVEN BOND", "CAUTIONED", "PENDING COURT", "TAKEN TO COURT", "RELEASED", "REMANDED", "CONVICTED"]
        for col_num, h in enumerate(headers_ops, 1):
            c = ws.cell(row=row_idx, column=col_num, value=h)
            c.fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
            c.font = Font(bold=True, size=9)
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.border = thin_border
        row_idx += 1

        for reg in data["sortedOpsRegions"]:
            item = data["opsRegional"][reg]
            ws.cell(row=row_idx, column=1, value=reg).border = thin_border
            vals = [item["arrested"], item["given_bond"], item["cautioned"], item["pending_court"], item["taken_to_court"], item["released"], item["remanded"], item["convicted"]]
            for c_idx, val in enumerate(vals, 2):
                c = ws.cell(row=row_idx, column=c_idx, value=val)
                c.alignment = Alignment(horizontal="center")
                c.border = thin_border
            row_idx += 1

        ws.cell(row=row_idx, column=1, value="SELECTED JURISDICTION").font = Font(bold=True)
        ws.cell(row=row_idx, column=1).border = thin_border
        gen_vals = [data["opsGeneral"]["arrested"], data["opsGeneral"]["given_bond"], data["opsGeneral"]["cautioned"], data["opsGeneral"]["pending_court"], data["opsGeneral"]["taken_to_court"], data["opsGeneral"]["released"], data["opsGeneral"]["remanded"], data["opsGeneral"]["convicted"]]
        for c_idx, val in enumerate(gen_vals, 2):
            c = ws.cell(row=row_idx, column=c_idx, value=val)
            c.font = Font(bold=True)
            c.alignment = Alignment(horizontal="center")
            c.border = thin_border
        for c_i in range(1, 10): ws.cell(row=row_idx, column=c_i).fill = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")
        row_idx += 2

        # --- SECTION 4: SUCCESS STORIES ---
        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=3)
        cell = ws.cell(row=row_idx, column=1, value=f"SUMMARY OF SUCCESSFUL OPERATIONS & MILESTONES FROM {start_dt.strftime('%d %b %Y').upper()} TO {end_dt.strftime('%d %b %Y').upper()}")
        cell.fill = PatternFill(start_color="FFE699", end_color="FFE699", fill_type="solid")
        cell.font = Font(bold=True, size=11)
        cell.alignment = Alignment(horizontal="center", vertical="center")
        row_idx += 1

        headers_story = ["NO", "REGION", "TOTAL SUCCESS STORIES LOGGED"]
        for col_num, h in enumerate(headers_story, 1):
            c = ws.cell(row=row_idx, column=col_num, value=h)
            c.fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
            c.font = Font(bold=True, size=10)
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = thin_border
        row_idx += 1

        for idx, reg in enumerate(data["sortedStoryRegions"], 1):
            ws.cell(row=row_idx, column=1, value=idx).alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=1).border = thin_border
            ws.cell(row=row_idx, column=2, value=reg).border = thin_border
            ws.cell(row=row_idx, column=3, value=data["storyRegional"][reg]).alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=3).border = thin_border
            row_idx += 1

        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=2)
        st_lbl = ws.cell(row=row_idx, column=1, value="GRAND TOTAL MILESTONES")
        st_lbl.font = Font(bold=True)
        st_lbl.alignment = Alignment(horizontal="right")
        for c_i in range(1, 3): ws.cell(row=row_idx, column=c_i).border = thin_border

        st_v = ws.cell(row=row_idx, column=3, value=data["grandStories"])
        st_v.font = Font(bold=True)
        st_v.alignment = Alignment(horizontal="center")
        st_v.border = thin_border
        for c_i in range(1, 4): ws.cell(row=row_idx, column=c_i).fill = PatternFill(start_color="FFD966", end_color="FFD966", fill_type="solid")

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 15)

        excel_buffer = io.BytesIO()
        wb.save(excel_buffer)
        excel_buffer.seek(0)

        password_str = str(current_user.fnum).strip()
        zip_buffer = io.BytesIO()

        with pyzipper.AESZipFile(zip_buffer, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(password_str.encode('utf-8'))
            zf.writestr(f"KMP_Consolidated_Ledger_{start_dt}_{end_dt}.xlsx", excel_buffer.getvalue())

        zip_buffer.seek(0)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="EXPORT",
            module="CONSOLIDATED_LEDGER",
            target_id="MASTER_SUMMARY_ZIP",
            changes_summary=f"{current_user.fnum} {current_user.rank} exported encrypted consolidated ledger ({start_dt} to {end_dt})."
        )

        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=KMP_Consolidated_Ledger_{start_dt}_{end_dt}.zip"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Consolidated Ledger Export Failed: {str(e)}")