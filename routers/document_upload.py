from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import io
import urllib.parse
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import openpyxl
import os
import boto3
from typing import Optional

from app import models
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["Document Upload & Archive"])

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION")
)
BUCKET_NAME = os.getenv("AWS_BUCKET_NAME")

def log_semantic_audit(db, fnum: str, action: str, target_identifier: str, changes: dict, remarks: str = ""):
    try:
        eat_tz = datetime.utcnow() + timedelta(hours=3)
        formatted_details = f"Target: {target_identifier} | Changes: " + ", ".join(
            [f"{k}: {v[0]} -> {v[1]}" for k, v in changes.items()]
        ) + f" | Remarks: {remarks}"
        
        new_audit = models.Audit_Logs(
            event_type=action,
            target_user=target_identifier,
            status="SUCCESS",
            details=formatted_details,
            user_fnum=fnum,
            created_at=eat_tz.strftime('%Y-%m-%d %H:%M:%S')
        )
        db.add(new_audit)
        db.commit()
    except Exception as e:
        print(f"Audit Log Failed: {e}")
        db.rollback()

@router.get("/reports/archive")
def get_document_archive(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        docs = db.query(models.DocumentArchive).order_by(models.DocumentArchive.upload_date.desc()).all()
        return [
            {
                "id": doc.id,
                "name": doc.file_name,
                "type": doc.doc_type,
                "date": doc.upload_date.strftime("%Y-%m-%d") if doc.upload_date else "",
                "size": doc.file_size or "N/A",
                "file_path": doc.file_path,
                "region": getattr(doc, 'region', 'KMP GENERAL'),
                "station": getattr(doc, 'station', 'KMP HEADQUARTERS')
            } for doc in docs
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch document archive: {str(e)}")

@router.get("/templates/list")
def get_command_templates(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        templates = db.query(models.CommandTemplate).order_by(models.CommandTemplate.last_updated.desc()).all()
        return [
            {
                "id": t.id,
                "name": t.file_name,
                "type": "Command Template", 
                "date": t.last_updated.strftime("%Y-%m-%d") if t.last_updated else "",
                "size": "N/A", 
                "file_path": t.s3_url,
                "region": "KMP HEADQUARTERS",
                "station": "HQ"
            } for t in templates
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch templates: {str(e)}")

@router.get("/reports/download/{doc_id}")
def download_archive_file(
    doc_id: int, 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    # Unified lookup checking DocumentArchive first, then CommandTemplate as fallback
    doc_record = db.query(models.DocumentArchive).filter(models.DocumentArchive.id == doc_id).first()
    is_template_record = False

    if not doc_record:
        doc_record = db.query(models.CommandTemplate).filter(models.CommandTemplate.id == doc_id).first()
        is_template_record = True

    if not doc_record:
        raise HTTPException(status_code=404, detail="Document record not found in system database.")
        
    file_path = doc_record.file_path if not is_template_record else doc_record.s3_url
    file_name = doc_record.file_name

    if not str(file_path).startswith("http"):
        raise HTTPException(status_code=404, detail="Local files cannot be dynamically stamped. Please use S3 uploads.")

    parsed_url = urllib.parse.urlparse(file_path)
    original_s3_key = parsed_url.path.lstrip('/') 
    file_extension = file_name.lower().split('.')[-1]

    try:
        file_stream = io.BytesIO()
        s3_client.download_fileobj(BUCKET_NAME, original_s3_key, file_stream)
        file_stream.seek(0)
        raw_bytes = file_stream.getvalue()

        eat_time = datetime.utcnow() + timedelta(hours=3)
        timestamp_eat = eat_time.strftime("%Y-%m-%d %H:%M:%S EAT")
        processed_date_str = eat_time.strftime("%Y-%m-%d")
        
        receipt_text = (
            "========================================================\n"
            "         KAMPALA METROPOLITAN POLICE HEADQUARTERS         \n"
            "         SECURE DOCUMENT & TEMPLATES ACCESS         \n"
            "--------------------------------------------------------\n"
            f"ACCESSED BY    : {current_user.fnum} - {current_user.rank} {current_user.name}\n"
            f"CLEARANCE      : {current_user.role} | STATION: {current_user.station}\n"
            f"PROCESSED DATE : {processed_date_str}\n"
            f"TIMESTAMP      : {timestamp_eat}\n"
            "========================================================"
        )

        output_stream = io.BytesIO()
        content_type = "application/octet-stream"

        if file_extension == 'docx':
            word_doc = Document(io.BytesIO(raw_bytes))
            section = word_doc.sections[0]
            footer = section.footer
            footer_p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
            footer_p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = footer_p.add_run(receipt_text)
            run.font.name = 'Courier New' 
            run.font.size = Pt(7.5) 
            run.font.bold = True
            run.font.color.rgb = RGBColor(139, 0, 0) 
            word_doc.save(output_stream)
            content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif file_extension in ['xlsx', 'xls']:
            wb = openpyxl.load_workbook(io.BytesIO(raw_bytes))
            for ws in wb.worksheets:
                if hasattr(ws, 'sheet_footer'):
                    ws.sheet_footer.center.text = receipt_text
                elif hasattr(ws, 'odd_footer'):
                    ws.odd_footer.center.text = receipt_text
            wb.save(output_stream)
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else:
            output_stream.write(raw_bytes)

        output_stream.seek(0)

        stamped_s3_key = f"forensic_cache/{current_user.fnum}_DOC_{doc_id}.{file_extension}"
        s3_client.upload_fileobj(
            output_stream, 
            BUCKET_NAME, 
            stamped_s3_key,
            ExtraArgs={"ContentType": content_type}
        )

        aws_region = os.getenv("AWS_REGION", "eu-central-1")
        stamped_url = f"https://{BUCKET_NAME}.s3.{aws_region}.amazonaws.com/{stamped_s3_key}"

        return {"download_url": stamped_url}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Universal Forensic Stamping Error: {str(e)}")

@router.post("/reports/upload-word-report")
async def upload_word_report(
    file: UploadFile = File(...),
    doc_type: str = Form(...),  
    target_region: Optional[str] = Form(None), 
    target_station: Optional[str] = Form(None), 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    try:
        contents = await file.read()
        file_size_kb = max(1, round(len(contents) / 1024))
        file_size_str = f"{file_size_kb} KB" if file_size_kb < 1024 else f"{round(file_size_kb / 1024, 1)} MB"

        effective_region = current_user.region or "KMP GENERAL"
        effective_station = current_user.station or "KMP HEADQUARTERS"
        
        if current_user.role in ["SUPER_ADMIN", "ADMIN"]:
            if target_region: effective_region = target_region.upper()
            if target_station: effective_station = target_station.upper()

        if doc_type == "weekly_report" and file.filename.lower().endswith('.docx'):
            try:
                doc = Document(io.BytesIO(contents))
                for para in doc.paragraphs:
                    para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
                    for run in para.runs:
                        run.font.name = 'Arial'
                        run.font.size = Pt(11)
                formatted_io = io.BytesIO()
                doc.save(formatted_io)
                contents = formatted_io.getvalue()
            except Exception as format_err:
                print(f"Formatting notice: {format_err}")
        
        eat_time = datetime.utcnow() + timedelta(hours=3)
        timestamp = eat_time.strftime("%Y%m%d_%H%M%S")
        safe_filename = f"{timestamp}_{file.filename.replace(' ', '_')}"
        s3_key = f"reports_archive/{safe_filename}"
        
        s3_client.put_object(
            Bucket=BUCKET_NAME, Key=s3_key, Body=contents,
            ContentType=file.content_type, ServerSideEncryption="AES256"
        )
        
        full_s3_url = f"https://{BUCKET_NAME}.s3.{os.getenv('AWS_REGION')}.amazonaws.com/{s3_key}"
        
        if doc_type == "weekly_report":
            display_type = "Weekly Report"
        elif doc_type == "general_doc":
            display_type = "General Document"
        else:
            display_type = doc_type
        
        new_archive = models.DocumentArchive(
            file_name=file.filename,
            doc_type=display_type,
            file_size=file_size_str,
            file_path=full_s3_url, 
            region=effective_region, 
            station=effective_station, 
            uploaded_by=current_user.fnum,
            upload_date=eat_time 
        )
        db.add(new_archive)
        db.commit()

        return {"status": "success", "message": f"Successfully archived {file.filename}."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

@router.delete("/reports/archive/{doc_id}")
def delete_archive_file(
    doc_id: int, 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if current_user.role not in ["SUPER_ADMIN", "ADMIN", "RPC"]:
        raise HTTPException(status_code=403, detail="Command clearance required to delete official records.")
        
    doc_record = db.query(models.DocumentArchive).filter(models.DocumentArchive.id == doc_id).first()
    if not doc_record:
        raise HTTPException(status_code=404, detail="Document not found.")
        
    try:
        if str(doc_record.file_path).startswith("http"):
            parsed_url = urllib.parse.urlparse(doc_record.file_path)
            s3_key = parsed_url.path.lstrip('/')
            try:
                s3_client.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
            except Exception as s3_err:
                print(f"S3 Delete warning: {s3_err}")
            
        db.delete(doc_record)
        db.commit()
        return {"message": "Document successfully deleted."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")