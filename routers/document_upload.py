import io
import os
import urllib.parse
from datetime import datetime
from typing import Optional, List, Union

import boto3
import docx
import openpyxl
import pytz
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["Document Upload & Archive"])

# AWS S3 Client Configuration
AWS_REGION = os.getenv("AWS_REGION", "eu-central-1")
BUCKET_NAME = os.getenv("AWS_BUCKET_NAME", "kmp-centralised-security-storage")

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=AWS_REGION
)

def get_eat_now():
    eat_tz = pytz.timezone("Africa/Nairobi")
    return datetime.now(eat_tz).replace(tzinfo=None)

def get_doc_archive_model():
    model = getattr(models, 'DocumentArchive', getattr(models, 'document_archive', None))
    if not model:
        raise HTTPException(status_code=500, detail="Document Archive model is not configured.")
    return model

def get_template_model():
    return getattr(models, 'CommandTemplate', getattr(models, 'command_template', None))

def log_semantic_audit(db: Session, fnum: str, action: str, target_identifier: str, changes: dict, remarks: str = ""):
    try:
        eat_time = get_eat_now()
        formatted_details = f"Target: {target_identifier} | Changes: " + ", ".join(
            [f"{k}: {v[0]} -> {v[1]}" for k, v in changes.items()]
        ) + f" | Remarks: {remarks}"
        
        audit_model = getattr(models, 'Audit_Logs', getattr(models, 'AuditLogs', None))
        if audit_model:
            new_audit = audit_model(
                event_type=action,
                target_user=target_identifier,
                status="SUCCESS",
                details=formatted_details,
                user_fnum=fnum,
                created_at=eat_time.strftime('%Y-%m-%d %H:%M:%S')
            )
            db.add(new_audit)
            db.commit()
    except Exception as e:
        print(f"Audit Log Notice: {e}")
        db.rollback()

