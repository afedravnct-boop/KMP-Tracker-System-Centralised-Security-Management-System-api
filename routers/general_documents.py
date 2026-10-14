import io
import os
import json
import base64
import urllib.parse
from datetime import datetime
from typing import Optional, List
import boto3
import openpyxl
import pymupdf
import pytz
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor
from docx.oxml import parse_xml
from pptx import Presentation
from pptx.util import Inches, Pt as PPTXPt
from pptx.dml.color import RGBColor as PPTXRGBColor

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from app import models
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1", tags=["General Documents"])

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

def get_general_doc_model():
    for name in ['GeneralDocuments', 'General_Documents', 'general_documents']:
        if hasattr(models, name):
            return getattr(models, name)
    raise HTTPException(status_code=500, detail="General Documents model not configured.")

@router.get("/general-documents")
@router.get("/general-docs/list")
def get_general_documents(
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(get_current_user)
):
    try:
        Model = get_general_doc_model()
        docs = db.query(Model).order_by(Model.id.desc()).all()
        
        serialized_docs = [{
            "id": d.id,
            "name": getattr(d, 'file_name', getattr(d, 'name', 'Document')),
            "type": getattr(d, 'doc_type', getattr(d, 'type', 'General Document')),
            "date": d.upload_date.strftime("%Y-%m-%d") if isinstance(getattr(d, 'upload_date', None), datetime) else str(getattr(d, 'upload_date', getattr(d, 'created_at', ''))).split(' ')[0],
            "size": getattr(d, 'file_size', getattr(d, 'size', 'N/A')),
            "file_path": getattr(d, 'file_path', getattr(d, 'url', '')),
            "region": getattr(d, 'region', 'KMP HEADQUARTERS'),
            "station": getattr(d, 'station', 'HQ')
        } for d in docs]

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="VIEW",
            module="GENERAL_DOCUMENTS",
            target_id="ALL_DOCUMENTS",
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} accessed General Documents repository (Fetched {len(serialized_docs)} files)."
        )

        return serialized_docs
    except Exception as e:
        print(f"General docs fetch error: {e}")
        return []

@router.post("/general-documents/upload")
@router.post("/general-docs/upload")
async def upload_general_document(
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    target_region: Optional[str] = Form(None),
    target_station: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
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

            record_neon_activity(
                logs_db=logs_db,
                fnum=current_user.fnum,
                action_type="REGISTER",
                module="GENERAL_DOCUMENTS",
                target_id=f.filename,
                changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} uploaded document titled \"{f.filename}\"."
            )
            
        db.commit()

        return {"status": "success", "message": f"Successfully uploaded {uploaded_count} general document(s)."}
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        print(f"Fetch error: {e}")
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")

