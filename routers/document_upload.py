import io
import os
import json
import base64
import urllib.parse
from datetime import datetime
from typing import Optional, List
from PIL import Image, ImageDraw, ImageFont

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
from sqlalchemy import text, or_, func

from app import models
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

# Try safe import for embedding ingestion
try:
    from embedding_service import ingest_document_vector
except ImportError:
    try:
        from app.embedding_service import ingest_document_vector
    except ImportError:
        def ingest_document_vector(*args, **kwargs):
            pass

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
    for model_name in ['DocumentArchive', 'Document_Archive', 'document_archive', 'document_archives']:
        if hasattr(models, model_name):
            return getattr(models, model_name)
    raise HTTPException(status_code=500, detail="Document Archive database model is not configured.")

def get_template_model():
    for model_name in ['CommandTemplate', 'Command_Template', 'command_template', 'command_templates']:
        if hasattr(models, model_name):
            return getattr(models, model_name)
    return None

def get_general_doc_model():
    for name in ['GeneralDocuments', 'General_Documents', 'general_documents']:
        if hasattr(models, name):
            return getattr(models, name)
    return None

@router.get("/reports/archive")
def get_document_archive(
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(get_current_user)
):
    try:
        ArchiveModel = get_doc_archive_model()
        query = db.query(ArchiveModel)

        if search:
            term = f"%{search.strip().upper()}%"
            search_conds = []
            if hasattr(ArchiveModel, 'file_name'): search_conds.append(ArchiveModel.file_name.ilike(term))
            elif hasattr(ArchiveModel, 'filename'): search_conds.append(ArchiveModel.filename.ilike(term))
            if hasattr(ArchiveModel, 'doc_type'): search_conds.append(ArchiveModel.doc_type.ilike(term))
            elif hasattr(ArchiveModel, 'doctype'): search_conds.append(ArchiveModel.doctype.ilike(term))
            if hasattr(ArchiveModel, 'station'): search_conds.append(ArchiveModel.station.ilike(term))
            if hasattr(ArchiveModel, 'region'): search_conds.append(ArchiveModel.region.ilike(term))
            if hasattr(ArchiveModel, 'uploaded_by'): search_conds.append(ArchiveModel.uploaded_by.ilike(term))
            if search_conds:
                query = query.filter(or_(*search_conds))

        docs = query.all()
        if not docs:
            raw_result = db.execute(text("SELECT id, file_name, doc_type, file_size, file_path, region, station, uploaded_by, upload_date FROM document_archive ORDER BY id DESC")).fetchall()
            results = [
                {
                    "id": row[0],
                    "name": row[1] or "document",
                    "type": row[2] or "General Document",
                    "date": str(row[8]).split(' ')[0] if row[8] else "",
                    "size": row[3] or "N/A",
                    "file_path": row[4] or "",
                    "region": row[5] or "KMP HEADQUARTERS",
                    "station": row[6] or "KMP HEADQUARTERS"
                } for row in raw_result
            ]
        else:
            results = []
            for doc in docs:
                file_name = getattr(doc, 'file_name', getattr(doc, 'filename', 'document'))
                doc_type = getattr(doc, 'doc_type', getattr(doc, 'doctype', 'General Document'))
                file_size = getattr(doc, 'file_size', getattr(doc, 'filesize', 'N/A'))
                file_path = getattr(doc, 'file_path', getattr(doc, 'filepath', ''))
                region = getattr(doc, 'region', 'KMP HEADQUARTERS')
                station = getattr(doc, 'station', 'KMP HEADQUARTERS')
                upload_date = getattr(doc, 'upload_date', getattr(doc, 'uploaded_at', None))
                
                date_str = ""
                if isinstance(upload_date, datetime):
                    date_str = upload_date.strftime("%Y-%m-%d")
                elif upload_date:
                    date_str = str(upload_date).split(' ')[0]

                results.append({
                    "id": getattr(doc, 'id', getattr(doc, 'sn', 1)),
                    "name": file_name,
                    "type": doc_type or "General Document",
                    "date": date_str,
                    "size": file_size or "N/A",
                    "file_path": file_path,
                    "region": region,
                    "station": station
                })

        if search:
            summary_text = f"{current_user.fnum} {current_user.rank} {current_user.name} searched document archive for query: \"{search}\" (Returned {len(results)} matches)."
        else:
            summary_text = f"{current_user.fnum} {current_user.rank} {current_user.name} accessed Document Archive repository (Fetched {len(results)} records)."

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="VIEW",
            module="DOCUMENT_ARCHIVE",
            target_id=search if search else "ALL_ARCHIVE",
            changes_summary=summary_text
        )

        return results
    except Exception as e:
        print(f"Archive fetch error: {str(e)}")
        try:
            raw_result = db.execute(text("SELECT id, file_name, doc_type, file_size, file_path, region, station, upload_date FROM document_archive ORDER BY id DESC")).fetchall()
            return [
                {
                    "id": row[0], "name": row[1] or "document", "type": row[2] or "General Document",
                    "date": str(row[7]).split(' ')[0] if row[7] else "", "size": row[3] or "N/A",
                    "file_path": row[4] or "", "region": row[5] or "KMP HEADQUARTERS", "station": row[6] or "KMP HEADQUARTERS"
                } for row in raw_result
            ]
        except Exception as inner_err:
            print(f"Raw SQL fallback failed: {inner_err}")
            return []


