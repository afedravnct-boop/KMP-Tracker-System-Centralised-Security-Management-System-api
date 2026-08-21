import io
import os
import urllib.parse
from datetime import datetime
from typing import Optional, List
import boto3
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import text
from app import models
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["General Documents"])

AWS_REGION = os.getenv("AWS_REGION", "eu-central-1")
BUCKET_NAME = os.getenv("AWS_BUCKET_NAME", "kmp-centralised-security-storage")
s3_client = boto3.client(
    "s3", 
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"), 
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"), 
    region_name=AWS_REGION
)

def get_general_doc_model():
    for name in ['GeneralDocuments', 'General_Documents', 'general_documents']:
        if hasattr(models, name):
            return getattr(models, name)
    raise HTTPException(status_code=500, detail="General Documents model not configured.")

# 🟢 Matches frontend sync (/api/v1/general-documents) as well as legacy list (/api/v1/general-docs/list)
@router.get("/general-documents")
@router.get("/general-docs/list")
def get_general_documents(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        Model = get_general_doc_model()
        docs = db.query(Model).order_by(Model.id.desc()).all()
        return [{
            "id": d.id,
            "name": getattr(d, 'file_name', getattr(d, 'name', 'Document')),
            "type": getattr(d, 'doc_type', getattr(d, 'type', 'General Document')),
            "date": d.upload_date.strftime("%Y-%m-%d") if isinstance(getattr(d, 'upload_date', None), datetime) else str(getattr(d, 'upload_date', getattr(d, 'created_at', ''))).split(' ')[0],
            "size": getattr(d, 'file_size', getattr(d, 'size', 'N/A')),
            "file_path": getattr(d, 'file_path', getattr(d, 'url', '')),
            "region": getattr(d, 'region', 'KMP HEADQUARTERS'),
            "station": getattr(d, 'station', 'HQ')
        } for d in docs]
    except Exception as e:
        print(f"General docs fetch error: {e}")
        return []

# 🟢 Matches both upload endpoints
@router.post("/general-documents/upload")
@router.post("/general-docs/upload")
async def upload_general_document(
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    target_region: Optional[str] = Form(None),
    target_station: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    Model = get_general_doc_model()
    file_list = [f for f in [file, *(files or [])] if f is not None]
    if not file_list:
        raise HTTPException(status_code=400, detail="No files received.")

    uploaded_count = 0
    try:
        for f in file_list:
            contents = await f.read()
            file_size_kb = max(1, round(len(contents) / 1024))
            size_str = f"{file_size_kb} KB" if file_size_kb < 1024 else f"{round(file_size_kb / 1024, 1)} MB"

            s3_key = f"general_docs/{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{f.filename.replace(' ', '_')}"
            s3_client.put_object(
                Bucket=BUCKET_NAME, 
                Key=s3_key, 
                Body=contents, 
                ContentType=f.content_type or "application/octet-stream", 
                ServerSideEncryption="AES256"
            )
            url = f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"

            new_doc = Model(
                file_name=f.filename,
                doc_type="General Document",
                file_size=size_str,
                file_path=url,
                region=target_region or current_user.region or "KMP HEADQUARTERS",
                station=target_station or current_user.station or "HQ",
                uploaded_by=current_user.fnum
            )
            db.add(new_doc)
            uploaded_count += 1
        db.commit()
        return {"status": "success", "message": f"Successfully uploaded {uploaded_count} general document(s)."}
    except Exception as e:
        print(f"Fetch error: {e}")
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")