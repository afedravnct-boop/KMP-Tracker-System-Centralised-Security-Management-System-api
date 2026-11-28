# routers/hr_router.py
import io
import json
import base64
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
import pytz
import pyzipper
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.enum.section import WD_ORIENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1/hr", tags=["HR & Establishments"])

# ====================================================================
# HIERARCHICAL RANK & COMMAND RESPONSIBILITY WEIGHT ENGINE
# ====================================================================

RANK_SENIORITY = {
    "IGP": 1, "DIGP": 2, "AIGP": 3, "SCP": 4, "CP": 5, "ACP": 6,
    "SSP": 7, "SP": 8, "MAJOR": 8.5, "SASP": 9, "ASP": 10, "IP": 11, "AIP": 12,
    "HCM": 13, "HC": 14, "S/SGT": 15, "SSGT": 15, "SGT": 16,
    "CPL": 17, "L/CPL": 18, "LCPL": 18, "PC": 19, "PPC": 20, "SPC": 21, "CIVILIAN": 50
}

REGION_SORT_PRIORITY = {
    "KMP HEADQUARTERS": 1,
    "KMP NORTH HEADQUARTERS": 2,
    "KMP NORTH": 3,
    "KMP EAST HEADQUARTERS": 4,
    "KMP EAST": 5,
    "KMP SOUTH HEADQUARTERS": 6,
    "KMP SOUTH": 7,
    "POLICE HEADQUARTERS": 8
}

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

# Used for UI & Word Ledger (matches UI order)
REGION_ORDER = [
    "KMP NORTH",
    "KMP EAST",
    "KMP SOUTH",
    "KMP HEADQUARTERS",
    "POLICE HEADQUARTERS"
]

OFFICER_RANKS = {
    "IGP", "DIGP", "AIGP", "SCP", "CP", "ACP", "SSP", "SP", "MAJOR", "SASP", "ASP",
    "IP", "AIP", "INSPECTOR", "SUPERINTENDENT", "COMMISSIONER"
}

NON_RESPONSIBILITY_POSITIONS = {
    "", "-", "N/A", "NA", "NONE", "NIL", "UNASSIGNED", "G/D", "GD",
    "GENERAL DUTY", "GENERAL DUTIES", "GUARD", "B/GUARD", "BODYGUARD",
    "BODY GUARD", "DRIVER", "ORDERLY", "SENTRY", "PATROL", "BEAT",
    "ESCORT", "CONSTABLE", "PC", "COURSE", "STUDY LEAVE", "LEAVE"
}


def clean_str(val) -> str:
    if not val:
        return ''
    return str(val).strip().upper()


def normalize_education_level(educ_str):
    """Normalizes high school levels: keeps uncertified s1-s3 as entered, maps others to UCE or UACE."""
    if not educ_str:
        return "N/A"
    cleaned = str(educ_str).strip().upper()

    if any(term in cleaned for term in ['S.1', 'S1', 'S.2', 'S2', 'S.3', 'S3', 'SENIOR 1', 'SENIOR 2', 'SENIOR 3']):
        return cleaned

    if any(term in cleaned for term in ['UACE', 'A-LEVEL', 'A LEVEL', 'S.6', 'S6', 'SENIOR 6']):
        return "UACE"
    if any(term in cleaned for term in ['UCE', 'O-LEVEL', 'O LEVEL', 'S.4', 'S4', 'SENIOR 4', 'PLE', 'P.7']):
        return "UCE"

    return cleaned


def normalize_region(reg_str, station_str=""):
    """🟢 Normalizes rogue or department-polluted region entries into official KMP regions."""
    combined = f"{str(reg_str or '')} {str(station_str or '')}".upper()

    if any(k in combined for k in ['POLICE HEADQUARTERS', 'NAGURU', 'LOGISTICS & ENGINEERING', 'FIRE & RESCUE']):
        return "POLICE HEADQUARTERS"
    if any(k in combined for k in ['KMP HEADQUARTERS', 'TRAFFIC', 'CID', 'ICT', 'FLYING SQUAD', 'CRIME INTELLIGENCE', 'G/D', 'CFPU', 'LOG AND ENG', 'LOGISTICS']):
        return "KMP HEADQUARTERS"
    if any(k in combined for k in ['NORTH', 'KAWEMPE', 'KAKIRI', 'KASANGATI', 'MATUGGA', 'NANSANA', 'OLD KAMPALA', 'WAKISO', 'WANDEGEYA']):
        return "KMP NORTH"
    if any(k in combined for k in ['EAST', 'JINJA ROAD', 'KIRA', 'MUKONO', 'NAGGALAMA', 'SEETA', 'KMPE']):
        return "KMP EAST"
    if any(k in combined for k in ['SOUTH', 'NATEETE', 'CPS', 'PARLIAMENT', 'ENTEBBE', 'KABALAGALA', 'KAJJANSI', 'KASENYI', 'KATWE', 'KYENGERA', 'NSANGI']):
        return "KMP SOUTH"

    for reg_name, stations in REGIONAL_HIERARCHY.items():
        for stn in stations:
            if stn in combined:
                return reg_name

    return "KMP HEADQUARTERS"


def is_officer(rank_str):
    """Strictly checks officer ranks (avoids matching CPL as CP or SPC as SP)."""
    if not rank_str:
        return False
    clean = str(rank_str).upper().replace('.', '').strip()
    tokens = [t.strip() for part in clean.split('/') for t in part.split() if t.strip()]
    return any(tok in OFFICER_RANKS for tok in tokens)


def has_position_of_responsibility(pos_str):
    """Returns True if the officer holds a substantive position of responsibility."""
    if not pos_str:
        return False
    cleaned = str(pos_str).strip().upper()
    if cleaned in NON_RESPONSIBILITY_POSITIONS:
        return False
    return True


