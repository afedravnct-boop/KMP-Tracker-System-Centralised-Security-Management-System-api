import io
import json
from datetime import datetime
import pytz
import pyzipper
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text

from auth import get_current_user, require_export_privilege
from app.database import get_db
from app import models

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics Exports"])

REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

@router.get("/export")
def export_analytics_report(db: Session = Depends(get_db), current_user = Depends(require_export_privilege)):
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
        
        # 1. Flexible ORM Model Resolution
        CrimeModel = None
        for name in ['Crime_Reports', 'CrimeReports', 'Reports', 'crime_reports']:
            if hasattr(models, name):
                CrimeModel = getattr(models, name)
                break

        StatsModel = None
        for name in ['Operational_Statistics', 'OperationalStatistics', 'Stats', 'operational_statistics']:
            if hasattr(models, name):
                StatsModel = getattr(models, name)
                break

        StoryModel = None
        for name in ['Success_Stories', 'SuccessStories', 'Stories', 'success_stories']:
            if hasattr(models, name):
                StoryModel = getattr(models, name)
                break

        NomModel = None
        for name in ['Nominal_Roll', 'NominalRoll', 'User', 'Users', 'nominal_roll']:
            if hasattr(models, name):
                NomModel = getattr(models, name)
                break

        AgricModel = None
        for name in ['Agricultural_Crime_Summary', 'AgriculturalCrimeSummary', 'agricultural_crime_summary']:
            if hasattr(models, name):
                AgricModel = getattr(models, name)
                break

        def get_scoped_query(ModelClass):
            if not ModelClass:
                return []
            q = db.query(ModelClass)
            
            if is_absolute_global or is_kmp_sys_mgr:
                return q.all()
                
            elif is_kmp_specialist:
                specs = []
                if "CID" in user_pos: specs.append("CID")
                if "CI" in user_pos or "CRIME INT" in user_pos: specs.append("CI")
                if "TRAFFIC" in user_pos: specs.append("TRAFFIC")
                
                if specs:
                    conds = []
                    for spec in specs:
                        if hasattr(ModelClass, 'section'): conds.append(func.upper(ModelClass.section).ilike(f"%{spec}%"))
                        if hasattr(ModelClass, 'dir'): conds.append(func.upper(ModelClass.dir).ilike(f"%{spec}%"))
                        if hasattr(ModelClass, 'position'): conds.append(func.upper(ModelClass.position).ilike(f"%{spec}%"))
                    if conds: return q.filter(or_(*conds)).all()
                return []
                
            elif is_regional_command:
                conds = []
                if hasattr(ModelClass, 'region'):
                    conds.append(func.upper(ModelClass.region) == user_reg)
                
                if hasattr(ModelClass, 'station') and user_reg in REGIONAL_HIERARCHY:
                    expanded_stns = set()
                    for s in REGIONAL_HIERARCHY[user_reg]:
                        expanded_stns.add(s)
                        expanded_stns.add(s.replace(' HEADQUARTERS', '').replace(' HQ', ''))
                        expanded_stns.add(s + ' HEADQUARTERS')
                        expanded_stns.add(s + ' HQ')
                    
                    conds.append(func.upper(ModelClass.station).in_(list(expanded_stns)))
                
                if conds:
                    return q.filter(or_(*conds)).all()
                return []
                
            elif hasattr(ModelClass, 'station') and user_stn:
                return q.filter(func.upper(ModelClass.station) == user_stn).all()
                
            return q.all()

        cr_records = get_scoped_query(CrimeModel)
        ops_records = get_scoped_query(StatsModel)
        ss_records = get_scoped_query(StoryModel)
        nom_records = get_scoped_query(NomModel)
        agric_records = get_scoped_query(AgricModel)

        # 2. Build Specialized Datasets
        agric_breakdown = {"ANIMALS": [0, 0], "PRODUCE": [0, 0], "EQUIPMENT": [0, 0]}
        for ag in agric_records:
            rep_type = str(getattr(ag, 'agric_crime_report', '')).upper()
            stolen = getattr(ag, 'number_count', 0) or 0
            recovered = getattr(ag, 'recoveries', 0) or 0
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
        nco_ranks = ['HCM', 'HC', 'S/SGT', 'SGT', 'CPL', 'L/CPL', 'PC', 'PPC', 'SPC']
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

        success_data = []
        for st in ss_records:
            date_val = str(getattr(st, 'date', ''))
            reg_val = getattr(st, 'region', '')
            stat_val = getattr(st, 'station', '')
            narrative = getattr(st, 'narrative', getattr(st, 'title', 'Successful operation executed.'))
            bullet_sentence = f"• Successful operational breakthrough achieved on {date_val} at {stat_val} ({reg_val}): {narrative}."
            success_data.append([reg_val, stat_val, bullet_sentence])

        disruptive_data = []
        region_ops_totals = {}
        for s in ops_records:
            reg = getattr(s, 'region', 'GENERAL')
            stat = getattr(s, 'station', 'N/A')
            wk = getattr(s, 'date', 'WEEKLY PERIOD')
            
            if reg not in region_ops_totals:
                region_ops_totals[reg] = {"arrested": 0, "bond": 0, "caution": 0, "pending": 0, "court": 0, "released": 0, "remanded": 0, "convicted": 0}
            
            arr = getattr(s, 'arrested', 0) or 0
            bon = getattr(s, 'given_bond', 0) or 0
            cau = getattr(s, 'cautioned', 0) or 0
            pen = getattr(s, 'pending_court', 0) or 0
            tak = getattr(s, 'taken_to_court', 0) or 0
            rel = getattr(s, 'released', 0) or 0
            rem = getattr(s, 'remanded', 0) or 0
            con = getattr(s, 'convicted', 0) or 0

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
            cat = getattr(r, 'offence', 'GENERAL CRIME') or 'GENERAL CRIME'
            comp_counts[cat] = comp_counts.get(cat, 0) + 1
        comp_data = [[k, v] for k, v in sorted(comp_counts.items(), key=lambda x: x[1], reverse=True)]

        summary_table_data = [
            ["Total General Manpower (Force-Wide)", len(nom_records)],
            ["Total General Male Personnel", total_male_general],
            ["Total General Female Personnel", total_female_general],
            ["Total Success Stories (General Force-Wide)", len(ss_records)],
            ["Total Recorded Incidents / Crime Reports", len(cr_records)],
            ["Total Disruptive Operations Logs", len(ops_records)],
            ["Total Suspects Arrested Force-Wide", sum(getattr(s, 'arrested', 0) or 0 for s in ops_records)],
            ["Total Convictions Obtained Force-Wide", sum(getattr(s, 'convicted', 0) or 0 for s in ops_records)]
        ]
        
        for r_name, totals in region_ops_totals.items():
            summary_table_data.append([f"Disruptive Ops Total - Region: {r_name} (Arrested / Convicted)", f"Arrested: {totals['arrested']} | Convicted: {totals['convicted']}"])

        wb = openpyxl.Workbook()
        wb.remove(wb.active)

        header_fill = PatternFill(start_color="002060", end_color="002060", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        section_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        section_font = Font(color="FFFFFF", bold=True, size=11)

        manpower_headers = ["Region", "Station", "Total", "Male", "Female"] + [item for r in all_ranks for item in (f"{r} (M)", f"{r} (F)")]

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
        add_individual_sheet("Success Stories", ["Region", "Station", "Operational Success Highlight (One-Line Bullet)"], success_data)
        add_individual_sheet("Disruptive Ops", ["Weekly Period", "Region", "Station", "Arrested", "Bonded", "Cautioned", "Pending Court", "To Court", "Released", "Remanded", "Convicted"], disruptive_data)
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

        append_stacked_section("1. Manpower Analysis (Officers & NCOs breakdown with HCM/HC)", manpower_headers, manpower_table_rows)
        append_stacked_section("2. Agricultural Crimes Breakdown (Animals, Produce, Equipment)", ["Sub-Category", "Stolen Count", "Recovered Count"], agric_cat_data)
        append_stacked_section("3. Success Stories & Breakthroughs (One-Line Bullet Sentences)", ["Region", "Station", "Operational Success Highlight"], success_data)
        append_stacked_section("4. Disruptive Operations Grouped Weekly by Station", ["Weekly Period", "Region", "Station", "Arrested", "Bonded", "Cautioned", "Pending Court", "To Court", "Released", "Remanded", "Convicted"], disruptive_data)
        append_stacked_section("5. Comparative Distribution & Volume Trends", ["Category / Offence", "Total Volume"], comp_data)
        append_stacked_section("6. Master Summary Table (General & Regional Totals)", ["Operational Metric Attribute", "Aggregate Value / Total"], summary_table_data)

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