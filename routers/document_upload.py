from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import io
import urllib.parse
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import openpyxl
from pptx import Presentation
from pptx.util import Inches, Pt as PPTXPt
from pptx.dml.color import RGBColor as PPTXRGBColor
import fitz
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
                "size": doc.file_size,
                "file_path": doc.file_path,
                "region": doc.region,
                "station": doc.station
            } for doc in docs
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch archive: {str(e)}")

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

        is_duplicate = db.query(models.DocumentArchive).filter(
            models.DocumentArchive.file_name == file.filename,
            models.DocumentArchive.file_size == file_size_str
        ).first()
        
        if is_duplicate:
            raise HTTPException(status_code=400, detail="DUPLICATE DETECTED: This document has already been uploaded.")

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
                print(f"Skipping formatting for {file.filename}: {format_err}")
        
        eat_time = datetime.utcnow() + timedelta(hours=3)
        timestamp = eat_time.strftime("%Y%m%d_%H%M%S")
        safe_filename = f"{timestamp}_{file.filename.replace(' ', '_')}"
        s3_key = f"reports_archive/{safe_filename}"
        
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=contents,
            ContentType=file.content_type,
            ServerSideEncryption="AES256"
        )
        
        full_s3_url = f"https://{BUCKET_NAME}.s3.{os.getenv('AWS_REGION')}.amazonaws.com/{s3_key}"
        display_type = "Formatted Weekly Report" if doc_type == "weekly_report" else "General Document"
        
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

        if hasattr(models, 'Audit_Logs'):
            log_semantic_audit(
                db=db, fnum=current_user.fnum, action="DOCUMENT_UPLOADED",
                target_identifier=file.filename, changes={}, 
                remarks=f"Successfully ingested {display_type} to S3 for {effective_region} / {effective_station}"
            )

        return {
            "status": "success",
            "message": f"Successfully processed and securely archived {file.filename} under {effective_station}.",
            "jurisdiction": {"region": effective_region, "station": effective_station}
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

@app.delete("/reports/archive/{doc_id}") # Note: use router.delete instead of app.delete
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
        raise HTTPException(status_code=404, detail="Document not found in the database.")
        
    try:
        if str(doc_record.file_path).startswith("http"):
            parsed_url = urllib.parse.urlparse(doc_record.file_path)
            s3_key = parsed_url.path.lstrip('/')
            try:
                s3_client.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
            except Exception as s3_err:
                print(f"Warning: Could not delete S3 object {s3_key}: {s3_err}")
            
        db.delete(doc_record)
        log_semantic_audit(
            db=db, fnum=current_user.fnum, action="DOCUMENT_DELETED",
            target_identifier=doc_record.file_name, changes={}, 
            remarks="Admin permanently deleted document from secure archives and S3."
        )
        db.commit()
        return {"message": "Document and associated cloud data successfully deleted."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")