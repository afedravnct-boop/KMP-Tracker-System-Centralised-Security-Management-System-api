# routers/analytics_export.py
import gc
import io
import json
import re
from datetime import datetime, timedelta
import pytz
import pyzipper
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import BarChart, PieChart, Reference
from openpyxl.chart.label import DataLabelList
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text
from typing import Optional, List, Dict, Any

from auth import get_current_user, require_export_privilege
from app.database import get_db, get_logs_db
from app import models
from routers.activity_logger import record_neon_activity

from routers.nominal_roll import (
    calculate_age_bracket,
    calculate_service_length_bracket,
    calculate_deployment_length_bracket,
    calculate_rank_tenure_bracket,
    normalize_personnel_status,
    normalize_education_level,
    normalize_section_unit,
    normalize_station_name,
    is_invalid_roster_entry
)

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics Exports & Intelligence"])

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU"]
}

RANK_HIERARCHY = [
    'IGP', 'DIGP', 'AIGP', 'SCP', 'CP', 'ACP', 'SSP', 'SP', 'SASP', 'ASP', 'IP', 'AIP',
    'HCM', 'HC', 'S/SGT', 'SSGT', 'SGT', 'CPL', 'L/CPL', 'PC', 'PPC', 'SPC'
]
RANK_ORDER_MAP = {rk: idx for idx, rk in enumerate(RANK_HIERARCHY)}

def sort_by_rank_hierarchy(items):
    """Sorts (rank, count) tuples from highest UPF rank to lowest, with unknown ranks at the end."""
    return sorted(items, key=lambda x: (RANK_ORDER_MAP.get(str(x[0]).strip().upper(), 999), -x[1]))

def _presence_label(val) -> str:
    s = str(val or "").strip().upper()
    return "RECORDED" if s and s not in ["NONE", "NULL", "NAN", "N/A", "NIL", "-"] else "MISSING"

NOMINAL_ROLL_ANALYSIS_COLUMNS = [
    ("rank", "Rank Census Distribution", lambda r: str(getattr(r, 'rank', '') or 'UNKNOWN').strip().upper()),
    ("name", "Name Completeness", lambda r: _presence_label(getattr(r, 'name', None))),
    ("sex", "Gender Distribution", lambda r: "FEMALE" if "F" in str(getattr(r, 'sex', 'M') or 'M').upper() else "MALE"),
    ("position", "Position / Role Distribution", lambda r: str(getattr(r, 'position', '') or 'UNSPECIFIED').strip().upper()),
    ("dob", "Age Demographics (18+)", lambda r: calculate_age_bracket(getattr(r, 'dob', None))),
    ("doe", "Length of Service (DOE)", lambda r: calculate_service_length_bracket(getattr(r, 'doe', None))),
    ("do_post", "Length at Current Station (D.O. Post)", lambda r: calculate_deployment_length_bracket(getattr(r, 'do_post', None))),
    ("do_pro", "Period on Current Rank (D.O. Pro)", lambda r: calculate_rank_tenure_bracket(getattr(r, 'do_pro', None))),
    ("contact", "Contact Availability", lambda r: _presence_label(getattr(r, 'contact', None))),
    ("educ_level", "Education Level", lambda r: normalize_education_level(getattr(r, 'educ_level', None)) or "UNSPECIFIED"),
    ("ipps", "IPPS Number Audit", lambda r: _presence_label(getattr(r, 'ipps', None))),
    ("tin", "TIN Number Audit", lambda r: _presence_label(getattr(r, 'tin', None))),
    ("nin", "NIN Number Audit", lambda r: _presence_label(getattr(r, 'nin', None))),
    ("home_dist", "Home District", lambda r: str(getattr(r, 'home_dist', '') or 'UNSPECIFIED').strip().upper()),
    ("tribe", "Tribe Distribution", lambda r: str(getattr(r, 'tribe', '') or 'UNSPECIFIED').strip().upper()),
    ("acc_no", "Bank Account Audit", lambda r: _presence_label(getattr(r, 'acc_no', getattr(r, 'accno', None)))),
    ("bank_branch", "Bank / Branch Distribution", lambda r: str(getattr(r, 'bank_branch', getattr(r, 'bankbranch', getattr(r, 'bank', ''))) or 'UNSPECIFIED').strip().upper()),
    ("station", "Station Distribution", lambda r: normalize_station_name(getattr(r, 'station', None))),
    ("district", "District Distribution", lambda r: str(getattr(r, 'district', '') or 'UNSPECIFIED').strip().upper()),
    ("region", "Region Distribution", lambda r: get_official_region_for_station(getattr(r, 'station', ''), getattr(r, 'region', ''))),
    ("section", "Section / Unit", lambda r: normalize_section_unit(getattr(r, 'section', None) or getattr(r, 'position', None))),
    ("dir", "Directorate", lambda r: str(getattr(r, 'dir', '') or 'UNSPECIFIED').strip().upper()),
    ("status", "Status / Deployability", lambda r: normalize_personnel_status(getattr(r, 'status', 'ACTIVE')))
]

DEFAULT_MANPOWER_COLUMNS = ["sex", "status", "rank", "doe", "do_post", "do_pro", "dob", "bank_branch"]

def resolve_selected_columns(columns_param: Optional[str]):
    if not columns_param or not columns_param.strip():
        active_keys = set(DEFAULT_MANPOWER_COLUMNS)
    elif columns_param.strip().upper() == "ALL":
        active_keys = {col_key for col_key, _, _ in NOMINAL_ROLL_ANALYSIS_COLUMNS}
    else:
        active_keys = {c.strip().lower() for c in columns_param.split(",") if c.strip()}

    selected = [item for item in NOMINAL_ROLL_ANALYSIS_COLUMNS if item[0] in active_keys]
    return selected if selected else [item for item in NOMINAL_ROLL_ANALYSIS_COLUMNS if item[0] in DEFAULT_MANPOWER_COLUMNS]

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

