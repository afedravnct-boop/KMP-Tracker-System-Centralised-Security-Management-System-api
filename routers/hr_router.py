# routers/hr_router.py
import io
import json
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
import pytz
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
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

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU"]
}

def normalize_education_level(educ_str):
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

def set_cell_background(cell, fill_hex):
    tcPr = cell._element.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill_hex)
    tcPr.append(shd)

def get_opsec_params(current_user):
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

    where_clause = ""
    params = {}

    if is_absolute_global or is_kmp_sys_mgr:
        return "", {}

    if is_kmp_specialist:
        specs = []
        if "CID" in user_pos: specs.append("CID")
        if "CI" in user_pos or "CRIME INT" in user_pos: specs.append("CI")
        if "TRAFFIC" in user_pos: specs.append("TRAFFIC")
        
        if specs:
            conds = []
            for i, spec in enumerate(specs):
                conds.append(f"(UPPER(position) LIKE :spec_{i})")
                params[f"spec_{i}"] = f"%{spec}%"
            where_clause = " WHERE (" + " OR ".join(conds) + ")"
        else:
            where_clause = " WHERE 1=0"
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
                conds.append(f"UPPER(station) IN ({', '.join(stn_keys)})")
        where_clause = " WHERE " + " OR ".join(conds) if len(conds) == 1 else " WHERE " + " AND ".join([conds[0], f"({ ' OR '.join(conds[1:]) })"])
    else:
        params['user_stn'] = user_stn
        clean_user_stn = user_stn.replace(' HEADQUARTERS', '').replace(' HQ', '')
        params['clean_stn'] = clean_user_stn
        params['hq_stn'] = f"{clean_user_stn} HEADQUARTERS"
        where_clause = " WHERE (UPPER(station) = :user_stn OR UPPER(station) = :clean_stn OR UPPER(station) = :hq_stn)"

    return where_clause, params