@router.post("/reports/upload-word-report")
async def upload_word_report(
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    doc_type: str = Form(...),  
    target_region: Optional[str] = Form(None), 
    target_station: Optional[str] = Form(None), 
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(get_current_user)
):
    ArchiveModel = get_doc_archive_model()
    file_list = [f for f in [file, *(files or [])] if f is not None]
    
    if not file_list:
        raise HTTPException(status_code=400, detail="No files received for intake.")

    effective_region = target_region.upper() if (target_region and current_user.role in ["SUPER_ADMIN", "ADMIN"]) else (current_user.region or "KMP GENERAL")
    effective_station = target_station.upper() if (target_station and current_user.role in ["SUPER_ADMIN", "ADMIN"]) else (current_user.station or "KMP HEADQUARTERS")
    eat_time = get_eat_now()
    uploaded_count = 0

    try:
        for single_file in file_list:
            contents = await single_file.read()
            
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
                Bucket=BUCKET_NAME, Key=s3_key, Body=contents,
                ContentType=single_file.content_type or "application/octet-stream", ServerSideEncryption="AES256"
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
            db.flush()

            record_neon_activity(
                logs_db=logs_db,
                fnum=current_user.fnum,
                action_type="REGISTER",
                module="DOCUMENT_ARCHIVE",
                target_id=single_file.filename,
                changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} uploaded document report titled \"{single_file.filename}\" (Type: {display_type})."
            )

            try:
                ingest_document_vector(
                    db=db,
                    document_id=new_archive.id,
                    document_type=display_type,
                    title=single_file.filename,
                    raw_text=contents.decode('utf-8', errors='ignore') if single_file.filename.endswith('.txt') else f"Document: {single_file.filename}",
                    region=effective_region,
                    division=getattr(current_user, 'division', 'KMP HEADQUARTERS'),
                    station=effective_station,
                    sd_ref="N/A",
                    logs_db=logs_db,
                    fnum=current_user.fnum
                )
            except Exception as vec_err:
                print(f"Vector ingestion notice: {vec_err}")

            uploaded_count += 1

        db.commit()
        return {"status": "success", "message": f"Successfully archived {uploaded_count} document(s)."}
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        print(f"Fetch error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process document intake: {str(e)}")