def get_comparison_level(current_user, selected_region: Optional[str]) -> str:
    """Returns 'REGION' for global users viewing all regions, otherwise 'STATION'."""
    sel_reg = (selected_region or "").strip().upper()
    if sel_reg and sel_reg not in ["ALL REGIONS", "ALL"]:
        return "STATION"

    user_role = (current_user.role or "").strip().upper()
    user_pos = (current_user.position or "").strip().upper()
    user_reg = (current_user.region or "").strip().upper()

    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}

    is_global = (
        user_role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN", "DEPUTY COMMANDER"] or
        "KMP COMMANDER" in user_pos or
        "DEPUTY KMP COMMANDER" in user_pos or
        "KMP ADMIN" in user_pos or
        perms.get("view_global_roster") is True or
        perms.get("global_observer") is True or
        user_reg in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"]
    )
    return "REGION" if is_global else "STATION"

def get_group_label(comparison_level: str, station_val: str, region_val: str) -> str:
    stn = normalize_station_name(station_val or "UNKNOWN")
    if comparison_level == "STATION":
        return stn
    return get_official_region_for_station(stn, region_val or "")

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
    plain_text = strip_html_tags(raw_narrative or '')
    lower_plain = plain_text.lower()
    
    classification = "RESIDENTIAL PROPERTY"
    if any(k in lower_plain for k in ["dormitory", "dorm", "hostel"]):
        classification = "SCHOOL DORMITORY"
    elif any(k in lower_plain for k in ["school", "college", "academy", "nursery", "student"]):
        classification = "SCHOOL FACILITY"
    elif any(k in lower_plain for k in ["factory", "industrial", "plant", "manufacturing"]):
        classification = "INDUSTRIAL / FACTORY"
    elif any(k in lower_plain for k in ["shop", "market", "store", "commercial", "hardware", "tailoring", "facility", "business"]):
        classification = "COMMERCIAL / BUSINESS ROOM"
    elif any(k in lower_plain for k in ["church", "mosque", "chapel", "temple"]):
        classification = "RELIGIOUS CENTRE"
    elif any(k in lower_plain for k in ["vehicle", "car", "taxi", "bus", "lorry", "truck", "motorcycle", "boda"]):
        classification = "MOTOR VEHICLE / TRANSPORT"
    elif any(k in lower_plain for k in ["rental", "room", "house", "residence", "residential"]):
        classification = "RESIDENTIAL ROOM / HOUSE"

    facility_match = re.search(r'(?:at|in|of)\s+([A-Z][a-zA-Z0-9\s]{3,30}\s+(?:School|College|Factory|Center|Centre|Hostel|Dormitory|Market))', plain_text)
    if facility_match:
        classification = facility_match.group(1).strip().upper()

    deaths = 0
    injuries = 0
    death_match = re.search(r'(\d+)\s*(?:dead|deaths|fatality|fatalities|killed|burnt to death)', text_blob)
    if death_match:
        deaths = safe_int(death_match.group(1))
    injury_match = re.search(r'(\d+)\s*(?:injured|injury|injuries|hurt|burn wounds|hospitalized|admitted)', text_blob)
    if injury_match:
        injuries = safe_int(injury_match.group(1))

    status_findings = "UNDER INVESTIGATION"
    if "cause of fire was still under investigation" in lower_plain or "still under investigation" in lower_plain:
        status_findings = "UNDER INVESTIGATION"
    elif any(k in lower_plain for k in ["lightning", "thunder", "act of god", "natural occurrence"]):
        status_findings = "CAUSE ESTABLISHED: NATURAL / LIGHTNING STRIKE"
    elif any(k in lower_plain for k in ["spark", "electrical", "short circuit", "power surge"]):
        status_findings = "CAUSE ESTABLISHED: ELECTRICAL SHORT CIRCUIT"
    elif any(k in lower_plain for k in ["arson", "malicious", "deliberate", "set fire", "student"]):
        status_findings = "CAUSE ESTABLISHED: ARSON / DELIBERATE ACT"
    elif any(k in lower_plain for k in ["charcoal", "stove", "candle", "cook", "gas leak", "cylinder"]):
        status_findings = "CAUSE ESTABLISHED: UNATTENDED HEAT SOURCE / GAS"
    else:
        cause_match = re.search(r'(?:due to|caused by|resulted from)\s+([^.,;]+)', lower_plain)
        if cause_match:
            custom_cause = cause_match.group(1).strip().upper()
            status_findings = f"CAUSE ESTABLISHED: {custom_cause}"
        else:
            status_findings = "CAUSE ESTABLISHED: CUSTOM / OTHER INQUIRY"

    return {
        "classification": classification,
        "deaths": deaths,
        "injuries": injuries,
        "totalCasualties": deaths + injuries,
        "statusFindings": status_findings
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

def build_bar_chart(title, x_title, y_title, ws, data_min_col, data_max_col, cat_col, header_row, end_row, width=18, height=11, show_legend=True):
    chart = BarChart()
    chart.type = "col"
    chart.grouping = "clustered"
    chart.style = 10
    chart.title = title
    chart.x_axis.title = x_title
    chart.y_axis.title = y_title
    chart.x_axis.delete = False
    chart.y_axis.delete = False
    if not show_legend:
        chart.legend = None
    data_ref = Reference(ws, min_col=data_min_col, max_col=data_max_col, min_row=header_row, max_row=end_row)
    cats_ref = Reference(ws, min_col=cat_col, min_row=header_row + 1, max_row=end_row)
    chart.add_data(data_ref, titles_from_data=True)
    chart.set_categories(cats_ref)
    chart.width = width
    chart.height = height
    return chart

def build_pie_chart(title, ws, data_col, cat_col, header_row, end_row, width=14, height=10):
    pie = PieChart()
    pie.title = title
    pie.style = 10
    data_ref = Reference(ws, min_col=data_col, min_row=header_row, max_row=end_row)
    cats_ref = Reference(ws, min_col=cat_col, min_row=header_row + 1, max_row=end_row)
    pie.add_data(data_ref, titles_from_data=True)
    pie.set_categories(cats_ref)
    pie.dataLabels = DataLabelList()
    pie.dataLabels.showPercent = True
    pie.dataLabels.showVal = True
    pie.width = width
    pie.height = height
    return pie

@router.get("/dashboard-intelligence", response_model=None)
def get_dashboard_intelligence(
    region: Optional[str] = None,
    station: Optional[str] = None,
    columns: Optional[str] = Query(default=None),
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    """Offloads pure numerical telemetry safely with comprehensive exception handling."""
    try:
        LockupModel = get_model_safe('lockup_matrix', 'suspect_lockup', 'LockupMatrix')
        StoryModel = get_model_safe('success_stories', 'SuccessStories', 'Stories')
        CrimeModel = get_model_safe('crime_reports', 'CrimeReports', 'Reports')
        ExhibitModel = get_model_safe('impounded_exhibits', 'Impounded_Exhibits', 'Exhibits')
        AccidentsModel = get_model_safe('accidents_statistics', 'Accidents_Statistics', 'AccidentsStatistics')
        FireModel = get_model_safe('fire_statistics', 'Fire_Statistics', 'FireStatistics')
        NomModel = get_model_safe('Nominal_Roll', 'NominalRoll', 'nominal_roll')

        def query_scoped(ModelClass):
            if not ModelClass:
                return []
            try:
                q = db.query(ModelClass)
                q = apply_precise_regional_scoping(q, ModelClass, region, station, current_user)
                return q.all()
            except Exception as ex:
                db.rollback()  
                print(f"Query scoped error for {ModelClass}: {ex}")
                return []

        lockup_records = query_scoped(LockupModel)
        story_records = query_scoped(StoryModel)
        crime_records = query_scoped(CrimeModel)
        exhibit_records = query_scoped(ExhibitModel)
        accidents_records = query_scoped(AccidentsModel)
        fire_records = query_scoped(FireModel)
        nom_records = [r for r in query_scoped(NomModel) if not is_invalid_roster_entry(r)]

        comparison_level = get_comparison_level(current_user, region)

        # 1. DETENTIONS / LOCKUP CALENDAR + COMPARATIVE AGE ANALYSIS
        date_map = {}
        region_demo_map = {}
        region_dur_map = {}
        age_comp_map = {}
        daily_totals = {}

        for r in lockup_records:
            try:
                d_str = str(getattr(r, 'date', getattr(r, 'created_at', ''))).split('T')[0]
                if not d_str or d_str == 'None':
                    continue

                stn = str(getattr(r, 'station', 'UNKNOWN')).upper()
                reg = get_official_region_for_station(stn, getattr(r, 'region', ''))
                
                suspects = safe_int(getattr(r, 'suspects', getattr(r, 'daily_lock_up', getattr(r, 'total_suspects', 0))))
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

                grp = get_group_label(comparison_level, stn, reg)
                if grp not in age_comp_map:
                    age_comp_map[grp] = {
                        "label": grp, "adults": 0, "juveniles": 0,
                        "maleAdults": 0, "femaleAdults": 0,
                        "maleJuveniles": 0, "femaleJuveniles": 0, "total": 0
                    }
                age_comp_map[grp]["maleAdults"] += m_ad
                age_comp_map[grp]["femaleAdults"] += f_ad
                age_comp_map[grp]["maleJuveniles"] += m_juv
                age_comp_map[grp]["femaleJuveniles"] += f_juv
                age_comp_map[grp]["adults"] += (m_ad + f_ad)
                age_comp_map[grp]["juveniles"] += (m_juv + f_juv)
                age_comp_map[grp]["total"] += (m_ad + f_ad + m_juv + f_juv)

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
            except Exception:
                continue

        detention_age_comparison = sorted(age_comp_map.values(), key=lambda x: x["total"], reverse=True)
        sorted_dates = sorted(date_map.keys(), reverse=True)
        daily_margins = []
        for i, dt in enumerate(sorted_dates):
            curr_total = daily_totals[dt]
            prev_total = daily_totals[sorted_dates[i + 1]] if i + 1 < len(sorted_dates) else curr_total
            margin = curr_total - prev_total
            status_note = 'DECREASE (Check Bails/Remands/Releases)' if margin < 0 else ('INCREASE (New Admissions)' if margin > 0 else 'STABLE')
            daily_margins.append({
                "date": dt, "total": curr_total, "margin": margin, "status": status_note
            })

        # 2. SUCCESS STORIES METRICS + CASCADING COMPARISON
        processed_stories = []
        stories_comp_map = {}
        for st in story_records:
            try:
                raw_narrative = getattr(st, 'narrative', getattr(st, 'title', 'Successful operation executed.'))
                parsed = parse_success_story_backend(raw_narrative)
                
                suspects = safe_int(
                    getattr(st, 'suspects_arrested', None) or 
                    getattr(st, 'suspects_arrested_count', None) or 
                    getattr(st, 'suspects', None) or 
                    parsed['suspects']
                )
                recoveries = str(
                    getattr(st, 'suspected_stolen_properties_recovered', None) or 
                    getattr(st, 'property_recovered', None) or 
                    getattr(st, 'recoveries', None) or 
                    parsed['recoveries']
                )
                legal_status = str(
                    getattr(st, 'legal_status', None) or 
                    getattr(st, 'status', None) or 
                    parsed['legalStatus']
                ).upper()
                classification = str(
                    getattr(st, 'category', None) or 
                    getattr(st, 'classification', None) or 
                    parsed['classification']
                ).upper()

                st_stn = str(getattr(st, 'station', 'UNKNOWN')).upper()
                st_reg = str(getattr(st, 'region', 'KMP GENERAL')).upper()
                grp = get_group_label(comparison_level, st_stn, st_reg)
                if grp not in stories_comp_map:
                    stories_comp_map[grp] = {"label": grp, "stories": 0, "suspects": 0}
                stories_comp_map[grp]["stories"] += 1
                stories_comp_map[grp]["suspects"] += suspects

                processed_stories.append({
                    "station": st_stn,
                    "region": st_reg,
                    "suspects": suspects,
                    "parsedSuspects": suspects,
                    "recoveries": recoveries,
                    "parsedRecoveries": recoveries,
                    "legalStatus": legal_status,
                    "parsedLegalStatus": legal_status,
                    "classification": classification,
                    "parsedClassification": classification,
                    "date": str(getattr(st, 'date', getattr(st, 'created_at', 'N/A'))).split('T')[0]
                })
            except Exception as e:
                print(f"Error parsing success story record: {e}")
                continue

        success_stories_comparison = sorted(stories_comp_map.values(), key=lambda x: x["stories"], reverse=True)

        # 3. FIRE INTELLIGENCE + CONCENTRATION BY REGION / STATION
        total_fire_incidents = len(fire_records)
        total_fire_deaths = 0
        total_fire_injuries = 0
        
        fire_list = []
        fire_causes_map = {}
        fire_conc_map = {}
        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        fire_monthly_map = {m: 0 for m in month_names}

        for f in fire_records:
            try:
                raw_narrative = str(getattr(f, 'narrative', getattr(f, 'nature_of_fire', '')))
                offence_str = str(getattr(f, 'nature_of_fire', ''))
                parsed_fire = parse_fire_incident_advanced(raw_narrative, offence_str)

                row_deaths = parsed_fire["deaths"] or safe_int(getattr(f, 'fatal_fires', 0))
                row_injuries = parsed_fire["injuries"]
                total_fire_deaths += row_deaths
                total_fire_injuries += row_injuries

                cause_key = parsed_fire["statusFindings"]
                fire_causes_map[cause_key] = fire_causes_map.get(cause_key, 0) + 1

                f_stn = str(getattr(f, 'station', 'UNKNOWN')).upper()
                f_reg = str(getattr(f, 'region', 'KMP GENERAL')).upper()
                grp = get_group_label(comparison_level, f_stn, f_reg)
                if grp not in fire_conc_map:
                    fire_conc_map[grp] = {"label": grp, "count": 0, "deaths": 0, "injuries": 0}
                fire_conc_map[grp]["count"] += 1
                fire_conc_map[grp]["deaths"] += row_deaths
                fire_conc_map[grp]["injuries"] += row_injuries

                d_str = str(getattr(f, 'date', ''))
                if d_str and d_str != 'None':
                    clean_d = d_str.split('T')[0][:10]
                    dt = datetime.strptime(clean_d, "%Y-%m-%d")
                    m_label = month_names[dt.month - 1]
                    fire_monthly_map[m_label] += 1

                fire_list.append({
                    "station": f_stn,
                    "region": f_reg,
                    "date": str(getattr(f, 'date', 'N/A')),
                    "classification": parsed_fire["classification"],
                    "statusFindings": parsed_fire["statusFindings"],
                    "deaths": row_deaths,
                    "injuries": row_injuries,
                    "summary": raw_narrative
                })
            except Exception:
                continue

        fire_causes_data = [{"cause": k, "count": v} for k, v in sorted(fire_causes_map.items(), key=lambda x: x[1], reverse=True)]
        fire_monthly_data = [{"month": m, "count": fire_monthly_map[m]} for m in month_names]
        fire_concentration_data = sorted(fire_conc_map.values(), key=lambda x: x["count"], reverse=True)

        # 4. ACCIDENTS INTELLIGENCE (CASCADING REGION / STATION)
        accidents_monthly_map = {m: 0 for m in month_names}
        accidents_severity_map = {"MINOR": 0, "SERIOUS": 0, "FATAL": 0}
        accidents_regional_map = {}

        accidents_formatted = []
        for ac in accidents_records:
            try:
                minor_c = safe_int(getattr(ac, 'minor', 0))
                serious_c = safe_int(getattr(ac, 'serious', 0))
                fatal_c = safe_int(getattr(ac, 'fatal', 0))
                victims_c = safe_int(getattr(ac, 'victims', 0))
                total_c = safe_int(getattr(ac, 'total', minor_c + serious_c + fatal_c))
                
                reg = str(getattr(ac, 'region', 'KMP GENERAL')).upper()
                stn = str(getattr(ac, 'station', 'N/A')).upper()
                nature = str(getattr(ac, 'nature_of_accident', 'TRAFFIC ACCIDENT')).upper()

                accidents_severity_map["MINOR"] += minor_c
                accidents_severity_map["SERIOUS"] += serious_c
                accidents_severity_map["FATAL"] += fatal_c

                grp = get_group_label(comparison_level, stn, reg)
                accidents_regional_map[grp] = accidents_regional_map.get(grp, 0) + total_c

                d_str = str(getattr(ac, 'date', ''))
                if d_str and d_str != 'None':
                    clean_d = d_str.split('T')[0][:10]
                    dt = datetime.strptime(clean_d, "%Y-%m-%d")
                    m_label = month_names[dt.month - 1]
                    accidents_monthly_map[m_label] += total_c

                accidents_formatted.append({
                    "id": safe_int(getattr(ac, 'id', getattr(ac, 'sn', 0))),
                    "date": str(getattr(ac, 'date', 'N/A')),
                    "region": reg,
                    "station": stn,
                    "nature": nature,
                    "nature_of_accident": nature,
                    "minor": minor_c,
                    "serious": serious_c,
                    "fatal": fatal_c,
                    "victims": victims_c,
                    "total": total_c
                })
            except Exception:
                continue

        accidents_monthly_data = [{"month": m, "count": accidents_monthly_map[m]} for m in month_names]
        accidents_severity_data = [{"severity": k, "count": v} for k, v in accidents_severity_map.items()]
        accidents_regional_data = [{"region": k, "value": v} for k, v in sorted(accidents_regional_map.items(), key=lambda x: x[1], reverse=True)]

        # 5. CRIME CATEGORIES
        crime_reg_map = {}
        for cr in crime_records:
            try:
                cat = normalize_offence_category(getattr(cr, 'crime_category', getattr(cr, 'offence', 'GENERAL CRIME')))
                reg = get_official_region_for_station(getattr(cr, 'station', ''), getattr(cr, 'region', ''))
                if reg not in crime_reg_map:
                    crime_reg_map[reg] = {"region": reg, "totalCrimes": 0, "categories": {}}
                crime_reg_map[reg]["totalCrimes"] += 1
                crime_reg_map[reg]["categories"][cat] = crime_reg_map[reg]["categories"].get(cat, 0) + 1
            except Exception:
                continue

        crime_category_data = []
        for reg, obj in crime_reg_map.items():
            cat_list = [{"name": c, "count": cnt} for c, cnt in sorted(obj["categories"].items(), key=lambda x: x[1], reverse=True)]
            crime_category_data.append({"region": reg, "totalCrimes": obj["totalCrimes"], "categoryList": cat_list})
        crime_category_data.sort(key=lambda x: x["totalCrimes"], reverse=True)

        # 6. EXHIBITS DATA RETRIEVAL
        exhibits_formatted = []
        for ex in exhibit_records:
            try:
                exhibits_formatted.append({
                    "id": safe_int(getattr(ex, 'id', getattr(ex, 'sn', 0))),
                    "category": str(getattr(ex, 'category', getattr(ex, 'exhibit_category', 'GENERAL')) or 'GENERAL').upper(),
                    "description": str(getattr(ex, 'description', getattr(ex, 'particulars', getattr(ex, 'type_make', 'N/A'))) or 'N/A').upper(),
                    "region": str(getattr(ex, 'region', 'KMP GENERAL') or 'KMP GENERAL').upper(),
                    "station": str(getattr(ex, 'station', getattr(ex, 'division', 'N/A')) or 'N/A').upper(),
                    "status": str(getattr(ex, 'status', 'IMPOUNDED') or 'IMPOUNDED').upper(),
                    "total": 1
                })
            except Exception:
                continue

        # 7. MANPOWER & NOMINAL ROLL INTELLIGENCE
        active_columns = resolve_selected_columns(columns)

        def build_manpower_bucket(records_subset):
            col_maps = {col_key: {} for col_key, _, _ in active_columns}

            for r in records_subset:
                for col_key, _, extractor in active_columns:
                    val = extractor(r)
                    col_maps[col_key][val] = col_maps[col_key].get(val, 0) + 1

            def to_pie(d, col_key=None):
                items = [(k, v) for k, v in d.items() if v > 0]
                if col_key == "rank":
                    ordered = sort_by_rank_hierarchy(items)
                else:
                    ordered = sorted(items, key=lambda x: x[1], reverse=True)
                return [{"name": k, "value": v} for k, v in ordered]

            return {
                "total": len(records_subset),
                "genderDistribution": to_pie(col_maps.get("sex", {})),
                "deployability": to_pie(col_maps.get("status", {})),
                "rankDistribution": to_pie(col_maps.get("rank", {}), "rank"),
                "serviceLength": to_pie(col_maps.get("doe", {})),
                "deploymentLength": to_pie(col_maps.get("do_post", {})),
                "rankTenure": to_pie(col_maps.get("do_pro", {})),
                "ageDemographics": to_pie(col_maps.get("dob", {})),
                "bankBranch": to_pie(col_maps.get("bank_branch", {})),
                "columns": {col_key: to_pie(col_maps[col_key], col_key) for col_key, _, _ in active_columns}
            }

        reg_grouped_nom = {}
        for r in nom_records:
            grp_key = get_group_label(comparison_level, getattr(r, 'station', ''), getattr(r, 'region', ''))
            reg_grouped_nom.setdefault(grp_key, []).append(r)

        manpower_intelligence = {
            "general": build_manpower_bucket(nom_records),
            "byRegion": {reg: build_manpower_bucket(recs) for reg, recs in sorted(reg_grouped_nom.items())},
            "selectedColumns": [{"key": k, "label": lbl} for k, lbl, _ in active_columns],
            "availableColumns": [{"key": k, "label": lbl} for k, lbl, _ in NOMINAL_ROLL_ANALYSIS_COLUMNS]
        }

        return {
            "comparisonLevel": comparison_level,
            "detentionCalendar": {
                "dates": sorted_dates,
                "dateMap": date_map,
                "regionDemographics": list(region_demo_map.values()),
                "regionDuration": list(region_dur_map.values()),
                "ageComparison": detention_age_comparison,
                "dailyMargins": daily_margins
            },
            "successStoriesProcessed": processed_stories,
            "successStoriesComparison": success_stories_comparison,
            "fireIntelligence": {
                "totalFires": total_fire_incidents,
                "totalDeaths": total_fire_deaths,
                "totalInjuries": total_fire_injuries,
                "fireList": fire_list,
                "fireCauses": fire_causes_data,
                "fireMonthly": fire_monthly_data,
                "fireConcentration": fire_concentration_data
            },
            "accidentsIntelligence": {
                "accidentsMonthly": accidents_monthly_data,
                "accidentsSeverity": accidents_severity_data,
                "accidentsRegional": accidents_regional_data
            },
            "crimeCategoryData": crime_category_data,
            "exhibitsData": exhibits_formatted,
            "accidentsData": accidents_formatted,
            "manpowerIntelligence": manpower_intelligence
        }
    except Exception as e:
        print(f"Dashboard Intelligence Critical Error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "comparisonLevel": "REGION",
            "detentionCalendar": {"dates": [], "dateMap": {}, "regionDemographics": [], "regionDuration": [], "ageComparison": [], "dailyMargins": []},
            "successStoriesProcessed": [],
            "successStoriesComparison": [],
            "fireIntelligence": {"totalFires": 0, "totalDeaths": 0, "totalInjuries": 0, "fireList": [], "fireCauses": [], "fireMonthly": [], "fireConcentration": []},
            "accidentsIntelligence": {"accidentsMonthly": [], "accidentsSeverity": [], "accidentsRegional": []},
            "crimeCategoryData": [],
            "exhibitsData": [],
            "accidentsData": [],
            "manpowerIntelligence": {"general": {}, "byRegion": {}, "selectedColumns": [], "availableColumns": []}
        }

@router.get("/export")
def export_analytics_report(
    region: Optional[str] = Query(default=None),
    station: Optional[str] = Query(default=None),
    columns: Optional[str] = Query(default=None),
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(require_export_privilege)
):
    try:
        CrimeModel = get_model_safe('Crime_Reports', 'CrimeReports', 'Reports', 'crime_reports')
        StatsModel = get_model_safe('operational_statistics', 'OperationalStatistics', 'Stats', 'operational_statistics')
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
        nom_records = [r for r in get_scoped_records(NomModel) if not is_invalid_roster_entry(r)]
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
            manpower_table_rows.append([f"REGION: {reg}", "", "", "", ""] + [""] * (len(all_ranks) * 2))
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
        for s in ops_records:
            reg = getattr(s, 'region', 'GENERAL')
            stat = getattr(s, 'station', 'N/A')
            wk = getattr(s, 'date', 'WEEKLY PERIOD')
            arr = safe_int(getattr(s, 'arrested', 0))
            bon = safe_int(getattr(s, 'given_bond', 0))
            cau = safe_int(getattr(s, 'cautioned', 0))
            tak = safe_int(getattr(s, 'taken_to_court', 0))
            rel = safe_int(getattr(s, 'released', 0))
            rem = safe_int(getattr(s, 'remanded', 0))
            con = safe_int(getattr(s, 'convicted', 0))
            disruptive_data.append([str(wk), reg, stat, arr, bon, cau, tak, rel, rem, con])

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
            return ws

        add_individual_sheet("Manpower Analysis", manpower_headers, manpower_table_rows)

        ws_agric = add_individual_sheet("Agricultural Crimes", ["Sub-Category", "Stolen Count", "Recovered Count"], agric_cat_data)
        if agric_cat_data:
            ws_agric.add_chart(
                build_bar_chart("Agricultural Crimes: Stolen vs Recovered", "Sub-Category", "Count", ws_agric, 3, 4, 2, 1, len(agric_cat_data) + 1),
                "F2"
            )

        add_individual_sheet("Success Stories", ["Region", "Station", "Date", "Suspects Arrested", "Recovered Properties", "Legal Status", "Classified Breakdown"], success_detailed_data)
        add_individual_sheet("Exhibits Grouped", exhibit_headers, exhibit_summary_data)
        add_individual_sheet("Disruptive Ops", ["Weekly Period", "Region", "Station", "Arrested", "Given Bond", "Cautioned", "Taken to Court", "Released by Court", "Suspects Remanded", "Suspects Convicted"], disruptive_data)
        
        for period_label, period_key in [("Weekly", "weekly"), ("Monthly", "monthly"), ("Annual", "annual")]:
            det_rows = detention_timeseries[period_key]
            ws_det = add_individual_sheet(
                f"Detention Analysis ({period_label})",
                ["Time Period", "Entries Logged", "Total Suspects", f"{period_label} Trend", "Adult Males", "Trend", "Adult Females", "Trend", "Detained 3+ Days", "Trend"],
                det_rows
            )
            if det_rows:
                ws_det.add_chart(
                    build_bar_chart(f"Cell Detentions ({period_label}) - Total Suspects", "Time Period", "Suspects", ws_det, 4, 4, 2, 1, len(det_rows) + 1, show_legend=False),
                    "M2"
                )

        for period_label, period_key in [("Weekly", "weekly"), ("Monthly", "monthly"), ("Annual", "annual")]:
            acc_rows = accidents_timeseries[period_key]
            ws_acc = add_individual_sheet(
                f"Accidents Analysis ({period_label})",
                ["Time Period", "Entries Logged", "Minor Crashes", f"{period_label} Trend", "Serious Crashes", "Trend", "Fatal Crashes", "Trend", "Total Victims", "Trend", "Total Instances", "Trend"],
                acc_rows
            )
            if acc_rows:
                ws_acc.add_chart(
                    build_bar_chart(f"Traffic Accidents ({period_label}) - Total Instances", "Time Period", "Total Instances", ws_acc, 12, 12, 2, 1, len(acc_rows) + 1, show_legend=False),
                    "O2"
                )

        ws_comp = add_individual_sheet("Comparative Trends", ["Category / Offence", "Total Volume"], comp_data)
        if comp_data:
            chart_end_row = min(len(comp_data), 15) + 1
            ws_comp.add_chart(
                build_bar_chart("Top Crime Categories (Vertical Graph)", "Category / Offence", "Total Volume", ws_comp, 3, 3, 2, 1, chart_end_row, width=18, height=11, show_legend=False),
                "E2"
            )
            ws_comp.add_chart(
                build_pie_chart("Top Crime Categories (Pie Share)", ws_comp, 3, 2, 1, chart_end_row, width=14, height=11),
                "E22"
            )

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
        append_stacked_section("5. Disruptive Operations Grouped Weekly by Station", ["Weekly Period", "Region", "Station", "Arrested", "Given Bond", "Cautioned", "Taken to Court", "Released by Court", "Suspects Remanded", "Suspects Convicted"], disruptive_data)
        append_stacked_section("6. Cell Detentions Analysis (Weekly Time-Series)", ["Time Period", "Entries Logged", "Total Suspects", "Weekly Trend", "Adult Males", "Trend", "Adult Females", "Trend", "Detained 3+ Days", "Trend"], detention_timeseries["weekly"])
        append_stacked_section("7. Traffic Accidents Analysis (Weekly Time-Series)", ["Time Period", "Entries Logged", "Minor Crashes", "Weekly Trend", "Serious Crashes", "Trend", "Fatal Crashes", "Trend", "Total Victims", "Trend", "Total Instances", "Trend"], accidents_timeseries["weekly"])
        append_stacked_section("8. Comparative Distribution & Volume Trends", ["Category / Offence", "Total Volume"], comp_data)
        append_stacked_section("9. Master Summary Table (General & Regional Totals)", ["Operational Metric Attribute", "Aggregate Value / Total"], summary_table_data)

        for col in ws_gen.columns:
            max_len = max([len(str(cell.value or '')) for cell in col], default=0)
            ws_gen.column_dimensions[col[0].column_letter].width = min(max_len + 3, 55)

        # ====================================================================
        # A. COMPARATIVE CRIME TABLE & VERTICAL BAR GRAPH (KMP N / E / S)
        # ====================================================================
        ws_crime_comp = wb.create_sheet(title="Crime Comparative", index=1)
        crime_comp_map = {}
        for cr in cr_records:
            stn = str(getattr(cr, 'station', '') or '').strip().upper()
            reg = get_official_region_for_station(stn, getattr(cr, 'region', ''))
            if reg not in ["KMP NORTH", "KMP EAST", "KMP SOUTH"]:
                continue
            offence = str(getattr(cr, 'offence', None) or getattr(cr, 'crime_category', None) or 'UNSPECIFIED OFFENCE').strip().upper()
            if offence not in crime_comp_map:
                crime_comp_map[offence] = {"KMP NORTH": 0, "KMP EAST": 0, "KMP SOUTH": 0}
            crime_comp_map[offence][reg] += 1

        crime_comp_rows = sorted(
            [(off, d["KMP NORTH"], d["KMP EAST"], d["KMP SOUTH"], d["KMP NORTH"] + d["KMP EAST"] + d["KMP SOUTH"])
             for off, d in crime_comp_map.items()],
            key=lambda x: x[4], reverse=True
        )

        ws_crime_comp.append(["S/N", "Crime / Offence", "KMP North", "KMP East", "KMP South", "Total"])
        for cell in ws_crime_comp[1]:
            cell.fill = header_fill; cell.font = header_font; cell.alignment = Alignment(horizontal="center", vertical="center")

        for idx, (off, n_cnt, e_cnt, s_cnt, tot) in enumerate(crime_comp_rows, 1):
            ws_crime_comp.append([idx, off, n_cnt, e_cnt, s_cnt, tot])

        if crime_comp_rows:
            gt_n = sum(r[1] for r in crime_comp_rows)
            gt_e = sum(r[2] for r in crime_comp_rows)
            gt_s = sum(r[3] for r in crime_comp_rows)
            ws_crime_comp.append(["", "GRAND TOTAL", gt_n, gt_e, gt_s, gt_n + gt_e + gt_s])
            for cell in ws_crime_comp[ws_crime_comp.max_row]:
                cell.fill = section_fill; cell.font = section_font

            ws_crime_comp.add_chart(
                build_bar_chart(
                    "Comparative Crime Breakdown (KMP North vs East vs South)",
                    "Crime / Offence",
                    "Number of Cases Reported",
                    ws_crime_comp, 3, 5, 2, 1, len(crime_comp_rows) + 1,
                    width=22, height=13
                ),
                "H2"
            )

        for col in ws_crime_comp.columns:
            max_len = max([len(str(cell.value or '')) for cell in col], default=0)
            ws_crime_comp.column_dimensions[col[0].column_letter].width = min(max_len + 3, 45)

        # ====================================================================
        # B. MANPOWER BREAKDOWNS (REGIONAL TABLES + PIE & VERTICAL BAR CHARTS)
        # ====================================================================
        ws_mp = wb.create_sheet(title="Manpower Charts & Tables", index=2)

        def build_mp_counts(records_subset, extractor_fn):
            counts = {}
            for r in records_subset:
                k = extractor_fn(r)
                counts[k] = counts.get(k, 0) + 1
            return counts

        mp_dimensions = [(col_key, label, extractor) for col_key, label, extractor in resolve_selected_columns(columns)]

        comparison_level_export = get_comparison_level(current_user, region)
        reg_grouped_export = {}
        for r in nom_records:
            grp_key = get_group_label(comparison_level_export, getattr(r, 'station', ''), getattr(r, 'region', ''))
            reg_grouped_export.setdefault(grp_key, []).append(r)
        sorted_export_groups = sorted(reg_grouped_export.keys())
        group_col_header = "Station" if comparison_level_export == "STATION" else "Region"

        curr_mp_row = 1
        for col_key, dim_title, extractor in mp_dimensions:
            general_counts = build_mp_counts(nom_records, extractor)
            nonzero_items = [(k, v) for k, v in general_counts.items() if v > 0]
            if not nonzero_items:
                continue

            if col_key == "rank":
                ordered_items = sort_by_rank_hierarchy(nonzero_items)
                sorted_cats = [k for k, _ in ordered_items]
            else:
                ordered_items = sorted(nonzero_items, key=lambda x: x[1], reverse=True)
                # OOM GUARD: Cap high-cardinality columns (e.g. bank_branch) to Top 15 + "OTHER"
                if len(ordered_items) > 15:
                    top_items = ordered_items[:15]
                    other_sum = sum(v for _, v in ordered_items[15:])
                    general_counts = dict(top_items)
                    general_counts["OTHER"] = other_sum
                    sorted_cats = [k for k, _ in top_items] + ["OTHER"]
                else:
                    sorted_cats = [k for k, _ in ordered_items]

            ws_mp.cell(row=curr_mp_row, column=1, value=dim_title.upper()).fill = section_fill
            ws_mp.cell(row=curr_mp_row, column=1).font = section_font
            curr_mp_row += 1

            sum_header_row = curr_mp_row
            for c_idx, h_text in enumerate(["Category", "Personnel", "% Share"], 1):
                c = ws_mp.cell(row=sum_header_row, column=c_idx, value=h_text)
                c.fill = header_fill; c.font = header_font; c.alignment = Alignment(horizontal="center", vertical="center")
            curr_mp_row += 1

            dim_total = sum(general_counts.values())
            for cat in sorted_cats:
                val = general_counts[cat]
                pct = f"{(val / dim_total * 100):.1f}%" if dim_total > 0 else "0.0%"
                ws_mp.cell(row=curr_mp_row, column=1, value=cat)
                ws_mp.cell(row=curr_mp_row, column=2, value=val)
                ws_mp.cell(row=curr_mp_row, column=3, value=pct)
                curr_mp_row += 1
            sum_end_row = curr_mp_row - 1

            ws_mp.cell(row=curr_mp_row, column=1, value="TOTAL").font = Font(bold=True)
            ws_mp.cell(row=curr_mp_row, column=2, value=dim_total).font = Font(bold=True)
            ws_mp.cell(row=curr_mp_row, column=3, value="100.0%").font = Font(bold=True)

            ws_mp.add_chart(
                build_pie_chart(f"{dim_title} (Pie)", ws_mp, 2, 1, sum_header_row, sum_end_row, width=13, height=9),
                f"E{sum_header_row}"
            )
            ws_mp.add_chart(
                build_bar_chart(f"{dim_title} (Vertical Graph)", "Category", "Number of Personnel", ws_mp, 2, 2, 1, sum_header_row, sum_end_row, width=15, height=9, show_legend=False),
                f"M{sum_header_row}"
            )

            curr_mp_row = max(curr_mp_row + 2, sum_header_row + 20)

            reg_headers = ["S/NO", group_col_header] + sorted_cats + ["Total"]
            for c_idx, h_text in enumerate(reg_headers, 1):
                c = ws_mp.cell(row=curr_mp_row, column=c_idx, value=h_text)
                c.fill = header_fill; c.font = header_font; c.alignment = Alignment(horizontal="center", vertical="center")
            curr_mp_row += 1

            top_cat_set = set(sorted_cats) - {"OTHER"}
            col_totals = {cat: 0 for cat in sorted_cats}
            for r_idx, grp_name in enumerate(sorted_export_groups, 1):
                raw_counts = build_mp_counts(reg_grouped_export[grp_name], extractor)
                r_counts = {}
                for k, v in raw_counts.items():
                    bucket = k if k in top_cat_set else ("OTHER" if "OTHER" in sorted_cats else k)
                    r_counts[bucket] = r_counts.get(bucket, 0) + v

                row_tot = 0
                ws_mp.cell(row=curr_mp_row, column=1, value=r_idx)
                ws_mp.cell(row=curr_mp_row, column=2, value=grp_name)
                for c_offset, cat in enumerate(sorted_cats, 3):
                    v = r_counts.get(cat, 0)
                    ws_mp.cell(row=curr_mp_row, column=c_offset, value=v)
                    col_totals[cat] += v
                    row_tot += v
                ws_mp.cell(row=curr_mp_row, column=len(sorted_cats) + 3, value=row_tot).font = Font(bold=True)
                curr_mp_row += 1

            ws_mp.cell(row=curr_mp_row, column=1, value="")
            ws_mp.cell(row=curr_mp_row, column=2, value="GRAND TOTAL")
            for c_offset, cat in enumerate(sorted_cats, 3):
                ws_mp.cell(row=curr_mp_row, column=c_offset, value=col_totals[cat])
            ws_mp.cell(row=curr_mp_row, column=len(sorted_cats) + 3, value=sum(col_totals.values()))
            for c_idx in range(1, len(reg_headers) + 1):
                cell = ws_mp.cell(row=curr_mp_row, column=c_idx)
                cell.fill = section_fill; cell.font = section_font

            curr_mp_row += 3

        for col in ws_mp.columns:
            max_len = max([len(str(cell.value or '')) for cell in col], default=0)
            ws_mp.column_dimensions[col[0].column_letter].width = min(max(max_len + 3, 12), 40)

        # Free ORM lists from RAM before serializing Excel + ZIP
        del cr_records, ops_records, ss_records, nom_records, agric_records, ex_records, lockup_records, accidents_records, reg_grouped_export
        gc.collect()

        excel_stream = io.BytesIO()
        wb.save(excel_stream)
        wb.close()
        del wb
        gc.collect()

        zip_stream = io.BytesIO()
        eat_time = datetime.now(pytz.timezone("Africa/Nairobi")).replace(tzinfo=None)
        fnum_clean = str(current_user.fnum).replace('/', '_').upper()
        zip_password = str(current_user.fnum).strip().encode('utf-8')

        with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            zf.writestr(f"{fnum_clean}_Analytics_Report_{eat_time.strftime('%Y%m%d')}.xlsx", excel_stream.getvalue())

        excel_stream.close()
        zip_stream.seek(0)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="ANALYTICS_EXPORT",
            target_id="MASTER_ANALYTICS_REPORT",
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} securely downloaded time-series encrypted Master Analytics & Operations Report with Vertical Charts, Fire Concentration, and Detention Age Comparison."
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