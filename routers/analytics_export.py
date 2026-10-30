# routers/analytics.py
import io
import json
import re
from datetime import datetime, timedelta
import pytz
import pyzipper
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text
from typing import Optional, List, Dict, Any # 🟢 FIX: CRITICAL MISSING IMPORT ADDED

from auth import get_current_user, require_export_privilege
from app.database import get_db, get_logs_db
from app import models
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics Exports & Intelligence"])

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU"]
}

# 🟢 FIX: Aggressive Safe Integer Casting for dirty database entries
def safe_int(val) -> int:
    try:
        return int(float(val)) if val else 0
    except (ValueError, TypeError):
        return 0

def get_model_safe(*model_names):
    """Safe helper to resolve database models across varying naming conventions and tablenames."""
    for name in model_names:
        if hasattr(models, name):
            return getattr(models, name)
            
    target_slug = model_names[-1].lower()
    for attr_name, cls in models.__dict__.items():
        if isinstance(cls, type) and hasattr(cls, '__tablename__'):
            if cls.__tablename__.lower() in [n.lower() for n in model_names] or cls.__tablename__.lower() == target_slug:
                return cls
    return None

def strip_html_tags(text_str: str) -> str:
    if not text_str:
        return ""
    clean_text = re.sub(r'<.*?>', ' ', str(text_str))
    clean_text = re.sub(r'(?i)&nbsp;', ' ', clean_text)
    clean_text = re.sub(r'(?i)&amp;', '&', clean_text)
    clean_text = re.sub(r'(?i)&quot;', '"', clean_text)
    clean_text = re.sub(r'(?i)&#39;', "'", clean_text)
    return re.sub(r'\s+', ' ', clean_text).strip()

def get_official_region_for_station(station_name: str, db_region: str) -> str:
    clean_station = strip_html_tags(station_name or "").strip().upper()
    clean_region = strip_html_tags(db_region or "").strip().upper()

    if clean_station in ["KIRA DIVISION", "KIRA DIV", "KIRA"]:
        clean_station = "KIRA DIV"

    if clean_region in REGIONAL_HIERARCHY and clean_station in REGIONAL_HIERARCHY[clean_region]:
        return clean_region

    for reg_name, stations in REGIONAL_HIERARCHY.items():
        if clean_station in stations:
            return reg_name

    return clean_region or "KMP GENERAL"

def apply_precise_regional_scoping(query, ModelClass, selected_region: Optional[str], selected_station: Optional[str], current_user):
    sel_reg = (selected_region or "").strip().upper()
    sel_stn = (selected_station or "").strip().upper()
    
    user_role = (current_user.role or "").strip().upper()
    user_pos = (current_user.position or "").strip().upper()
    user_reg = (current_user.region or "").strip().upper()
    user_stn = (current_user.station or "").strip().upper()

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
        perms.get("global_observer") is True or
        user_reg in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"]
    )

    if sel_stn and sel_stn not in ["ALL STATIONS", "ALL STATIONS / DIVISIONS", "ALL"]:
        conds = []
        if hasattr(ModelClass, 'station'):
            clean_sel_stn = sel_stn.replace(" HEADQUARTERS", "").replace(" HQ", "")
            conds.append(
                or_(
                    func.upper(ModelClass.station) == sel_stn,
                    func.upper(ModelClass.station) == f"{clean_sel_stn} HEADQUARTERS",
                    func.upper(ModelClass.station) == f"{clean_sel_stn} HQ"
                )
            )
        return query.filter(or_(*conds))

    if sel_reg and sel_reg != "ALL REGIONS":
        conds = []
        if hasattr(ModelClass, 'region'):
            conds.append(func.upper(ModelClass.region) == sel_reg)
        
        if sel_reg in REGIONAL_HIERARCHY and hasattr(ModelClass, 'station'):
            region_stations = [s.upper() for s in REGIONAL_HIERARCHY[sel_reg]]
            conds.append(func.upper(ModelClass.station).in_(region_stations))

        return query.filter(or_(*conds))

    if not is_absolute_global:
        conds = []
        if user_reg and hasattr(ModelClass, 'region'):
            conds.append(func.upper(ModelClass.region) == user_reg)
        if user_stn and hasattr(ModelClass, 'station'):
            clean_user_stn = user_stn.replace(" HEADQUARTERS", "").replace(" HQ", "")
            conds.append(
                or_(
                    func.upper(ModelClass.station) == user_stn,
                    func.upper(ModelClass.station) == f"{clean_user_stn} HEADQUARTERS"
                )
            )
        if conds:
            return query.filter(or_(*conds))
        return query.filter(text("1=0"))

    return query

def normalize_offence_category(raw_offence: str) -> str:
    if not raw_offence:
        return "UNSPECIFIED OFFENCE"
    clean = str(raw_offence).strip().upper()
    mapping = {
        'DEATH SUDDEN': 'Sudden Death',
        'DEATH_SUDDEN': 'Sudden Death',
        'SUDDEN DEATH': 'Sudden Death',
        'FIREOUTBREAK': 'Fire Outbreak',
        'FIRE OUTBREAK': 'Fire Outbreak',
        'BY DEATH DROWNING': 'Death by Drowning',
        'DEATH DROWNING': 'Death by Drowning',
        'AGGRAVATED ROBBERY': 'Aggravated Robbery',
        'MURDER SUSPECTED': 'Suspected Murder',
        'ATTEMPTED MURDER': 'Attempted Murder',
        'DEFILEMENT / RAPE': 'Defilement / Rape'
    }
    if mapping.get(clean):
        return mapping[clean]
    if "FATAL" in clean and ("TRAFFIC" in clean or "ACCIDENT" in clean):
        return "Traffic Accident (Fatal)"
    if "MINOR" in clean and ("TRAFFIC" in clean or "ACCIDENT" in clean):
        return "Traffic Accident (Minor)"
    if "DEFILEMENT" in clean or "RAPE" in clean:
        return "Defilement / Rape"
    return clean.replace("_", " ").title()