@router.get("/aggregated-ledger")
def get_aggregated_hr_ledger(
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    try:
        where_clause, params = get_opsec_params(current_user)
        nr_query = "SELECT f_num, name, rank, sex, region, station, position, educ_level, status, dob, nin FROM nominal_roll"
        status_filter = " WHERE UPPER(COALESCE(status, 'ACTIVE')) != 'ARCHIVED'"
        if where_clause:
            status_filter += where_clause.replace("WHERE", "AND")

        records = db.execute(text(nr_query + status_filter), params).fetchall()

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
                nin = str(p[10] or '').upper() if len(p) > 10 and p[10] else ''
                if sex == 'F' or nin.startswith('CF'): stats["sex"]["F"] += 1
                else: stats["sex"]["M"] += 1

                dob = p[9] if len(p) > 9 else None
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
            {"key": "KMP NORTH", "match": ["KMP NORTH"]},
            {"key": "KMP EAST", "match": ["KMP EAST"]},
            {"key": "KMP SOUTH", "match": ["KMP SOUTH"]},
            {"key": "KMP HEADQUARTERS", "match": ["KMP HEADQUARTERS"]},
            {"key": "POLICE HEADQUARTERS", "match": ["POLICE HEADQUARTERS", "NAGURU"]}
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

            if reg not in region_map:
                region_map[reg] = {"regionName": reg, "hqPersonnel": 0, "stations": {}, "total": 0}

            is_reg_hq = stn in ["KMP NORTH HEADQUARTERS", "KMP EAST HEADQUARTERS", "KMP SOUTH HEADQUARTERS", "KMP HEADQUARTERS", "POLICE HEADQUARTERS"]
            if is_reg_hq:
                region_map[reg]["hqPersonnel"] += 1
                region_map[reg]["total"] += 1
                continue

            is_post = "POLICE POST" in stn or " P/P" in stn or stn.endswith(" PP") or "P.P" in stn
            parent_station = stn
            post_name = None
            if is_post:
                parent_station = "LOCAL POLICE POSTS"
                post_name = stn

            if parent_station not in region_map[reg]["stations"]:
                region_map[reg]["stations"][parent_station] = {"stationName": parent_station, "stationPersonnel": 0, "posts": {}, "total": 0}

            if is_post and post_name:
                if post_name not in region_map[reg]["stations"][parent_station]["posts"]:
                    region_map[reg]["stations"][parent_station]["posts"][post_name] = 0
                region_map[reg]["stations"][parent_station]["posts"][post_name] += 1

            region_map[reg]["stations"][parent_station]["stationPersonnel"] += 1
            region_map[reg]["stations"][parent_station]["total"] += 1
            region_map[reg]["total"] += 1

        return {
            "nominalAggregates": nominal_aggregates,
            "hierarchicalEstablishments": list(region_map.values())
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Aggregation Error: {str(e)}")

@router.get("/export-excel")
def export_establishments_excel(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(get_current_user)
):
    try:
        where_clause, params = get_opsec_params(current_user)
        est_query = "SELECT id, region, division, station, personnel_in_station, sub_station, personnel_in_sub_station, post, personnel_in_post, booths, personnel_in_booth, installed_by, location, status, comment, last_updated_by, created_at FROM establishments"
        est_records = db.execute(text(est_query + where_clause), params).fetchall()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Divisions & Stations Counts"
        ws.views.sheetView[0].showGridLines = True

        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
        header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell_font = Font(name="Calibri", size=10)
        thin_border = Border(left=Side(style='thin', color='D1D5DB'), right=Side(style='thin', color='D1D5DB'), top=Side(style='thin', color='D1D5DB'), bottom=Side(style='thin', color='D1D5DB'))

        ws.merge_cells("A1:Q1")
        banner = ws.cell(row=1, column=1, value="UGANDA POLICE FORCE - ESTABLISHMENTS & POSTS COUNT REPORT")
        banner.font = Font(name="Calibri", size=11, bold=True, color="991B1B")
        banner.fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
        banner.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 24

        headers = ["ID", "Region", "Division", "Station", "Personnel (Stn)", "Sub-Station", "Personnel (Sub)", "Post", "Personnel (Post)", "Booths", "Personnel (Booth)", "Installed By", "Location", "Status", "Comment", "Last Updated By", "Created At"]
        ws.row_dimensions[3].height = 26
        for col_idx, h in enumerate(headers, 1):
            cell = ws.cell(row=3, column=col_idx, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align
            cell.border = thin_border

        current_row = 4
        for idx, r in enumerate(est_records):
            row_data = list(r)
            ws.append(row_data)
            ws.row_dimensions[current_row].height = 20
            for col_idx in range(1, len(row_data) + 1):
                cell = ws.cell(row=current_row, column=col_idx)
                cell.font = cell_font
                cell.border = thin_border
                if col_idx in [1, 5, 7, 9, 11, 14]:
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    cell.alignment = Alignment(horizontal="left", vertical="center")
            current_row += 1

        for col in ws.columns:
            col_letter = col[0].column_letter
            max_len = max([len(str(cell.value or '')) for cell in col], default=0)
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 40)

        excel_stream = io.BytesIO()
        wb.save(excel_stream)
        excel_stream.seek(0)

        eat_time = datetime.now(pytz.timezone("Africa/Nairobi")).replace(tzinfo=None)
        filename = f"KMP_Establishments_Report_{eat_time.strftime('%Y%m%d')}.xlsx"

        record_neon_activity(
            logs_db=logs_db, fnum=current_user.fnum, action_type="EXPORT", module="ESTABLISHMENTS_EXCEL",
            target_id="EXCEL_EXPORT", changes_summary=f"{current_user.fnum} downloaded Establishments Excel Report."
        )

        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel Export Error: {str(e)}")

@router.get("/export-word")
def export_demographics_word(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(get_current_user)
):
    try:
        where_clause, params = get_opsec_params(current_user)
        nr_query = "SELECT f_num, name, rank, sex, region, station, position, educ_level, status, dob, nin FROM nominal_roll"
        status_filter = " WHERE UPPER(COALESCE(status, 'ACTIVE')) != 'ARCHIVED'"
        if where_clause:
            status_filter += where_clause.replace("WHERE", "AND")

        records = db.execute(text(nr_query + status_filter), params).fetchall()

        doc = Document()
        section = doc.sections[0]
        section.orientation = WD_ORIENT.LANDSCAPE
        section.page_width = Inches(11.69)
        section.page_height = Inches(8.27)
        section.top_margin = Inches(0.6)
        section.bottom_margin = Inches(0.6)
        section.left_margin = Inches(0.6)
        section.right_margin = Inches(0.6)

        title_p = doc.add_paragraph()
        title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run_title = title_p.add_run("UGANDA POLICE FORCE - KAMPALA METROPOLITAN POLICE\nHR & DEMOGRAPHIC COMMAND SUMMARY REPORT")
        run_title.font.name = "Calibri"
        run_title.font.size = Pt(12)
        run_title.font.bold = True
        run_title.font.color.rgb = RGBColor(153, 27, 27)

        sub_p = doc.add_paragraph()
        sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run_sub = sub_p.add_run(f"Jurisdiction Scope: {current_user.station or current_user.region} | Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        run_sub.font.name = "Calibri"
        run_sub.font.size = Pt(9)
        run_sub.font.color.rgb = RGBColor(100, 116, 139)

        doc.add_paragraph()

        # Compute exact regional totals & demographics matching UI ledger
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
                nin = str(p[10] or '').upper() if len(p) > 10 and p[10] else ''
                if sex == 'F' or nin.startswith('CF'): stats["sex"]["F"] += 1
                else: stats["sex"]["M"] += 1

                dob = p[9] if len(p) > 9 else None
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
            {"key": "KMP NORTH", "match": ["KMP NORTH"]},
            {"key": "KMP EAST", "match": ["KMP EAST"]},
            {"key": "KMP SOUTH", "match": ["KMP SOUTH"]},
            {"key": "KMP HEADQUARTERS", "match": ["KMP HEADQUARTERS"]},
            {"key": "POLICE HEADQUARTERS", "match": ["POLICE HEADQUARTERS", "NAGURU"]}
        ]

        # Add Table mirroring Nominal Roll Aggregates UI
        table = doc.add_table(rows=1, cols=6)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.style = 'Table Grid'
        
        headers = ["Region", "Officers", "NCOs", "Male / Female (Off / NCO)", "Education Breakdown (Off / NCO)", "Region Total"]
        hdr_cells = table.rows[0].cells
        for i, h_text in enumerate(headers):
            hdr_cells[i].text = h_text
            set_cell_background(hdr_cells[i], "1F2937")
            for p in hdr_cells[i].paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    r.font.bold = True
                    r.font.size = Pt(8.5)
                    r.font.color.rgb = RGBColor(255, 255, 255)

        master_off = 0
        master_nco = 0
        master_total = 0

        for reg in regions_config:
            reg_personnel = [r for r in records if any(m in str(r[4] or '').upper() for m in reg["match"])]
            officers = [r for r in reg_personnel if is_officer(r[2])]
            ncos = [r for r in reg_personnel if not is_officer(r[2])]
            
            off_stats = calc_stats(officers)
            nco_stats = calc_stats(ncos)
            
            master_off += len(officers)
            master_nco += len(ncos)
            master_total += len(reg_personnel)

            row_cells = table.add_row().cells
            row_cells[0].text = reg["key"]
            row_cells[1].text = str(len(officers))
            row_cells[2].text = str(len(ncos))
            row_cells[3].text = f"Off: M-{off_stats['sex']['M']} / F-{off_stats['sex']['F']}\nNCO: M-{nco_stats['sex']['M']} / F-{nco_stats['sex']['F']}"
            row_cells[4].text = f"Off Deg:{off_stats['edu']['degree']} Dip:{off_stats['edu']['diploma']} UACE:{off_stats['edu']['uace']} UCE:{off_stats['edu']['uce']}\nNCO Deg:{nco_stats['edu']['degree']} Dip:{nco_stats['edu']['diploma']} UACE:{nco_stats['edu']['uace']} UCE:{nco_stats['edu']['uce']}"
            row_cells[5].text = str(len(reg_personnel))

            for idx, cell in enumerate(row_cells):
                for p in cell.paragraphs:
                    if idx in [0, 3, 4]: p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                    else: p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for r in p.runs: r.font.size = Pt(7.5)

        # Master Total Row
        tot_row = table.add_row().cells
        tot_row[0].text = "KMP MASTER TOTALS"
        tot_row[1].text = str(master_off)
        tot_row[2].text = str(master_nco)
        tot_row[3].text = "-"
        tot_row[4].text = "-"
        tot_row[5].text = str(master_total)
        
        for cell in tot_row:
            set_cell_background(cell, "E5E7EB")
            for p in cell.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    r.font.bold = True
                    r.font.size = Pt(8.5)

        doc_stream = io.BytesIO()
        doc.save(doc_stream)
        doc_stream.seek(0)

        eat_time = datetime.now(pytz.timezone("Africa/Nairobi")).replace(tzinfo=None)
        filename = f"KMP_HR_Demographic_Summary_{eat_time.strftime('%Y%m%d')}.docx"

        record_neon_activity(
            logs_db=logs_db, fnum=current_user.fnum, action_type="EXPORT", module="DEMOGRAPHICS_WORD",
            target_id="WORD_EXPORT", changes_summary=f"{current_user.fnum} downloaded HR Demographic Summary Word Report."
        )

        return StreamingResponse(
            doc_stream,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Word Export Error: {str(e)}")