def is_comdr_kmp(pos_str) -> bool:
    pos = clean_str(pos_str)
    if 'DEP' in pos or 'DEPUTY' in pos:
        return False
    return (
        'KMP COMMANDER' in pos or
        (any(k in pos for k in ['COMD', 'COMDR', 'COM', 'COMMANDER', 'CDR']) and 'KMP' in pos)
    )


def get_command_weight(pos_str) -> int:
    try:
        pos = clean_str(pos_str)
        if is_comdr_kmp(pos):
            return 1
        if 'DEPUTY KMP' in pos or 'DEP KMP' in pos or 'DEP. KMP' in pos or (('DEP' in pos or 'DEPUTY' in pos) and 'KMP' in pos):
            return 2
        if 'ADMIN KMP' in pos or 'KMP ADMIN' in pos or 'KMP ADMIN OFFICER' in pos:
            return 3
        if 'RPC' in pos and not ('DEPUTY' in pos or 'DEP' in pos or 'D/RPC' in pos):
            return 1
        if 'DEPUTY RPC' in pos or 'DEP RPC' in pos or 'D/RPC' in pos:
            return 2
        if 'DPC' in pos and not ('DEPUTY' in pos or 'DEP' in pos or 'D/DPC' in pos):
            return 4
        if 'DEPUTY DPC' in pos or 'DEP DPC' in pos or 'D/DPC' in pos:
            return 5
        if (any(k in pos for k in ['COM', 'COMD', 'COMDR', 'COMMANDER', 'CDR'])) and not ('DEP' in pos or 'DEPUTY' in pos):
            return 5
        if 'DEP' in pos or 'DEPUTY' in pos:
            return 6
        if 'OC STATION' in pos or 'O/C STATION' in pos or 'O/C STN' in pos or 'OC STN' in pos or 'OC DIV' in pos or ('OC' in pos and not ('CID' in pos or 'CI' in pos)):
            return 7
        if 'OC CID' in pos or 'O/C CID' in pos or 'HEAD CID' in pos:
            return 8
        if 'OC CI' in pos or 'O/C CI' in pos or 'CRIME INTELLIGENCE' in pos:
            return 9
        if 'OC POST' in pos or 'O/C POST' in pos or 'IC POST' in pos:
            return 10
        if '2I/C' in pos or 'DEPUTY OC' in pos or 'I/C' in pos or 'INCHARGE' in pos:
            return 11
    except Exception:
        pass
    return 50


def get_rank_weight(rank_str: str) -> float:
    if not rank_str:
        return 99
    r = clean_str(rank_str)
    if 'DRV' in r or 'DRIVER' in r:
        if 'SGT' in r or 'SERGEANT' in r:
            r = 'SGT'
        elif 'CPL' in r or 'CORPORAL' in r:
            r = 'CPL'
        else:
            r = 'PC'
    if r == 'DC' or r.startswith('D/C'):
        r = 'PC'
    elif r.startswith('D/') or r.startswith('D-') or r.startswith('D '):
        r = r.replace('D/', '').replace('D-', '').replace('D ', '').strip()
        if r == 'C':
            r = 'PC'
    if not r:
        r = 'PC'
    return RANK_SENIORITY.get(r, 40)


def get_region_priority_for_row(reg_str, station_str) -> int:
    stn = clean_str(station_str)
    reg = normalize_region(reg_str, stn)

    # Place Regional HQ officers directly above Division/Station officers in the same region
    if reg == "KMP NORTH" and stn in {"KMP NORTH HEADQUARTERS", "KMP NORTH", "KMP NORTH HQ"}:
        return REGION_SORT_PRIORITY["KMP NORTH HEADQUARTERS"]
    if reg == "KMP EAST" and stn in {"KMP EAST HEADQUARTERS", "KMP EAST", "KMP EAST HQ"}:
        return REGION_SORT_PRIORITY["KMP EAST HEADQUARTERS"]
    if reg == "KMP SOUTH" and stn in {"KMP SOUTH HEADQUARTERS", "KMP SOUTH", "KMP SOUTH HQ"}:
        return REGION_SORT_PRIORITY["KMP SOUTH HEADQUARTERS"]

    return REGION_SORT_PRIORITY.get(reg, 50)


def get_station_sort_key(reg_name, station_str):
    stn = str(station_str or '').strip().upper()
    hierarchy_list = REGIONAL_HIERARCHY.get(reg_name, [])
    for idx, h_stn in enumerate(hierarchy_list):
        if stn == h_stn or h_stn in stn:
            return (idx, stn)
    return (len(hierarchy_list), stn)


def calc_stats(lst):
    stats = {
        "total": len(lst),
        "sex": {"M": 0, "F": 0},
        "age": {"twenties": 0, "thirties": 0, "forties": 0, "fifties": 0, "unknown": 0},
        "edu": {"degree": 0, "diploma": 0, "cert": 0, "uace": 0, "uce": 0, "s2_s3": 0, "others": 0}
    }
    current_year = datetime.now().year
    for p in lst:
        sex = str(p[3] or '').upper()
        nin = str(p[10] or '').upper() if len(p) > 10 and p[10] else ''
        if sex == 'F' or sex == 'FEMALE' or nin.startswith('CF'):
            stats["sex"]["F"] += 1
        else:
            stats["sex"]["M"] += 1

        dob = p[9] if len(p) > 9 else None
        if dob:
            try:
                birth_year = int(str(dob).split('-')[0])
                age = current_year - birth_year
                if 18 <= age <= 29:
                    stats["age"]["twenties"] += 1
                elif 30 <= age <= 39:
                    stats["age"]["thirties"] += 1
                elif 40 <= age <= 49:
                    stats["age"]["forties"] += 1
                elif age >= 50:
                    stats["age"]["fifties"] += 1
                else:
                    stats["age"]["unknown"] += 1
            except Exception:
                stats["age"]["unknown"] += 1
        else:
            stats["age"]["unknown"] += 1

        edu = normalize_education_level(p[7])
        if "DEGREE" in edu or "BACHELOR" in edu:
            stats["edu"]["degree"] += 1
        elif "DIP" in edu:
            stats["edu"]["diploma"] += 1
        elif "CERT" in edu:
            stats["edu"]["cert"] += 1
        elif edu == "UACE":
            stats["edu"]["uace"] += 1
        elif edu == "UCE":
            stats["edu"]["uce"] += 1
        elif "S.2" in edu or "S.3" in edu or "S2" in edu or "S3" in edu:
            stats["edu"]["s2_s3"] += 1
        else:
            stats["edu"]["others"] += 1
    return stats


