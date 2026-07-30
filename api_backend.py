import io
import os
import gc
import re
import html
import uuid
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List

import pytz
import uvicorn
import pyzipper
import pandas as pd
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import UploadFile, File, HTTPException, Depends

# Internal Imports
from app import models, database
from app.database import engine, get_db, get_logs_db
from app.database import LogsSessionLocal as SessionLogsLocal
from app.core import security
from auth import router as auth_router, get_current_user

# ==========================================
# 0. LOAD ENVIRONMENT VARIABLES & CONFIG
# ==========================================
load_dotenv()

app = FastAPI(title="KMP Centralised Security Data Management System")

conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_PORT=587,
    MAIL_SERVER="smtp.gmail.com",
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False
)

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION")
)
BUCKET_NAME = os.getenv("AWS_BUCKET_NAME")

# ==========================================
# 1. MIDDLEWARE & STARTUP
# ==========================================
models.Base.metadata.create_all(bind=engine)

models.Base.metadata.create_all(bind=SessionLogsLocal().get_bind())
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173", 
        "https://kmp-tracker-system-centralised-secu.vercel.app", 
        "https://kmp-tracker-system-centralised-security-management-adj4h23x4.vercel.app",
        "https://kmp-tracker-system-centralised-security-management-od0odfzxy.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

app.include_router(auth_router, prefix="/api/auth")

class PasswordChangeReq(BaseModel):
    old_password: str
    new_password: str

class ForcePasswordReq(BaseModel):
    new_password: str
# ==========================================
# 2. PYDANTIC SCHEMAS
# ==========================================
class UserAccessUpdate(BaseModel):
    role: str
    permissions: dict

class Admin_CommunicationCreate(BaseModel):
    sender_fnum: str
    sender_name: str
    target_audience: str
    target_region: Optional[str] = None
    message_type: str
    subject: str
    message: str
    send_email: bool = False

class EstablishmentCreate(BaseModel):
    region: str
    division: str
    station: str
    personnel_in_station: Optional[int] = 0
    sub_station: Optional[str] = ""
    personnel_in_sub_station: Optional[int] = 0
    post: Optional[str] = ""
    personnel_in_post: Optional[int] = 0
    booths: Optional[int] = 0
    location: Optional[str] = ""
    personnel_in_booth: Optional[int] = 0
    installed_by: Optional[str] = ""
    status: Optional[str] = "OPERATIONAL"
    comment: Optional[str] = ""
    last_updated_by: Optional[str] = ""

class ArchiveRequest(BaseModel):
    archive_reason: str

class SessionLogRequest(BaseModel):
    fnum: str

# ==========================================
# 3. SECURITY & DEPENDENCIES
# ==========================================
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        fnum: str = payload.get("sub")
        if fnum is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user = db.query(models.Users).filter(models.Users.fnum == fnum).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

def require_admin(current_user: models.Users = Depends(get_current_user)):
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    if user_role not in ["ADMIN", "SUPER_ADMIN"]:
        raise HTTPException(status_code=403, detail="Clearance Denied: Admin privileges required.")
    return current_user

def require_export_privilege(current_user: models.Users = Depends(get_current_user)):
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    perms = current_user.permissions or {}
    if user_role not in ["ADMIN", "SUPER_ADMIN", "RPC"] and not perms.get("export_data", False):
        raise HTTPException(status_code=403, detail="Clearance Denied: Data Export Privileges Required.")
    return current_user

# ==========================================
# 4. UTILITY FUNCTIONS
# ==========================================
def log_semantic_audit(db, fnum: str, action: str, target_identifier: str, changes: dict, remarks: str = ""):
    try:
        formatted_details = f"Target: {target_identifier} | Changes: " + ", ".join(
            [f"{k}: {v[0]} -> {v[1]}" for k, v in changes.items()]
        ) + f" | Remarks: {remarks}"
        
        new_audit = models.Audit_Logs(
            event_type=action,
            target_user=target_identifier,
            status="SUCCESS",
            details=formatted_details,
            user_fnum=fnum,
            created_at=datetime.now(pytz.timezone("Africa/Nairobi")).replace(tzinfo=None)
        )
        db.add(new_audit)
        db.commit()
    except Exception as e:
        print(f"Audit Log Failed: {e}")
        db.rollback()

def strip_html_to_plain_text(text):
    if not text: 
        return ""
    text = str(text)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</p>|</div>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<li>', '\n• ', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def apply_custom_sheet_design(workbook, worksheet, df, sheet_title, user):
    # 1. PREPARE PRINT SETTINGS (Page Layout ready for Ctrl+P)
    worksheet.set_landscape()
    worksheet.set_margins(left=0.25, right=0.25, top=0.75, bottom=0.75)

    # 2. SET PRINT HEADERS AND FOOTERS
    worksheet.set_header('&C&"Tahoma,Bold"RESTRICTED')
    worksheet.set_footer('&C&"Tahoma"Page &P of &N\nRESTRICTED')

    # 3. CREATE FORMATS (Tahoma enforced)
    header_format = workbook.add_format({
        'bold': True,
        'bg_color': '#002060', 
        'font_color': 'white',
        'font_name': 'Tahoma',
        'font_size': 11,
        'border': 1,
        'align': 'center',
        'valign': 'vcenter',
        'text_wrap': True
    })
    
    data_format = workbook.add_format({
        'font_name': 'Tahoma',
        'font_size': 11,
        'border': 1,
        'valign': 'vcenter'
    })

    # 4. APPLY HEADER ROW FORMATTING
    for col_num, value in enumerate(df.columns.values):
        worksheet.write(0, col_num, value, header_format)

    # 5. APPLY DATA ROW FORMATTING
    for row_num in range(len(df)):
        for col_num in range(len(df.columns)):
            val = df.iloc[row_num, col_num]
            if pd.isna(val): val = ""
            worksheet.write(row_num + 1, col_num, val, data_format)

# 6. SHEET-SPECIFIC PRINT SCALING & COLUMN SIZING
    if "OPS Statistics" in sheet_title:  # 🟢 CHANGED: Now catches both the Master and the (Print) sheet
        worksheet.fit_to_pages(1, 0) # Fit to 1 page wide
        worksheet.set_column('A:A', 5)   # SN
        worksheet.set_column('B:B', 12)  # Date
        worksheet.set_column('C:D', 20)  # Region, Station
        worksheet.set_column('E:L', 10)  # Metrics

    elif "(Print)" in sheet_title:       # PRINT TABS (Crime Registry & Establishments)
        worksheet.fit_to_pages(1, 0)     # Fit to 1 page wide for UI copies
        worksheet.set_column('A:A', 5)   # SN
        worksheet.set_column('B:Z', 15)  # Standard readable width for the rest

    else:
        # Master tabs: NO fit-to-width so they stay wide and readable
        worksheet.set_column('A:Z', 18) 

async def send_command_briefing(email_to: List[str], subject: str, html_body: str):
    message = MessageSchema(
        subject=subject,
        recipients=email_to,
        body=html_body,
        subtype="html"
    )
    fm = FastMail(conf)
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"❌ Failed to dispatch email: {e}")

def build_and_send_weekly_briefing():
    html_content = """
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px; max-width: 600px;">
        <h2 style="color: #1e3a8a;">KMP Tracker System - Weekly Briefing</h2>
        <p>The system has compiled the latest cross-domain metrics.</p>
        <p>Please log in to the Master Dashboard to view the full Consolidated Ledger.</p>
    </div>
    """
    try:
        recipients = ["afedravnct@gmail.com"] 
        asyncio.run(send_command_briefing(recipients, "KMP Weekly Command Briefing", html_content))
    except Exception as e:
        print(f"Scheduler failed to send email: {e}")

scheduler = BackgroundScheduler()
scheduler.add_job(build_and_send_weekly_briefing, 'cron', day_of_week='mon', hour=6, minute=0)
if not scheduler.running:
    scheduler.start()

# ==========================================
# 5. USER AUTHENTICATION & PROFILES
# ==========================================
@app.post("/api/auth/refresh")
def refresh_session_token(current_user = Depends(get_current_user)):
    access_token_expires = timedelta(minutes=30)
    new_access_token = security.create_access_token(
        data={"sub": current_user.fnum}, 
        expires_delta=access_token_expires
    )
    return {"access_token": new_access_token, "token_type": "bearer"}

