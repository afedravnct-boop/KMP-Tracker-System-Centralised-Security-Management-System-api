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
from sqlalchemy import func, or_, and_

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

def is_station_equivalent(stat_a, stat_b) -> bool:
    a = clean_str(stat_a)
    b = clean_str(stat_b)
    if not a or not b: return False
    if a == b: return True
    clean_a = re.sub(r'(\s+HEADQUARTERS|\s+HQ)$', '', a)
    clean_b = re.sub(r'(\s+HEADQUARTERS|\s+HQ)$', '', b)
    return clean_a == clean_b and len(clean_a) > 0

def get_official_region_for_station(station_name: str, db_region: Optional[str] = None) -> str:
    clean_station = clean_str(station_name)
    clean_db_region = normalize_region_name(db_region)

    if REGIONAL_HIERARCHY.get(clean_db_region) and clean_station in REGIONAL_HIERARCHY[clean_db_region]:
        return clean_db_region

    for region_name, stations_list in REGIONAL_HIERARCHY.items():
        if clean_station in stations_list or any(is_station_equivalent(s, clean_station) for s in stations_list):
            return region_name

    return clean_db_region or 'KMP GENERAL'

def get_model_safe(*names):
    for name in names:
        if hasattr(models, name):
            return getattr(models, name)
    return None

