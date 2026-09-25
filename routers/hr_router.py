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

from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1/hr", tags=["HR & Establishments"])

# 🟢 Enriched hierarchy ensuring both "REGION HEADQUARTERS" and "REGION" designations exist
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
    
    # Keep uncertified lower secondary classes as entered
    if any(term in cleaned for term in ['S.1', 'S1', 'S.2', 'S2', 'S.3', 'S3', 'SENIOR 1', 'SENIOR 2', 'SENIOR 3']):
        return cleaned
        
    # Map certified levels
    if any(term in cleaned for term in ['UACE', 'A-LEVEL', 'A LEVEL', 'S.6', 'S6', 'SENIOR 6']):
        return "UACE"
    if any(term in cleaned for term in ['UCE', 'O-LEVEL', 'O LEVEL', 'S.4', 'S4', 'SENIOR 4', 'PLE', 'P.7']):
        return "UCE"
        
    return cleaned

@router.get("/export-ledger")
def export_hr_establishments_zip(
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

        # 🟢 OPSEC Role Classification Engine
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

        # 1. Scope Jurisdiction using unified clearance rules directly mapped to SQL
        if is_absolute_global or is_kmp_sys_mgr:
            pass # Global scope: No WHERE clause required
            
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
                
            # Allow full structural view of establishments for KMP Specialists
            pass

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
            nr_where = " WHERE UPPER(station) = :user_stn"
            est_where = " WHERE UPPER(station) = :user_stn"

        nr_records = db.execute(text(nr_query + nr_where), params).fetchall()
        est_records = db.execute(text(est_query + est_where), params).fetchall()

        # 2. Build Excel File in Memory with Normalized Education Levels
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

        # 3. Build Formatted Two-Page A4 Landscape Word Document matching UI Structure
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

        # 4. Bind and AES Encrypt Data Export Packages 
        with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            excel_filename = f"{officer_fnum.replace('/', '_')}_HR_Ledger_{eat_time.strftime('%Y%m%d')}.xlsx"
            word_filename = f"{officer_fnum.replace('/', '_')}_HR_Ledger_Report_{eat_time.strftime('%Y%m%d')}.docx"
            
            zf.writestr(excel_filename, excel_stream.getvalue())
            zf.writestr(word_filename, doc_stream.getvalue())

        zip_stream.seek(0)

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