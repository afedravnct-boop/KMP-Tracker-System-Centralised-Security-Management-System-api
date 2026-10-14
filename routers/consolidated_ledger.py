import io
import json
import re
from datetime import datetime, date, timedelta
from typing import Optional, List, Union
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Query
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
        crime_model = get_model_safe('CrimeIncident', 'Crime_Incident', 'Crime_Reports', 'CrimeReports', 'reports')
        stats_model = get_model_safe('OperationalStats', 'Operational_Stats', 'Operational_Statistics', 'operational_stats', 'stats')
        stories_model = get_model_safe('SuccessStories', 'Success_Stories', 'stories')
        agric_model = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary')

        today = date.today()
        default_start = today - timedelta(days=6)
        
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else default_start
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else today
        except ValueError:
            start_dt = default_start
            end_dt = today

        region_order = ["KMP NORTH", "KMP EAST", "KMP SOUTH", "KMP HEADQUARTERS", "POLICE HEADQUARTERS"]
        def sort_regions(regions):
            return sorted(regions, key=lambda x: region_order.index(x) if x in region_order else 999)

        # ==========================================
        # 1. DATABASE-LEVEL AGGREGATION: CRIMES
        # ==========================================
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

            # Apply DB-level filters if specific region/station are chosen
            if region != "ALL REGIONS":
                query = query.filter(crime_model.region == region)
            if station != "ALL STATIONS":
                query = query.filter(crime_model.station == station)

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

        # ==========================================
        # 2. DATABASE-LEVEL AGGREGATION: AGRICULTURAL CRIMES
        # ==========================================
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

            if region != "ALL REGIONS":
                ag_query = ag_query.filter(agric_model.region == region)
            if station != "ALL STATIONS":
                ag_query = ag_query.filter(agric_model.station == station)

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

        # ==========================================
        # 3. DATABASE-LEVEL AGGREGATION: OPS STATS
        # ==========================================
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

            if region != "ALL REGIONS":
                stats_query = stats_query.filter(stats_model.region == region)
            if station != "ALL STATIONS":
                stats_query = stats_query.filter(stats_model.station == station)

            stats_rows = stats_query.group_by(stats_model.region, stats_model.station).all()

            for row in stats_rows:
                stn = clean_str(row.station)
                reg = get_official_region_for_station(stn, row.region)

                if reg not in ops_regional:
                    ops_regional[reg] = {k: 0 for k in ops_general.keys()}

                for key in ops_general.keys():
                    val = int(getattr(row, key, 0) or 0)
                    ops_regional[reg][key] += val
                    ops_general[key] += val

        # ==========================================
        # 4. DATABASE-LEVEL AGGREGATION: STORIES
        # ==========================================
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

            if region != "ALL REGIONS":
                story_query = story_query.filter(stories_model.region == region)
            if station != "ALL STATIONS":
                story_query = story_query.filter(stories_model.station == station)

            story_rows = story_query.group_by(stories_model.region, stories_model.station).all()

            for row in story_rows:
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
            changes_summary=f"{current_user.fnum} {current_user.rank} compiled consolidated ledger ({start_dt} to {end_dt})."
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