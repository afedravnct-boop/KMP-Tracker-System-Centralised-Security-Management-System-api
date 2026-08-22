import io
import json
import base64
from datetime import datetime
import openpyxl
import pytz
import pyzipper
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1/hr", tags=["HR & Establishments"])

@router.get("/export-ledger")
def export_hr_establishments_zip(
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    try:
        # 1. Scope Jurisdiction
        is_global = current_user.role in ['SUPER_ADMIN', 'ADMIN', 'RPC'] or current_user.region in ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS']
        
        nr_query = "SELECT fnum, name, rank, sex, region, station, position, status FROM nominal_roll"
        est_query = "SELECT id, region, division, station, personnel_in_station, sub_station, personnel_in_sub_station, post, personnel_in_post, booths, personnel_in_booth, installed_by, location, status, comment, last_updated_by, created_at FROM establishments"
        
        if not is_global:
            nr_query += f" WHERE region = '{current_user.region}'"
            est_query += f" WHERE region = '{current_user.region}'"
            
        nr_records = db.execute(text(nr_query)).fetchall()
        est_records = db.execute(text(est_query)).fetchall()

        # 2. Build Excel File in Memory
        wb = openpyxl.Workbook()
        
        # Nominal Roll Sheet
        ws_nr = wb.active
        ws_nr.title = "Nominal Roll"
        ws_nr.append(["Force Number", "Name", "Rank", "Sex", "Region", "Station", "Position", "Status"])
        for row in nr_records:
            ws_nr.append(list(row))
            
        # Establishments Sheet
        ws_est = wb.create_sheet(title="establishments")
        ws_est.append(["ID", "Region", "Division", "Station", "Personnel (Station)", "Sub-Station", "Personnel (Sub-Stn)", "Post", "Personnel (Post)", "Booths", "Personnel (Booth)", "Installed By", "Location", "Status", "Comment", "Last Updated By", "Created At"])
        for row in est_records:
            ws_est.append(list(row))

        # 3. Apply Forensic Watermark
        eat_tz = pytz.timezone("Africa/Nairobi")
        eat_time = datetime.now(eat_tz).replace(tzinfo=None)
        
        officer_fnum = (current_user.fnum or "UNKNOWN").strip().upper()
        stamp_id = f"KMP-STAMP-{officer_fnum}-{eat_time.strftime('%Y%m%d%H%M%S')}"
        
        compact_payload = {"f": officer_fnum, "s": stamp_id}
        encoded_token = base64.b64encode(json.dumps(compact_payload).encode('utf-8')).decode('utf-8')
        
        wb.properties.creator = f"{current_user.fnum} {current_user.rank} {current_user.name}"
        wb.properties.lastModifiedBy = f"{current_user.fnum} {current_user.rank} {current_user.name}"
        wb.properties.keywords = f"KMP_AUDIT;{encoded_token}"
        wb.properties.description = f"Export: {current_user.fnum} [{current_user.station}]. ID: {stamp_id}"
        wb.properties.category = "RESTRICTED / FORENSIC POLICE RECORD"

        excel_stream = io.BytesIO()
        wb.save(excel_stream)
        excel_stream.seek(0)

        # 4. Encrypt inside a ZIP using Force Number
        zip_stream = io.BytesIO()
        # The password is the officer's exact force number (e.g., A/2408)
        zip_password = str(current_user.fnum).strip().encode('utf-8')

        with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            excel_filename = f"{officer_fnum.replace('/', '_')}_HR_Ledger_{eat_time.strftime('%Y%m%d')}.xlsx"
            zf.writestr(excel_filename, excel_stream.getvalue())

        zip_stream.seek(0)

        # 5. Send ZIP to Frontend
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