def build_ledger_aggregates(records):
    regions_config = [
        {"key": "KMP NORTH", "match": ["KMP NORTH"]},
        {"key": "KMP EAST", "match": ["KMP EAST"]},
        {"key": "KMP SOUTH", "match": ["KMP SOUTH"]},
        {"key": "KMP HEADQUARTERS", "match": ["KMP HEADQUARTERS"]},
        {"key": "POLICE HEADQUARTERS", "match": ["POLICE HEADQUARTERS", "NAGURU"]}
    ]

    nominal_aggregates = []
    for reg in regions_config:
        reg_personnel = [r for r in records if normalize_region(r[4], r[5]) == reg["key"]]
        officers = [r for r in reg_personnel if is_officer(r[2])]
        ncos = [r for r in reg_personnel if not is_officer(r[2])]
        nominal_aggregates.append({
            "region": reg["key"],
            "officers": calc_stats(officers),
            "ncos": calc_stats(ncos),
            "totalOff": len(officers),
            "totalNco": len(ncos),
            "regionTotal": len(reg_personnel)
        })

    region_map = {}
    for r in records:
        stn = str(r[5] or 'HQ').strip().upper()
        raw_reg = str(r[4] or '').strip().upper()
        reg = normalize_region(raw_reg, stn)

        if reg not in region_map:
            region_map[reg] = {"regionName": reg, "hqPersonnel": 0, "stations": {}, "total": 0}

        is_reg_hq = stn in [
            "KMP NORTH HEADQUARTERS", "KMP EAST HEADQUARTERS",
            "KMP SOUTH HEADQUARTERS", "KMP HEADQUARTERS", "POLICE HEADQUARTERS"
        ]

        if is_reg_hq:
            region_map[reg]["hqPersonnel"] += 1
            region_map[reg]["total"] += 1
            continue

        is_post = "POLICE POST" in stn or " P/P" in stn or stn.endswith(" PP") or "P.P" in stn or "P/POST" in stn

        parent_station = stn
        post_name = None
        if is_post:
            parent_station = "LOCAL POLICE POSTS"
            post_name = stn

        if parent_station not in region_map[reg]["stations"]:
            region_map[reg]["stations"][parent_station] = {
                "stationName": parent_station,
                "stationPersonnel": 0,
                "posts": {},
                "total": 0
            }

        if is_post and post_name:
            if post_name not in region_map[reg]["stations"][parent_station]["posts"]:
                region_map[reg]["stations"][parent_station]["posts"][post_name] = 0
            region_map[reg]["stations"][parent_station]["posts"][post_name] += 1

        region_map[reg]["stations"][parent_station]["stationPersonnel"] += 1
        region_map[reg]["stations"][parent_station]["total"] += 1
        region_map[reg]["total"] += 1

    ordered_establishments = []
    for reg_key in REGION_ORDER:
        if reg_key in region_map:
            ordered_establishments.append(region_map[reg_key])
    for reg_key, val in region_map.items():
        if reg_key not in REGION_ORDER:
            ordered_establishments.append(val)

    return nominal_aggregates, ordered_establishments


# --- DOCX STYLING HELPERS ---
def set_cell_background(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tcPr.append(shd)


def set_cell_margins(cell, top=40, bottom=40, left=60, right=60):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)


def style_cell(cell, text_val, font_size=7.5, bold=False, color_rgb=(15, 23, 42), align=WD_ALIGN_PARAGRAPH.CENTER, bg_hex=None):
    cell.text = ""
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    set_cell_margins(cell, top=35, bottom=35, left=50, right=50)
    if bg_hex:
        set_cell_background(cell, bg_hex)
    p = cell.paragraphs[0]
    p.alignment = align
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    run = p.add_run(str(text_val))
    run.font.name = 'Arial'
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = RGBColor(*color_rgb)


def style_multiline_cell(cell, lines, font_size=6.5, align=WD_ALIGN_PARAGRAPH.LEFT, bg_hex=None):
    """lines is a list of tuples: (text_str, bold_bool, color_rgb_tuple)"""
    cell.text = ""
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    set_cell_margins(cell, top=30, bottom=30, left=45, right=45)
    if bg_hex:
        set_cell_background(cell, bg_hex)
    for i, (txt, is_bold, rgb) in enumerate(lines):
        p = cell.paragraphs[0] if i == 0 else cell.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0.5)
        run = p.add_run(txt)
        run.font.name = 'Arial'
        run.font.size = Pt(font_size)
        run.font.bold = is_bold
        run.font.color.rgb = RGBColor(*rgb)


def format_age_lines(age_dict, dark_mode=False):
    base_rgb = (241, 245, 249) if dark_mode else (30, 41, 59)
    red_rgb = (248, 113, 113) if dark_mode else (220, 38, 38)
    return [
        (f"18-29yrs: {age_dict['twenties']}", dark_mode, base_rgb),
        (f"30-39yrs: {age_dict['thirties']}", dark_mode, base_rgb),
        (f"40-49yrs: {age_dict['forties']}", dark_mode, base_rgb),
        (f"50+ yrs: {age_dict['fifties']}", dark_mode, base_rgb),
        (f"Unrecorded: {age_dict['unknown']}", True, red_rgb),
    ]