def get_ledger_aggregated_data(db: Session, start_dt: date, end_dt: date, region: str, station: str):
    crime_model = get_model_safe('CrimeIncident', 'Crime_Incident', 'Crime_Reports', 'CrimeReports', 'reports')
    stats_model = get_model_safe('OperationalStats', 'Operational_Stats', 'Operational_Statistics', 'operational_stats', 'stats')
    stories_model = get_model_safe('SuccessStories', 'Success_Stories', 'stories')
    agric_model = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary')

    region_order = ["KMP NORTH", "KMP EAST", "KMP SOUTH", "KMP HEADQUARTERS", "POLICE HEADQUARTERS"]
    def sort_regions(regions):
        return sorted(regions, key=lambda x: region_order.index(x) if x in region_order else 999)

    crime_regional, crime_general = {}, {}
    grand_crime_cases, grand_crime_suspects = 0, 0

    if crime_model:
        query = db.query(
            crime_model.region,
            crime_model.station,
            crime_model.offence,
            func.count(crime_model.id).label('cases'),
            func.sum(func.coalesce(crime_model.suspects, 0)).label('suspects')
        ).filter(
            crime_model.date >= str(start_dt),
            crime_model.date <= str(end_dt)
        )
        if region != "ALL REGIONS": query = query.filter(crime_model.region == region)
        if station != "ALL STATIONS": query = query.filter(crime_model.station == station)

        crime_rows = query.group_by(crime_model.region, crime_model.station, crime_model.offence).all()
        for row in crime_rows:
            stn = clean_str(row.station)
            reg = get_official_region_for_station(stn, row.region)
            off = clean_str(row.offence) or 'UNSPECIFIED INCIDENT'
            cases = int(row.cases or 0)
            suspects = int(row.suspects or 0)

            if reg not in crime_regional: crime_regional[reg] = {}
            if off not in crime_regional[reg]: crime_regional[reg][off] = {"cases": 0, "suspects": 0}
            crime_regional[reg][off]["cases"] += cases
            crime_regional[reg][off]["suspects"] += suspects

            if off not in crime_general: crime_general[off] = {"cases": 0, "suspects": 0}
            crime_general[off]["cases"] += cases
            crime_general[off]["suspects"] += suspects

            grand_crime_cases += cases
            grand_crime_suspects += suspects

    if agric_model:
        ag_query = db.query(
            agric_model.region,
            agric_model.station,
            agric_model.agric_crime_report,
            func.sum(func.coalesce(agric_model.number_count, 0)).label('total_count')
        ).filter(
            agric_model.date >= str(start_dt),
            agric_model.date <= str(end_dt)
        )
        if region != "ALL REGIONS": ag_query = ag_query.filter(agric_model.region == region)
        if station != "ALL STATIONS": ag_query = ag_query.filter(agric_model.station == station)

        ag_rows = ag_query.group_by(agric_model.region, agric_model.station, agric_model.agric_crime_report).all()
        for row in ag_rows:
            stn = clean_str(row.station)
            reg = get_official_region_for_station(stn, row.region)
            off = (row.agric_crime_report or 'AGRICULTURAL THEFT').upper()
            count = int(row.total_count or 0)

            if reg not in crime_regional: crime_regional[reg] = {}
            if off not in crime_regional[reg]: crime_regional[reg][off] = {"cases": 0, "suspects": 0}
            crime_regional[reg][off]["cases"] += count

            if off not in crime_general: crime_general[off] = {"cases": 0, "suspects": 0}
            crime_general[off]["cases"] += count
            grand_crime_cases += count

    ops_regional = {}
    ops_general = {k: 0 for k in ['arrested', 'given_bond', 'cautioned', 'pending_court', 'taken_to_court', 'released', 'remanded', 'convicted']}

    if stats_model:
        stats_query = db.query(
            stats_model.region,
            stats_model.station,
            func.sum(func.coalesce(stats_model.arrested, 0)).label('arrested'),
            func.sum(func.coalesce(stats_model.given_bond, 0)).label('given_bond'),
            func.sum(func.coalesce(stats_model.cautioned, 0)).label('cautioned'),
            func.sum(func.coalesce(stats_model.pending_court, 0)).label('pending_court'),
            func.sum(func.coalesce(stats_model.taken_to_court, 0)).label('taken_to_court'),
            func.sum(func.coalesce(stats_model.released, 0)).label('released'),
            func.sum(func.coalesce(stats_model.remanded, 0)).label('remanded'),
            func.sum(func.coalesce(stats_model.convicted, 0)).label('convicted')
        ).filter(
            stats_model.date >= str(start_dt),
            stats_model.date <= str(end_dt)
        )
        if region != "ALL REGIONS": stats_query = stats_query.filter(stats_model.region == region)
        if station != "ALL STATIONS": stats_query = stats_query.filter(stats_model.station == station)

        stats_rows = stats_query.group_by(stats_model.region, stats_model.station).all()
        for row in stats_rows:
            stn = clean_str(row.station)
            reg = get_official_region_for_station(stn, row.region)
            if reg not in ops_regional: ops_regional[reg] = {k: 0 for k in ops_general.keys()}
            for key in ops_general.keys():
                val = int(getattr(row, key, 0) or 0)
                ops_regional[reg][key] += val
                ops_general[key] += val

    story_regional = {}
    grand_stories = 0

    if stories_model:
        story_query = db.query(
            stories_model.region,
            stories_model.station,
            func.count(stories_model.id).label('story_count')
        ).filter(
            stories_model.date >= str(start_dt),
            stories_model.date <= str(end_dt)
        )
        if region != "ALL REGIONS": story_query = story_query.filter(stories_model.region == region)
        if station != "ALL STATIONS": story_query = story_query.filter(stories_model.station == station)

        story_rows = story_query.group_by(stories_model.region, stories_model.station).all()
        for row in story_rows:
            stn = clean_str(row.station)
            reg = get_official_region_for_station(stn, row.region)
            count = int(row.story_count or 0)
            story_regional[reg] = story_regional.get(reg, 0) + count
            grand_stories += count

    return {
        "crimeRegional": crime_regional,
        "crimeGeneral": crime_general,
        "sortedCrimeRegions": sort_regions(list(crime_regional.keys())),
        "grandCrimeCases": grand_crime_cases,
        "grandCrimeSuspects": grand_crime_suspects,
        "opsRegional": ops_regional,
        "opsGeneral": ops_general,
        "sortedOpsRegions": sort_regions(list(ops_regional.keys())),
        "storyRegional": story_regional,
        "sortedStoryRegions": sort_regions(list(story_regional.keys())),
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
        default_start = today - timedelta(days=30)
        
        # Keep dates as pure YYYY-MM-DD strings for lightning-fast database matching
        start_str = start_date if start_date else str(default_start)
        end_str = end_date if end_date else str(today)

        crime_model = get_model_safe('CrimeIncident', 'Crime_Incident', 'Crime_Reports', 'CrimeReports', 'reports')
        stats_model = get_model_safe('OperationalStats', 'Operational_Stats', 'Operational_Statistics', 'operational_stats', 'stats')
        stories_model = get_model_safe('SuccessStories', 'Success_Stories', 'stories')
        agric_model = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary')

        region_order = ["KMP NORTH", "KMP EAST", "KMP SOUTH", "KMP HEADQUARTERS", "POLICE HEADQUARTERS"]
        def sort_regions(regions):
            return sorted(regions, key=lambda x: region_order.index(x) if x in region_order else 999)

        crime_regional, crime_general = {}, {}
        grand_crime_cases, grand_crime_suspects = 0, 0

        # --- CRIMES ---
        if crime_model:
            query = db.query(
                crime_model.region,
                crime_model.station,
                crime_model.offence,
                func.count(crime_model.id).label('cases'),
                func.sum(func.coalesce(crime_model.suspects, 0)).label('suspects')
            ).filter(
                crime_model.date >= start_str,
                crime_model.date <= end_str + " 23:59:59" # Captures full day even with timestamps
            )
            if region != "ALL REGIONS": query = query.filter(crime_model.region == region)
            if station != "ALL STATIONS": query = query.filter(crime_model.station == station)

            for row in query.group_by(crime_model.region, crime_model.station, crime_model.offence).all():
                stn = clean_str(row.station)
                reg = get_official_region_for_station(stn, row.region)
                off = clean_str(row.offence) or 'UNSPECIFIED INCIDENT'
                cases = int(row.cases or 0)
                suspects = int(row.suspects or 0)

                if reg not in crime_regional: crime_regional[reg] = {}
                if off not in crime_regional[reg]: crime_regional[reg][off] = {"cases": 0, "suspects": 0}
                crime_regional[reg][off]["cases"] += cases
                crime_regional[reg][off]["suspects"] += suspects

                if off not in crime_general: crime_general[off] = {"cases": 0, "suspects": 0}
                crime_general[off]["cases"] += cases
                crime_general[off]["suspects"] += suspects

                grand_crime_cases += cases
                grand_crime_suspects += suspects

        # --- AGRICULTURAL ---
        if agric_model:
            ag_query = db.query(
                agric_model.region,
                agric_model.station,
                agric_model.agric_crime_report,
                func.sum(func.coalesce(agric_model.number_count, 0)).label('total_count')
            ).filter(
                agric_model.date >= start_str,
                agric_model.date <= end_str + " 23:59:59"
            )
            if region != "ALL REGIONS": ag_query = ag_query.filter(agric_model.region == region)
            if station != "ALL STATIONS": ag_query = ag_query.filter(agric_model.station == station)

            for row in ag_query.group_by(agric_model.region, agric_model.station, agric_model.agric_crime_report).all():
                stn = clean_str(row.station)
                reg = get_official_region_for_station(stn, row.region)
                off = (row.agric_crime_report or 'AGRICULTURAL THEFT').upper()
                count = int(row.total_count or 0)

                if reg not in crime_regional: crime_regional[reg] = {}
                if off not in crime_regional[reg]: crime_regional[reg][off] = {"cases": 0, "suspects": 0}
                crime_regional[reg][off]["cases"] += count

                if off not in crime_general: crime_general[off] = {"cases": 0, "suspects": 0}
                crime_general[off]["cases"] += count
                grand_crime_cases += count

        # --- OPS STATS ---
        ops_regional = {}
        ops_general = {k: 0 for k in ['arrested', 'given_bond', 'cautioned', 'pending_court', 'taken_to_court', 'released', 'remanded', 'convicted']}

        if stats_model:
            stats_rows = db.query(stats_model).all()
            for row in stats_rows:
                # Parse database date safely regardless of string format
                r_date_str = str(row.date).split()[0] # handles timestamps if present
                try:
                    # Try parsing YYYY-MM-DD or DD/MM/YYYY
                    if '-' in r_date_str:
                        r_dt = datetime.strptime(r_date_str, "%Y-%m-%d").date()
                    else:
                        r_dt = datetime.strptime(r_date_str, "%d/%m/%Y").date()
                except ValueError:
                    continue

                if not (start_dt <= r_dt <= end_dt):
                    continue

                stn = clean_str(row.station)
                reg = get_official_region_for_station(stn, row.region)

                if region != "ALL REGIONS" and reg != region:
                    continue
                if station != "ALL STATIONS" and not is_station_equivalent(stn, station):
                    continue

                if reg not in ops_regional: 
                    ops_regional[reg] = {k: 0 for k in ops_general.keys()}
                    
                for key in ops_general.keys():
                    val = int(getattr(row, key, 0) or 0)
                    ops_regional[reg][key] += val
                    ops_general[key] += val

        # --- STORIES ---
        story_regional = {}
        grand_stories = 0

        if stories_model:
            story_query = db.query(
                stories_model.region,
                stories_model.station,
                func.count(stories_model.id).label('story_count')
            ).filter(
                stories_model.date >= start_str,
                stories_model.date <= end_str + " 23:59:59"
            )
            if region != "ALL REGIONS": story_query = story_query.filter(stories_model.region == region)
            if station != "ALL STATIONS": story_query = story_query.filter(stories_model.station == station)

            for row in story_query.group_by(stories_model.region, stories_model.station).all():
                stn = clean_str(row.station)
                reg = get_official_region_for_station(stn, row.region)
                count = int(row.story_count or 0)
                story_regional[reg] = story_regional.get(reg, 0) + count
                grand_stories += count

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="VIEW",
            module="CONSOLIDATED_LEDGER",
            target_id="MASTER_SUMMARY",
            changes_summary=f"{current_user.fnum} {current_user.rank} compiled consolidated ledger ({start_str} to {end_str})."
        )

        return {
            "status": "success",
            "data": {
                "crimeRegional": crime_regional,
                "crimeGeneral": crime_general,
                "sortedCrimeRegions": sort_regions(list(crime_regional.keys())),
                "grandCrimeCases": grand_crime_cases,
                "grandCrimeSuspects": grand_crime_suspects,
                "opsRegional": ops_regional,
                "opsGeneral": ops_general,
                "sortedOpsRegions": sort_regions(list(ops_regional.keys())),
                "storyRegional": story_regional,
                "sortedStoryRegions": sort_regions(list(story_regional.keys())),
                "grandStories": grand_stories
            }
        }
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

        # Build Excel Workbook
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Consolidated Ledger"
        ws.views.sheetView[0].showGridLines = True

        # Forensic Metadata Stamping
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
        double_bottom_border = Border(
            left=Side(style='thin', color='A6A6A6'),
            right=Side(style='thin', color='A6A6A6'),
            top=Side(style='thin', color='A6A6A6'),
            double=True
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
            reg_start_row = row_idx
            reg_cases, reg_suspects = 0, 0

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

            # Subtotal row
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
        if data["crimeGeneral"]:
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

            for idx, (off, item) in enumerate(data["crimeGeneral"].items(), 1):
                ws.cell(row=row_idx, column=1, value=idx).alignment = Alignment(horizontal="center")
                ws.cell(row=row_idx, column=1).border = thin_border
                ws.cell(row=row_idx, column=2, value=off).border = thin_border
                ws.cell(row=row_idx, column=3, value=item["cases"]).alignment = Alignment(horizontal="center")
                ws.cell(row=row_idx, column=3).border = thin_border
                ws.cell(row=row_idx, column=4, value=item["suspects"]).alignment = Alignment(horizontal="center")
                ws.cell(row=row_idx, column=4).border = thin_border
                row_idx += 1

            # Grand Total
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

        # General Ops Summary Row
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

        if data["sortedStoryRegions"]:
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

        # Auto-fit column widths
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 15)

        excel_buffer = io.BytesIO()
        wb.save(excel_buffer)
        excel_buffer.seek(0)

        # AES-256 ZIP Encryption using User's Force Number
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