@app.post("/api/v1/auth/signup")
def register_user(
    fnum: str = Form(...), rank: str = Form(...), name: str = Form(...),
    ipps: str = Form(...), region: str = Form(...), station: str = Form(...),
    position: str = Form(...), email: str = Form(...), phone: str = Form(...),
    password: str = Form(...), sex: Optional[str] = Form(None),
    division: Optional[str] = Form(None), role: str = Form("USER"), 
    profile_photo_path: str = Form(""), db: Session = Depends(get_db)
):
    if not re.match(r'^\d{10}$', phone):
        raise HTTPException(status_code=400, detail="Contact number must be exactly 10 digits.")

    if db.query(models.Users).filter(models.Users.fnum == fnum).first():
         raise HTTPException(status_code=400, detail="User with this fnum already exists.")
         
    if role != "SUPER_ADMIN" and not profile_photo_path:
        raise HTTPException(status_code=400, detail="A profile photo is mandatory for non-admin users.")

    try:
        new_user = models.Users(
            fnum=fnum, rank=rank, name=name, sex=sex, ipps=ipps, region=region,
            division=division, station=station, position=position, email=email,
            phone=phone, hashed_password=security.get_password_hash(password) if hasattr(security, 'get_password_hash') else password,
            role=role, profile_photo_path=profile_photo_path
        )
        db.add(new_user)
        db.commit()
        return {"status": "success", "message": "User registered successfully!"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database write failed: {str(e)}")

from urllib.parse import unquote
from fastapi import HTTPException, Depends

@app.put("/api/v1/users/change-password")
def change_user_password(data: PasswordChangeReq, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    # Add your logic to verify old password here if needed
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        
    hashed = security.get_password_hash(data.new_password) if hasattr(security, 'get_password_hash') else data.new_password
    current_user.hashed_password = hashed
    db.commit()
    
    if hasattr(models, 'Audit_Logs'):
        log_semantic_audit(db, current_user.fnum, "PASSWORD_UPDATE", "SELF", {}, "User updated personal security key.")
    return {"status": "success", "message": "Security key updated successfully."}

@app.put("/api/v1/admin/users/{target_fnum}/force-password")
def force_user_password(target_fnum: str, data: ForcePasswordReq, db: Session = Depends(get_db), admin: models.Users = Depends(require_admin)):
    clean_fnum = unquote(target_fnum).strip().upper()
    target_user = db.query(models.Users).filter(models.Users.fnum == clean_fnum).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Target officer not found.")
        
    hashed = security.get_password_hash(data.new_password) if hasattr(security, 'get_password_hash') else data.new_password
    target_user.hashed_password = hashed
    db.commit()
    
    if hasattr(models, 'Audit_Logs'):
        log_semantic_audit(db, admin.fnum, "ADMIN_FORCE_PASSWORD", clean_fnum, {}, "Super Admin forced a new security key.")
    return {"status": "success", "message": "Password forced successfully."}

# ---------------------------------------------------------
# ADMIN: APPROVE PENDING USER REGISTRATION
# ---------------------------------------------------------
@app.post("/api/v1/admin/approve/{fnum:path}")
def approve_pending_user(fnum: str, db: Session = Depends(get_db)):
    # 1. Clean the Force Number (Ensures "A%2F2408" safely becomes "A/2408")
    clean_fnum = unquote(fnum).strip().upper()
    
    # 2. Find the pending user in the database
    # (Assuming your SQLAlchemy model is named models.Users)
    target_user = db.query(models.Users).filter(models.Users.fnum == clean_fnum).first()
    
    if not target_user:
        raise HTTPException(status_code=404, detail=f"Officer {clean_fnum} not found in database.")
        
    # 3. Activate the user 
    # (Using hasattr ensures this won't crash regardless of what you named your column)
    if hasattr(target_user, 'status'):
        target_user.status = "ACTIVE"
        
    if hasattr(target_user, 'is_approved'):
        target_user.is_approved = True
        
    if hasattr(target_user, 'is_active'):
        target_user.is_active = True

    # 4. Log the action (Optional, if you have Audit Logs setup)
    if hasattr(models, 'Audit_Logs'):
        log_semantic_audit(db, "SYSTEM", "ACCOUNT_APPROVAL", target_user.fnum, {}, f"User {clean_fnum} was approved for system access.")

    # 5. Save changes
    db.commit()
    
    return {"status": "success", "message": f"Officer {clean_fnum} successfully authorized."}

@app.post("/api/v1/users/upload-profile")
async def upload_profile_photo(
    file: UploadFile = File(...),
    fnum: str = Form("PENDING_REGISTRATION"),
    category: str = Form("user_profile"),
    narrative: str = Form("Officer Profile Photo")
):
    try:
        file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
        unique_id = uuid.uuid4().hex[:8]
        clean_fnum = fnum.replace("/", "_")
        s3_key = f"profile_photos/{clean_fnum}_{unique_id}.{file_extension}"

        s3_client.upload_fileobj(
            file.file, BUCKET_NAME, s3_key,
            ExtraArgs={"ContentType": file.content_type, "ServerSideEncryption": "AES256"}
        )

        full_url = f"https://{BUCKET_NAME}.s3.{os.getenv('AWS_REGION')}.amazonaws.com/{s3_key}"
        return {
            "status": "success", 
            "message": "Profile photo uploaded successfully!", 
            "full_s3_url": full_url, 
            "cloud_storage_path": s3_key
        }
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"S3 Upload failed: {str(e)}")
    finally:
        file.file.close()

@app.put("/api/v1/users/profile/update")
def update_user_profile(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    new_fnum = data.get("fnum", "").strip().upper()
    old_fnum = current_user.fnum.strip().upper()
    fnum_changing = new_fnum and new_fnum != old_fnum

    if fnum_changing:
        if not re.search(r'[A-Za-z]', new_fnum):
            raise HTTPException(status_code=400, detail="Officer File Numbers must be alphanumeric.")
        
        if db.query(models.Users).filter(models.Users.fnum == new_fnum).first():
            raise HTTPException(status_code=400, detail="File Number is actively registered to another account.")

        hr_verification = db.query(models.Nominal_Roll).filter(
            or_(models.Nominal_Roll.fnum == new_fnum, models.Nominal_Roll.f_num == new_fnum),
            models.Nominal_Roll.rank == data.get("rank"),
            models.Nominal_Roll.station == data.get("station")
        ).first()

        if not hr_verification:
            raise HTTPException(
                status_code=403, 
                detail=f"Verification Failed: HR has not registered {data.get('rank')} {new_fnum} at {data.get('station')}."
            )

    for key, value in data.items():
        if hasattr(current_user, key) and key not in ['id', 'hashed_password', 'is_approved', 'permissions', 'role']:
            setattr(current_user, key, value)
            
    try:
        if fnum_changing:
            db.query(models.Communication_Reads).filter(models.Communication_Reads.fnum == old_fnum).update({"fnum": new_fnum})
            db.query(models.Password_Reset_Requests).filter(models.Password_Reset_Requests.fnum == old_fnum).update({"fnum": new_fnum})
            db.query(models.Audit_Logs).filter(models.Audit_Logs.user_fnum == old_fnum).update({"user_fnum": new_fnum})
            db.query(models.Admin_Communication).filter(models.Admin_Communication.sender_fnum == old_fnum).update({"sender_fnum": new_fnum})
            db.query(models.Modification_Requests).filter(models.Modification_Requests.fnum == old_fnum).update({"fnum": new_fnum})
            
        db.commit()
        db.refresh(current_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database cascade failed: {str(e)}")

    response_data = {"status": "success", "message": "Profile updated successfully."}
    
    if fnum_changing:
        access_token_expires = timedelta(minutes=300) 
        new_token = security.create_access_token(data={"sub": new_fnum}, expires_delta=access_token_expires)
        response_data["new_token"] = new_token
        
        if hasattr(models, 'Audit_Logs'):
            log_semantic_audit(
                db=db, fnum=new_fnum, action="PROFILE_PROMOTION", 
                target_identifier=old_fnum, changes={"fnum": (old_fnum, new_fnum)}, 
                remarks="Verified against Live Nominal Roll"
            )

    return response_data

@app.post("/api/v1/update-rank")
def update_rank(data: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    officer = db.query(models.Users).filter(models.Users.fnum == data['fnum']).first()
    if not officer:
        raise HTTPException(status_code=404, detail="Officer not found")
        
    old_rank = officer.rank
    new_rank = data['new_rank']
    officer.rank = new_rank
    db.commit()
    
    log_semantic_audit(db, current_user.fnum, "RANK_PROMOTION", officer.fnum, {"rank": (old_rank, new_rank)}, "Approved by Regional Personnel")
    return {"message": "Success"}

@app.put("/api/v1/users/{fnum}/access")
def update_user_access(fnum: str, access_data: UserAccessUpdate, db: Session = Depends(get_db), admin: models.Users = Depends(require_admin)):
    target_user = db.query(models.Users).filter(models.Users.fnum == fnum).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    target_user.role = access_data.role
    target_user.permissions = access_data.permissions
    db.commit()
    return {"status": "success", "message": "Access matrix updated"}

@app.post("/api/v1/users/heartbeat")
def heartbeat(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        current_user.last_active_at = datetime.utcnow()
        db.commit()
        return {"status": "alive"}
    except Exception as e:
        db.rollback()
        return {"status": "error"}

@app.get("/api/v1/users/online")
def get_online_users(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    threshold = datetime.utcnow() - timedelta(minutes=2)
    
    query = db.query(models.Users).filter(
        models.Users.is_approved == True,
        models.Users.last_active_at >= threshold
    )
    
    perms = current_user.permissions or {}
    is_global = (
        current_user.role == "SUPER_ADMIN" or 
        perms.get("view_global_roster", False) or
        current_user.region in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"] or
        current_user.station in ["KMP HEADQUARTERS", "KMP Headquarters", "NAGURU"]
    )
    
    if not is_global:
        is_regional = (current_user.role == "RPC" or perms.get("view_regional_roster", False) or "Deputy" in (current_user.position or ""))
        if is_regional:
            query = query.filter(models.Users.region == current_user.region)
        else:
            query = query.filter(models.Users.station == current_user.station)
            
    active_users = query.all()
    
    return [
        {
            "fnum": u.fnum,
            "name": u.name,
            "station": u.station,
            "profile_photo_path": u.profile_photo_path
        } for u in active_users
    ]

# ==========================================
# 6. PASSWORD RESET WORKFLOW
# ==========================================
@app.post("/api/v1/auth/request-reset")
def request_password_reset(fnum: str = Form(...), db: Session = Depends(get_db)):
    user = db.query(models.Users).filter(models.Users.fnum == fnum).first()
    if not user:
        raise HTTPException(status_code=404, detail="Officer Force Number not found.")

    existing_req = db.query(models.Password_Reset_Requests).filter(
        models.Password_Reset_Requests.fnum == fnum,
        models.Password_Reset_Requests.status == "PENDING"
    ).first()
    if existing_req:
        return {"status": "success", "message": "Request already in queue."}

    new_req = models.Password_Reset_Requests(
        fnum=user.fnum, name=user.name, rank=user.rank,
        station=user.station, region=user.region
    )
    db.add(new_req)
    db.commit()
    return {"status": "success", "message": "Password reset requested. Contact your commanding officer."}

@app.get("/api/v1/admin/reset-requests")
def get_password_reset_requests(db: Session = Depends(get_db), current_user: models.Users = Depends(require_admin)):
    query = db.query(models.Password_Reset_Requests).filter(models.Password_Reset_Requests.status == "PENDING")
    
    if current_user.role != "SUPER_ADMIN":
        query = query.filter(models.Password_Reset_Requests.region == current_user.region)
        if "Commander" in current_user.position and current_user.role != "RPC":
            query = query.filter(models.Password_Reset_Requests.station == current_user.station)

    requests = query.order_by(models.Password_Reset_Requests.request_date.desc()).all()
    eat_tz = pytz.timezone("Africa/Kampala")
    results = []
    
    for r in requests:
        local_time = r.request_date
        if local_time:
            if local_time.tzinfo is None:
                local_time = pytz.utc.localize(local_time)
            formatted_time = local_time.astimezone(eat_tz).strftime("%Y-%m-%d %H:%M")
        else:
            formatted_time = "Unknown Time"
            
        results.append({
            "id": r.id, "fnum": r.fnum, "name": r.name, "rank": r.rank, 
            "station": r.station, "region": r.region, "request_date": formatted_time
        })
    return results

@app.post("/api/v1/admin/execute-reset/{req_id}")
def execute_password_reset(req_id: int, action: str = Form(...), db: Session = Depends(get_db), current_user: models.Users = Depends(require_admin)):
    req = db.query(models.Password_Reset_Requests).filter(models.Password_Reset_Requests.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")

    if action == "REJECT":
        req.status = "REJECTED"
        db.commit()
        return {"status": "success", "message": "Request rejected."}

    if action == "APPROVE":
        user = db.query(models.Users).filter(models.Users.fnum == req.fnum).first()
        if not user:
            raise HTTPException(status_code=404, detail="User no longer exists.")
        
        new_password = "UPF" + req.fnum.replace("/", "")[-4:]
        if hasattr(security, 'get_password_hash'):
            user.hashed_password = security.get_password_hash(new_password)
        else:
            user.hashed_password = new_password
            
        req.status = "APPROVED"
        
        if hasattr(models, 'Audit_Logs'):
            log_semantic_audit(db, current_user.fnum, "PASSWORD_RESET", req.fnum, {"password": ("Old", "Reset via Admin")}, f"Temporary key issued: {new_password}")
            
        db.commit()
        return {"status": "success", "new_password": new_password}

# ==========================================
# 7. ADMIN APPROVALS & SYSTEM ROSTER
# ==========================================
@app.get("/api/v1/admin/pending-users")
def get_pending_users(db: Session = Depends(get_db)):
    try:
        return db.query(models.Users).filter(models.Users.is_approved == False).all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch pending users: {str(e)}")

@app.patch("/api/v1/admin/approve-user/{target_fnum}")
def approve_user(target_fnum: str, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    target_user = db.query(models.Users).filter(models.Users.fnum == target_fnum, models.Users.is_approved == False).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Pending user not found.")

    if current_user.role != "SUPER_ADMIN":
        if target_user.region != current_user.region:
            raise HTTPException(status_code=403, detail="Cannot approve users outside your region.")
        if "Commander" in current_user.position and current_user.role != "RPC" and target_user.station != current_user.station:
            raise HTTPException(status_code=403, detail="Cannot approve users outside your division.")

    if current_user.role != "SUPER_ADMIN":
        active_count = db.query(models.Users).filter(
            models.Users.is_approved == True,
            models.Users.station == target_user.station,
            models.Users.position == target_user.position
        ).count()
        if active_count >= 3:
            raise HTTPException(status_code=400, detail=f"Quota full: Max 3 active {target_user.position}s allowed in {target_user.station}.")

    target_user.is_approved = True
    db.commit()
    return {"message": "User approved successfully."}

@app.get("/api/v1/users")
def get_all_active_users(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        query = db.query(models.Users).filter(models.Users.is_approved == True)
        perms = current_user.permissions or {}
        
        is_global = (
            current_user.role == "SUPER_ADMIN" or 
            perms.get("view_global_roster", False) or
            current_user.region in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"] or
            current_user.station in ["KMP HEADQUARTERS", "KMP Headquarters", "NAGURU"]
        )
        
        if not is_global:
            is_regional = (current_user.role == "RPC" or perms.get("view_regional_roster", False) or "Deputy" in (current_user.position or ""))
            if is_regional:
                query = query.filter(models.Users.region == current_user.region)
            else:
                query = query.filter(models.Users.station == current_user.station)
                
        users = query.all()
        return [
            {
                "fnum": u.fnum, "name": u.name, "rank": u.rank, "role": u.role, 
                "station": u.station, "region": u.region, "division": u.division,
                "position": u.position, "email": u.email, "phone": u.phone,
                "ipps": u.ipps, "sex": u.sex, "profile_photo_path": u.profile_photo_path,
                "permissions": u.permissions
            } for u in users
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 8. LEDGER MANAGEMENT (GET, POST, PUT)
# ==========================================
# --- CRIME REPORTS ---
@app.get("/api/v1/reports")
def get_reports(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Crime_Reports)
    if current_user.role == "SUPER_ADMIN" or (current_user.permissions or {}).get("view_all_reports", False):
        pass 
    elif current_user.role in ["ADMIN", "RPC"]:
        query = query.filter(models.Crime_Reports.region == current_user.region)
    else:
        query = query.filter(models.Crime_Reports.station == current_user.station)
        
    reports = query.order_by(models.Crime_Reports.sn.desc()).all()
    
    return [{
        "sn": r.sn, 
        "sdRef": r.sd_ref, 
        "region": r.region, 
        "station": r.station,
        "date": r.date, 
        "time": r.time, 
        "offence": r.offence, 
        "narrative": r.narrative, 
        "status": r.status, 
        "suspects": r.suspects, 
        "lastUpdatedBy": r.last_updated_by,
        "suspectDetails": [{
            "name": getattr(s, 'name', ''), 
            "sex": getattr(s, 'sex', ''), 
            "age": getattr(s, 'age', ''), 
            "residence": getattr(s, 'residence', ''),
            "mental_health_status": getattr(s, 'mental_health_status', ''), 
            "photo_url": getattr(s, 'photo_url', '')
        } for s in getattr(r, 'suspect_details', [])]
    } for r in reports] 

@app.post("/api/v1/reports")
def create_report(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data["region"] = current_user.region
            data["station"] = current_user.station
            
        suspects_data = data.pop('suspectDetails', []) 
        new_record = models.Crime_Reports(**data)
        new_record.last_updated_by = current_user.fnum
        
        db.add(new_record)
        db.flush() 
        
        for s in suspects_data:
            new_suspect = models.Suspect_Lockup(
                sd_ref=new_record.sn,
                name=s.get('name'), 
                sex=s.get('sex'), 
                age=str(s.get('age')) if s.get('age') else None,
                tribe=s.get('tribe'), 
                residence=s.get('residence'), 
                contact=s.get('contact'),
                mental_health_status=s.get('mental_health_status'),
                photo_url=s.get('photo_url') 
            )
            db.add(new_suspect)
        return {"status": "success"}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Duplicate Reference for this station.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/v1/reports/{sn}")
def update_report(sn: int, data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        existing_report = db.query(models.Crime_Reports).filter(models.Crime_Reports.sn == sn).first()
        if not existing_report:
            raise HTTPException(status_code=404, detail="Crime Report not found")

        suspects_data = data.pop('suspectDetails', [])
        data.pop('sn', None)
        
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data.pop("region", None)
            data.pop("station", None)
        
        for key, value in data.items():
            if hasattr(existing_report, key):
                setattr(existing_report, key, value)
                
        existing_report.last_updated_by = current_user.fnum
        
        existing_lockups = db.query(models.Suspect_Lockup).filter(models.Suspect_Lockup.sd_ref == sn).all()
        existing_names = [lockup.name for lockup in existing_lockups]
        
        for s in suspects_data:
            if s.get('name') not in existing_names:
                new_suspect = models.Suspect_Lockup(
                    sd_ref=sn, name=s.get('name'), sex=s.get('sex'), age=str(s.get('age')) if s.get('age') else None,
                    tribe=s.get('tribe'), residence=s.get('residence'), contact=s.get('contact'),
                    mental_health_status=s.get('mental_health_status'),
                    photo_url=s.get('photo_url') 
                )
                db.add(new_suspect)

        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# --- OPS STATISTICS ---
@app.get("/api/v1/stats")
def get_stats(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Operational_Statistics)
    if current_user.role == "SUPER_ADMIN":
        pass
    elif current_user.role in ["ADMIN", "RPC"]:
        query = query.filter(models.Operational_Statistics.region == current_user.region)
    else:
        query = query.filter(models.Operational_Statistics.station == current_user.station)
        
    return query.order_by(models.Operational_Statistics.sn.desc()).all()

@app.post("/api/v1/stats")
def create_stat(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data["region"] = current_user.region
            data["station"] = current_user.station
            
        new_record = models.Operational_Statistics(**data)
        new_record.last_updated_by = current_user.fnum
        db.add(new_record)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# --- SUCCESS STORIES ---
@app.get("/api/v1/stories")
def get_stories(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Success_Stories)
    if current_user.role == "SUPER_ADMIN":
        pass
    elif current_user.role in ["ADMIN", "RPC"]:
        query = query.filter(models.Success_Stories.region == current_user.region)
    else:
        query = query.filter(models.Success_Stories.station == current_user.station)
    return query.order_by(models.Success_Stories.sn.desc()).all()

@app.post("/api/v1/stories")
def create_story(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data["region"] = current_user.region
            data["station"] = current_user.station
            
        new_record = models.Success_Stories(**data)
        new_record.last_updated_by = current_user.fnum
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        return {"status": "success", "sn": new_record.sn}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# --- ESTABLISHMENTS ---
@app.get("/api/v1/establishments")
def get_all_establishments(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Establishments)
    if current_user.role == "SUPER_ADMIN":
        pass
    elif current_user.role in ["ADMIN", "RPC"]:
        query = query.filter(models.Establishments.region == current_user.region)
    else:
        query = query.filter(models.Establishments.station == current_user.station)
    return query.order_by(models.Establishments.id.desc()).all()

@app.post("/api/v1/establishments")
def create_establishment(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data["region"] = current_user.region
            data["division"] = current_user.division
            data["station"] = current_user.station
            
        new_est = models.Establishments(**data)
        new_est.last_updated_by = current_user.fnum
        db.add(new_est)
        db.commit()
        db.refresh(new_est)
        return {"status": "success", "sn": new_est.sn}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/v1/establishments/{est_id}")
def update_establishment(est_id: int, est_update: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    existing_est = db.query(models.Establishments).filter(
        (models.Establishments.id == est_id) if hasattr(models.Establishments, 'id') else (models.Establishments.sn == est_id)
    ).first()
    
    if not existing_est:
        raise HTTPException(status_code=404, detail="Establishment not found.")

    est_update.pop('sn', None) 
    est_update.pop('id', None) 
    
    if current_user.role not in ["SUPER_ADMIN", "RPC"]:
        est_update.pop("region", None)
        est_update.pop("division", None)
        est_update.pop("station", None)

    for key, value in est_update.items():
        if hasattr(existing_est, key):
            setattr(existing_est, key, value)

    existing_est.last_updated_by = current_user.fnum
    db.commit()
    return {"status": "success"}

# --- NOMINAL ROLL ---
@app.get("/api/v1/nominal-roll")
def get_Nominal_Rolls(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    # Safely target your exact model
    db_model = getattr(models, 'nominal_roll', getattr(models, 'Nominal_Roll', getattr(models, 'NominalRoll', None)))
    
    if not db_model:
        return []

    query = db.query(db_model)
    
    if current_user.role in ["ADMIN", "SUPER_ADMIN", "RPC", "Deputy Commander"]:
        pass 
    else:
        query = query.filter(db_model.station == current_user.station)
        
    sn_col = getattr(db_model, 'sn', getattr(db_model, 'id', None))
    if sn_col:
        query = query.order_by(sn_col.desc())
        
    return query.all()

@app.post("/api/v1/nominal-roll")
def create_Nominal_Roll(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data["region"] = current_user.region
            data["station"] = current_user.station
            
        clean_data = {}
        for k, v in data.items():
            if v == "":
                clean_data[k] = None
            else:
                if k in ['dob', 'doe', 'dopost', 'dopro'] and v is not None:
                    if "/" in v:  
                        try:
                            date_obj = datetime.strptime(v, "%d/%m/%Y")
                            clean_data[k] = date_obj.strftime("%Y-%m-%d")
                        except ValueError:
                            clean_data[k] = v 
                    else:
                        clean_data[k] = v 
                else:
                    clean_data[k] = v

        db_model = getattr(models, 'nominal_roll', getattr(models, 'Nominal_Roll', getattr(models, 'NominalRoll', None)))
        new_record = db_model(**clean_data)
        new_record.last_updated_by = current_user.fnum
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        return {"status": "success", "message": "Officer added successfully", "sn": new_record.sn}
        
    except IntegrityError:
        db.rollback() 
        raise HTTPException(status_code=400, detail="Duplicate Entry: Force Number or IPPS already exists.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.put("/api/v1/nominal-roll/{fnum}/archive")
def archive_personnel(fnum: str, request_data: ArchiveRequest, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        db_model = getattr(models, 'nominal_roll', getattr(models, 'Nominal_Roll', getattr(models, 'NominalRoll', None)))
        active_record = db.query(db_model).filter(
            (db_model.fnum == fnum) if hasattr(db_model, 'fnum') else (db_model.f_num == fnum)
        ).first()
        
        if not active_record:
            raise HTTPException(status_code=404, detail="Officer not found in active roll.")

        record_data = active_record.__dict__.copy()
        record_data.pop("_sa_instance_state", None) 
        record_data.pop("id", None) 
        record_data.pop("sn", None) 
        
        record_data["status"] = "ARCHIVED"
        record_data["archive_reason"] = request_data.archive_reason
        record_data["archive_date"] = datetime.now().date()
        record_data["last_updated_by"] = current_user.fnum

        archived_record = models.Nominal_Roll_Archive(**record_data)
        db.add(archived_record)
        db.delete(active_record)
        db.commit()
        return {"status": "success", "message": "Officer successfully moved to archives."}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to migrate record: {str(e)}")

# ---------------------------------------------------------
# ADMIN: EXCEL BULK UPLOAD FOR NOMINAL ROLL
# ---------------------------------------------------------
@app.post("/api/v1/nominal-roll/bulk-upload")
async def bulk_upload_nominal_roll(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    # 1. Security Check
    if current_user.role not in ["ADMIN", "SUPER_ADMIN", "RPC", "Deputy Commander"]:
        raise HTTPException(status_code=403, detail="Clearance Denied: Unauthorized for bulk HR uploads.")

    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel (.xlsx or .xls) file.")

    try:
        # 2. Read the Excel File
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        # 3. 🔥 ULTRA-FORGIVING HEADERS
        # Strips all spaces, dashes, and special characters
        df.columns = df.columns.str.strip().str.lower().str.replace(r'[^a-z0-9]', '', regex=True)
        
# The Smart Mapping Dictionary - Mapping to Python Model Attribute Names
        header_map = {
            "sn": "sn", "serial": "sn", "serialnumber": "sn",
            "forcenumber": "fnum", "fnumber": "fnum", "fnum": "fnum", "f_num": "fnum", "force": "fnum", "fno": "fnum",
            "rank": "rank",
            "name": "name", "fullname": "name", "officername": "name",
            "sex": "sex", "gender": "sex",
            "position": "position", "role": "position", "title": "position",
            "dob": "dob", "dateofbirth": "dob",
            "doe": "doe", "dateofenlistment": "doe",
            "dopost": "dopost", "do_post": "dopost", "dateofpost": "dopost",
            "dopro": "dopro", "do_pro": "dopro", "dateofpromotion": "dopro",
            "contact": "contact", "phone": "contact", "phonenumber": "contact", "telephone": "contact",
            "educlevel": "educlevel", "educ_level": "educlevel", "education": "educlevel", "educationlevel": "educlevel",
            "ipps": "ipps", "ippsnumber": "ipps", "ippsno": "ipps",
            "tin": "tin", "tinnumber": "tin", "tinno": "tin",
            "nin": "nin", "nationalid": "nin", "nid": "nin",
            "homedist": "homedist", "home_dist": "homedist", "homedistrict": "homedist", "district": "homedist",
            "tribe": "tribe", "ethnicity": "tribe",
            "accno": "accno", "acc_no": "accno", "accountnumber": "accno", "accountno": "accno", "account": "accno",
            "bankbranch": "bankbranch", "bank_branch": "bankbranch", "bank": "bankbranch", "branch": "bankbranch",
            "station": "station", "dutystation": "station",
            "region": "region", "command": "region",
            "section": "section", "department": "section",
            "directorate": "dir", "dir": "dir",
            "status": "status"
        }
        
        df.rename(columns=header_map, inplace=True)
        
        # Clean empty cells
        df = df.where(pd.notnull(df), None)
        
        records_added = 0
        records_skipped = 0
        
        # Fetch existing Force Numbers using the attribute name 'fnum'
        existing_fnums = {u[0] for u in db.query(models.Nominal_Roll.fnum).all()}
        
        # Get valid Python attribute names from the Model
        valid_keys = [c.key for c in models.Nominal_Roll.__table__.columns]

for index, row in df.iterrows():
            row_dict = row.to_dict()
            
            # 🟢 Clean out NaN / NaT values generated by pandas empty cells
            row_dict = {k: (None if pd.isna(v) else v) for k, v in row_dict.items()}
            
            # Extract and force string casting for Force Number
            fnum_val = str(row_dict.get('fnum', row_dict.get('f_num', ''))).strip().upper()
            
            if not fnum_val or fnum_val in ['NONE', 'NAN', 'NAT', '']:
                continue 
                
            if fnum_val in existing_fnums:
                records_skipped += 1
                continue
            
            # Clean and format dates safely
            for date_col in ['dob', 'doe', 'dopost', 'dopro']:
                if date_col in row_dict and row_dict[date_col]:
                    val = row_dict[date_col]
                    if isinstance(val, datetime):
                        row_dict[date_col] = val.strftime("%Y-%m-%d")
                    elif isinstance(val, str) and "/" in val:
                        try:
                            # Handles messy Excel dates like "07/'02/1983" or "10/12/1990"
                            clean_date_str = val.replace("'", "").strip()
                            d_obj = datetime.strptime(clean_date_str, "%d/%m/%Y")
                            row_dict[date_col] = d_obj.strftime("%Y-%m-%d")
                        except ValueError:
                            row_dict[date_col] = None
            
            # Ensure Python attribute name 'fnum' is correctly populated
            row_dict['fnum'] = fnum_val
            row_dict.pop('f_num', None) # Remove database-only key if it snuck in
            
            # Build and Save - Filtering strictly against valid model columns
            clean_row = {k: v for k, v in row_dict.items() if k in valid_keys and v is not None}
            
            try:
                new_record = models.Nominal_Roll(**clean_row)
                new_record.last_updated_by = current_user.fnum
                db.add(new_record)
                existing_fnums.add(fnum_val) 
                records_added += 1
            except Exception as row_err:
                print(f"Skipping malformed row for {fnum_val}: {row_err}")
                continue

        db.commit()
        
        if hasattr(models, 'Audit_Logs'):
            log_semantic_audit(
                db, current_user.fnum, "HR_BULK_UPLOAD", "SYSTEM", 
                {}, f"Uploaded {records_added} personnel. Skipped {records_skipped} duplicates."
            )
            
        return {
            "status": "success", 
            "message": f"Successfully imported {records_added} officers. Skipped {records_skipped} duplicates."
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Bulk upload failed: {str(e)}")

@app.get("/api/v1/nominal-roll-archive")
def get_archived_personnel(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Nominal_Roll_Archive)
    if current_user.role not in ["ADMIN", "SUPER_ADMIN"] and not (current_user.permissions or {}).get("view_all_nominal", False):
        query = query.filter(models.Nominal_Roll_Archive.region == current_user.region)
        
    archives = query.order_by(models.Nominal_Roll_Archive.sn.desc()).all()
    clean_results = []
    for a in archives:
        a_dict = a.__dict__.copy()
        a_dict.pop("_sa_instance_state", None)
        if 'f_num' in a_dict and 'fnum' not in a_dict:
            a_dict['fnum'] = a_dict['f_num']
        clean_results.append(a_dict)
    return clean_results

# ==========================================
# 9. FILE UPLOADS
# ==========================================
@app.post("/api/v1/investigation/upload/")
async def upload_file(
    file: UploadFile = File(...),
    category: Optional[str] = Form(None),
    case_id: Optional[str] = Form(None),
    narrative: Optional[str] = Form(None),
    current_user: models.Users = Depends(get_current_user)
):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file was provided.")

    file_extension = file.filename.split('.')[-1]
    unique_id = uuid.uuid4().hex[:8]
    s3_key = f"investigations/{unique_id}.{file_extension}"

    try:
        s3_client.upload_fileobj(
            file.file, BUCKET_NAME, s3_key,
            ExtraArgs={"ContentType": file.content_type, "ServerSideEncryption": "AES256"}
        )
        full_s3_url = f"https://{BUCKET_NAME}.s3.{os.getenv('AWS_REGION')}.amazonaws.com/{s3_key}"
        return {
            "status": "success", 
            "message": "Investigation file uploaded successfully!", 
            "url": full_s3_url,
            "cloud_storage_path": s3_key, 
            "full_s3_url": full_s3_url 
        }
    except ClientError as e:
        raise HTTPException(status_code=500, detail="Cloud upload failed.")
    finally:
        file.file.close()

# ==========================================
# 10. COMMUNICATIONS
# ==========================================
@app.post("/api/v1/communications")
def create_admin_communication(comm: Admin_CommunicationCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    try:
        db_comm = models.Admin_Communication(
            sender_fnum=comm.sender_fnum, sender_name=comm.sender_name,
            target_audience=comm.target_audience, target_region=comm.target_region,
            message_type=comm.message_type, subject=comm.subject, message=comm.message
        )
        db.add(db_comm)
        db.commit()
        db.refresh(db_comm)

        if comm.send_email:
            query = db.query(models.Users.email).filter(models.Users.email.isnot(None))
            if comm.target_audience == 'ADMINS_ONLY':
                query = query.filter(models.Users.role.in_(['ADMIN', 'SUPER_ADMIN']))
            elif comm.target_audience == 'RPC_ONLY':
                query = query.filter(models.Users.role == 'RPC')
            elif comm.target_audience == 'SPECIFIC_REGION':
                query = query.filter(models.Users.region == comm.target_region)
                
            emails = [u[0] for u in query.all()]
            if emails:
                html_body = f"""
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #b91c1c;">[{comm.message_type.replace('_', ' ')}] {comm.subject}</h2>
                    <p><strong>From:</strong> {comm.sender_name} ({comm.sender_fnum})</p>
                    <hr/>
                    <div>{comm.message}</div>
                    <hr/>
                    <p style="font-size: 10px; color: gray;">Automated dispatch from KMP Tracker.</p>
                </div>
                """
                def send_email_sync():
                    asyncio.run(send_command_briefing(emails, comm.subject, html_body))
                
                background_tasks.add_task(send_email_sync)

        return {"status": "success", "id": db_comm.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/Admin_Communication")
def get_admin_communications(
    start_date: Optional[str] = None, end_date: Optional[str] = None,
    db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)
):
    query = db.query(models.Admin_Communication)

    if current_user.role != "SUPER_ADMIN":
        visibility_conditions = [
            models.Admin_Communication.target_audience == "ALL",
            models.Admin_Communication.target_audience == "ALL_USERS",
            models.Admin_Communication.sender_fnum == current_user.fnum
        ]
        if current_user.role == "ADMIN":
            visibility_conditions.append(models.Admin_Communication.target_audience == "ADMINS_ONLY")
        if current_user.role == "RPC":
            visibility_conditions.append(models.Admin_Communication.target_audience == "RPC_ONLY")
            
        visibility_conditions.append(
            and_(
                models.Admin_Communication.target_audience == "SPECIFIC_REGION",
                models.Admin_Communication.target_region == current_user.region
            )
        )
        query = query.filter(or_(*visibility_conditions))

    if start_date:
        query = query.filter(models.Admin_Communication.created_at >= start_date)
    if end_date:
        query = query.filter(models.Admin_Communication.created_at <= f"{end_date} 23:59:59")

    comms = query.order_by(models.Admin_Communication.created_at.desc()).all()
    
    read_records = db.query(models.Communication_Reads.comm_id).filter(
        models.Communication_Reads.fnum == current_user.fnum
    ).all()
    read_comm_ids = {r[0] for r in read_records} 
    
    eat_tz = pytz.timezone("Africa/Kampala")
    clean_comms = []
    
    for c in comms:
        is_read = c.id in read_comm_ids
        local_time = c.created_at
        if local_time:
            if local_time.tzinfo is None:
                local_time = pytz.utc.localize(local_time)
            formatted_time = local_time.astimezone(eat_tz).strftime("%Y-%m-%d %H:%M")
        else:
            formatted_time = "Unknown Time"
            
        clean_comms.append({
            "id": c.id, "sender_fnum": c.sender_fnum, "sender_name": c.sender_name,
            "target_audience": c.target_audience, "target_region": c.target_region,
            "message_type": c.message_type, "subject": c.subject, "message": c.message,
            "created_at": formatted_time, "acknowledged": is_read
        })

    return clean_comms

@app.post("/api/v1/communications/{comm_id}/acknowledge")
def acknowledge_communication(comm_id: int, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        existing_read = db.query(models.Communication_Reads).filter(
            models.Communication_Reads.comm_id == comm_id,
            models.Communication_Reads.fnum == current_user.fnum
        ).first()

        if not existing_read:
            eat_tz = pytz.timezone("Africa/Kampala")
            uganda_time = datetime.now(eat_tz).replace(tzinfo=None)
            new_read = models.Communication_Reads(
                comm_id=comm_id, fnum=current_user.fnum, read_at=uganda_time
            )
            db.add(new_read)
            db.commit()
            
        return {"status": "success", "message": "Receipt safely logged in database"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/communications/{comm_id}/readers")
def get_communication_readers(comm_id: int, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    position_str = current_user.position or ""
    is_cleared = (
        current_user.role in ["ADMIN", "SUPER_ADMIN", "RPC", "Deputy Commander"] or
        "Divisional Commander" in position_str or
        "Deputy" in position_str or
        "RPC" in position_str
    )
    
    if not is_cleared:
        raise HTTPException(status_code=403, detail="Clearance Denied: High Command privileges required.")
    
    try:
        readers = db.query(
            models.Communication_Reads.read_at, models.Users.name, models.Users.fnum
        ).join(
            models.Users, models.Communication_Reads.fnum == models.Users.fnum
        ).filter(models.Communication_Reads.comm_id == comm_id).order_by(models.Communication_Reads.read_at.desc()).all()

        eat_tz = pytz.timezone("Africa/Kampala")
        results = []
        for r in readers:
            local_time = r.read_at
            if local_time:
                if local_time.tzinfo is None:
                    local_time = pytz.utc.localize(local_time)
                formatted_time = local_time.astimezone(eat_tz).strftime("%Y-%m-%d %H:%M:%S")
            else:
                formatted_time = "Unknown Time"
                
            results.append({"name": r.name, "fnum": r.fnum, "read_at": formatted_time})
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 11. EXPORTS & REPORTING
# ==========================================
@app.get("/api/v1/reports/consolidated-ledger")
def get_consolidated_ledger(start_date: str, end_date: str, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        perms = current_user.permissions
        if isinstance(perms, str):
            import json
            try:
                perms = json.loads(perms)
            except:
                perms = {}
        if not isinstance(perms, dict):
            perms = {}

        is_admin = current_user.role in ["ADMIN", "SUPER_ADMIN"]
        has_perm = perms.get("consolidated", False)

        if not is_admin and not has_perm:
            raise HTTPException(status_code=403, detail="Clearance Denied: You do not have access to the Consolidated Ledger.")

        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)

        start_str = start_dt.strftime("%Y-%m-%d")
        end_str = end_dt.strftime("%Y-%m-%d")

        crime_data = db.query(
            models.Crime_Reports.region, models.Crime_Reports.offence,
            func.count(models.Crime_Reports.sn).label("cases"),
            func.sum(models.Crime_Reports.suspects).label("suspects")
        ).filter(and_(models.Crime_Reports.date >= start_str, models.Crime_Reports.date < end_str))\
         .group_by(models.Crime_Reports.region, models.Crime_Reports.offence).all()

        ops_data = db.query(
            models.Operational_Statistics.region,
            func.sum(models.Operational_Statistics.arrested).label("arrested")
        ).filter(and_(models.Operational_Statistics.date >= start_str, models.Operational_Statistics.date < end_str))\
         .group_by(models.Operational_Statistics.region).all()

        story_data = db.query(
            models.Success_Stories.region,
            func.count(models.Success_Stories.sn).label("count")
        ).filter(and_(models.Success_Stories.date >= start_str, models.Success_Stories.date < end_str))\
         .group_by(models.Success_Stories.region).all()

        result = []
        for r in crime_data:
            result.append({"region": r[0], "offence": r[1], "cases": r[2], "suspects": r[3] or 0})
        for o in ops_data:
            result.append({"region": o[0], "offence": "DISRUPTIVE OPS", "cases": 0, "suspects": o[1] or 0})
        for s in story_data:
            result.append({"region": s[0], "offence": "SUCCESS STORIES", "cases": s[1], "suspects": 0})

        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"Ledger Crash: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database Ledger Error: {str(e)}")

@app.get("/api/v1/reports/establishments-json")
@app.get("/api/v1/reports/hr-establishments-json")
def get_hr_summary_json(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        hr_query = db.query(models.Nominal_Roll)
        if current_user.role not in ["SUPER_ADMIN", "ADMIN", "RPC"]:
            hr_query = hr_query.filter(models.Nominal_Roll.station == current_user.station)
        elif current_user.role in ["ADMIN", "RPC"]:
            hr_query = hr_query.filter(models.Nominal_Roll.region == current_user.region)
            
        hr_records = hr_query.all()
        hr_list, grouped_hr = [], {}
        
        for r in hr_records:
            age = "-"
            dob = getattr(r, 'dob', None)
            if dob:
                try:
                    birth_year = int(str(dob).split("-")[0])
                    age = str(datetime.now().year - birth_year)
                except: pass
            
            key = (getattr(r, 'rank', '-'), age, getattr(r, 'sex', '-'), getattr(r, 'educ_level', getattr(r, 'educlevel', '-')), getattr(r, 'region', '-'), getattr(r, 'dir', '-'), getattr(r, 'section', '-'))
            grouped_hr[key] = grouped_hr.get(key, 0) + 1
            
        for key, count in grouped_hr.items():
            hr_list.append({
                "rank": key[0] or "-", "age": key[1], "sex": key[2] or "-", "educ_level": key[3] or "-", 
                "region": key[4] or "-", "dir": key[5] or "-", "section": key[6] or "-", "sub_total": count
            })

        est_query = db.query(models.Establishments)
        if current_user.role not in ["SUPER_ADMIN", "ADMIN", "RPC"]:
            est_query = est_query.filter(models.Establishments.station == current_user.station)
        elif current_user.role in ["ADMIN", "RPC"]:
            est_query = est_query.filter(models.Establishments.region == current_user.region)
            
        est_records = est_query.all()
        est_list = []
        for e in est_records:
            pers_stn = getattr(e, 'personnel_in_station', 0) or 0
            pers_post = getattr(e, 'personnel_in_post', 0) or 0
            pers_booth = getattr(e, 'personnel_in_booth', getattr(e, 'booths', 0)) or 0
            est_list.append({
                "region": getattr(e, 'region', '-'), "division": getattr(e, 'station', '-'), "station": getattr(e, 'station', '-'),
                "pers_stn": pers_stn, "sub_station": getattr(e, 'sub_station', '-'), "post": getattr(e, 'post', '-'),
                "pers_post": pers_post, "sub_total": pers_stn + pers_post + pers_booth
            })

        return {"hr": hr_list, "establishments": est_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to load HR data due to a server error.")

@app.get("/api/v1/reports/export")
@app.get("/api/v1/reports/export")
def export_master_database_unified(
    timeframe: Optional[str] = "all", scope: Optional[str] = None, 
    value: Optional[str] = None, db: Session = Depends(get_db), 
    authorized_user: models.Users = Depends(require_export_privilege)
):
    try:
        excel_buffer = io.BytesIO()
        zip_buffer = io.BytesIO()

        with pd.ExcelWriter(excel_buffer, engine='xlsxwriter') as writer:
            workbook = writer.book
            workbook.formats[0].set_font_name('Tahoma')
            workbook.formats[0].set_font_size(11)

            # --- TAB 1: CRIME REGISTRY ---
            crime_query = db.query(models.Crime_Reports)
            if scope == "station" and value and value != "all":
                crime_query = crime_query.filter(models.Crime_Reports.station == value)
            crime_data = crime_query.yield_per(1000)
            
            crime_list = [{
                "ID": getattr(r, 'id', ''),
                "SN": getattr(r, 'id', ''), 
                "SD REF": getattr(r, 'sd_ref', getattr(r, 'sdRef', '')),
                "REGION": getattr(r, 'region', ''),
                "STATION": getattr(r, 'station', ''),
                "DATE": str(getattr(r, 'date', '')) if getattr(r, 'date') else "",
                "TIME": str(getattr(r, 'time', '')) if getattr(r, 'time') else "",
                "OFFENCE": getattr(r, 'offence', ''),
                "NARRATIVE": strip_html_to_plain_text(getattr(r, 'narrative', '')),
                "STATUS": getattr(r, 'status', ''),
                "SUSPECTS": getattr(r, 'suspects', 0),
                "LAST UPDATED BY": getattr(r, 'last_updated_by', ''),
                "CREATED AT": str(getattr(r, 'created_at', ''))
            } for r in crime_data]
            
            ordered_columns = ["ID", "SN", "SD REF", "REGION", "STATION", "DATE", "TIME", "OFFENCE", "NARRATIVE", "STATUS", "SUSPECTS", "LAST UPDATED BY", "CREATED AT"]

            if crime_list:
                df_crime = pd.DataFrame(crime_list)
                df_crime = df_crime[ordered_columns]
            else:
                df_crime = pd.DataFrame(columns=ordered_columns)

            df_crime.to_excel(writer, sheet_name="Crime Registry", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["Crime Registry"], df_crime, "Crime Registry", authorized_user)

            # --- TAB 1B: CRIME REGISTRY (Printable) ---
            if not df_crime.empty:
                df_crime_print = df_crime.copy()
                df_crime_print["Date & Time"] = df_crime_print["DATE"].astype(str) + " " + df_crime_print["TIME"].astype(str)
                df_crime_print["Region/Station/Post"] = df_crime_print["REGION"].astype(str) + " / " + df_crime_print["STATION"].astype(str)
                
                df_crime_print.rename(columns={
                    "ID": "S/N", 
                    "SN": "S/N", 
                    "SD REF": "Reference",
                    "NARRATIVE": "Incident Narrative",
                    "STATUS": "Status",
                    "SUSPECTS": "Suspects"
                }, inplace=True)

                if "COMPLAINANT" not in df_crime_print.columns:
                    df_crime_print["Complainant"] = ""
                else:
                    df_crime_print.rename(columns={"COMPLAINANT": "Complainant"}, inplace=True)

                ui_crime_columns = ["S/N", "Reference", "Date & Time", "Region/Station/Post", "Incident Narrative", "Complainant", "Suspects", "Status"]
                available_crime_cols = [col for col in ui_crime_columns if col in df_crime_print.columns]
                df_crime_print = df_crime_print[available_crime_cols]
            else:
                df_crime_print = pd.DataFrame(columns=["S/N", "Reference", "Date & Time", "Region/Station/Post", "Incident Narrative", "Complainant", "Suspects", "Status"])
                
            df_crime_print.to_excel(writer, sheet_name="Crime Registry (Print)", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["Crime Registry (Print)"], df_crime_print, "Crime Registry (Print)", authorized_user)

            del crime_data, crime_list, df_crime
            gc.collect()

            # --- TAB 2: OPS STATISTICS ---
            stats_query = db.query(models.Operational_Statistics)
            if scope == "station" and value and value != "all":
                stats_query = stats_query.filter(models.Operational_Statistics.station == value)
            stats_data = stats_query.yield_per(1000)
            stats_list = [{
                "SN": getattr(s, 'id', getattr(s, 'sn', '')), 
                "Date": str(getattr(s, 'date', '')) if getattr(s, 'date') else "", 
                "Region": getattr(s, 'region', ''),
                "Station": getattr(s, 'station', ''), 
                "Arrested": getattr(s, 'arrested', 0), 
                "Given Bond": getattr(s, 'given_bond', 0),
                "Cautioned": getattr(s, 'cautioned', 0), 
                "Pending Court": getattr(s, 'pending_court', 0), 
                "Taken To Court": getattr(s, 'taken_to_court', 0),
                "Released": getattr(s, 'released', 0), 
                "Remanded": getattr(s, 'remanded', 0), 
                "Convicted": getattr(s, 'convicted', 0)
            } for s in stats_data]
            
            df_stats = pd.DataFrame(stats_list) if stats_list else pd.DataFrame(columns=["SN", "Date", "Region", "Station", "Arrested", "Given Bond", "Cautioned", "Pending Court", "Taken To Court", "Released", "Remanded", "Convicted"])
            df_stats.to_excel(writer, sheet_name="OPS Statistics", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["OPS Statistics"], df_stats, "OPS Statistics", authorized_user)
            
            # --- TAB 2B: OPS STATISTICS (Printable) ---
            if not df_stats.empty:
                df_stats_print = df_stats.copy()
                numeric_cols = ["Arrested", "Given Bond", "Cautioned", "Pending Court", "Taken To Court", "Released", "Remanded", "Convicted"]
                
                # SECURE SUM: Convert all strings/nulls to numeric 0 first to prevent sum() crashes
                for col in numeric_cols:
                    df_stats_print[col] = pd.to_numeric(df_stats_print[col], errors='coerce').fillna(0)
                    
                totals = df_stats_print[numeric_cols].sum()
                
                total_row = {col: "" for col in df_stats_print.columns}
                total_row["Station"] = "TOTALS"
                for col in numeric_cols:
                    total_row[col] = totals[col]
                    
                df_total = pd.DataFrame([total_row])
                df_stats_print = pd.concat([df_stats_print, df_total], ignore_index=True)
            else:
                df_stats_print = pd.DataFrame(columns=["SN", "Date", "Region", "Station", "Arrested", "Given Bond", "Cautioned", "Pending Court", "Taken To Court", "Released", "Remanded", "Convicted"])

            df_stats_print.to_excel(writer, sheet_name="OPS Statistics (Print)", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["OPS Statistics (Print)"], df_stats_print, "OPS Statistics (Print)", authorized_user)
            
            del stats_data, stats_list, df_stats
            gc.collect()

            # --- TAB 3: SUCCESS STORIES ---
            stories_query = db.query(models.Success_Stories)
            if scope == "station" and value and value != "all":
                stories_query = stories_query.filter(models.Success_Stories.station == value)
            stories_data = stories_query.yield_per(1000)
            stories_list = [{
                "SN": getattr(s, 'id', getattr(s, 'sn', '')), 
                "Date": str(getattr(s, 'date', '')) if getattr(s, 'date') else "", 
                "Time": str(getattr(s, 'time', '')) if getattr(s, 'time') else "",
                "Region": getattr(s, 'region', ''), 
                "Station": getattr(s, 'station', ''), 
                "Status": getattr(s, 'status', ''),
                "Narrative": strip_html_to_plain_text(getattr(s, 'narrative', '')) 
            } for s in stories_data]
            df_stories = pd.DataFrame(stories_list) if stories_list else pd.DataFrame(columns=["SN", "Date", "Time", "Region", "Station", "Status", "Narrative"])
            df_stories.to_excel(writer, sheet_name="Success Stories", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["Success Stories"], df_stories, "Success Stories", authorized_user)
            del stories_data, stories_list, df_stories
            gc.collect()

            # --- TAB 4: NOMINAL ROLL ---
            roll_query = db.query(models.Nominal_Roll)
            if scope == "station" and value and value != "all":
                roll_query = roll_query.filter(models.Nominal_Roll.station == value)
            roll_data = roll_query.yield_per(1000)
            roll_list = [{
                "SN": getattr(n, 'id', getattr(n, 'sn', '')), 
                "Force Number": getattr(n, 'fnum', getattr(n, 'f_num', '')),
                "Rank": getattr(n, 'rank', ''), "Name": getattr(n, 'name', ''), "Sex": getattr(n, 'sex', ''),
                "Position": getattr(n, 'position', ''), 
                "DOB": str(getattr(n, 'dob', '')) if getattr(n, 'dob') else "", 
                "DOE": str(getattr(n, 'doe', '')) if getattr(n, 'doe') else "",
                "DO POST": str(getattr(n, 'dopost', getattr(n, 'do_post', ''))) if getattr(n, 'dopost', getattr(n, 'do_post', '')) else "", 
                "DO PRO": str(getattr(n, 'dopro', getattr(n, 'do_pro', ''))) if getattr(n, 'dopro', getattr(n, 'do_pro', '')) else "",
                "Contact": getattr(n, 'contact', ''), "Educ Level": getattr(n, 'educlevel', getattr(n, 'educ_level', '')),
                "IPPS": getattr(n, 'ipps', ''), "TIN": getattr(n, 'tin', ''), "NIN": getattr(n, 'nin', ''),
                "Home Dist": getattr(n, 'homedist', getattr(n, 'home_dist', '')), "Tribe": getattr(n, 'tribe', ''),
                "Acc No": getattr(n, 'accno', getattr(n, 'acc_no', '')), "Bank Branch": getattr(n, 'bankbranch', getattr(n, 'bank_branch', '')),
                "Station": getattr(n, 'station', ''), "District": getattr(n, 'district', ''), "Region": getattr(n, 'region', ''),
                "Section": getattr(n, 'section', ''), "Directorate": getattr(n, 'dir', ''), "Status": getattr(n, 'status', '')
            } for n in roll_data]
            df_roll = pd.DataFrame(roll_list) if roll_list else pd.DataFrame(columns=["SN", "Force Number", "Rank", "Name", "Sex", "Position", "DOB", "DOE", "DO POST", "DO PRO", "Contact", "Educ Level", "IPPS", "TIN", "NIN", "Home Dist", "Tribe", "Acc No", "Bank Branch", "Station", "District", "Region", "Section", "Directorate", "Status"])
            df_roll.to_excel(writer, sheet_name="Nominal Roll", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["Nominal Roll"], df_roll, "Nominal Roll", authorized_user)

            # --- TAB 4B: ESTABLISHMENTS (Printable) ---
            if not df_roll.empty:
                df_hr_print = df_roll.copy()
                df_hr_print.rename(columns={
                    "SN": "S/N",
                    "Force Number": "F-NUMBER",
                    "Rank": "RANK",
                    "Name": "NAME",
                    "Region": "REGION",
                    "Station": "STATION",
                    "Position": "ROLE",
                    "Contact": "CONTACT"
                }, inplace=True)
                
                ui_hr_columns = ["S/N", "F-NUMBER", "RANK", "NAME", "REGION", "STATION", "ROLE", "CONTACT"] 
                available_hr_cols = [col for col in ui_hr_columns if col in df_hr_print.columns]
                df_hr_print = df_hr_print[available_hr_cols]
            else:
                df_hr_print = pd.DataFrame(columns=["S/N", "F-NUMBER", "RANK", "NAME", "REGION", "STATION", "ROLE", "CONTACT"])
                
            df_hr_print.to_excel(writer, sheet_name="Establishments (Print)", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["Establishments (Print)"], df_hr_print, "Establishments (Print)", authorized_user)

            del roll_data, roll_list, df_roll
            gc.collect()

        workbook.set_properties({
            'title': 'KMP Master Database - RESTRICTED',
            'author': f'{authorized_user.rank} {authorized_user.name}',
            'manager': authorized_user.fnum,
            'comments': f'FORENSIC TRACE: Downloaded by {authorized_user.fnum}'
        })

        zip_password = authorized_user.fnum.encode('utf-8')
        with pyzipper.AESZipFile(zip_buffer, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            zf.writestr(f"KMP_Master_Database_{authorized_user.fnum}.xlsx", excel_buffer.getvalue())

        zip_buffer.seek(0)
        
        if hasattr(models, 'Audit_Logs'):
            log_semantic_audit(
                db=db, fnum=authorized_user.fnum, action="MASTER_DATA_EXPORT",
                target_identifier="SYSTEM", changes={}, remarks="AES-Encrypted Master Database ZIP Downloaded"
            )
        
        return StreamingResponse(
            zip_buffer, media_type="application/zip", 
            headers={"Content-Disposition": f"attachment; filename=KMP_Master_Database_{authorized_user.fnum}.zip"}
        ) 

    except Exception as e:
        print(f"Export Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate secure Master Database file.")

@app.get("/api/v1/export/establishments")
def export_establishments(db: Session = Depends(get_db), authorized_user: models.Users = Depends(require_export_privilege)):
    try:
        excel_buffer = io.BytesIO()
        zip_buffer = io.BytesIO()

        with pd.ExcelWriter(excel_buffer, engine='xlsxwriter') as writer:
            workbook = writer.book

            # Process HR Data
            hr_data = db.query(models.Nominal_Roll).yield_per(1000)
            hr_list = [{
                "SN": getattr(h, 'id', getattr(h, 'sn', '')), "Force Number": getattr(h, 'f_num', getattr(h, 'fnum', '')), 
                "Name": getattr(h, 'name', ''), "Rank": getattr(h, 'rank', ''), "Sex": getattr(h, 'sex', ''), 
                "Region": getattr(h, 'region', ''), "Station": getattr(h, 'station', ''), "Position": getattr(h, 'position', ''), "Status": getattr(h, 'status', '')
            } for h in hr_data]
            df_hr = pd.DataFrame(hr_list) if hr_list else pd.DataFrame(columns=["SN", "Force Number", "Name", "Rank", "Sex", "Region", "Station", "Position", "Status"])
            df_hr.to_excel(writer, sheet_name="Nominal Roll", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["Nominal Roll"], df_hr, "Nominal Roll", authorized_user)
            del hr_data, hr_list, df_hr
            gc.collect()

            # Process Establishments Data
            est_data = db.query(models.Establishments).yield_per(1000)
            est_list = [{
                "SN": getattr(e, 'id', getattr(e, 'sn', '')), "Region": getattr(e, 'region', ''), "Division": getattr(e, 'division', ''),
                "Station": getattr(e, 'station', ''), "Personnel (Station)": getattr(e, 'personnel_in_station', 0) or 0,
                "Sub-Station": getattr(e, 'sub_station', ''), "Personnel (Sub-Stn)": getattr(e, 'personnel_in_sub_station', 0) or 0,
                "Post": getattr(e, 'post', ''), "Personnel (Post)": getattr(e, 'personnel_in_post', 0) or 0,
                "Booths": getattr(e, 'booths', 0) or 0, "Personnel (Booth)": getattr(e, 'personnel_in_booth', 0) or 0,
                "Installed By": getattr(e, 'installed_by', ''), "Location": getattr(e, 'location', ''),
                "Status": getattr(e, 'status', ''), "Comment": strip_html_to_plain_text(getattr(e, 'comment', '')), 
                "Last Updated By": getattr(e, 'last_updated_by', '')
            } for e in est_data]
            df_est = pd.DataFrame(est_list) if est_list else pd.DataFrame(columns=[
                "SN", "Region", "Division", "Station", "Personnel (Station)", "Sub-Station", 
                "Personnel (Sub-Stn)", "Post", "Personnel (Post)", "Booths", "Personnel (Booth)", 
                "Installed By", "Location", "Status", "Comment", "Last Updated By"
            ])
            df_est.to_excel(writer, sheet_name="establishments", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["establishments"], df_est, "establishments", authorized_user)
            del est_data, est_list, df_est
            gc.collect()
            
        workbook.set_properties({
            'title': 'KMP HR & establishments - RESTRICTED',
            'author': f'{authorized_user.rank} {authorized_user.name}'
        })

        zip_password = authorized_user.fnum.encode('utf-8')
        with pyzipper.AESZipFile(zip_buffer, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            zf.writestr(f"KMP_HR_establishments_{authorized_user.fnum}.xlsx", excel_buffer.getvalue())

        zip_buffer.seek(0)

        if hasattr(models, 'Audit_Logs'):
            log_semantic_audit(
                db=db, fnum=authorized_user.fnum, action="HR_DATA_EXPORT",
                target_identifier="SYSTEM", changes={}, remarks="AES-Encrypted HR & Establishments ZIP Downloaded"
            )

        return StreamingResponse(
            zip_buffer, media_type='application/zip',
            headers={"Content-Disposition": f"attachment; filename=KMP_HR_Ledger_{authorized_user.fnum}.zip"}
        )
    except Exception as e:
        print(f"HR Export Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate secure HR Excel file.")

# ==========================================
# 12. AUDIT & ACTIVITY LOGS
# ==========================================
@app.get("/api/v1/audit-logs")
def get_system_audit_logs(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        if current_user.role not in ["ADMIN", "SUPER_ADMIN", "RPC"]:
            raise HTTPException(status_code=403, detail="Unauthorized access to system logs.")

        logs = db.query(models.Audit_Logs).order_by(models.Audit_Logs.id.desc()).limit(100).all()
        
        clean_logs = []
        for log in logs:
            formatted_time = None
            if log.created_at:
                formatted_time = log.created_at.strftime("%Y-%m-%dT%H:%M:%S+03:00")
                
            clean_logs.append({
                "id": log.id,
                "created_at": formatted_time,
                "event_type": getattr(log, 'event_type', None), 
                "user_fnum": getattr(log, 'user_fnum', None),
                "target_user": getattr(log, 'target_user', None),
                "status": getattr(log, 'status', None),
                "details": getattr(log, 'details', None)
            })
            
        return clean_logs
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs.")

@app.get("/api/v1/activity-logs")
@app.get("/api/v1/activity_logs")
def get_system_activity_logs(db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    try:
        if current_user.role not in ["ADMIN", "SUPER_ADMIN", "RPC"]:
            raise HTTPException(status_code=403, detail="Unauthorized access.")
        
        logs = db.query(models.Activity_Logs).order_by(models.Activity_Logs.id.desc()).limit(100).all()
        return [
            {
                "id": log.id,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "fnum": log.fnum or '',
                "action": log.action or '',
                "module": log.module or '',
                "details": log.details or ''
            } for log in logs
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch activity logs: {str(e)}")

@app.post("/api/v1/activity-logs")
def create_system_activity_log(data: dict, db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    try:
        page = data.get("page_accessed", data.get("module", "UNKNOWN"))
        act = data.get("action", "ACCESSED MODULE")
        
        new_activity = models.Activity_Logs(
            fnum=current_user.fnum,
            action=act,
            module=page,
            details=f"Officer {current_user.name} ({current_user.fnum}) executed {act} on {page}",
            created_at=datetime.utcnow()
        )
        db.add(new_activity)
        db.commit()
        return {"status": "logged in database"}
    except Exception as e:
        db.rollback()
        error_msg = f"DATABASE ERROR writing to Activity Logs: {str(e)}"
        print(error_msg) 
        return {"status": "error", "detail": error_msg}

@app.post("/api/v1/audit-logs")
def create_audit_log(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        new_log = models.AuditLogs(
            user_fnum=current_user.fnum,
            event_type=data.get("event_type", "PAGE_ACCESS"),
            target_user=data.get("target_user", "SYSTEM"),
            details=data.get("details", "Performed system action"),
            status="SUCCESS"
        )
        db.add(new_log)
        db.commit()
        return {"status": "logged"}
    except Exception as e:
        db.rollback()
        return {"status": "error"}

@app.post("/api/v1/system/log-session")
def log_user_session(req: SessionLogRequest, db: Session = Depends(get_db)):
    if hasattr(models, 'Audit_Logs'):
        log_semantic_audit(
            db=db, fnum=req.fnum, action="OFFICER_AUTHENTICATION", 
            target_identifier="SYSTEM", changes={}, remarks="Secure session initiated via Dashboard Gateway"
        )
    return {"status": "success"}

# ==========================================
# 14. MODIFICATION REQUESTS & REVOCATIONS
# ==========================================
@app.get("/api/v1/requests")
def get_all_requests(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Modification_Requests).join(
        models.Users, models.Modification_Requests.fnum == models.Users.fnum
    ).filter(models.Modification_Requests.status == "PENDING")
    
    if current_user.role != "SUPER_ADMIN":
        if current_user.role == "RPC":
            query = query.filter(models.Users.region == current_user.region)
        elif "Commander" in (current_user.position or ""):
            query = query.filter(models.Users.station == current_user.station)
        else:
            raise HTTPException(status_code=403, detail="Clearance Denied")
            
    requests = query.order_by(models.Modification_Requests.id.desc()).all()
    results = []
    for r in requests:
        officer = db.query(models.Users).filter(models.Users.fnum == r.fnum).first()
        if officer:
            results.append({
                "id": r.id, "fnum": r.fnum, "current_name": officer.name,
                "requested_name": r.requested_name, "current_rank": officer.rank,
                "requested_rank": r.requested_rank, "current_region": officer.region,
                "requested_region": r.requested_region, "current_station": officer.station,
                "requested_station": r.requested_station, "status": r.status
            })
    return results

@app.post("/api/v1/requests")
def create_modification_request(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        new_req = models.Modification_Requests(
            fnum=current_user.fnum, requested_name=data.get("requested_name"),
            requested_rank=data.get("requested_rank"), requested_region=data.get("requested_region"),
            requested_station=data.get("requested_station"), status="PENDING"
        )
        db.add(new_req)
        db.commit()
        return {"status": "success", "message": "Profile modification request sent to Command."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/v1/users/{fnum}/revoke")
def revoke_user_access(
    fnum: str, reason: str = "No reason provided", 
    db: Session = Depends(get_db), admin: models.Users = Depends(require_admin)
):
    """Safely revokes an active user's access and logs the reason."""
    clean_fnum = unquote(fnum).strip().upper()
    target_user = db.query(models.Users).filter(models.Users.fnum == clean_fnum).first()
    if not target_user:
        raise HTTPException(status_code=404, detail=f"Officer {clean_fnum} not found.")

    if hasattr(target_user, 'status'): target_user.status = 'REVOKED'
    if hasattr(target_user, 'is_approved'): target_user.is_approved = False
    if hasattr(target_user, 'is_active'): target_user.is_active = False
    if hasattr(target_user, 'comments'): target_user.comments = reason

    if hasattr(models, 'Audit_Logs'):
        log_semantic_audit(
            db=db, fnum=admin.fnum, action="USER_ACCESS_REVOKED",
            target_identifier=clean_fnum, changes={"status": ("ACTIVE", "REVOKED")},
            remarks=f"Revocation Reason: {reason}"
        )
    db.commit()
    return {"status": "success", "message": f"User {clean_fnum} access revoked."}

@app.patch("/api/v1/requests/{req_id}")
def update_modification_request_status(
    req_id: int, payload: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(require_admin)
):
    req = db.query(models.Modification_Requests).filter(models.Modification_Requests.id == req_id).first()
    if not req: raise HTTPException(status_code=404, detail="Request not found.")
        
    action_status = payload.get("status", "").upper()
    req.status = action_status
    reason = payload.get("reason", "No reason provided")
    
    if action_status == "APPROVED":
        user = db.query(models.Users).filter(models.Users.fnum == req.fnum).first()
        if user:
            changes = {}
            if req.requested_name and req.requested_name != user.name:
                changes["name"] = (user.name, req.requested_name); user.name = req.requested_name
            if req.requested_rank and req.requested_rank != user.rank:
                changes["rank"] = (user.rank, req.requested_rank); user.rank = req.requested_rank
            if req.requested_region and req.requested_region != user.region:
                changes["region"] = (user.region, req.requested_region); user.region = req.requested_region
            if req.requested_station and req.requested_station != user.station:
                changes["station"] = (user.station, req.requested_station); user.station = req.requested_station
                
            if hasattr(models, 'Audit_Logs') and changes:
                log_semantic_audit(db, current_user.fnum, "HR_MODIFICATION_APPROVED", user.fnum, changes, "Admin approved profile update request.")
    elif action_status == "REJECTED":
        if hasattr(models, 'Audit_Logs'):
            log_semantic_audit(db, current_user.fnum, "HR_MODIFICATION_REJECTED", req.fnum, {}, f"Reason: {reason}")
            
    db.commit()
    return {"status": "success", "message": f"Request {action_status.lower()} successfully."}

if __name__ == "__main__":
    uvicorn.run("api_backend:app", host="0.0.0.0", port=8000, reload=True)