# 🟢 Added Forensic Watermarking and Stamping Engine to General Documents Download Route
@router.get("/general-docs/download/{doc_id}")
@router.get("/general-documents/download/{doc_id}")
def download_general_document(
    doc_id: int, 
    return_url: bool = False,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(get_current_user)
):
    Model = get_general_doc_model()
    doc_record = db.query(Model).filter(Model.id == doc_id).first()
    if not doc_record:
        raise HTTPException(status_code=404, detail="General document record not found.")
        
    file_path = getattr(doc_record, 'file_path', getattr(doc_record, 'url', ''))
    file_name = getattr(doc_record, 'file_name', getattr(doc_record, 'name', 'document'))

    if not str(file_path).startswith("http"):
        raise HTTPException(status_code=404, detail="File path invalid or missing S3 storage link.")

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

        officer_fnum = (current_user.fnum or "HQ-UNKNOWN").strip().upper()
        officer_rank = (current_user.rank or "OFFICER").strip().upper()
        officer_name = (current_user.name or "UNKNOWN").strip().upper()
        officer_signature = f"{officer_fnum} {officer_rank} {officer_name}"
        command_post = f"{current_user.station or 'KMP HEADQUARTERS'}, {current_user.region or 'KMP HEADQUARTERS'}"
        stamp_id = f"KMP-STAMP-{officer_fnum}-{eat_time.strftime('%Y%m%d%H%M%S')}"

        compact_payload = {"f": officer_fnum, "s": stamp_id}
        encoded_token = base64.b64encode(json.dumps(compact_payload).encode('utf-8')).decode('utf-8')
        keywords_str = f"KMP_AUDIT;{encoded_token}"[:250]
        comments_str = f"Export: {officer_signature} [{command_post}]. ID: {stamp_id}"

        vertical_stamp_text = f"SECURE ACCESS BY: {officer_signature}  |  CLEARANCE: {current_user.role}  |  STAMP ID: {stamp_id}  |  TIMESTAMP: {timestamp_eat}"

        output_stream = io.BytesIO()
        content_type = "application/octet-stream"

        if file_extension == 'docx':
            word_doc = Document(io.BytesIO(raw_bytes))
            core_props = word_doc.core_properties
            core_props.author = officer_signature
            core_props.last_modified_by = officer_signature
            core_props.keywords = keywords_str
            core_props.comments = comments_str
            core_props.category = "RESTRICTED / LAW ENFORCEMENT RECORD"

            section = word_doc.sections[0]
            footer = section.footer
            if not footer.paragraphs:
                footer.add_paragraph()
            
            try:
                vml_xml = f'''
                <w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" 
                     xmlns:v="urn:schemas-microsoft-com:vml" 
                     xmlns:o="urn:schemas-microsoft-com:office:office">
                    <w:pict>
                        <v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e">
                            <v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/>
                            <v:textpath on="t" fitshape="t"/>
                            <o:lock v:ext="edit" text="t" shapetype="t"/>
                        </v:shapetype>
                        <v:shape id="VerticalStamp" type="#_x0000_t136" 
                                style="position:absolute;left:0;text-align:center;margin-left:-265pt;margin-top:0pt;width:600pt;height:12pt;rotation:270;z-index:-251657216;mso-position-horizontal:absolute;mso-position-horizontal-relative:page;mso-position-vertical:center;mso-position-vertical-relative:page" 
                                fillcolor="#8B0000" stroked="f">
                            <v:textpath style="font-family:'Courier New';font-size:7pt;font-weight:bold" string="{vertical_stamp_text}"/>
                        </v:shape>
                    </w:pict>
                </w:r>
                '''
                vml_run = parse_xml(vml_xml)
                footer.paragraphs[-1]._p.append(vml_run)
            except Exception as e:
                print(f"Failed to inject VML vertical watermark: {e}")
            
            word_doc.save(output_stream)
            content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

        elif file_extension in ['xlsx', 'xls']:
            wb = openpyxl.load_workbook(io.BytesIO(raw_bytes))
            wb.properties.creator = officer_signature
            wb.properties.lastModifiedBy = officer_signature
            wb.properties.keywords = keywords_str
            wb.properties.description = comments_str
            wb.properties.category = "RESTRICTED / FORENSIC POLICE RECORD"
            
            for ws in wb.worksheets:
                if hasattr(ws, 'sheet_footer'): 
                    ws.sheet_footer.left.text = vertical_stamp_text
                elif hasattr(ws, 'odd_footer'): 
                    ws.odd_footer.left.text = vertical_stamp_text
            wb.save(output_stream)
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

        elif file_extension == 'pdf':
            try:
                pdf_doc = pymupdf.open(stream=raw_bytes, filetype="pdf")
                for page in pdf_doc:
                    rect = page.rect
                    page.insert_text(
                        pymupdf.Point(25, rect.height - 50),
                        vertical_stamp_text,
                        fontsize=7,
                        fontname="courier-bold",
                        color=(0.545, 0, 0),
                        rotate=90 
                    )
                stamped_pdf_bytes = pdf_doc.tobytes()
                output_stream = io.BytesIO(stamped_pdf_bytes)
                content_type = "application/pdf"
            except Exception:
                output_stream.write(raw_bytes)
                content_type = "application/pdf"

        else:
            output_stream.write(raw_bytes)

        output_stream.seek(0)
        final_bytes = output_stream.getvalue()

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="GENERAL_DOCUMENTS",
            target_id=str(doc_id),
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} securely downloaded and watermarked general document titled \"{file_name}\"."
        )

        if return_url:
            temp_s3_key = f"forensic_cache/{stamp_id}_{file_name}"
            s3_client.put_object(
                Bucket=BUCKET_NAME,
                Key=temp_s3_key,
                Body=final_bytes,
                ContentType=content_type,
                ServerSideEncryption="AES256"
            )
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': BUCKET_NAME, 'Key': temp_s3_key},
                ExpiresIn=3600
            )
            return JSONResponse(content={"url": presigned_url})

        return StreamingResponse(
            io.BytesIO(final_bytes),
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{file_name}"'
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"General Document Stamping Error: {str(e)}")