def parse_fire_incident_advanced(raw_narrative: str, offence_str: str):
    text_blob = f"{offence_str or ''} {raw_narrative or ''}".lower()
    classification = "RESIDENTIAL HOUSE"
    if any(k in text_blob for k in ["school", "college", "academy", "nursery", "student", "dormitory"]):
        classification = "SCHOOL"
    elif any(k in text_blob for k in ["church", "mosque", "chapel", "temple", "synagogue", "relig"]):
        classification = "CHURCH / RELIGIOUS CENTRE"
    elif any(k in text_blob for k in ["vehicle", "car", "taxi", "bus", "lorry", "truck", "boda", "motorcycle"]):
        classification = "MOTOR VEHICLE"
    elif any(k in text_blob for k in ["boat", "vessel", "ship", "canoe", "watercraft"]):
        classification = "VESSEL"
    elif any(k in text_blob for k in ["furniture", "shop", "market", "store", "warehouse", "commercial", "factory", "office", "hardware"]):
        classification = "FURNITURE SHOP / COMMERCIAL PROPERTY"
    
    deaths = 0
    injuries = 0
    death_match = re.search(r'(\d+)\s*(?:dead|deaths|fatality|fatalities|killed|burnt to death)', text_blob)
    if death_match:
        deaths = safe_int(death_match.group(1))
    injury_match = re.search(r'(\d+)\s*(?:injured|injury|injuries|hurt|burn wounds|hospitalized|admitted)', text_blob)
    if injury_match:
        injuries = safe_int(injury_match.group(1))

    return {
        "classification": classification,
        "deaths": deaths,
        "injuries": injuries,
        "totalCasualties": deaths + injuries
    }

def parse_success_story_backend(raw_narrative: str):
    if not raw_narrative:
        return {
            "suspects": 0,
            "recoveries": "NONE RECORDED",
            "legalStatus": "UNDER INVESTIGATION",
            "classification": "OPERATIONAL BREAKTHROUGH"
        }

    raw_narrative_str = str(raw_narrative)
    headline_match = re.search(r'<strong>(.*?)<\/strong>', raw_narrative_str, re.IGNORECASE)
    if headline_match:
        classification = strip_html_tags(headline_match.group(1)).strip().upper()
    else:
        classification = "OPERATIONAL BREAKTHROUGH & SUSPECT APPREHENSION"

    plain_text = strip_html_tags(raw_narrative_str)
    lower_text = plain_text.lower()
    
    suspects_count = 0
    suspect_patterns = [
        re.search(r'(\d+)\s*(?:suspects|suspect|person|persons|culprits|thieves|gang|individuals)', lower_text),
        re.search(r'(?:arrest(?:ed|ing)?|apprehend(?:ed)?|detain(?:ed)?)\s*(?:of)?\s*(\d+)', lower_text)
    ]
    for m in suspect_patterns:
        if m and m.group(1):
            suspects_count = safe_int(m.group(1))
            break
    if suspects_count == 0 and ('suspect' in lower_text or 'arrest' in lower_text or 'apprehend' in lower_text):
        suspects_count = 1 

    legal_status = 'UNDER INVESTIGATION'
    if 'remand' in lower_text or 'remanded' in lower_text:
        legal_status = 'REMANDED'
    elif 'convict' in lower_text or 'sentenced' in lower_text:
        legal_status = 'CONVICTED'
    elif 'acquit' in lower_text:
        legal_status = 'ACQUITTED'
    elif 'court' in lower_text or 'trial' in lower_text or 'magistrate' in lower_text or 'arraign' in lower_text:
        legal_status = 'UNDERGOING COURT TRIAL'

    recoveries_list = []
    recovery_matches = re.findall(r'(\d+)\s*([a-z\s]+(?:cows|cow|cattle|phones|phone|pistol|pistols|gun|guns|firearm|firearms|cash|money|shillings|computers|computer|chairs|chair|tables|table|shoes|shoe|motorcycles|motorcycle|vehicles|vehicle|pangas|panga|weapons|weapon|items))', lower_text, re.IGNORECASE)
    for count_val, item_val in recovery_matches:
        formatted_count = str(count_val).zfill(2)
        recoveries_list.append(f"{formatted_count} | {item_val.strip().upper()}")

    if not recoveries_list:
        if 'motorcycle' in lower_text or 'boda' in lower_text: recoveries_list.append('01 | MOTORCYCLE RECOVERED')
        elif 'vehicle' in lower_text or 'car' in lower_text: recoveries_list.append('01 | MOTOR VEHICLE RECOVERED')
        elif 'phone' in lower_text or 'mobile' in lower_text: recoveries_list.append('01 | MOBILE PHONE RECOVERED')
        elif 'cattle' in lower_text or 'cow' in lower_text: recoveries_list.append('01 | STOLEN CATTLE RECOVERED')
        elif 'cash' in lower_text or 'money' in lower_text or 'shillings' in lower_text: recoveries_list.append('01 | CASH / FUNDS RECOVERED')
        elif 'gun' in lower_text or 'pistol' in lower_text or 'firearm' in lower_text: recoveries_list.append('01 | FIREARM RECOVERED')
        elif 'uniform' in lower_text or 'stores' in lower_text: recoveries_list.append('01 | GOVERNMENT STORES')
        else: recoveries_list.append('NONE RECORDED')

    classification_str = str(classification)
    formatted_classification = (classification_str[:52] + '...') if len(classification_str) > 55 else classification_str

    return {
        "suspects": suspects_count,
        "recoveries": " || ".join(recoveries_list),
        "legalStatus": legal_status,
        "classification": formatted_classification
    }

