import io
import json
import re
from datetime import datetime, date, timedelta
from typing import Optional, List, Union
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

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

def normalize_station_name(station_str) -> str:
    if not station_str: return "UNKNOWN"
    val = clean_str(station_str)
    if val in ["OLD KLA", "OK", "OLD K", "O/K", "OLD KAMPALA DIVISION"]:
        return "OLD KAMPALA"
    val = val.replace(" POLICE STATION", "").replace(" POL STN", "").replace(" P/STN", "").replace(" DIVISION", "")
    if val.endswith(" P") and len(val) > 2:  
        val = val[:-2].strip()
    return val

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

def is_lockup_log(item) -> bool:
    try:
        if getattr(item, 'is_hq_general_total', False): return True
        if 'HEADQUARTERS GENERAL TOTAL' in str(getattr(item, 'station', '')).upper(): return True
        lockup = getattr(item, 'daily_lock_up', None)
        offence = getattr(item, 'offence', None)
        if lockup is not None and float(lockup) > 0 and not offence: return True
        return False
    except:
        return False

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

        # Fetch basic records efficiently
        crimes = db.query(crime_model).filter(crime_model.date >= str(start_dt), crime_model.date <= str(end_dt)).all() if crime_model else []
        statistics = db.query(stats_model).filter(stats_model.date >= str(start_dt), stats_model.date <= str(end_dt)).all() if stats_model else []
        stories = db.query(stories_model).filter(stories_model.date >= str(start_dt), stories_model.date <= str(end_dt)).all() if stories_model else []
        agric = db.query(agric_model).filter(agric_model.date >= str(start_dt), agric_model.date <= str(end_dt)).all() if agric_model else []

        # --- DATA AGGREGATION ENGINE (Moved from Frontend) ---
        crime_regional, crime_general = {}, {}
        grand_crime_cases, grand_crime_suspects = 0, 0
        ops_regional = {}
        ops_general = {k: 0 for k in ['arrested', 'given_bond', 'cautioned', 'pending_court', 'taken_to_court', 'released', 'remanded', 'convicted']}
        story_regional = {}
        grand_stories = 0

        # Helper to check jurisdiction matches
        def matches_jurisdiction(stn, reg):
            if region == 'ALL REGIONS':
                pass
            elif reg == region:
                pass
            elif region in REGIONAL_HIERARCHY and any(is_station_equivalent(s, stn) for s in REGIONAL_HIERARCHY[region]):
                pass
            else:
                return False
                
            if station != 'ALL STATIONS':
                if not is_station_equivalent(stn, station):
                    return False
            return True

        # Process Crimes
        for r in crimes:
            if is_lockup_log(r): continue
            stn = clean_str(getattr(r, 'station', ''))
            reg = get_official_region_for_station(stn, getattr(r, 'region', ''))
            
            if not matches_jurisdiction(stn, reg): continue

            off = clean_str(getattr(r, 'offence', '')) or 'UNSPECIFIED INCIDENT'
            suspects = int(getattr(r, 'suspects', 0) or 0)

            if reg not in crime_regional: crime_regional[reg] = {}
            if off not in crime_regional[reg]: crime_regional[reg][off] = {"cases": 0, "suspects": 0}
            crime_regional[reg][off]["cases"] += 1
            crime_regional[reg][off]["suspects"] += suspects

            if off not in crime_general: crime_general[off] = {"cases": 0, "suspects": 0}
            crime_general[off]["cases"] += 1
            crime_general[off]["suspects"] += suspects

            grand_crime_cases += 1
            grand_crime_suspects += suspects

        # Process Agricultural Crimes
        for a in agric:
            stn = clean_str(getattr(a, 'station', ''))
            reg = get_official_region_for_station(stn, getattr(a, 'region', ''))
            
            if not matches_jurisdiction(stn, reg): continue

            off = (getattr(a, 'agric_crime_report', 'AGRICULTURAL THEFT') or 'AGRICULTURAL THEFT').upper()
            count = int(getattr(a, 'number_count', 0) or 0)

            if reg not in crime_regional: crime_regional[reg] = {}
            if off not in crime_regional[reg]: crime_regional[reg][off] = {"cases": 0, "suspects": 0}
            crime_regional[reg][off]["cases"] += count

            if off not in crime_general: crime_general[off] = {"cases": 0, "suspects": 0}
            crime_general[off]["cases"] += count
            grand_crime_cases += count

        # Process Ops Stats
        for s in statistics:
            stn = clean_str(getattr(s, 'station', ''))
            reg = get_official_region_for_station(stn, getattr(s, 'region', ''))
            if not matches_jurisdiction(stn, reg): continue

            if reg not in ops_regional:
                ops_regional[reg] = {k: 0 for k in ops_general.keys()}
            
            for key in ops_general.keys():
                val = int(getattr(s, key, 0) or 0)
                ops_regional[reg][key] += val
                ops_general[key] += val

        # Process Stories
        for st in stories:
            stn = clean_str(getattr(st, 'station', ''))
            reg = get_official_region_for_station(stn, getattr(st, 'region', ''))
            if not matches_jurisdiction(stn, reg): continue

            story_regional[reg] = story_regional.get(reg, 0) + 1
            grand_stories += 1

        # Sorting logic (matching frontend exactly)
        region_order = ["KMP NORTH", "KMP EAST", "KMP SOUTH", "KMP HEADQUARTERS", "POLICE HEADQUARTERS"]
        def sort_regions(regions):
            return sorted(regions, key=lambda x: region_order.index(x) if x in region_order else 999)

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