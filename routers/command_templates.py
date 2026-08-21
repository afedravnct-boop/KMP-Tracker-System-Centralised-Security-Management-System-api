import os
import boto3
import pytz
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1/templates", tags=["Command Templates"])

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

def get_template_model():
    for model_name in ['CommandTemplate', 'Command_Template', 'command_template', 'command_templates']:
        if hasattr(models, model_name):
            return getattr(models, model_name)
    return None

@router.get("/list")
def get_command_templates(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        TemplateModel = get_template_model()
        if not TemplateModel:
            return []
            
        templates = db.query(TemplateModel).all()
        results = []
        for t in templates:
            filename = getattr(t, 'file_name', getattr(t, 'filename', getattr(t, 'file_path', 'document')))
            ext = filename.split('.')[-1].lower() if '.' in filename else "unknown"
            
            if ext in ['docx', 'doc']: file_type = "Word Document"
            elif ext in ['xlsx', 'xls']: file_type = "Excel Spreadsheet"
            elif ext in ['pptx', 'ppt']: file_type = "PowerPoint Presentation"
            elif ext == 'pdf': file_type = "PDF Document"
            else: file_type = getattr(t, 'doc_type', 'Command Template')

            upload_dt = getattr(t, 'upload_date', getattr(t, 'uploaded_at', None))
            date_str = upload_dt.strftime("%Y-%m-%d") if isinstance(upload_dt, datetime) else str(upload_dt or "").split(' ')[0]

            results.append({
                "id": getattr(t, 'id', getattr(t, 'sn', 1)),
                "name": filename,
                "type": file_type,
                "date": date_str,
                "size": getattr(t, 'file_size', 'N/A'),
                "file_path": getattr(t, 'file_path', getattr(t, 'filepath', '')),
                "region": getattr(t, 'region', 'KMP HEADQUARTERS'),
                "station": getattr(t, 'station', 'HQ')
            })
        return results
    except Exception as e:
        print(f"Templates List Notice: {str(e)}")
        return []

@router.post("/upload/{template_id_key}")
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

    file_list = [f for f in [file, *(files or [])] if f is not None]
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
                Bucket=BUCKET_NAME, Key=s3_key, Body=contents,
                ContentType=single_file.content_type or "application/octet-stream", ServerSideEncryption="AES256"
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
        print(f"Fetch error: {e}")
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")