def calculate_timeseries_aggregates(records, date_field, value_fields):
    weekly_map, monthly_map, annual_map = {}, {}, {}

    for r in records:
        d_str = getattr(r, date_field, None)
        if not d_str:
            continue
        
        # 🟢 FIX: Safe Date Parsing for varying DB formats
        dt = None
        try:
            if isinstance(d_str, datetime):
                dt = d_str
            else:
                clean_d = str(d_str).split('T')[0][:10]
                try: dt = datetime.strptime(clean_d, "%Y-%m-%d")
                except ValueError:
                    try: dt = datetime.strptime(clean_d, "%d/%m/%Y")
                    except ValueError: continue
        except Exception:
            continue
            
        if not dt: continue

        week_key = f"{dt.year}-W{dt.strftime('%V')}"
        month_key = dt.strftime("%Y-%m (%B)")
        annual_key = str(dt.year)

        def accumulate(target_dict, key):
            if key not in target_dict:
                target_dict[key] = {vf: 0 for vf in value_fields}
                target_dict[key]["_count"] = 0
            target_dict[key]["_count"] += 1
            for vf in value_fields:
                target_dict[key][vf] += safe_int(getattr(r, vf, 0))

        accumulate(weekly_map, week_key)
        accumulate(monthly_map, month_key)
        accumulate(annual_map, annual_key)

    def format_rows(sorted_keys, data_map):
        formatted_rows = []
        prev_totals = {vf: None for vf in value_fields}
        for k in sorted_keys:
            metrics = data_map[k]
            row = [k, metrics["_count"]]
            for vf in value_fields:
                curr_val = metrics[vf]
                row.append(curr_val)
                prev_val = prev_totals[vf]
                if prev_val is not None and prev_val > 0:
                    pct_change = ((curr_val - prev_val) / prev_val) * 100
                    trend_str = f"{pct_change:+.1f}%"
                elif prev_val == 0 and curr_val > 0:
                    trend_str = "+100.0% (New)"
                else:
                    trend_str = "0.0%"
                row.append(trend_str)
                prev_totals[vf] = curr_val
            formatted_rows.append(row)
        return formatted_rows

    return {
        "weekly": format_rows(sorted(weekly_map.keys()), weekly_map),
        "monthly": format_rows(sorted(monthly_map.keys()), monthly_map),
        "annual": format_rows(sorted(annual_map.keys()), annual_map)
    }