def format_sex_lines(sex_dict, dark_mode=False):
    m_rgb = (147, 197, 253) if dark_mode else (29, 78, 216)
    f_rgb = (249, 168, 212) if dark_mode else (190, 24, 93)
    return [
        (f"M: {sex_dict['M']}", True, m_rgb),
        (f"F: {sex_dict['F']}", True, f_rgb),
    ]


def format_edu_lines(edu_dict, dark_mode=False):
    base_rgb = (241, 245, 249) if dark_mode else (30, 41, 59)
    blue_rgb = (147, 197, 253) if dark_mode else (37, 99, 235)
    return [
        (f"Degree: {edu_dict['degree']}", dark_mode, base_rgb),
        (f"Diploma: {edu_dict['diploma']}", dark_mode, base_rgb),
        (f"Cert: {edu_dict['cert']}", dark_mode, base_rgb),
        (f"UACE (S6): {edu_dict['uace']}", True, blue_rgb),
        (f"UCE (S4): {edu_dict['uce']}", True, blue_rgb),
        (f"S2/S3: {edu_dict['s2_s3']}", dark_mode, base_rgb),
        (f"Others: {edu_dict['others']}", dark_mode, base_rgb),
    ]


@router.get("/aggregated-ledger")
@router.get("/aggregated-ledger/")
def get_aggregated_hr_ledger(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    try:
        user_role = str(current_user.role).strip().upper() if current_user.role else ""
        user_pos = str(current_user.position).strip().upper() if current_user.position else ""
        user_reg = str(current_user.region).strip().upper() if current_user.region else ""
        user_stn = str(current_user.station).strip().upper() if current_user.station else ""

        perms = current_user.permissions or {}
        if isinstance(perms, str):
            try:
                perms = json.loads(perms)
            except Exception:
                perms = {}

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
            user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN"] and
            not is_kmp_sys_mgr and
            not is_kmp_specialist
        )

        nr_query = "SELECT f_num, name, rank, sex, region, station, position, educ_level, status, dob, nin FROM nominal_roll WHERE UPPER(COALESCE(status, 'ACTIVE')) != 'ARCHIVED'"
        nr_where = ""
        params = {}

        if is_absolute_global or is_kmp_sys_mgr:
            pass
        elif is_kmp_specialist:
            specs = []
            if "CID" in user_pos: specs.append("CID")
            if "CI" in user_pos or "CRIME INT" in user_pos: specs.append("CI")
            if "TRAFFIC" in user_pos: specs.append("TRAFFIC")

            if specs:
                conds = []
                for i, spec in enumerate(specs):
                    conds.append(f"(UPPER(position) LIKE :spec_{i})")
                    params[f"spec_{i}"] = f"%{spec}%"
                nr_where = " AND (" + " OR ".join(conds) + ")"
            else:
                nr_where = " AND 1=0"
        elif is_regional_command:
            conds = ["UPPER(region) = :user_reg"]
            params['user_reg'] = user_reg

            if user_reg in REGIONAL_HIERARCHY:
                expanded_stns = set()
                for s in REGIONAL_HIERARCHY[user_reg]:
                    expanded_stns.add(s)
                    expanded_stns.add(s.replace(' HEADQUARTERS', '').replace(' HQ', ''))
                    expanded_stns.add(s + ' HEADQUARTERS')
                    expanded_stns.add(s + ' HQ')

                stn_keys = []
                for i, s in enumerate(expanded_stns):
                    key = f"stn_{i}"
                    params[key] = s
                    stn_keys.append(f":{key}")

                if stn_keys:
                    in_clause = ", ".join(stn_keys)
                    conds.append(f"UPPER(station) IN ({in_clause})")

            nr_where = " AND (" + " OR ".join(conds) + ")"
        else:
            params['user_stn'] = user_stn
            clean_user_stn = user_stn.replace(' HEADQUARTERS', '').replace(' HQ', '')
            params['clean_stn'] = clean_user_stn
            params['hq_stn'] = f"{clean_user_stn} HEADQUARTERS"

            nr_where = " AND (UPPER(station) = :user_stn OR UPPER(station) = :clean_stn OR UPPER(station) = :hq_stn)"

        records = db.execute(text(nr_query + nr_where), params).fetchall()
        nominal_aggregates, hierarchical_establishments = build_ledger_aggregates(records)

        return {
            "nominalAggregates": nominal_aggregates,
            "hierarchicalEstablishments": hierarchical_establishments
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Aggregation Error: {str(e)}")


@router.get("/export-excel")
@router.get("/export-excel/")
@router.get("/export-ledger")
@router.get("/export-ledger/")
def export_hr_establishments_zip(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(get_current_user)
):
    try:
        user_role = str(current_user.role).strip().upper() if current_user.role else ""
        user_pos = str(current_user.position).strip().upper() if current_user.position else ""
        user_reg = str(current_user.region).strip().upper() if current_user.region else ""
        user_stn = str(current_user.station).strip().upper() if current_user.station else ""

        perms = current_user.permissions or {}
        if isinstance(perms, str):
            try:
                perms = json.loads(perms)
            except Exception:
                perms = {}

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
            user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN"] and
            not is_kmp_sys_mgr and
            not is_kmp_specialist
        )

        nr_query = "SELECT f_num, name, rank, sex, region, station, position, educ_level, status, dob, nin FROM nominal_roll WHERE UPPER(COALESCE(status, 'ACTIVE')) != 'ARCHIVED'"
        nr_where = ""
        params = {}

        if is_absolute_global or is_kmp_sys_mgr:
            pass
        elif is_kmp_specialist:
            specs = []
            if "CID" in user_pos: specs.append("CID")
            if "CI" in user_pos or "CRIME INT" in user_pos: specs.append("CI")
            if "TRAFFIC" in user_pos: specs.append("TRAFFIC")

            if specs:
                conds = []
                for i, spec in enumerate(specs):
                    conds.append(f"(UPPER(position) LIKE :spec_{i})")
                    params[f"spec_{i}"] = f"%{spec}%"
                nr_where = " AND (" + " OR ".join(conds) + ")"
            else:
                nr_where = " AND 1=0"
        elif is_regional_command:
            conds = ["UPPER(region) = :user_reg"]
            params['user_reg'] = user_reg

            if user_reg in REGIONAL_HIERARCHY:
                expanded_stns = set()
                for s in REGIONAL_HIERARCHY[user_reg]:
                    expanded_stns.add(s)
                    expanded_stns.add(s.replace(' HEADQUARTERS', '').replace(' HQ', ''))
                    expanded_stns.add(s + ' HEADQUARTERS')
                    expanded_stns.add(s + ' HQ')

                stn_keys = []
                for i, s in enumerate(expanded_stns):
                    key = f"stn_{i}"
                    params[key] = s
                    stn_keys.append(f":{key}")

                if stn_keys:
                    in_clause = ", ".join(stn_keys)
                    conds.append(f"UPPER(station) IN ({in_clause})")

            nr_where = " AND (" + " OR ".join(conds) + ")"
        else:
            params['user_stn'] = user_stn
            clean_user_stn = user_stn.replace(' HEADQUARTERS', '').replace(' HQ', '')
            params['clean_stn'] = clean_user_stn
            params['hq_stn'] = f"{clean_user_stn} HEADQUARTERS"

            nr_where = " AND (UPPER(station) = :user_stn OR UPPER(station) = :clean_stn OR UPPER(station) = :hq_stn)"

        nr_records = db.execute(text(nr_query + nr_where), params).fetchall()
        nominal_aggregates, hierarchical_establishments = build_ledger_aggregates(nr_records)

        # =====================================================================
        # 1. EXCEL WORKBOOK: ONLY OFFICERS WITH POSITIONS OF RESPONSIBILITY
        #    HIERARCHY: COMDR KMP TOPMOST -> REGION PRIORITY -> RANK -> COMMAND POSITION -> F/NO
        # =====================================================================
        responsibility_officers = [
            r for r in nr_records
            if is_officer(r[2]) and has_position_of_responsibility(r[6])
        ]

        def hierarchical_sort_key(row):
            top_kmp_cmd = 0 if is_comdr_kmp(row[6]) else 1
            reg_pri = get_region_priority_for_row(row[4], row[5])
            rank_w = get_rank_weight(row[2])
            cmd_w = get_command_weight(row[6])
            fnum = clean_str(row[0])
            return (top_kmp_cmd, reg_pri, rank_w, cmd_w, fnum)

        responsibility_officers.sort(key=hierarchical_sort_key)

        wb = openpyxl.Workbook()
        ws_nr = wb.active
        ws_nr.title = "Command & Responsibility"

        excel_headers = [
            "SN", "Force Number", "Rank", "Name", "Sex",
            "Region", "Station", "Position of Responsibility",
            "Education Level", "Status"
        ]
        ws_nr.append(excel_headers)

        header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        header_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
        for col_idx in range(1, len(excel_headers) + 1):
            cell = ws_nr.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for idx, row in enumerate(responsibility_officers, start=1):
            norm_reg = normalize_region(row[4], row[5])
            ws_nr.append([
                idx,
                str(row[0] or ''),
                str(row[2] or ''),
                str(row[1] or ''),
                str(row[3] or ''),
                norm_reg,
                str(row[5] or ''),
                str(row[6] or ''),
                normalize_education_level(row[7]),
                str(row[8] or 'ACTIVE')
            ])

        for col in ws_nr.columns:
            max_len = 0
            col_letter = col[0].column_letter
            for cell in col:
                val_len = len(str(cell.value or ""))
                if val_len > max_len:
                    max_len = val_len
            ws_nr.column_dimensions[col_letter].width = min(max_len + 4, 42)

        excel_stream = io.BytesIO()
        wb.save(excel_stream)
        excel_stream.seek(0)

        # =====================================================================
        # 2. WORD DOCUMENT: MIRRORS UI LEDGER SCREENSHOTS
        #    - Table 1: NOMINAL ROLL AGGREGATES (MANPOWER SUMMARY)
        #    - Table 2: POLICE ESTABLISHMENTS (HIERARCHICAL NOMINAL ROLL EXTRACTION)
        # =====================================================================
        doc = Document()
        section = doc.sections[0]
        section.orientation = WD_ORIENT.LANDSCAPE
        section.page_width = Inches(11.69)
        section.page_height = Inches(8.27)
        section.top_margin = Inches(0.35)
        section.bottom_margin = Inches(0.35)
        section.left_margin = Inches(0.35)
        section.right_margin = Inches(0.35)

        eat_tz = pytz.timezone("Africa/Nairobi")
        eat_time = datetime.now(eat_tz).replace(tzinfo=None)

        title_p = doc.add_paragraph()
        title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        title_p.paragraph_format.space_after = Pt(2)
        title_run = title_p.add_run("KAMPALA METROPOLITAN POLICE — HUMAN RESOURCE & ESTABLISHMENTS LEDGER")
        title_run.font.name = 'Arial'
        title_run.font.size = Pt(12)
        title_run.font.bold = True
        title_run.font.color.rgb = RGBColor(15, 23, 42)

        sub_p = doc.add_paragraph()
        sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        sub_p.paragraph_format.space_after = Pt(8)
        jurisdiction_str = "ALL REGIONS (GLOBAL / KMP HQ)" if (is_absolute_global or is_kmp_sys_mgr) else (user_reg if is_regional_command else user_stn)
        sub_run = sub_p.add_run(f"Jurisdiction Scope: {jurisdiction_str}  |  Generated: {eat_time.strftime('%Y-%m-%d %H:%M EAT')}")
        sub_run.font.name = 'Arial'
        sub_run.font.size = Pt(8.5)
        sub_run.font.color.rgb = RGBColor(100, 116, 139)

        # --- TABLE 1: NOMINAL ROLL AGGREGATES (MANPOWER SUMMARY) ---
        h1 = doc.add_paragraph()
        h1.paragraph_format.space_after = Pt(4)
        h1_run = h1.add_run("1. NOMINAL ROLL AGGREGATES (MANPOWER SUMMARY)")
        h1_run.font.name = 'Arial'
        h1_run.font.bold = True
        h1_run.font.size = Pt(9.5)
        h1_run.font.color.rgb = RGBColor(30, 58, 138)

        agg_table = doc.add_table(rows=2, cols=13)
        agg_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        agg_table.style = 'Table Grid'

        r0 = agg_table.rows[0].cells
        r1 = agg_table.rows[1].cells

        r0[0].merge(r1[0])
        style_cell(r0[0], "SN", font_size=7.5, bold=True, color_rgb=(30, 41, 59), bg_hex="F1F5F9")

        r0[1].merge(r1[1])
        style_cell(r0[1], "REGION", font_size=7.5, bold=True, color_rgb=(30, 41, 59), align=WD_ALIGN_PARAGRAPH.LEFT, bg_hex="F1F5F9")

        r0[2].merge(r0[3])
        style_cell(r0[2], "RANK TOTAL", font_size=7.5, bold=True, color_rgb=(30, 41, 59), bg_hex="F1F5F9")

        r0[4].merge(r0[5])
        style_cell(r0[4], "AGE DEMOGRAPHICS", font_size=7.5, bold=True, color_rgb=(30, 41, 59), bg_hex="F1F5F9")

        r0[6].merge(r0[7])
        style_cell(r0[6], "SEX RATIO", font_size=7.5, bold=True, color_rgb=(30, 41, 59), bg_hex="F1F5F9")

        r0[8].merge(r0[9])
        style_cell(r0[8], "EDUCATION BASE", font_size=7.5, bold=True, color_rgb=(30, 41, 59), bg_hex="F1F5F9")

        r0[10].merge(r0[12])
        style_cell(r0[10], "SUB-TOTALS", font_size=7.5, bold=True, color_rgb=(255, 255, 255), bg_hex="1E3A8A")

        sub_headers = [
            (2, "OFFICERS", (30, 41, 59), "F8FAFC"),
            (3, "NCOS", (30, 41, 59), "F8FAFC"),
            (4, "OFFICERS", (30, 41, 59), "F8FAFC"),
            (5, "NCOS", (30, 41, 59), "F8FAFC"),
            (6, "OFFICERS", (30, 41, 59), "F8FAFC"),
            (7, "NCOS", (30, 41, 59), "F8FAFC"),
            (8, "OFFICERS", (30, 41, 59), "F8FAFC"),
            (9, "NCOS", (30, 41, 59), "F8FAFC"),
            (10, "TOTAL OFF", (255, 255, 255), "1D4ED8"),
            (11, "TOTAL NCO", (255, 255, 255), "047857"),
            (12, "REGION TOTAL", (250, 204, 21), "0F172A"),
        ]
        for col_idx, label, rgb, bg in sub_headers:
            style_cell(r1[col_idx], label, font_size=7, bold=True, color_rgb=rgb, bg_hex=bg)

        m_off_total = 0
        m_nco_total = 0
        m_off_age = {"twenties": 0, "thirties": 0, "forties": 0, "fifties": 0, "unknown": 0}
        m_nco_age = {"twenties": 0, "thirties": 0, "forties": 0, "fifties": 0, "unknown": 0}
        m_off_sex = {"M": 0, "F": 0}
        m_nco_sex = {"M": 0, "F": 0}
        m_off_edu = {"degree": 0, "diploma": 0, "cert": 0, "uace": 0, "uce": 0, "s2_s3": 0, "others": 0}
        m_nco_edu = {"degree": 0, "diploma": 0, "cert": 0, "uace": 0, "uce": 0, "s2_s3": 0, "others": 0}

        for idx, reg_agg in enumerate(nominal_aggregates, start=1):
            row_cells = agg_table.add_row().cells
            off = reg_agg["officers"]
            nco = reg_agg["ncos"]

            m_off_total += reg_agg["totalOff"]
            m_nco_total += reg_agg["totalNco"]
            for k in m_off_age:
                m_off_age[k] += off["age"][k]
                m_nco_age[k] += nco["age"][k]
            for k in m_off_sex:
                m_off_sex[k] += off["sex"][k]
                m_nco_sex[k] += nco["sex"][k]
            for k in m_off_edu:
                m_off_edu[k] += off["edu"][k]
                m_nco_edu[k] += nco["edu"][k]

            style_cell(row_cells[0], str(idx), font_size=7.5, bold=True, color_rgb=(71, 85, 105))
            style_cell(row_cells[1], reg_agg["region"], font_size=7.5, bold=True, color_rgb=(15, 23, 42), align=WD_ALIGN_PARAGRAPH.LEFT)
            style_cell(row_cells[2], str(reg_agg["totalOff"]), font_size=8, bold=True, color_rgb=(29, 78, 216))
            style_cell(row_cells[3], str(reg_agg["totalNco"]), font_size=8, bold=True, color_rgb=(4, 120, 87))

            style_multiline_cell(row_cells[4], format_age_lines(off["age"]), font_size=6.5)
            style_multiline_cell(row_cells[5], format_age_lines(nco["age"]), font_size=6.5)
            style_multiline_cell(row_cells[6], format_sex_lines(off["sex"]), font_size=7, align=WD_ALIGN_PARAGRAPH.CENTER)
            style_multiline_cell(row_cells[7], format_sex_lines(nco["sex"]), font_size=7, align=WD_ALIGN_PARAGRAPH.CENTER)
            style_multiline_cell(row_cells[8], format_edu_lines(off["edu"]), font_size=6.5)
            style_multiline_cell(row_cells[9], format_edu_lines(nco["edu"]), font_size=6.5)

            style_cell(row_cells[10], str(reg_agg["totalOff"]), font_size=8, bold=True, color_rgb=(29, 78, 216), bg_hex="EFF6FF")
            style_cell(row_cells[11], str(reg_agg["totalNco"]), font_size=8, bold=True, color_rgb=(4, 120, 87), bg_hex="ECFDF5")
            style_cell(row_cells[12], str(reg_agg["regionTotal"]), font_size=8.5, bold=True, color_rgb=(15, 23, 42), bg_hex="F1F5F9")

        grand_total = m_off_total + m_nco_total

        # KMP MASTER TOTALS ROW
        mt_cells = agg_table.add_row().cells
        mt_cells[0].merge(mt_cells[1])
        style_cell(mt_cells[0], "KMP MASTER TOTALS:", font_size=8, bold=True, color_rgb=(250, 204, 21), align=WD_ALIGN_PARAGRAPH.CENTER, bg_hex="0F172A")
        style_cell(mt_cells[2], str(m_off_total), font_size=8.5, bold=True, color_rgb=(147, 197, 253), bg_hex="0F172A")
        style_cell(mt_cells[3], str(m_nco_total), font_size=8.5, bold=True, color_rgb=(110, 231, 183), bg_hex="0F172A")
        style_multiline_cell(mt_cells[4], format_age_lines(m_off_age, dark_mode=True), font_size=6.5, bg_hex="1E293B")
        style_multiline_cell(mt_cells[5], format_age_lines(m_nco_age, dark_mode=True), font_size=6.5, bg_hex="1E293B")
        style_multiline_cell(mt_cells[6], format_sex_lines(m_off_sex, dark_mode=True), font_size=7, align=WD_ALIGN_PARAGRAPH.CENTER, bg_hex="1E293B")
        style_multiline_cell(mt_cells[7], format_sex_lines(m_nco_sex, dark_mode=True), font_size=7, align=WD_ALIGN_PARAGRAPH.CENTER, bg_hex="1E293B")
        style_multiline_cell(mt_cells[8], format_edu_lines(m_off_edu, dark_mode=True), font_size=6.5, bg_hex="1E293B")
        style_multiline_cell(mt_cells[9], format_edu_lines(m_nco_edu, dark_mode=True), font_size=6.5, bg_hex="1E293B")
        style_cell(mt_cells[10], str(m_off_total), font_size=8.5, bold=True, color_rgb=(255, 255, 255), bg_hex="1D4ED8")
        style_cell(mt_cells[11], str(m_nco_total), font_size=8.5, bold=True, color_rgb=(255, 255, 255), bg_hex="047857")
        style_cell(mt_cells[12], str(grand_total), font_size=9, bold=True, color_rgb=(250, 204, 21), bg_hex="020617")

        # OVERALL GRAND TOTAL ROW
        gt_cells = agg_table.add_row().cells
        gt_cells[0].merge(gt_cells[1])
        style_cell(gt_cells[0], "OVERALL GRAND TOTAL:", font_size=8, bold=True, color_rgb=(250, 204, 21), align=WD_ALIGN_PARAGRAPH.CENTER, bg_hex="020617")

        gt_cells[2].merge(gt_cells[3])
        style_cell(gt_cells[2], str(grand_total), font_size=9.5, bold=True, color_rgb=(250, 204, 21), bg_hex="020617")

        comb_age = {k: m_off_age[k] + m_nco_age[k] for k in m_off_age}
        gt_cells[4].merge(gt_cells[5])
        style_multiline_cell(gt_cells[4], format_age_lines(comb_age, dark_mode=True), font_size=6.5, align=WD_ALIGN_PARAGRAPH.CENTER, bg_hex="020617")

        comb_sex = {k: m_off_sex[k] + m_nco_sex[k] for k in m_off_sex}
        gt_cells[6].merge(gt_cells[7])
        style_multiline_cell(gt_cells[6], format_sex_lines(comb_sex, dark_mode=True), font_size=7.5, align=WD_ALIGN_PARAGRAPH.CENTER, bg_hex="020617")

        comb_edu = {k: m_off_edu[k] + m_nco_edu[k] for k in m_off_edu}
        gt_cells[8].merge(gt_cells[9])
        style_multiline_cell(gt_cells[8], format_edu_lines(comb_edu, dark_mode=True), font_size=6.5, align=WD_ALIGN_PARAGRAPH.CENTER, bg_hex="020617")

        style_cell(gt_cells[10], str(m_off_total), font_size=8.5, bold=True, color_rgb=(255, 255, 255), bg_hex="1E3A8A")
        style_cell(gt_cells[11], str(m_nco_total), font_size=8.5, bold=True, color_rgb=(255, 255, 255), bg_hex="065F46")
        style_cell(gt_cells[12], str(grand_total), font_size=9.5, bold=True, color_rgb=(250, 204, 21), bg_hex="020617")

        # --- PAGE BREAK FOR TABLE 2 ---
        doc.add_page_break()

        # --- TABLE 2: POLICE ESTABLISHMENTS (HIERARCHICAL NOMINAL ROLL EXTRACTION) ---
        h2 = doc.add_paragraph()
        h2.paragraph_format.space_after = Pt(4)
        h2_run = h2.add_run("2. POLICE ESTABLISHMENTS (HIERARCHICAL NOMINAL ROLL EXTRACTION)")
        h2_run.font.name = 'Arial'
        h2_run.font.bold = True
        h2_run.font.size = Pt(9.5)
        h2_run.font.color.rgb = RGBColor(4, 120, 87)

        est_table = doc.add_table(rows=1, cols=8)
        est_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        est_table.style = 'Table Grid'

        est_hdrs = [
            ("SN", "0F172A"),
            ("REGIONAL HQ", "0F172A"),
            ("NO OF PERSONNEL", "0F172A"),
            ("STATION", "0F172A"),
            ("NO OF PERSONNEL", "0F172A"),
            ("POST", "0F172A"),
            ("NO OF PERSONNEL", "0F172A"),
            ("TOTAL MANPOWER", "047857"),
        ]
        hdr_cells = est_table.rows[0].cells
        for idx, (label, bg) in enumerate(est_hdrs):
            align = WD_ALIGN_PARAGRAPH.LEFT if idx in [1, 3, 5] else WD_ALIGN_PARAGRAPH.CENTER
            style_cell(hdr_cells[idx], label, font_size=7.5, bold=True, color_rgb=(255, 255, 255), align=align, bg_hex=bg)

        for reg_idx, reg_obj in enumerate(hierarchical_establishments, start=1):
            r_cells = est_table.add_row().cells
            reg_label = reg_obj["regionName"]
            if "HEADQUARTERS" not in reg_label:
                reg_label = f"{reg_label} HEADQUARTERS"

            style_cell(r_cells[0], str(reg_idx), font_size=7.5, bold=True, color_rgb=(15, 23, 42), bg_hex="F8FAFC")
            style_cell(r_cells[1], reg_label, font_size=8, bold=True, color_rgb=(15, 23, 42), align=WD_ALIGN_PARAGRAPH.LEFT, bg_hex="F8FAFC")
            style_cell(r_cells[2], str(reg_obj["hqPersonnel"]), font_size=8, bold=True, color_rgb=(29, 78, 216), bg_hex="F8FAFC")
            style_cell(r_cells[3], "-", font_size=7.5, color_rgb=(148, 163, 184), bg_hex="F8FAFC")
            style_cell(r_cells[4], "-", font_size=7.5, color_rgb=(148, 163, 184), bg_hex="F8FAFC")
            style_cell(r_cells[5], "-", font_size=7.5, color_rgb=(148, 163, 184), bg_hex="F8FAFC")
            style_cell(r_cells[6], "-", font_size=7.5, color_rgb=(148, 163, 184), bg_hex="F8FAFC")
            style_cell(r_cells[7], str(reg_obj["total"]), font_size=8.5, bold=True, color_rgb=(255, 255, 255), bg_hex="047857")

            stations_sorted = sorted(
                reg_obj["stations"].values(),
                key=lambda s: get_station_sort_key(reg_obj["regionName"], s["stationName"])
            )
            for stn_obj in stations_sorted:
                s_cells = est_table.add_row().cells
                style_cell(s_cells[0], "-", font_size=7, color_rgb=(148, 163, 184))
                style_cell(s_cells[1], "-", font_size=7, color_rgb=(148, 163, 184))
                style_cell(s_cells[2], "-", font_size=7, color_rgb=(148, 163, 184))
                style_cell(s_cells[3], f"↳ {stn_obj['stationName']}", font_size=7.5, bold=True, color_rgb=(30, 41, 59), align=WD_ALIGN_PARAGRAPH.LEFT)
                style_cell(s_cells[4], str(stn_obj["stationPersonnel"]), font_size=7.5, bold=True, color_rgb=(4, 120, 87))
                style_cell(s_cells[5], "-", font_size=7, color_rgb=(148, 163, 184))
                style_cell(s_cells[6], "-", font_size=7, color_rgb=(148, 163, 184))
                style_cell(s_cells[7], str(stn_obj["total"]), font_size=7.5, bold=True, color_rgb=(4, 120, 87))

                for post_name, post_count in sorted(stn_obj["posts"].items()):
                    p_cells = est_table.add_row().cells
                    style_cell(p_cells[0], "-", font_size=7, color_rgb=(203, 213, 225))
                    style_cell(p_cells[1], "-", font_size=7, color_rgb=(203, 213, 225))
                    style_cell(p_cells[2], "-", font_size=7, color_rgb=(203, 213, 225))
                    style_cell(p_cells[3], "-", font_size=7, color_rgb=(203, 213, 225))
                    style_cell(p_cells[4], "-", font_size=7, color_rgb=(203, 213, 225))
                    style_cell(p_cells[5], f"↳ {post_name}", font_size=7, color_rgb=(51, 65, 85), align=WD_ALIGN_PARAGRAPH.LEFT)
                    style_cell(p_cells[6], str(post_count), font_size=7.5, bold=True, color_rgb=(217, 119, 6))
                    style_cell(p_cells[7], str(post_count), font_size=7.5, bold=True, color_rgb=(217, 119, 6))

        doc_stream = io.BytesIO()
        doc.save(doc_stream)
        doc_stream.seek(0)

        officer_fnum = (current_user.fnum or "UNKNOWN").strip().upper()
        zip_stream = io.BytesIO()
        zip_password = str(current_user.fnum).strip().encode('utf-8')

        with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            excel_filename = f"{officer_fnum.replace('/', '_')}_HR_Command_Officers_{eat_time.strftime('%Y%m%d')}.xlsx"
            word_filename = f"{officer_fnum.replace('/', '_')}_HR_Ledger_Report_{eat_time.strftime('%Y%m%d')}.docx"

            zf.writestr(excel_filename, excel_stream.getvalue())
            zf.writestr(word_filename, doc_stream.getvalue())

        zip_stream.seek(0)

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="HR_ESTABLISHMENTS_EXPORT",
            target_id="MASTER_HR_LEDGER",
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} securely downloaded password-encrypted Master HR & Establishments Ledger packages."
        )

        zip_filename = f"SECURE_HR_LEDGER_{eat_time.strftime('%Y%m%d')}.zip"
        headers = {
            'Content-Disposition': f'attachment; filename="{zip_filename}"',
            'Access-Control-Expose-Headers': 'Content-Disposition'
        }

        return StreamingResponse(
            zip_stream,
            media_type="application/zip",
            headers=headers
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export Error: {str(e)}")