@router.get("/reports/download/{doc_id}")
@router.get("/templates/download/{doc_id}")
@router.get("/general-docs/download/{doc_id}") 
def download_archive_file(
    doc_id: int, 
    return_url: bool = False,
    category: Optional[str] = None, 
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(get_current_user)
):
    ArchiveModel = get_doc_archive_model()
    TemplateModel = get_template_model()
    GeneralDocModel = get_general_doc_model()
    
    doc_record = None
    
    if category == 'templates' and TemplateModel:
        doc_record = db.query(TemplateModel).filter(TemplateModel.id == doc_id).first()
    elif category == 'general_doc' and GeneralDocModel:
        doc_record = db.query(GeneralDocModel).filter(GeneralDocModel.id == doc_id).first()
    elif category == 'weekly_report' and ArchiveModel:
        doc_record = db.query(ArchiveModel).filter(ArchiveModel.id == doc_id).first()
        
    if not doc_record:
        if ArchiveModel: doc_record = db.query(ArchiveModel).filter(ArchiveModel.id == doc_id).first()
        if not doc_record and TemplateModel: doc_record = db.query(TemplateModel).filter(TemplateModel.id == doc_id).first()
        if not doc_record and GeneralDocModel: doc_record = db.query(GeneralDocModel).filter(GeneralDocModel.id == doc_id).first()

    if not doc_record:
        raise HTTPException(status_code=404, detail="Document record not found in system database.")
        
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

        vertical_stamp_text = f"RESTRICTED LAW ENFORCEMENT RECORD  |  ACCESS BY: {officer_signature}  |  STAMP ID: {stamp_id}  |  TIME: {timestamp_eat}"
        
        receipt_text = (
            "========================================================\n"
            "         KAMPALA METROPOLITAN POLICE HEADQUARTERS        \n"
            "         CSDMS SECURE DOCUMENT ACCESS        \n"
            "--------------------------------------------------------\n"
            f"ACCESSED BY    : {officer_signature}\n"
            f"CLEARANCE      : {current_user.role} | STATION: {current_user.station}\n"
            f"AUDIT STAMP ID : {stamp_id}\n"
            f"TIMESTAMP      : {timestamp_eat}\n"
            "========================================================"
        )

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
            header = section.header
            
            try:
                # 🟢 1. Generate the forensic stamp as a high-res transparent PNG image
                font_size = 22
                try:
                    font = ImageFont.truetype("arial.ttf", font_size)
                except IOError:
                    try:
                        font = ImageFont.truetype("DejaVuSans.ttf", font_size)
                    except IOError:
                        font = ImageFont.load_default()

                dummy_img = Image.new('RGBA', (1, 1), (255, 255, 255, 0))
                draw = ImageDraw.Draw(dummy_img)
                try:
                    bbox = draw.textbbox((0, 0), vertical_stamp_text, font=font)
                    txt_width = bbox[2] - bbox[0]
                    txt_height = bbox[3] - bbox[1]
                except AttributeError:
                    txt_width, txt_height = draw.textsize(vertical_stamp_text, font=font)

                img = Image.new('RGBA', (txt_width + 40, txt_height + 20), (255, 255, 255, 0))
                draw = ImageDraw.Draw(img)
                draw.text((20, 10), vertical_stamp_text, fill=(139, 0, 0, 255), font=font)
                
                # Rotate image 90 degrees so it reads bottom-to-top
                img = img.rotate(90, expand=True)
                
                img_stream = io.BytesIO()
                img.save(img_stream, format='PNG')
                img_stream.seek(0)

                # 🟢 2. DEDICATED LEFT-ALIGNED PARAGRAPH
                # By creating a new paragraph before the letterhead and forcing left alignment,
                # we prevent Google Docs from dragging the image into the center.
                stamp_p = header.insert_paragraph_before("")
                stamp_p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                run = stamp_p.add_run()
                
                # Add picture inline first (height spans ~9 inches of the margin)
                picture = run.add_picture(img_stream, height=Inches(9.0))
                
                # 🟢 3. Convert inline picture to absolute floating watermark
                drawing_elem = run._r.find('.//w:drawing', namespaces=run._r.nsmap)
                inline_elem = drawing_elem.find('.//wp:inline', namespaces=run._r.nsmap)
                
                if inline_elem is not None:
                    extent = inline_elem.find('.//wp:extent', namespaces=run._r.nsmap)
                    cx, cy = extent.get('cx'), extent.get('cy')
                    graphic_elem = inline_elem.find('.//a:graphic', namespaces=run._r.nsmap)
                    
                    # behindDoc="1" pushes the image behind the text
                    # posOffset=228600 pins it exactly 0.25 inches from the left edge of the paper
                    # posOffset=1000000 pins it ~1 inch down from the top edge
                    anchor_xml = f'''
                    <wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
                               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
                               distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0"
                               behindDoc="1" locked="1" layoutInCell="0" allowOverlap="1">
                        <wp:simplePos x="0" y="0"/>
                        <wp:positionH relativeFrom="page">
                            <wp:posOffset>228600</wp:posOffset>
                        </wp:positionH>
                        <wp:positionV relativeFrom="page">
                            <wp:posOffset>1000000</wp:posOffset>
                        </wp:positionV>
                        <wp:extent cx="{cx}" cy="{cy}"/>
                        <wp:effectExtent l="0" t="0" r="0" b="0"/>
                        <wp:wrapNone/>
                        <wp:docPr id="1001" name="Forensic_Stamp"/>
                        <wp:cNvGraphicFramePr/>
                    </wp:anchor>
                    '''
                    anchor_elem = parse_xml(anchor_xml)
                    anchor_elem.append(graphic_elem)
                    
                    drawing_elem.remove(inline_elem)
                    drawing_elem.append(anchor_elem)

            except Exception as e:
                print(f"Failed to inject floating image watermark: {e}")
            
            word_doc.save(output_stream)
            content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

        elif file_extension == 'pdf':
            try:
                pdf_doc = pymupdf.open(stream=raw_bytes, filetype="pdf")
                for page in pdf_doc:
                    rect = page.rect
                    page.insert_text(
                        pymupdf.Point(20, rect.height - 50),
                        vertical_stamp_text,
                        fontsize=7,
                        fontname="courier-bold",
                        color=(0.545, 0, 0), 
                        rotate=90,
                        overlay=True
                    )
                stamped_pdf_bytes = pdf_doc.tobytes()
                output_stream = io.BytesIO(stamped_pdf_bytes)
                content_type = "application/pdf"
            except Exception as pdf_err:
                print(f"PDF watermarking notice: {pdf_err}")
                output_stream.write(raw_bytes)
                content_type = "application/pdf"

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

        elif file_extension in ['pptx', 'ppt']:
            try:
                prs = Presentation(io.BytesIO(raw_bytes))
                prs.core_properties.author = officer_signature
                prs.core_properties.last_modified_by = officer_signature
                prs.core_properties.keywords = keywords_str
                prs.core_properties.comments = comments_str
                prs.core_properties.category = "RESTRICTED / FORENSIC POLICE RECORD"
                
                if prs.slides:
                    slide = prs.slides[0]
                    left_box = slide.shapes.add_textbox(Inches(0.2), Inches(0.2), Inches(8), Inches(1))
                    left_box.rotation = 270 
                    p_left = left_box.text_frame.add_paragraph()
                    p_left.text = vertical_stamp_text
                    p_left.font.size = PPTXPt(6.5)
                    p_left.font.bold = True
                    p_left.font.name = 'Courier New'
                    p_left.font.color.rgb = PPTXRGBColor(139, 0, 0)

                prs.save(output_stream)
                content_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            except Exception:
                output_stream.write(raw_bytes)
                content_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

        else:
            output_stream.write(raw_bytes)

        output_stream.seek(0)
        final_bytes = output_stream.getvalue()

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="UPDATE",
            module="DOCUMENT_ARCHIVE",
            target_id=str(doc_id),
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} securely downloaded and watermarked document titled \"{file_name}\"."
        )

        if return_url:
            temp_s3_key = f"forensic_cache/{stamp_id}_{file_name}"
            
            s3_client.put_object(
                Bucket=BUCKET_NAME,
                Key=temp_s3_key,
                Body=final_bytes,
                ContentType=content_type,
                ContentDisposition="inline", 
                ServerSideEncryption="AES256"
            )
            
            # 🟢 FIX: S3 Waiter forces Google Docs Viewer to wait until the file is ready
            try:
                waiter = s3_client.get_waiter('object_exists')
                waiter.wait(Bucket=BUCKET_NAME, Key=temp_s3_key, WaiterConfig={'Delay': 1, 'MaxAttempts': 5})
            except Exception:
                import time
                time.sleep(1.5)

            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': BUCKET_NAME, 
                    'Key': temp_s3_key,
                    'ResponseContentDisposition': 'inline'
                },
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
        raise HTTPException(status_code=500, detail=f"Universal Forensic Stamping Error: {str(e)}")