@router.get("/dashboard-intelligence", response_model=None)
def get_dashboard_intelligence(
    region: Optional[str] = None,
    station: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    """Offloads success stories parsing, fire intelligence, manpower matrix, crime categories, detentions, exhibits, and accidents with precision regional/station filtering."""
    try:
        LockupModel = get_model_safe('LockupMatrix', 'lockup_matrix', 'suspect_lockup')
        StoryModel = get_model_safe('Success_Stories', 'SuccessStories', 'Stories', 'success_stories')
        CrimeModel = get_model_safe('Crime_Reports', 'CrimeReports', 'Reports', 'crime_reports')
        ExhibitModel = get_model_safe('Impounded_Exhibits', 'Exhibits', 'impounded_exhibits')
        AccidentsModel = get_model_safe('Accidents_Statistics', 'AccidentsStatistics', 'accidents_statistics')

        def query_scoped(ModelClass):
            if not ModelClass:
                return []
            q = db.query(ModelClass)
            q = apply_precise_regional_scoping(q, ModelClass, region, station, current_user)
            return q.all()

        lockup_records = query_scoped(LockupModel)
        story_records = query_scoped(StoryModel)
        crime_records = query_scoped(CrimeModel)
        exhibit_records = query_scoped(ExhibitModel)
        accidents_records = query_scoped(AccidentsModel)

        # 1. DETENTIONS / LOCKUP CALENDAR & MARGIN AUDITS
        date_map = {}
        region_demo_map = {}
        region_dur_map = {}
        daily_totals = {}

        for r in lockup_records:
            d_str = str(getattr(r, 'date', getattr(r, 'created_at', ''))).split('T')[0]
            if not d_str:
                continue

            stn = str(getattr(r, 'station', 'UNKNOWN')).upper()
            reg = get_official_region_for_station(stn, getattr(r, 'region', ''))
            
            suspects = safe_int(getattr(r, 'suspects', getattr(r, 'daily_lock_up', 0)))
            m_ad = safe_int(getattr(r, 'male_count', getattr(r, 'male', 0)))
            m_juv = safe_int(getattr(r, 'male_juvenile_count', 0))
            f_ad = safe_int(getattr(r, 'female_count', getattr(r, 'female', 0)))
            f_juv = safe_int(getattr(r, 'female_juvenile_count', 0))
            d3_over = safe_int(getattr(r, 'detention_3days_over', 0))

            if d_str not in date_map:
                date_map[d_str] = {"total": 0, "stations": []}
            date_map[d_str]["total"] += suspects
            date_map[d_str]["stations"].append({
                "station": stn, "region": reg, "suspects": suspects,
                "mAd": m_ad, "mJuv": m_juv, "fAd": f_ad, "fJuv": f_juv, "d3Over": d3_over
            })

            daily_totals[d_str] = daily_totals.get(d_str, 0) + suspects

            if reg not in region_demo_map:
                region_demo_map[reg] = {"region": reg, "maleAdults": 0, "femaleAdults": 0, "maleJuveniles": 0, "femaleJuveniles": 0}
            region_demo_map[reg]["maleAdults"] += m_ad
            region_demo_map[reg]["femaleAdults"] += f_ad
            region_demo_map[reg]["maleJuveniles"] += m_juv
            region_demo_map[reg]["femaleJuveniles"] += f_juv

            if reg not in region_dur_map:
                region_dur_map[reg] = {"region": reg, "day1": 0, "day2": 0, "over3Days": 0}
            region_dur_map[reg]["day1"] += safe_int(getattr(r, 'detention_1day', 0))
            region_dur_map[reg]["day2"] += safe_int(getattr(r, 'detention_2days', 0))
            region_dur_map[reg]["over3Days"] += d3_over

        sorted_dates = sorted(date_map.keys())
        daily_margins = []
        for i, dt in enumerate(sorted_dates):
            curr_total = daily_totals[dt]
            prev_total = daily_totals[sorted_dates[i - 1]] if i > 0 else curr_total
            margin = curr_total - prev_total
            status_note = 'DECREASE (Check Bails/Remands/Releases)' if margin < 0 else ('INCREASE (New Admissions)' if margin > 0 else 'STABLE')
            daily_margins.append({
                "date": dt,
                "total": curr_total,
                "margin": margin,
                "status": status_note
            })

        # 2. SUCCESS STORIES PROCESSING
        parsed_stories = []
        for st in story_records:
            raw_narrative = getattr(st, 'narrative', getattr(st, 'title', ''))
            parsed = parse_success_story_backend(raw_narrative)
            parsed_stories.append({
                "station": getattr(st, 'station', 'UNKNOWN'),
                "region": getattr(st, 'region', 'KMP GENERAL'),
                "parsedSuspects": getattr(st, 'suspects_arrested', 0) or getattr(st, 'suspects_arrested_count', 0) or parsed['suspects'],
                "parsedRecoveries": getattr(st, 'suspected_stolen_properties_recovered', '') or getattr(st, 'property_recovered', '') or parsed['recoveries'],
                "parsedLegalStatus": getattr(st, 'legal_status', '') or parsed['legalStatus'],
                "parsedClassification": parsed['classification']
            })

        # 3. FIRE INTELLIGENCE
        fire_keywords = ["fire", "arson", "burnt", "flames", "inferno", "scorch"]
        fire_list = []
        total_fire_deaths = 0
        total_fire_injuries = 0
        for cr in crime_records:
            narrative = str(getattr(cr, 'narrative', '') or "")
            offence = str(getattr(cr, 'offence', '') or "")
            if any(kw in narrative.lower() or kw in offence.lower() for kw in fire_keywords):
                parsed_fire = parse_fire_incident_advanced(narrative, offence)
                total_fire_deaths += parsed_fire["deaths"]
                total_fire_injuries += parsed_fire["injuries"]
                fire_list.append({
                    "station": getattr(cr, 'station', 'UNKNOWN'),
                    "region": getattr(cr, 'region', 'KMP GENERAL'),
                    "date": str(getattr(cr, 'date', 'N/A')),
                    "classification": parsed_fire["classification"],
                    "deaths": parsed_fire["deaths"],
                    "injuries": parsed_fire["injuries"],
                    "summary": strip_html_tags(narrative or offence or 'Fire incident logged.')
                })

        # 4. CRIME CATEGORIES
        crime_reg_map = {}
        for cr in crime_records:
            cat = normalize_offence_category(getattr(cr, 'crime_category', getattr(cr, 'offence', 'GENERAL CRIME')))
            reg = get_official_region_for_station(getattr(cr, 'station', ''), getattr(cr, 'region', ''))
            if reg not in crime_reg_map:
                crime_reg_map[reg] = {"region": reg, "totalCrimes": 0, "categories": {}}
            crime_reg_map[reg]["totalCrimes"] += 1
            crime_reg_map[reg]["categories"][cat] = crime_reg_map[reg]["categories"].get(cat, 0) + 1

        crime_category_data = []
        for reg, obj in crime_reg_map.items():
            cat_list = [{"name": c, "count": cnt} for c, cnt in sorted(obj["categories"].items(), key=lambda x: x[1], reverse=True)]
            crime_category_data.append({"region": reg, "totalCrimes": obj["totalCrimes"], "categoryList": cat_list})
        crime_category_data.sort(key=lambda x: x["totalCrimes"], reverse=True)

        # 5. EXHIBITS DATA RETRIEVAL
        exhibits_formatted = []
        for ex in exhibit_records:
            exhibits_formatted.append({
                "id": getattr(ex, 'id', 0),
                "category": str(getattr(ex, 'category', 'GENERAL') or 'GENERAL').upper(),
                "description": str(getattr(ex, 'description', getattr(ex, 'particulars', 'N/A')) or 'N/A').upper(),
                "region": str(getattr(ex, 'region', 'KMP GENERAL') or 'KMP GENERAL').upper(),
                "station": str(getattr(ex, 'station', 'N/A') or 'N/A').upper(),
                "status": str(getattr(ex, 'status', 'IMPOUNDED') or 'IMPOUNDED').upper(),
                "total": 1
            })

        # 6. ACCIDENTS DATA RETRIEVAL
        accidents_formatted = []
        for ac in accidents_records:
            accidents_formatted.append({
                "id": getattr(ac, 'id', 0),
                "date": str(getattr(ac, 'date', 'N/A')),
                "region": str(getattr(ac, 'region', 'KMP GENERAL')).upper(),
                "station": str(getattr(ac, 'station', 'N/A')).upper(),
                "nature": str(getattr(ac, 'nature_of_accident', 'TRAFFIC ACCIDENT')).upper(),
                "minor": safe_int(getattr(ac, 'minor', 0)),
                "serious": safe_int(getattr(ac, 'serious', 0)),
                "fatal": safe_int(getattr(ac, 'fatal', 0)),
                "victims": safe_int(getattr(ac, 'victims', 0)),
                "total": safe_int(getattr(ac, 'total', 0))
            })

        return {
            "detentionCalendar": {
                "dates": sorted_dates,
                "dateMap": date_map,
                "regionDemographics": list(region_demo_map.values()),
                "regionDuration": list(region_dur_map.values()),
                "dailyMargins": daily_margins
            },
            "successStoriesProcessed": parsed_stories,
            "fireIntelligence": {
                "totalFires": len(fire_list),
                "totalDeaths": total_fire_deaths,
                "totalInjuries": total_fire_injuries,
                "fireList": fire_list
            },
            "crimeCategoryData": crime_category_data,
            "exhibitsData": exhibits_formatted,
            "accidentsData": accidents_formatted
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Dashboard intelligence computation failed: {str(e)}")

@router.get("/export")
def export_analytics_report(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(require_export_privilege)
):
    try:
        user_role = str(current_user.role).strip().upper() if current_user.role else ""
        user_pos = str(current_user.position).strip().upper() if current_user.position else ""
        user_reg = str(current_user.region).strip().upper() if current_user.region else ""
        user_stn = str(current_user.station).strip().upper() if current_user.station else ""

        perms = current_user.permissions or {}
        if isinstance(perms, str):
            try: perms = json.loads(perms)
            except Exception: perms = {}

        is_absolute_global = (
            user_role in ["SUPER_ADMIN", "ASSISTANT_SUPER_ADMIN"] or
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
            user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN"] or
            user_pos.find("RPC") != -1 or
            user_reg in REGIONAL_HIERARCHY
        )
        
        CrimeModel = get_model_safe('Crime_Reports', 'CrimeReports', 'Reports', 'crime_reports')
        StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics', 'Stats', 'operational_statistics')
        StoryModel = get_model_safe('Success_Stories', 'SuccessStories', 'Stories', 'success_stories')
        NomModel = get_model_safe('Nominal_Roll', 'NominalRoll', 'User', 'Users', 'nominal_roll')
        AgricModel = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary', 'agricultural_crime_summary')
        ExhibitModel = get_model_safe('Impounded_Exhibits', 'Exhibits', 'impounded_exhibits')
        LockupModel = get_model_safe('LockupMatrix', 'lockup_matrix', 'suspect_lockup')
        AccidentsModel = get_model_safe('Accidents_Statistics', 'AccidentsStatistics', 'accidents_statistics')

        def get_scoped_records(ModelClass):
            if not ModelClass:
                return []
            q = db.query(ModelClass)
            q = apply_precise_regional_scoping(q, ModelClass, region, station, current_user)
            return q.all()

        cr_records = get_scoped_records(CrimeModel)
        ops_records = get_scoped_records(StatsModel)
        ss_records = get_scoped_records(StoryModel)
        nom_records = get_scoped_records(NomModel)
        agric_records = get_scoped_records(AgricModel)
        ex_records = get_scoped_records(ExhibitModel)
        lockup_records = get_scoped_records(LockupModel)
        accidents_records = get_scoped_records(AccidentsModel)

        fire_incidents_count = 0
        total_fire_deaths = 0
        total_fire_injuries = 0
        fire_keywords = ["fire", "arson", "burnt", "flames", "inferno", "scorch"]
        for cr in cr_records:
            narrative = str(getattr(cr, 'narrative', '') or "")
            offence = str(getattr(cr, 'offence', '') or "")
            if any(kw in narrative.lower() or kw in offence.lower() for kw in fire_keywords):
                fire_incidents_count += 1
                parsed_fire = parse_fire_incident_advanced(narrative, offence)
                total_fire_deaths += parsed_fire["deaths"]
                total_fire_injuries += parsed_fire["injuries"]

        overstayed_details_map = {}
        total_overstayed_suspects = 0
        total_female_custody = 0
        total_juveniles_custody = 0
        for lck in lockup_records:
            d3 = safe_int(getattr(lck, 'detention_3days_over', 0))
            if d3 > 0:
                stn = str(getattr(lck, 'station', 'UNKNOWN')).upper()
                overstayed_details_map[stn] = overstayed_details_map.get(stn, 0) + d3
                total_overstayed_suspects += d3
            total_female_custody += safe_int(getattr(lck, 'female_count', 0)) + safe_int(getattr(lck, 'female_juvenile_count', 0))
            total_juveniles_custody += safe_int(getattr(lck, 'female_juvenile_count', 0)) + safe_int(getattr(lck, 'male_juvenile_count', 0))

        detention_timeseries = calculate_timeseries_aggregates(
            lockup_records, date_field='date', 
            value_fields=['suspects', 'male_count', 'female_count', 'detention_3days_over']
        )
        accidents_timeseries = calculate_timeseries_aggregates(
            accidents_records, date_field='date', 
            value_fields=['minor', 'serious', 'fatal', 'victims', 'total']
        )

        agric_breakdown = {"ANIMALS": [0, 0], "PRODUCE": [0, 0], "EQUIPMENT": [0, 0]}
        for ag in agric_records:
            rep_type = str(getattr(ag, 'agric_crime_report', '')).upper()
            stolen = safe_int(getattr(ag, 'number_count', 0))
            recovered = safe_int(getattr(ag, 'recoveries', 0))
            if "ANIMAL" in rep_type or "LIVESTOCK" in rep_type or "CATTLE" in rep_type:
                agric_breakdown["ANIMALS"][0] += stolen
                agric_breakdown["ANIMALS"][1] += recovered
            elif "EQUIPMENT" in rep_type or "IMPLEMENT" in rep_type or "MACHINE" in rep_type:
                agric_breakdown["EQUIPMENT"][0] += stolen
                agric_breakdown["EQUIPMENT"][1] += recovered
            else:
                agric_breakdown["PRODUCE"][0] += stolen
                agric_breakdown["PRODUCE"][1] += recovered

        agric_cat_data = [
            ["ANIMALS (Livestock & Wildlife)", agric_breakdown["ANIMALS"][0], agric_breakdown["ANIMALS"][1]],
            ["PRODUCE (Crops & Harvest)", agric_breakdown["PRODUCE"][0], agric_breakdown["PRODUCE"][1]],
            ["EQUIPMENT (Farm Implements & Tools)", agric_breakdown["EQUIPMENT"][0], agric_breakdown["EQUIPMENT"][1]]
        ]

        officer_ranks = ['CP', 'ACP', 'SSP', 'SP', 'SASP', 'ASP', 'IP', 'AIP']
        nco_ranks = ['HCM', 'HC', 'S/SGT', 'SSGT', 'SGT', 'CPL', 'L/CPL', 'PC', 'PPC', 'SPC']
        all_ranks = officer_ranks + nco_ranks

        manpower_matrix = {}
        total_male_general = 0
        total_female_general = 0

        for n in nom_records:
            reg = str(getattr(n, 'region', 'KMP HEADQUARTERS') or 'KMP HEADQUARTERS').upper()
            stat = str(getattr(n, 'station', 'HQ') or 'HQ').upper()
            rnk = str(getattr(n, 'rank', 'PC') or 'PC').upper()
            sex = str(getattr(n, 'sex', 'M') or 'M').upper()

            if reg not in manpower_matrix:
                manpower_matrix[reg] = {}
            if stat not in manpower_matrix[reg]:
                manpower_matrix[reg][stat] = {rk: {'M': 0, 'F': 0} for rk in all_ranks}

            if rnk in manpower_matrix[reg][stat]:
                if 'F' in sex:
                    manpower_matrix[reg][stat][rnk]['F'] += 1
                    total_female_general += 1
                else:
                    manpower_matrix[reg][stat][rnk]['M'] += 1
                    total_male_general += 1

        manpower_table_rows = []
        for reg, stations in manpower_matrix.items():
            manpower_table_rows.append([f"REGION: {reg}", "", "", ""] + [""] * (len(all_ranks) * 2))
            for stat, ranks_data in stations.items():
                stat_m = sum(v['M'] for v in ranks_data.values())
                stat_f = sum(v['F'] for v in ranks_data.values())
                stat_total = stat_m + stat_f
                row_entry = [reg, stat, stat_total, stat_m, stat_f]
                for rk in all_ranks:
                    row_entry.append(ranks_data[rk]['M'])
                    row_entry.append(ranks_data[rk]['F'])
                manpower_table_rows.append(row_entry)

        success_detailed_data = []
        for st in ss_records:
            date_val = str(getattr(st, 'date', ''))
            reg_val = getattr(st, 'region', '')
            stat_val = getattr(st, 'station', '')
            raw_narrative = getattr(st, 'narrative', getattr(st, 'title', 'Successful operation executed.'))
            parsed = parse_success_story_backend(raw_narrative)
            
            suspects = getattr(st, 'suspects_arrested', 0) or getattr(st, 'suspects_arrested_count', 0) or parsed['suspects']
            recoveries = getattr(st, 'suspected_stolen_properties_recovered', '') or getattr(st, 'property_recovered', '') or parsed['recoveries']
            legal_status = getattr(st, 'legal_status', '') or parsed['legalStatus']
            classification = parsed['classification']
            
            success_detailed_data.append([reg_val, stat_val, date_val, suspects, recoveries, legal_status, classification])

        exhibit_summary_map = {}
        for ex in ex_records:
            cat = str(getattr(ex, 'category', 'GENERAL') or 'GENERAL').upper()
            desc = str(getattr(ex, 'description', getattr(ex, 'particulars', 'N/A')) or 'N/A').upper()
            reg = str(getattr(ex, 'region', 'KMP GENERAL') or 'KMP GENERAL').upper()
            div = str(getattr(ex, 'division', getattr(ex, 'station', 'N/A')) or 'N/A').upper()
            stn = str(getattr(ex, 'station', 'N/A') or 'N/A').upper()
            status = str(getattr(ex, 'status', 'IMPOUNDED') or 'IMPOUNDED').upper()
            key = (cat, desc, reg, div, stn, status)
            exhibit_summary_map[key] = exhibit_summary_map.get(key, 0) + 1

        exhibit_summary_data = [[k[0], k[1], k[2], k[3], k[4], k[5], v] for k, v in exhibit_summary_map.items()]

        disruptive_data = []
        region_ops_totals = {}
        for s in ops_records:
            reg = getattr(s, 'region', 'GENERAL')
            stat = getattr(s, 'station', 'N/A')
            wk = getattr(s, 'date', 'WEEKLY PERIOD')
            
            if reg not in region_ops_totals:
                region_ops_totals[reg] = {"arrested": 0, "bond": 0, "caution": 0, "pending": 0, "court": 0, "released": 0, "remanded": 0, "convicted": 0}
            
            arr = safe_int(getattr(s, 'arrested', 0))
            bon = safe_int(getattr(s, 'given_bond', 0))
            cau = safe_int(getattr(s, 'cautioned', 0))
            pen = safe_int(getattr(s, 'pending_court', 0))
            tak = safe_int(getattr(s, 'taken_to_court', 0))
            rel = safe_int(getattr(s, 'released', 0))
            rem = safe_int(getattr(s, 'remanded', 0))
            con = safe_int(getattr(s, 'convicted', 0))

            region_ops_totals[reg]["arrested"] += arr
            region_ops_totals[reg]["bond"] += bon
            region_ops_totals[reg]["caution"] += cau
            region_ops_totals[reg]["pending"] += pen
            region_ops_totals[reg]["court"] += tak
            region_ops_totals[reg]["released"] += rel
            region_ops_totals[reg]["remanded"] += rem
            region_ops_totals[reg]["convicted"] += con

            disruptive_data.append([str(wk), reg, stat, arr, bon, cau, pen, tak, rel, rem, con])

        comp_counts = {}
        for r in cr_records:
            cat = str(getattr(r, 'offence', 'GENERAL CRIME') or 'GENERAL CRIME').strip().upper()
            comp_counts[cat] = comp_counts.get(cat, 0) + 1
        comp_data = [[k, v] for k, v in sorted(comp_counts.items(), key=lambda x: x[1], reverse=True)]

        summary_table_data = [
            ["Total General Manpower (Force-Wide)", len(nom_records)],
            ["Total General Male Personnel", total_male_general],
            ["Total General Female Personnel", total_female_general],
            ["Total Success Stories / Breakthroughs", len(ss_records)],
            ["Total Recorded Incidents / Crime Reports", len(cr_records)],
            ["Total Disruptive Operations Logs", len(ops_records)],
            ["Total Impounded Exhibits Tracked", len(ex_records)],
            ["Total Traffic Accidents Recorded", len(accidents_records)],
            ["Total Fire Outbreaks & Arson Incidents", fire_incidents_count],
            ["Total Fire Deaths Recorded", total_fire_deaths],
            ["Total Fire Injuries Recorded", total_fire_injuries],
            ["Total Suspects Arrested Force-Wide", sum(safe_int(getattr(s, 'arrested', 0)) for s in ops_records)],
            ["Total Convictions Obtained Force-Wide", sum(safe_int(getattr(s, 'convicted', 0)) for s in ops_records)],
            ["Total Constitutional Overstays (3+ Days in Cells)", total_overstayed_suspects],
            ["Total Women in Custody (Adults & Juveniles)", total_female_custody],
            ["Total Juveniles / Minors in Detention", total_juveniles_custody]
        ]
        
        for stn_name, count_val in overstayed_details_map.items():
            summary_table_data.append([f"Overstay Audit - Station: {stn_name}", f"{count_val} suspect(s) overstayed 3+ days"])

        wb = openpyxl.Workbook()
        wb.remove(wb.active)

        header_fill = PatternFill(start_color="002060", end_color="002060", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        section_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        section_font = Font(color="FFFFFF", bold=True, size=11)

        manpower_headers = ["Region", "Station", "Total", "Male", "Female"] + [item for r in all_ranks for item in (f"{r} (M)", f"{r} (F)")]
        exhibit_headers = ["Category", "Description", "Region", "Division", "Station", "Status", "Total Count"]

        def add_individual_sheet(title, headers, rows):
            ws = wb.create_sheet(title=title)
            ws.append(["SN"] + headers)
            for cell in ws[1]:
                cell.fill = header_fill; cell.font = header_font; cell.alignment = Alignment(horizontal="center", vertical="center")
            for idx, r in enumerate(rows, 1):
                ws.append([idx] + list(r))
            for col in ws.columns:
                max_len = max([len(str(cell.value or '')) for cell in col], default=0)
                ws.column_dimensions[col[0].column_letter].width = min(max_len + 3, 50)

        add_individual_sheet("Manpower Analysis", manpower_headers, manpower_table_rows)
        add_individual_sheet("Agricultural Crimes", ["Sub-Category", "Stolen Count", "Recovered Count"], agric_cat_data)
        add_individual_sheet("Success Stories", ["Region", "Station", "Date", "Suspects Arrested", "Recovered Properties", "Legal Status", "Classified Breakdown"], success_detailed_data)
        add_individual_sheet("Exhibits Grouped", exhibit_headers, exhibit_summary_data)
        add_individual_sheet("Disruptive Ops", ["Weekly Period", "Region", "Station", "Arrested", "Bonded", "Cautioned", "Pending Court", "To Court", "Released", "Remanded", "Convicted"], disruptive_data)
        
        add_individual_sheet("Detention Analysis (Weekly)", ["Time Period", "Entries Logged", "Total Suspects", "Weekly Trend", "Adult Males", "Trend", "Adult Females", "Trend", "Detained 3+ Days", "Trend"], detention_timeseries["weekly"])
        add_individual_sheet("Detention Analysis (Monthly)", ["Time Period", "Entries Logged", "Total Suspects", "Monthly Trend", "Adult Males", "Trend", "Adult Females", "Trend", "Detained 3+ Days", "Trend"], detention_timeseries["monthly"])
        add_individual_sheet("Detention Analysis (Annual)", ["Time Period", "Entries Logged", "Total Suspects", "Annual Trend", "Adult Males", "Trend", "Adult Females", "Trend", "Detained 3+ Days", "Trend"], detention_timeseries["annual"])

        add_individual_sheet("Accidents Analysis (Weekly)", ["Time Period", "Entries Logged", "Minor Crashes", "Weekly Trend", "Serious Crashes", "Trend", "Fatal Crashes", "Trend", "Total Victims", "Trend", "Total Instances", "Trend"], accidents_timeseries["weekly"])
        add_individual_sheet("Accidents Analysis (Monthly)", ["Time Period", "Entries Logged", "Minor Crashes", "Monthly Trend", "Serious Crashes", "Trend", "Fatal Crashes", "Trend", "Total Victims", "Trend", "Total Instances", "Trend"], accidents_timeseries["monthly"])
        add_individual_sheet("Accidents Analysis (Annual)", ["Time Period", "Entries Logged", "Minor Crashes", "Annual Trend", "Serious Crashes", "Trend", "Fatal Crashes", "Trend", "Total Victims", "Trend", "Total Instances", "Trend"], accidents_timeseries["annual"])

        add_individual_sheet("Comparative Trends", ["Category / Offence", "Total Volume"], comp_data)
        add_individual_sheet("Master Summary Aggregates", ["Operational Metric Attribute", "Aggregate Value / Total"], summary_table_data)

        ws_gen = wb.create_sheet(title="General Analytics", index=0)
        
        def append_stacked_section(section_title, headers, rows):
            ws_gen.append([section_title.upper()])
            title_cell = ws_gen.cell(row=ws_gen.max_row, column=1)
            title_cell.fill = section_fill
            title_cell.font = section_font
            title_cell.alignment = Alignment(horizontal="left", vertical="center")
            
            ws_gen.append(["SN"] + headers)
            header_row_idx = ws_gen.max_row
            for col_idx in range(1, len(headers) + 2):
                c = ws_gen.cell(row=header_row_idx, column=col_idx)
                c.fill = header_fill; c.font = header_font; c.alignment = Alignment(horizontal="center", vertical="center")

            if not rows:
                ws_gen.append(["—", "No records captured for this analytical attribute."])
            else:
                for idx, r in enumerate(rows, 1):
                    ws_gen.append([idx] + list(r))
            ws_gen.append([])

        append_stacked_section("1. Manpower Analysis (Officers & NCOs breakdown)", manpower_headers, manpower_table_rows)
        append_stacked_section("2. Agricultural Crimes Breakdown", ["Sub-Category", "Stolen Count", "Recovered Count"], agric_cat_data)
        append_stacked_section("3. Success Stories Breakdown", ["Region", "Station", "Date", "Suspects Arrested", "Recovered Properties", "Legal Status", "Classified Breakdown"], success_detailed_data)
        append_stacked_section("4. Exhibits Grouped Summary", exhibit_headers, exhibit_summary_data)
        append_stacked_section("5. Disruptive Operations Grouped Weekly by Station", ["Weekly Period", "Region", "Station", "Arrested", "Bonded", "Cautioned", "Pending Court", "To Court", "Released", "Remanded", "Convicted"], disruptive_data)
        append_stacked_section("6. Cell Detentions Analysis (Weekly Time-Series)", ["Time Period", "Entries Logged", "Total Suspects", "Weekly Trend", "Adult Males", "Trend", "Adult Females", "Trend", "Detained 3+ Days", "Trend"], detention_timeseries["weekly"])
        append_stacked_section("7. Traffic Accidents Analysis (Weekly Time-Series)", ["Time Period", "Entries Logged", "Minor Crashes", "Weekly Trend", "Serious Crashes", "Trend", "Fatal Crashes", "Trend", "Total Victims", "Trend", "Total Instances", "Trend"], accidents_timeseries["weekly"])
        append_stacked_section("8. Comparative Distribution & Volume Trends", ["Category / Offence", "Total Volume"], comp_data)
        append_stacked_section("9. Master Summary Table (General & Regional Totals)", ["Operational Metric Attribute", "Aggregate Value / Total"], summary_table_data)

        for col in ws_gen.columns:
            max_len = max([len(str(cell.value or '')) for cell in col], default=0)
            ws_gen.column_dimensions[col[0].column_letter].width = min(max_len + 3, 55)

        excel_stream = io.BytesIO()
        wb.save(excel_stream)

        zip_stream = io.BytesIO()
        eat_time = datetime.now(pytz.timezone("Africa/Nairobi")).replace(tzinfo=None)
        fnum_clean = str(current_user.fnum).replace('/', '_').upper()
        zip_password = str(current_user.fnum).strip().encode('utf-8')

        with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            zf.writestr(f"{fnum_clean}_Analytics_Report_{eat_time.strftime('%Y%m%d')}.xlsx", excel_stream.getvalue())

        zip_stream.seek(0)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="ANALYTICS_EXPORT",
            target_id="MASTER_ANALYTICS_REPORT",
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} securely downloaded time-series encrypted Master Analytics & Operations Report with Advanced Fire Classifications and Daily Detentions Progression."
        )

        return StreamingResponse(
            zip_stream,
            media_type="application/zip",
            headers={
                'Content-Disposition': f'attachment; filename="SECURE_ANALYTICS_REPORT_{eat_time.strftime("%Y%m%d")}.zip"',
                'Access-Control-Expose-Headers': 'Content-Disposition'
            }
        )
    except Exception as e:
        print(f"Analytics Export Error: {e}")
        raise HTTPException(status_code=500, detail=f"Analytics export compilation failed: {str(e)}")