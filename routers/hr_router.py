# routers/hr_router.py
import io
import json
import base64
from datetime import datetime
import openpyxl
import pytz
import pyzipper
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_ORIENT
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1/hr", tags=["HR & Establishments"])

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

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

@router.get("/aggregated-ledger")
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
            user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN"] and
            not is_kmp_sys_mgr and
            not is_kmp_specialist
        )

        nr_query = "SELECT fnum, name, rank, sex, region, station, position, educ_level, status, dob, nin, section, dir FROM nominal_roll WHERE UPPER(status) != 'ARCHIVED'"
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
                    conds.append(f"(UPPER(section) LIKE :spec_{i} OR UPPER(dir) LIKE :spec_{i} OR UPPER(position) LIKE :spec_{i})")
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

        def is_officer(rank_str):
            if not rank_str: return False
            clean = str(rank_str).upper().replace('.', '').replace('/', '').strip()
            keywords = ['IGP', 'DIGP', 'AIGP', 'SCP', 'CP', 'ACP', 'SSP', 'SP', 'ASP', 'IP', 'AIP', 'INSPECTOR', 'SUPERINTENDENT', 'COMMISSIONER']
            return any(kw in clean for kw in keywords)

        def calc_stats(lst):
            stats = {"total": len(lst), "sex": {"M": 0, "F": 0}, "age": {"twenties": 0, "thirties": 0, "forties": 0, "fifties": 0, "unknown": 0}, "edu": {"degree": 0, "diploma": 0, "cert": 0, "uace": 0, "uce": 0, "s2_s3": 0, "others": 0}}
            current_year = datetime.now().year
            for p in lst:
                sex = str(p[3] or '').upper()
                nin = str(p[10] or '').upper()
                if sex == 'F' or nin.startswith('CF'): stats["sex"]["F"] += 1
                else: stats["sex"]["M"] += 1

                dob = p[9]
                if dob:
                    try:
                        birth_year = int(str(dob).split('-')[0])
                        age = current_year - birth_year
                        if 18 <= age <= 29: stats["age"]["twenties"] += 1
                        elif 30 <= age <= 39: stats["age"]["thirties"] += 1
                        elif 40 <= age <= 49: stats["age"]["forties"] += 1
                        elif age >= 50: stats["age"]["fifties"] += 1
                        else: stats["age"]["unknown"] += 1
                    except:
                        stats["age"]["unknown"] += 1
                else:
                    stats["age"]["unknown"] += 1

                edu = normalize_education_level(p[7])
                if "DEGREE" in edu or "BACHELOR" in edu: stats["edu"]["degree"] += 1
                elif "DIP" in edu: stats["edu"]["diploma"] += 1
                elif "CERT" in edu: stats["edu"]["cert"] += 1
                elif edu == "UACE": stats["edu"]["uace"] += 1
                elif edu == "UCE": stats["edu"]["uce"] += 1
                elif "S.2" in edu or "S.3" in edu: stats["edu"]["s2_s3"] += 1
                else: stats["edu"]["others"] += 1
            return stats

        regions_config = [
            {"key": "GENERAL / HQ", "match": ["HEADQUARTERS", "HQ", "GENERAL", "NAGURU"]},
            {"key": "KMP EAST", "match": ["KMP EAST", "EAST"]},
            {"key": "KMP NORTH", "match": ["KMP NORTH", "NORTH"]},
            {"key": "KMP SOUTH", "match": ["KMP SOUTH", "SOUTH"]}
        ]

        nominal_aggregates = []
        for reg in regions_config:
            reg_personnel = [r for r in records if any(m in str(r[4] or '').upper() for m in reg["match"])]
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
            reg = str(r[4] or 'KMP GENERAL').strip().upper()
            pst = str(r[11] or r[12] or '').strip().upper()

            if reg not in region_map:
                region_map[reg] = {"regionName": reg, "hqPersonnel": 0, "stations": {}, "total": 0}

            if 'HEADQUARTERS' in stn and 'DIVISION' not in stn and (not pst or pst == '-'):
                region_map[reg]["hqPersonnel"] += 1
                region_map[reg]["total"] += 1
                continue

            if stn not in region_map[reg]["stations"]:
                region_map[reg]["stations"][stn] = {"stationName": stn, "stationPersonnel": 0, "posts": {}, "total": 0}

            if pst and pst != '-':
                region_map[reg]["stations"][stn]["posts"][pst] = region_map[reg]["stations"][stn]["posts"].get(pst, 0) + 1
            else:
                region_map[reg]["stations"][stn]["stationPersonnel"] += 1

            region_map[reg]["stations"][stn]["total"] += 1
            region_map[reg]["total"] += 1

        return {
            "nominalAggregates": nominal_aggregates,
            "hierarchicalEstablishments": list(region_map.values())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Aggregation Error: {str(e)}")

@router.get("/export-ledger")
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
            user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN"] and
            not is_kmp_sys_mgr and
            not is_kmp_specialist
        )

        nr_query = "SELECT fnum, name, rank, sex, region, station, position, educ_level, status FROM nominal_roll"
        est_query = "SELECT id, region, division, station, personnel_in_station, sub_station, personnel_in_sub_station, post, personnel_in_post, booths, personnel_in_booth, installed_by, location, status, comment, last_updated_by, created_at FROM establishments"

        nr_where = ""
        est_where = ""
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
                    conds.append(f"(UPPER(section) LIKE :spec_{i} OR UPPER(dir) LIKE :spec_{i} OR UPPER(position) LIKE :spec_{i})")
                    params[f"spec_{i}"] = f"%{spec}%"
                nr_where = " WHERE " + " OR ".join(conds)
            else:
                nr_where = " WHERE 1=0"

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
                    
            where_clause = " WHERE " + " OR ".join(conds)
            nr_where = where_clause
            est_where = where_clause
            
        else:
            params['user_stn'] = user_stn
            clean_user_stn = user_stn.replace(' HEADQUARTERS', '').replace(' HQ', '')
            params['clean_stn'] = clean_user_stn
            params['hq_stn'] = f"{clean_user_stn} HEADQUARTERS"
            
            nr_where = " WHERE (UPPER(station) = :user_stn OR UPPER(station) = :clean_stn OR UPPER(station) = :hq_stn)"
            est_where = " WHERE (UPPER(station) = :user_stn OR UPPER(station) = :clean_stn OR UPPER(station) = :hq_stn)"

        nr_records = db.execute(text(nr_query + nr_where), params).fetchall()
        est_records = db.execute(text(est_query + est_where), params).fetchall()

        wb = openpyxl.Workbook()
        ws_nr = wb.active
        ws_nr.title = "Nominal Roll"
        ws_nr.append(["Force Number", "Name", "Rank", "Sex", "Region", "Station", "Position", "Education Level", "Status"])
        for row in nr_records:
            row_list = list(row)
            row_list[7] = normalize_education_level(row_list[7])
            ws_nr.append(row_list)
            
        ws_est = wb.create_sheet(title="establishments")
        ws_est.append(["ID", "Region", "Division", "Station", "Personnel (Station)", "Sub-Station", "Personnel (Sub-Stn)", "Post", "Personnel (Post)", "Booths", "Personnel (Booth)", "Installed By", "Location", "Status", "Comment", "Last Updated By", "Created At"])
        for row in est_records:
            ws_est.append(list(row))

        excel_stream = io.BytesIO()
        wb.save(excel_stream)
        excel_stream.seek(0)

        doc = Document()
        section = doc.sections[0]
        section.orientation = WD_ORIENT.LANDSCAPE
        section.page_width = Inches(11.69) 
        section.page_height = Inches(8.27) 
        section.top_margin = Inches(0.4)
        section.bottom_margin = Inches(0.4)
        section.left_margin = Inches(0.4)
        section.right_margin = Inches(0.4)

        title_p = doc.add_paragraph()
        title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        title_run = title_p.add_run("KAMPALA METROPOLITAN POLICE - HR & ESTABLISHMENTS LEDGER")
        title_run.font.name = 'Arial'
        title_run.font.size = Pt(12)
        title_run.font.bold = True
        title_run.font.color.rgb = RGBColor(15, 23, 42)

        sub_p = doc.add_paragraph()
        sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        jurisdiction_str = "GLOBAL / KMP HEADQUARTERS" if (is_absolute_global or is_kmp_sys_mgr) else (user_reg if is_regional_command else user_stn)
        sub_run = sub_p.add_run(f"Jurisdiction Scope: {jurisdiction_str} | Generated: {datetime.now().strftime('%Y-%m-%d')}")
        sub_run.font.name = 'Arial'
        sub_run.font.size = Pt(9)
        sub_run.font.color.rgb = RGBColor(100, 116, 139)

        h1 = doc.add_paragraph()
        h1_run = h1.add_run("1. Master Personnel Nominal Roll")
        h1_run.font.bold = True
        h1_run.font.size = Pt(10)

        nr_table = doc.add_table(rows=1, cols=8)
        nr_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        nr_table.style = 'Table Grid'
        
        hdr_cells = nr_table.rows[0].cells
        headers = ["F/No", "Name", "Rank", "Sex", "Station", "Position", "Educ Level", "Status"]
        for idx, text_val in enumerate(headers):
            hdr_cells[idx].text = text_val
            for p in hdr_cells[idx].paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    r.font.bold = True
                    r.font.size = Pt(8.5)

        for row in nr_records[:150]:
            row_cells = nr_table.add_row().cells
            row_vals = [str(row[0] or ''), str(row[1] or ''), str(row[2] or ''), str(row[3] or ''), str(row[5] or ''), str(row[6] or ''), normalize_education_level(row[7]), str(row[8] or '')]
            for idx, val in enumerate(row_vals):
                row_cells[idx].text = val
                for p in row_cells[idx].paragraphs:
                    for r in p.runs:
                        r.font.size = Pt(8)

        doc.add_page_break()

        h2 = doc.add_paragraph()
        h2_run = h2.add_run("2. Regional Establishments Breakdown")
        h2_run.font.bold = True
        h2_run.font.size = Pt(10)

        est_table = doc.add_table(rows=1, cols=6)
        est_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        est_table.style = 'Table Grid'

        est_hdrs = ["Division", "Station", "Pers (Stn)", "Sub-Station", "Pers (Sub)", "Status"]
        est_hdr_cells = est_table.rows[0].cells
        for idx, text_val in enumerate(est_hdrs):
            est_hdr_cells[idx].text = text_val
            for p in est_hdr_cells[idx].paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    r.font.bold = True
                    r.font.size = Pt(8.5)

        for row in est_records[:100]:
            row_cells = est_table.add_row().cells
            row_vals = [str(row[2] or ''), str(row[3] or ''), str(row[4] or '0'), str(row[5] or '-'), str(row[6] or '0'), str(row[13] or 'OPERATIONAL')]
            for idx, val in enumerate(row_vals):
                row_cells[idx].text = val
                for p in row_cells[idx].paragraphs:
                    for r in p.runs:
                        r.font.size = Pt(8)

        doc_stream = io.BytesIO()
        doc.save(doc_stream)
        doc_stream.seek(0)

        eat_tz = pytz.timezone("Africa/Nairobi")
        eat_time = datetime.now(eat_tz).replace(tzinfo=None)
        
        officer_fnum = (current_user.fnum or "UNKNOWN").strip().upper()
        zip_stream = io.BytesIO()
        zip_password = str(current_user.fnum).strip().encode('utf-8')

        with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            excel_filename = f"{officer_fnum.replace('/', '_')}_HR_Ledger_{eat_time.strftime('%Y%m%d')}.xlsx"
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