@router.post("/documents/verify-forensic-stamp")
async def verify_forensic_stamp(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        filename = file.filename.lower()
        
        author = "UNKNOWN"
        keywords = ""
        comments = ""
        token_data = {}

        if filename.endswith(('.xlsx', '.xls')):
            wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
            props = wb.properties
            author = props.creator or props.lastModifiedBy or "UNKNOWN"
            keywords = props.keywords or ""
            comments = props.description or ""
            
        elif filename.endswith(('.docx', '.doc')):
            doc = Document(io.BytesIO(contents))
            props = doc.core_properties
            author = props.author or props.last_modified_by or "UNKNOWN"
            keywords = props.keywords or ""
            comments = props.comments or ""

        if "TOKEN:" in keywords:
            try:
                raw_token = keywords.split("TOKEN:")[1].split(";")[0]
                token_data = json.loads(base64.b64decode(raw_token).decode("utf-8"))
            except Exception:
                pass

        is_verified = "KMP_CSDMS_AUDIT_STAMP" in keywords or "KMP-STAMP" in comments or bool(token_data)

        return {
            "verified": is_verified,
            "inspected_filename": file.filename,
            "downloaded_by_fnum": token_data.get("fnum", "N/A"),
            "downloaded_by_officer": token_data.get("signature", author),
            "officer_rank": token_data.get("rank", "N/A"),
            "originating_station": token_data.get("station", "N/A"),
            "originating_region": token_data.get("region", "N/A"),
            "export_timestamp": token_data.get("timestamp", "N/A"),
            "forensic_stamp_id": token_data.get("stamp_id", "N/A"),
            "security_classification": "RESTRICTED / ENCRYPTED LAW ENFORCEMENT RECORD" if is_verified else "UNVERIFIED"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Forensic inspection failed: {str(e)}")

@router.delete("/reports/archive/{doc_id}")
def delete_archive_file(
    doc_id: int, 
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user = Depends(get_current_user)
):
    if current_user.role not in ["SUPER_ADMIN", "ADMIN", "RPC"]:
        raise HTTPException(status_code=403, detail="Command clearance required to delete official records.")
        
    ArchiveModel = get_doc_archive_model()
    TemplateModel = get_template_model()
    GeneralDocModel = get_general_doc_model()
    
    doc_record = db.query(ArchiveModel).filter(ArchiveModel.id == doc_id).first()
    if not doc_record and TemplateModel:
        doc_record = db.query(TemplateModel).filter(TemplateModel.id == doc_id).first()
    if not doc_record and GeneralDocModel:
        doc_record = db.query(GeneralDocModel).filter(GeneralDocModel.id == doc_id).first()

    if not doc_record:
        raise HTTPException(status_code=404, detail="Document not found.")
        
    try:
        file_path = getattr(doc_record, 'file_path', getattr(doc_record, 'url', ''))
        if str(file_path).startswith("http"):
            parsed_url = urllib.parse.urlparse(file_path)
            s3_key = parsed_url.path.lstrip('/')
            try:
                s3_client.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
            except Exception as s3_err:
                print(f"S3 Delete warning: {s3_err}")
            
            doc_record = None
            db.delete(doc_record)
            db.commit()

            record_neon_activity(
                logs_db=logs_db,
                fnum=current_user.fnum,
                action_type="DELETE",
                module="DOCUMENT_ARCHIVE",
                target_id=str(doc_id),
                changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} permanently purged archived document ID {doc_id} from repository."
            )

            return {
                "message": "Document successfully deleted from repository and database."
            }
    except Exception as e:
        print(f"Delete error: {e}")
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")