@router.get("/reports/archive")
def get_document_archive(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        ArchiveModel = get_doc_archive_model()
        pk_col = getattr(ArchiveModel, 'id', getattr(ArchiveModel, 'sn', None))
        
        query = db.query(ArchiveModel)
        if pk_col is not None:
            docs = query.order_by(pk_col.desc()).all()
        else:
            docs = query.all()

        return [
            {
                "id": getattr(doc, 'id', getattr(doc, 'sn', 1)),
                "name": doc.file_name,
                "type": getattr(doc, 'doc_type', "General Document"),
                "date": doc.upload_date.strftime("%Y-%m-%d") if isinstance(doc.upload_date, datetime) else str(doc.upload_date or ""),
                "size": getattr(doc, 'file_size', "N/A"),
                "file_path": doc.file_path,
                "region": getattr(doc, 'region', 'KMP HEADQUARTERS'),
                "station": getattr(doc, 'station', 'KMP HEADQUARTERS')
            } for doc in docs
        ]
    except Exception as e:
        print(f"Archive fetch error: {str(e)}")
        return []

@router.get("/templates/list")
def get_command_templates(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        TemplateModel = get_template_model()
        if not TemplateModel:
            return []
            
        pk_col = getattr(TemplateModel, 'id', getattr(TemplateModel, 'sn', None))
        query = db.query(TemplateModel)
        templates = query.order_by(pk_col.desc()).all() if pk_col is not None else query.all()
        
        results = []
        for t in templates:
            filename = getattr(t, 'file_name', None) or getattr(t, 'file_path', '') or "document"
            ext = filename.split('.')[-1].lower() if '.' in filename else "unknown"
            
            if ext in ['docx', 'doc']:
                file_type = "Word Document"
            elif ext in ['xlsx', 'xls']:
                file_type = "Excel Spreadsheet"
            elif ext in ['pptx', 'ppt']:
                file_type = "PowerPoint Presentation"
            elif ext == 'pdf':
                file_type = "PDF Document"
            else:
                file_type = getattr(t, 'doc_type', 'Command Template')

            upload_dt = getattr(t, 'upload_date', None)
            date_str = upload_dt.strftime("%Y-%m-%d") if isinstance(upload_dt, datetime) else str(upload_dt or "")

            results.append({
                "id": getattr(t, 'id', getattr(t, 'sn', 1)),
                "name": filename,
                "type": file_type,
                "date": date_str,
                "size": getattr(t, 'file_size', 'N/A'),
                "file_path": getattr(t, 'file_path', ''),
                "region": getattr(t, 'region', 'KMP HEADQUARTERS'),
                "station": getattr(t, 'station', 'HQ')
            })
        return results
    except Exception as e:
        print(f"Templates List Notice: {str(e)}")
        return []

@router.post("/templates/upload/{template_id_key}")
async def upload_command_template(
    template_id_key: str,
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    doc_type: str = Form("Command Template"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    TemplateModel = get_template_model()
    if not TemplateModel:
        raise HTTPException(status_code=500, detail="Command Template table model not initialized.")

    file_list = []
    if files:
        file_list.extend(files)
    if file:
        file_list.append(file)
        
    if not file_list:
        raise HTTPException(status_code=400, detail="No template file provided.")

    eat_time = get_eat_now()
    uploaded_count = 0

    try:
        for single_file in file_list:
            contents = await single_file.read()
            file_size_kb = max(1, round(len(contents) / 1024))
            file_size_str = f"{file_size_kb} KB" if file_size_kb < 1024 else f"{round(file_size_kb / 1024, 1)} MB"

            timestamp = eat_time.strftime("%Y%m%d_%H%M%S")
            safe_filename = f"{timestamp}_{single_file.filename.replace(' ', '_')}"
            s3_key = f"command_templates/{safe_filename}"
            
            s3_client.put_object(
                Bucket=BUCKET_NAME, 
                Key=s3_key, 
                Body=contents,
                ContentType=single_file.content_type or "application/octet-stream", 
                ServerSideEncryption="AES256"
            )
            
            full_s3_url = f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
            
            new_template = TemplateModel(
                file_name=single_file.filename,
                doc_type=doc_type,
                file_size=file_size_str,
                file_path=full_s3_url,
                region=getattr(current_user, 'region', 'KMP HEADQUARTERS'),
                station=getattr(current_user, 'station', 'HQ'),
                uploaded_by=current_user.fnum,
                upload_date=eat_time
            )
            db.add(new_template)
            uploaded_count += 1

        db.commit()
        return {"status": "success", "message": f"Successfully uploaded {uploaded_count} template(s)."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to upload template: {str(e)}")

@router.post("/reports/upload-word-report")
async def upload_word_report(
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    doc_type: str = Form(...),  
    target_region: Optional[str] = Form(None), 
    target_station: Optional[str] = Form(None), 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    ArchiveModel = get_doc_archive_model()
    
    file_list = []
    if files:
        file_list.extend(files)
    if file:
        file_list.append(file)
        
    if not file_list:
        raise HTTPException(status_code=400, detail="No files received for intake.")

    effective_region = target_region.upper() if (target_region and current_user.role in ["SUPER_ADMIN", "ADMIN"]) else (current_user.region or "KMP GENERAL")
    effective_station = target_station.upper() if (target_station and current_user.role in ["SUPER_ADMIN", "ADMIN"]) else (current_user.station or "KMP HEADQUARTERS")
    eat_time = get_eat_now()
    uploaded_count = 0

    try:
        for single_file in file_list:
            contents = await single_file.read()
            
            # Format and justify docx if requested
            if doc_type == "weekly_report" and single_file.filename.lower().endswith('.docx'):
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
                    print(f"Document justification notice: {format_err}")

            file_size_kb = max(1, round(len(contents) / 1024))
            file_size_str = f"{file_size_kb} KB" if file_size_kb < 1024 else f"{round(file_size_kb / 1024, 1)} MB"

            timestamp = eat_time.strftime("%Y%m%d_%H%M%S")
            safe_filename = f"{timestamp}_{single_file.filename.replace(' ', '_')}"
            s3_key = f"reports_archive/{safe_filename}"
            
            s3_client.put_object(
                Bucket=BUCKET_NAME, 
                Key=s3_key, 
                Body=contents,
                ContentType=single_file.content_type or "application/octet-stream", 
                ServerSideEncryption="AES256"
            )
            
            full_s3_url = f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
            
            display_type = "Weekly Report" if doc_type == "weekly_report" else ("General Document" if doc_type == "general_doc" else doc_type)
            
            new_archive = ArchiveModel(
                file_name=single_file.filename,
                doc_type=display_type,
                file_size=file_size_str,
                file_path=full_s3_url, 
                region=effective_region, 
                station=effective_station, 
                uploaded_by=current_user.fnum,
                upload_date=eat_time 
            )
            db.add(new_archive)
            uploaded_count += 1

        db.commit()
        return {"status": "success", "message": f"Successfully archived {uploaded_count} document(s)."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to process document intake: {str(e)}")

@router.get("/reports/download/{doc_id}")
@router.get("/templates/download/{doc_id}")
def download_archive_file(
    doc_id: int, 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    ArchiveModel = get_doc_archive_model()
    TemplateModel = get_template_model()
    
    doc_record = db.query(ArchiveModel).filter(ArchiveModel.id == doc_id).first()
    if not doc_record and TemplateModel:
        doc_record = db.query(TemplateModel).filter(TemplateModel.id == doc_id).first()

    if not doc_record:
        raise HTTPException(status_code=404, detail="Document record not found in system database.")
        
    file_path = doc_record.file_path
    file_name = doc_record.file_name

    if not str(file_path).startswith("http"):
        raise HTTPException(status_code=404, detail="Local static files cannot be dynamically watermarked. S3 storage required.")

    parsed_url = urllib.parse.urlparse(file_path)
    original_s3_key = parsed_url.path.lstrip('/') 
    file_extension = file_name.lower().split('.')[-1] if '.' in file_name else "bin"

    try:
        file_stream = io.BytesIO()
        s3_client.download_fileobj(BUCKET_NAME, original_s3_key, file_stream)
        file_stream.seek(0)
        raw_bytes = file_stream.getvalue()

        eat_time = get_eat_now()
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

        stamped_url = f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{stamped_s3_key}"
        return {"download_url": stamped_url, "file_url": stamped_url}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Universal Forensic Stamping Error: {str(e)}")

@router.delete("/reports/archive/{doc_id}")
def delete_archive_file(
    doc_id: int, 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if current_user.role not in ["SUPER_ADMIN", "ADMIN", "RPC"]:
        raise HTTPException(status_code=403, detail="Command clearance required to delete official records.")
        
    ArchiveModel = get_doc_archive_model()
    TemplateModel = get_template_model()
    
    doc_record = db.query(ArchiveModel).filter(ArchiveModel.id == doc_id).first()
    if not doc_record and TemplateModel:
        doc_record = db.query(TemplateModel).filter(TemplateModel.id == doc_id).first()

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
        return {"message": "Document successfully deleted from repository and database."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")