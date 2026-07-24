import io
import csv
import zipfile
import os
import gc
import tempfile
from fastapi.responses import FileResponse
from fastapi import BackgroundTasks
import re         
import html
import shutil
import pytz
import uvicorn
import asyncio
import pyzipper
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
import uuid
from pydantic import BaseModel
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.exc import IntegrityError
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import boto3
from botocore.exceptions import ClientError
from sqlalchemy import and_, or_

# Internal Imports
from app import models, database
from app.database import engine, logs_engine, get_db, SessionLocal
from app.core import security
from auth import router as auth_router, get_current_user

# ==========================================
# 0. LOAD ENVIRONMENT VARIABLES FIRST
# ==========================================
load_dotenv()

# ==========================================
# 1. INITIALIZE FASTAPI & CONFIGURATIONS
# ==========================================
app = FastAPI(title="KMP Tracker Central API")

conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_PORT=587,
    MAIL_SERVER="smtp.gmail.com",
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False
)

def record_activity(fnum: str, action: str, details: str):
    db_logs = SessionLogsLocal()
    try:
        if hasattr(models, 'Activity_Logs'):
            eat_tz = pytz.timezone("Africa/Nairobi")
            uganda_time = datetime.now(eat_tz).replace(tzinfo=None)

            new_activity = models.Activity_Logs( 
                fnum=fnum,
                action=action,
                module="SYSTEM_ACTION",
                details=details,
                created_at=uganda_time 
            )
            db_logs.add(new_activity)
            db_logs.commit()
    except Exception as e:
        print(f"Failed to record activity: {e}")
        db_logs.rollback()
    finally:
        db_logs.close()

def log_semantic_audit(db, fnum: str, action: str, target_identifier: str, changes: dict, remarks: str = ""):
    try:
        formatted_details = f"Target: {target_identifier} | Changes: " + ", ".join(
            [f"{k}: {v[0]} -> {v[1]}" for k, v in changes.items()]
        ) + f" | Remarks: {remarks}"
        
        # FIXED: Mapped precisely to models.Audit_Logs columns
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

# Secure connection logic
LOGS_DATABASE_URL = os.getenv("LOGS_DATABASE_URL")

# Create a dedicated engine for your logs
logs_engine = create_engine(LOGS_DATABASE_URL)
SessionLogsLocal = sessionmaker(bind=logs_engine)

# Function to record in your new table
def log_activity_to_remote_db(fnum, action, module, details):
    db_logs = SessionLogsLocal()
    try:
        new_log = models.Activity_Logs(
            fnum=fnum, 
            action=action, 
            module=module, 
            details=details
        )
        db_logs.add(new_log)
        db_logs.commit()
    except Exception as e:
        print(f"Logging Failed: {e}")
        db_logs.rollback()
    finally:
        db_logs.close()

@app.post("/api/v1/update-rank")
def update_rank(data: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    officer = db.query(models.Users).filter(models.Users.fnum == data['fnum']).first()
    if not officer:
        raise HTTPException(status_code=404, detail="Officer not found")
        
    old_rank = officer.rank
    new_rank = data['new_rank']
    officer.rank = new_rank
    db.commit()
    
    log_semantic_audit(
        db=db,
        fnum=current_user.fnum,
        action="RANK_PROMOTION",
        target_identifier=officer.fnum,
        changes={"rank": (old_rank, new_rank)},
        remarks="Approved by Regional Personnel Office"
    )
    return {"message": "Success"}

# ==========================================
# 2. BACKGROUND TASKS & EMAIL LOGIC
# ==========================================
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
        print(f"✅ Email successfully dispatched to {email_to}")
    except Exception as e:
        print(f"❌ Failed to dispatch email: {e}")

def build_and_send_weekly_briefing():
    print("Compiling Weekly Command Briefing...")
    html_content = """
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px; max-width: 600px;">
        <h2 style="color: #1e3a8a;">KMP Tracker System - Weekly Briefing</h2>
        <p>The system has compiled the latest cross-domain metrics.</p>
        <p>Please log in to the <a href="http://localhost:5173">Master Dashboard</a> to view the full Consolidated Ledger.</p>
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
# 3. DATABASE, CORS & FILE UPLOADS
# ==========================================
models.Base.metadata.create_all(bind=engine)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173", 
        "https://kmp-tracker-system-centralised-secu.vercel.app", 
        "https://kmp-tracker-system-centralised-security-management-adj4h23x4.vercel.app",
        "https://kmp-tracker-system-centralised-security-management-od0odfzxy.vercel.app" # <-- YOUR NEW URL IS ADDED HERE
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION")
)
BUCKET_NAME = os.getenv("AWS_BUCKET_NAME")

app.include_router(auth_router, prefix="/api/auth")

# ==========================================
# 4. SECURITY DEPENDENCIES
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

@app.post("/api/auth/refresh")
def refresh_session_token(current_user = Depends(get_current_user)):
    """
    Accepts a valid token, verifies the user via get_current_user, 
    and issues a fresh 30-minute token.
    """
    access_token_expires = timedelta(minutes=30)
    
    new_access_token = create_access_token(
        data={"sub": current_user.fnum}, 
        expires_delta=access_token_expires
    )
    
    return {"access_token": new_access_token, "token_type": "bearer"}

def require_admin(current_user: models.Users = Depends(get_current_user)):
    # 1. Safely convert to uppercase and strip hidden spaces
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    
    if user_role not in ["ADMIN", "SUPER_ADMIN"]:
        raise HTTPException(status_code=403, detail="Clearance Denied: Admin privileges required.")
    return current_user

def require_export_privilege(current_user: models.Users = Depends(get_current_user)):
    # 1. Safely convert to uppercase and strip hidden spaces
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    perms = current_user.permissions or {}
    
    if user_role not in ["ADMIN", "SUPER_ADMIN", "RPC"] and not perms.get("export_data", False):
        raise HTTPException(status_code=403, detail="Clearance Denied: Data Export Privileges Required.")
    return current_user

# ==========================================
# 5. PYDANTIC SCHEMAS
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

class ProfileModRequest(BaseModel):
    fnum: str
    requested_name: Optional[str] = None
    requested_rank: Optional[str] = None
    requested_region: Optional[str] = None
    requested_station: Optional[str] = None

class ReviewAction(BaseModel):
    status: str

# ==========================================
# 6. API ENDPOINTS
# ==========================================

@app.put("/api/v1/users/{fnum}/access")
def update_user_access(fnum: str, access_data: UserAccessUpdate, db: Session = Depends(get_db), admin: models.Users = Depends(require_admin)):
    target_user = db.query(models.Users).filter(models.Users.fnum == fnum).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    target_user.role = access_data.role
    target_user.permissions = access_data.permissions
    db.commit()
    return {"status": "success", "message": "Access matrix updated"}

@app.get("/api/v1/reports/consolidated-ledger")
def get_consolidated_ledger(start_date: str, end_date: str, db: Session = Depends(get_db), admin: models.Users = Depends(require_admin)):
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
    
    start_str = start_dt.strftime("%Y-%m-%d")
    end_str = end_dt.strftime("%Y-%m-%d")

    crime_data = db.query(
        models.Crime_Reports.region, 
        models.Crime_Reports.offence, 
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

@app.get("/api/v1/reports")
def get_reports(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Crime_Reports)
    if current_user.role not in ["ADMIN", "SUPER_ADMIN"] and not (current_user.permissions or {}).get("view_all_reports", False):
        query = query.filter(models.Crime_Reports.region == current_user.region)
        
    reports = query.order_by(models.Crime_Reports.sn.desc()).all()
    return [{
        "sn": r.sn, "sdRef": r.sd_ref, "region": r.region, "station": r.station,
        "date": r.date, "time": r.time, "offence": r.offence, "narrative": r.narrative, 
        "status": r.status, "suspects": r.suspects, "lastUpdatedBy": r.last_updated_by,
        "suspectDetails": [{"name": getattr(s, 'name', ''), "sex": getattr(s, 'sex', ''), "age": getattr(s, 'age', ''), "residence": getattr(s, 'residence', '')} for s in getattr(r, 'suspect_details', [])]
    } for r in reports]

@app.get("/api/v1/reports/establishments-json")
def get_hr_summary_json(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        hr_records = db.query(models.Nominal_Roll).all()
        hr_list = []
        grouped_hr = {}
        
        for r in hr_records:
            age = "-"
            dob = getattr(r, 'dob', None)
            if dob:
                try:
                    birth_year = int(str(dob).split("-")[0])
                    age = str(datetime.now().year - birth_year)
                except:
                    pass
            
            key = (
                getattr(r, 'rank', '-'), 
                age, 
                getattr(r, 'sex', '-'), 
                getattr(r, 'educ_level', getattr(r, 'educlevel', '-')), 
                getattr(r, 'region', '-'), 
                getattr(r, 'dir', '-'), 
                getattr(r, 'section', '-')
            )
            if key not in grouped_hr:
                grouped_hr[key] = 0
            grouped_hr[key] += 1
            
        for key, count in grouped_hr.items():
            hr_list.append({
                "rank": key[0] or "-", "age": key[1], "sex": key[2] or "-",
                "educ_level": key[3] or "-", "region": key[4] or "-",
                "dir": key[5] or "-", "section": key[6] or "-", "sub_total": count
            })

        est_records = db.query(models.Establishments).all()
        est_list = []
        for e in est_records:
            pers_stn = getattr(e, 'personnel_in_station', 0) or 0
            pers_post = getattr(e, 'personnel_in_post', 0) or 0
            pers_booth = getattr(e, 'personnel_in_booth', getattr(e, 'booths', 0)) or 0
            
            est_list.append({
                "region": getattr(e, 'region', '-'),
                "division": getattr(e, 'station', '-'), 
                "station": getattr(e, 'station', '-'),
                "pers_stn": pers_stn,
                "sub_station": getattr(e, 'sub_station', '-'),
                "post": getattr(e, 'post', '-'),
                "pers_post": pers_post,
                "sub_total": pers_stn + pers_post + pers_booth
            })

        return {"hr": hr_list, "establishments": est_list}
        
    except Exception as e:
        print(f"Error generating HR JSON: {e}")
        raise HTTPException(status_code=500, detail="Failed to load HR data due to a server error.")

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
    full_s3_url = None

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
        print(f"❌ S3 Error: {e}")
        raise HTTPException(status_code=500, detail="Cloud upload failed.")
    finally:
        file.file.close()

@app.get("/api/v1/nominal-roll")
def get_Nominal_Rolls(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Nominal_Roll)
    if current_user.role not in ["ADMIN", "SUPER_ADMIN"] and not (current_user.permissions or {}).get("view_all_nominal", False):
        query = query.filter(models.Nominal_Roll.region == current_user.region)
    return query.order_by(models.Nominal_Roll.sn.desc()).all()

@app.get("/api/v1/stats")
def get_stats(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Operational_Statistics)
    if current_user.role not in ["ADMIN", "SUPER_ADMIN"]:
        query = query.filter(models.Operational_Statistics.region == current_user.region)
    return query.order_by(models.Operational_Statistics.sn.desc()).all()

@app.get("/api/v1/stories")
def get_stories(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Success_Stories)
    if current_user.role not in ["ADMIN", "SUPER_ADMIN"]:
        query = query.filter(models.Success_Stories.region == current_user.region)
    return query.order_by(models.Success_Stories.sn.desc()).all()

@app.get("/api/v1/reports/hr-establishments-json")
def get_hr_establishments(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Establishments)
    if current_user.role not in ["ADMIN", "SUPER_ADMIN"]:
        query = query.filter(models.Establishments.region == current_user.region)
        
    raw_establishments = query.order_by(models.Establishments.sn.desc()).all()
    clean_results = []
    for est in raw_establishments:
        est_dict = est.__dict__.copy()            
        est_dict.pop("_sa_instance_state", None)  
        clean_results.append(est_dict)            
    
    return clean_results

@app.get("/api/v1/requests")
def get_all_requests(db: Session = Depends(get_db)):
    """Fetches all HR Modification/Profile Requests for the Admin panel"""
    return db.query(models.Modification_Requests).order_by(models.Modification_Requests.id.desc()).all()

@app.get("/api/v1/audit-logs")
def get_audit_logs(db: Session = Depends(get_db)):
    """Fetches the system security & audit_logs"""
    return db.query(models.Audit_Logs).order_by(models.Audit_Logs.id.desc()).all()

# ==========================================
# SAFETY POST ENDPOINTS
# ==========================================
@app.get("/api/v1/establishments")
def get_all_establishments(db: Session = Depends(get_db)):
    """Fetches all establishments to populate the frontend ledger"""
    return db.query(models.Establishments).order_by(models.Establishments.id.desc()).all()

@app.post("/api/v1/establishments")
def create_establishment(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        
        new_est = models.Establishments(**data)
        new_est.last_updated_by = current_user.fnum
        db.add(new_est)
        db.commit()
        db.refresh(new_est)
        return {"status": "success", "sn": new_est.sn}
    except Exception as e:
        db.rollback()
        print(f"❌ Establishment Save Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/v1/establishments/{sn}")
def update_establishment(sn: int, est_update: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    existing_est = db.query(models.Establishments).filter(models.Establishments.sn == sn).first()
    if not existing_est:
        raise HTTPException(status_code=404, detail="Establishment not found.")

    est_update.pop('sn', None) 

    for key, value in est_update.items():
        if hasattr(existing_est, key):
            setattr(existing_est, key, value)

    existing_est.last_updated_by = current_user.fnum
    db.commit()
    return {"status": "success"}

@app.post("/api/v1/nominal-roll")
def create_Nominal_Roll(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
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

        new_record = models.Nominal_Roll(**clean_data)
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
        print(f"❌ Save Error: {e}") 
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/api/v1/stories")
def create_story(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        new_record = models.Success_Stories(**data)
        new_record.last_updated_by = current_user.fnum
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        return {"status": "success", "sn": new_record.sn}
    except Exception as e:
        db.rollback()
        print(f"❌ Story Save Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/reports")
def create_report(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        # Safely extract the suspect array before saving the main report
        suspects_data = data.pop('suspectDetails', []) 
        
        new_record = models.Crime_Reports(**data)
        new_record.last_updated_by = current_user.fnum
        db.add(new_record)
        db.flush() # This assigns the SN to the report BEFORE we commit!
        
        # Loop through the array and lock them into the suspect_lockup table
        for s in suspects_data:
            new_suspect = models.Suspect_Lockup(
                sd_ref=new_record.sn, # Ties the suspect to the Crime Report SN
                name=s.get('name'),
                sex=s.get('sex'),
                age=str(s.get('age')) if s.get('age') else None,
                tribe=s.get('tribe'),
                residence=s.get('residence'),
                contact=s.get('contact'),
                mental_health_status=s.get('mental_health_status')
            )
            db.add(new_suspect)

        db.commit()
        return {"status": "success"}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Duplicate Reference for this station.")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# THE MISSING CRIME REPORT UPDATE ROUTE
# ==========================================
@app.put("/api/v1/reports/{sn}")
def update_report(sn: int, data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        existing_report = db.query(models.Crime_Reports).filter(models.Crime_Reports.sn == sn).first()
        if not existing_report:
            raise HTTPException(status_code=404, detail="Crime Report not found")

        suspects_data = data.pop('suspectDetails', [])
        data.pop('sn', None)
        
        # Update the main report details
        for key, value in data.items():
            if hasattr(existing_report, key):
                setattr(existing_report, key, value)
                
        existing_report.last_updated_by = current_user.fnum
        
        # Pull existing suspects so we don't create duplicates when updating
        existing_lockups = db.query(models.Suspect_Lockup).filter(models.Suspect_Lockup.sd_ref == sn).all()
        existing_names = [lockup.name for lockup in existing_lockups]
        
        # Add any newly appended suspects to the lockup table
        for s in suspects_data:
            if s.get('name') not in existing_names:
                new_suspect = models.Suspect_Lockup(
                    sd_ref=sn,
                    name=s.get('name'),
                    sex=s.get('sex'),
                    age=str(s.get('age')) if s.get('age') else None,
                    tribe=s.get('tribe'),
                    residence=s.get('residence'),
                    contact=s.get('contact'),
                    mental_health_status=s.get('mental_health_status')
                )
                db.add(new_suspect)

        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/stats")
def create_stat(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        new_record = models.Operational_Statistics(**data)
        new_record.last_updated_by = current_user.fnum
        db.add(new_record)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# COMMUNICATION HUB ENDPOINTS
# ==========================================

@app.post("/api/v1/Admin_Communication")
async def create_admin_communication(comm: Admin_CommunicationCreate, db: Session = Depends(get_db), current_user: models.Users = Depends(require_admin)):
    
    db_comm = models.Admin_Communication(
        sender_fnum=comm.sender_fnum,
        sender_name=comm.sender_name,
        target_audience=comm.target_audience,
        target_region=comm.target_region,
        message_type=comm.message_type,
        subject=comm.subject,
        message=comm.message
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
                <p style="font-size: 10px; color: gray;">This is an automated dispatch from the KMP Tracker System.</p>
            </div>
            """
            asyncio.create_task(send_command_briefing(emails, comm.subject, html_body))

    return {"status": "success", "id": db_comm.id}

# =====================================================================
def strip_html_to_plain_text(text):
    if not text: return ""
    text = str(text)
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    return html.unescape(text)

def apply_custom_sheet_design(workbook, worksheet, df, sheet_name, user):
    # Applies the dark blue UPF forensic header styling
    header_format = workbook.add_format({
        'bold': True, 'valign': 'vcenter',
        'fg_color': '#0B2447', 'font_color': 'white', 'border': 1
    })
    for col_num, value in enumerate(df.columns.values):
        worksheet.write(0, col_num, value, header_format)
        worksheet.set_column(col_num, col_num, 18)

@app.post("/api/v1/communications/{comm_id}/acknowledge")
def acknowledge_communication(comm_id: int, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        # Check if the officer already acknowledged it to prevent duplicates
        existing_read = db.query(models.Communication_Reads).filter(
            models.Communication_Reads.comm_id == comm_id,
            models.Communication_Reads.fnum == current_user.fnum
        ).first()

        if not existing_read:
            new_read = models.Communication_Reads(
                comm_id=comm_id,
                fnum=current_user.fnum,
                read_at=datetime.utcnow() 
            )
            db.add(new_read)
            db.commit()
            
        return {"status": "success", "message": "Receipt acknowledged"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 2. ROUTE FOR ADMINS TO VIEW THE RECEIPTS
# ==========================================
@app.get("/api/v1/communications/{comm_id}/readers")
def get_communication_readers(comm_id: int, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    # Block non-admins from viewing the ledger
    if current_user.role not in ["ADMIN", "SUPER_ADMIN"]:
        raise HTTPException(status_code=403, detail="Clearance Denied")
    
    try:
        # Join the Communication_Reads table with the Users table to get their real names
        readers = db.query(
            models.Communication_Reads.read_at,
            models.Users.name,
            models.Users.fnum
        ).join(
            models.Users, models.Communication_Reads.fnum == models.Users.fnum
        ).filter(
            models.Communication_Reads.comm_id == comm_id
        ).all()

        eat_tz = pytz.timezone("Africa/Kampala")
        results = []
        
        for r in readers:
            # Convert UTC database time to East Africa Time for the UI
            local_time = r.read_at
            if local_time:
                if local_time.tzinfo is None:
                    local_time = pytz.utc.localize(local_time)
                local_time = local_time.astimezone(eat_tz)
                formatted_time = local_time.strftime("%Y-%m-%d %H:%M")
            else:
                formatted_time = "Unknown Time"
                
            results.append({
                "name": r.name,
                "fnum": r.fnum,
                "read_at": formatted_time
            })
            
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/reports/export")
def export_master_excel(
    background_tasks: BackgroundTasks, # <-- Added to clean up files after download
    timeframe: Optional[str] = "all",
    scope: Optional[str] = None, 
    value: Optional[str] = None, 
    db: Session = Depends(get_db), 
    authorized_user: models.Users = Depends(require_export_privilege)
):
    try:
        # 1. Create temporary files on Render's physical disk (Saves RAM)
        temp_dir = tempfile.mkdtemp()
        excel_path = os.path.join(temp_dir, f"temp_master_{authorized_user.fnum}.xlsx")
        zip_path = os.path.join(temp_dir, f"KMP_Master_Database_{authorized_user.fnum}.zip")

        with pd.ExcelWriter(excel_path, engine='xlsxwriter') as writer:
            workbook = writer.book

            # --- PROCESS CRIME DATA ---
            # yield_per(1000) prevents the database from dumping all rows into RAM at once
            crime_data = db.query(models.Crime_Reports).yield_per(1000)
            crime_list = [{
                "SN": getattr(r, 'sn', ''), "SD Ref": getattr(r, 'sd_ref', getattr(r, 'sdRef', '')),
                "Date": getattr(r, 'date', ''), "Time": getattr(r, 'time', ''), "Region": getattr(r, 'region', ''),
                "Station": getattr(r, 'station', ''), "Offence": getattr(r, 'offence', ''), "Status": getattr(r, 'status', ''),
                "Suspects": getattr(r, 'suspects', 0), "Narrative": strip_html_to_plain_text(getattr(r, 'narrative', ''))
            } for r in crime_data]
            df_crime = pd.DataFrame(crime_list) if crime_list else pd.DataFrame(columns=["SN", "SD Ref", "Date", "Time", "Region", "Station", "Offence", "Status", "Suspects", "Narrative"])
            df_crime.to_excel(writer, sheet_name="Crime Registry", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["Crime Registry"], df_crime, "Crime Registry", authorized_user)
            
            # 🧹 FREE RAM INSTANTLY before moving to the next table
            del crime_data, crime_list, df_crime
            gc.collect() 

            # --- PROCESS OPS STATISTICS ---
            stats_data = db.query(models.Operational_Statistics).yield_per(1000)
            stats_list = [{
                "SN": getattr(s, 'sn', ''), "Date": getattr(s, 'date', ''), "Region": getattr(s, 'region', ''),
                "Station": getattr(s, 'station', ''), "Arrested": getattr(s, 'arrested', 0), "Given Bond": getattr(s, 'given_bond', 0),
                "Cautioned": getattr(s, 'cautioned', 0), "Pending Court": getattr(s, 'pending_court', 0), "Taken To Court": getattr(s, 'taken_to_court', 0),
                "Released": getattr(s, 'released', 0), "Remanded": getattr(s, 'remanded', 0), "Convicted": getattr(s, 'convicted', 0)
            } for s in stats_data]
            df_stats = pd.DataFrame(stats_list) if stats_list else pd.DataFrame(columns=["SN", "Date", "Region", "Station", "Arrested", "Given Bond", "Cautioned", "Pending Court", "Taken To Court", "Released", "Remanded", "Convicted"])
            df_stats.to_excel(writer, sheet_name="OPS Statistics", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["OPS Statistics"], df_stats, "OPS Statistics", authorized_user)
            
            del stats_data, stats_list, df_stats
            gc.collect()

            # --- PROCESS SUCCESS STORIES ---
            stories_data = db.query(models.Success_Stories).yield_per(1000)
            stories_list = [{
                "SN": getattr(s, 'sn', ''), "Date": getattr(s, 'date', ''), "Time": getattr(s, 'time', ''),
                "Region": getattr(s, 'region', ''), "Station": getattr(s, 'station', ''), "Status": getattr(s, 'status', ''),
                "Narrative": strip_html_to_plain_text(getattr(s, 'narrative', ''))
            } for s in stories_data]
            df_stories = pd.DataFrame(stories_list) if stories_list else pd.DataFrame(columns=["SN", "Date", "Time", "Region", "Station", "Status", "Narrative"])
            df_stories.to_excel(writer, sheet_name="Success Stories", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["Success Stories"], df_stories, "Success Stories", authorized_user)
            
            del stories_data, stories_list, df_stories
            gc.collect()

            # --- PROCESS NOMINAL ROLL ---
            roll_data = db.query(models.Nominal_Roll).yield_per(1000)
            roll_list = [{
                "SN": getattr(n, 'sn', ''), "Force Number": getattr(n, 'fnum', getattr(n, 'f_num', '')),
                "Rank": getattr(n, 'rank', ''), "Name": getattr(n, 'name', ''), "Sex": getattr(n, 'sex', ''),
                "Position": getattr(n, 'position', ''), "DOB": getattr(n, 'dob', ''), "DOE": getattr(n, 'doe', ''),
                "DO POST": getattr(n, 'dopost', getattr(n, 'do_post', '')), "DO PRO": getattr(n, 'dopro', getattr(n, 'do_pro', '')),
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
            
            del roll_data, roll_list, df_roll
            gc.collect()

            workbook.set_properties({
                'title': 'KMP Master Database - RESTRICTED',
                'author': f'{authorized_user.rank} {authorized_user.name}',
                'manager': authorized_user.fnum,
                'company': 'Uganda Police Force (KMP)',
                'comments': f'FORENSIC TRACE: Downloaded by {authorized_user.fnum} on {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
            })

        # 2. Write AES Zip directly to physical disk
        zip_password = authorized_user.fnum.encode('utf-8')
        with pyzipper.AESZipFile(zip_path, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            zf.write(excel_path, f"KMP_Master_Database_{authorized_user.fnum}.xlsx")

        # Clean up the raw excel file immediately for security
        os.remove(excel_path)
        
        if hasattr(models, 'Audit_Logs'):
            audit_entry = models.Audit_Logs(
                event_type="MASTER_DATA_EXPORT", target_user="SYSTEM", status="SUCCESS",
                details="AES-Encrypted Master Database ZIP Downloaded (4 Sheets)", user_fnum=authorized_user.fnum
            )
            db.add(audit_entry)
            db.commit()

        # 3. Schedule final cleanup after the user finishes downloading
        def cleanup_temp_files(path_to_delete: str, dir_to_delete: str):
            try:
                if os.path.exists(path_to_delete): os.remove(path_to_delete)
                if os.path.exists(dir_to_delete): os.rmdir(dir_to_delete)
            except Exception:
                pass

        background_tasks.add_task(cleanup_temp_files, zip_path, temp_dir)

        # 4. Stream the file directly from disk to the browser
        return FileResponse(
            path=zip_path,
            filename=f"KMP_Master_Database_{authorized_user.fnum}.zip",
            media_type='application/zip'
        )
        
    except Exception as e:
        print(f"Export Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate secure Master Database file.")


@app.get("/api/v1/export/establishments")
def export_establishments(
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db), 
    authorized_user: models.Users = Depends(require_export_privilege)
):
    try:
        temp_dir = tempfile.mkdtemp()
        excel_path = os.path.join(temp_dir, f"temp_est_{authorized_user.fnum}.xlsx")
        zip_path = os.path.join(temp_dir, f"KMP_HR_Ledger_{authorized_user.fnum}.zip")

        with pd.ExcelWriter(excel_path, engine='xlsxwriter') as writer:
            workbook = writer.book

            # Process HR Data
            hr_data = db.query(models.Nominal_Roll).yield_per(1000)
            hr_list = [{"Force Number": getattr(h, 'f_num', getattr(h, 'fnum', '')), "Name": getattr(h, 'name', ''), "Rank": getattr(h, 'rank', ''), "Sex": getattr(h, 'sex', ''), "Region": getattr(h, 'region', ''), "Station": getattr(h, 'station', ''), "Position": getattr(h, 'position', ''), "Status": getattr(h, 'status', '')} for h in hr_data]
            df_hr = pd.DataFrame(hr_list) if hr_list else pd.DataFrame(columns=["Force Number", "Name", "Rank", "Sex", "Region", "Station", "Position", "Status"])
            df_hr.to_excel(writer, sheet_name="Nominal Roll", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["Nominal Roll"], df_hr, "Nominal Roll", authorized_user)
            
            del hr_data, hr_list, df_hr
            gc.collect()

            # Process Establishments Data
            est_data = db.query(models.Establishments).yield_per(1000)
            est_list = [{
                "ID": getattr(e, 'id', ''), "Region": getattr(e, 'region', ''), "Division": getattr(e, 'division', ''),
                "Station": getattr(e, 'station', ''), "Personnel (Station)": getattr(e, 'personnel_in_station', 0) or 0,
                "Sub-Station": getattr(e, 'sub_station', ''), "Personnel (Sub-Stn)": getattr(e, 'personnel_in_sub_station', 0) or 0,
                "Post": getattr(e, 'post', ''), "Personnel (Post)": getattr(e, 'personnel_in_post', 0) or 0,
                "Booths": getattr(e, 'booths', 0) or 0, "Personnel (Booth)": getattr(e, 'personnel_in_booth', 0) or 0,
                "Installed By": getattr(e, 'installed_by', ''), "Location": getattr(e, 'location', ''),
                "Status": getattr(e, 'status', ''), "Comment": strip_html_to_plain_text(getattr(e, 'comment', '')),
                "Last Updated By": getattr(e, 'last_updated_by', ''), "Created At": getattr(e, 'created_at', '').strftime("%Y-%m-%d %H:%M") if getattr(e, 'created_at', None) else ''
            } for e in est_data]
            df_est = pd.DataFrame(est_list) if est_list else pd.DataFrame(columns=[
                "ID", "Region", "Division", "Station", "Personnel (Station)", "Sub-Station", 
                "Personnel (Sub-Stn)", "Post", "Personnel (Post)", "Booths", "Personnel (Booth)", 
                "Installed By", "Location", "Status", "Comment", "Last Updated By", "Created At"
            ])
            df_est.to_excel(writer, sheet_name="establishments", index=False)
            apply_custom_sheet_design(workbook, writer.sheets["establishments"], df_est, "establishments", authorized_user)
            
            del est_data, est_list, df_est
            gc.collect()
            
            workbook.set_properties({
                'title': 'KMP HR & establishments - RESTRICTED',
                'author': f'{authorized_user.rank} {authorized_user.name}',
                'manager': authorized_user.fnum,
                'company': 'Uganda Police Force (KMP)',
                'comments': f'FORENSIC TRACE: Downloaded by {authorized_user.fnum} on {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
            })
            workbook.set_custom_property('Forensic_FNUM', authorized_user.fnum)

        zip_password = authorized_user.fnum.encode('utf-8')
        with pyzipper.AESZipFile(zip_path, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            zf.write(excel_path, f"KMP_HR_establishments_{authorized_user.fnum}.xlsx")

        os.remove(excel_path)
        
        if hasattr(models, 'AuditLog'):
            audit_entry = models.AuditLog(
                event_type="DATA_EXPORT", target_user="SYSTEM", status="SUCCESS",
                details="AES-Encrypted HR & establishments ZIP Downloaded", user_fnum=authorized_user.fnum
            )
            db.add(audit_entry)
            db.commit()

        def cleanup_temp_files(path_to_delete: str, dir_to_delete: str):
            try:
                if os.path.exists(path_to_delete): os.remove(path_to_delete)
                if os.path.exists(dir_to_delete): os.rmdir(dir_to_delete)
            except Exception:
                pass

        background_tasks.add_task(cleanup_temp_files, zip_path, temp_dir)

        return FileResponse(
            path=zip_path,
            filename=f"KMP_HR_Ledger_{authorized_user.fnum}.zip",
            media_type='application/zip'
        )
        
    except Exception as e:
        print(f"HR Export Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate secure HR Excel file.")

# ==========================================
# ACTIVITY LOGS ENDPOINT
# ==========================================
@app.get("/api/v1/activity_logs")
def get_activity_logs(db: Session = Depends(database.get_db), current_user = Depends(get_current_user)):
    if hasattr(models, 'Activity_Logs'):
        logs = db.query(models.activity_logs).order_by(models.activity_logs.time.desc()).limit(100).all()
        return logs
    return []

# =====================================================================
# 8. NOMINAL ROLL ARCHIVE SYSTEM (MIGRATION & RETRIEVAL)
# =====================================================================

class ArchiveRequest(BaseModel):
    archive_reason: str

@app.put("/api/v1/nominal-roll/{fnum}/archive")
def archive_personnel(fnum: str, request_data: ArchiveRequest, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        active_record = db.query(models.Nominal_Roll).filter(
            (models.Nominal_Roll.fnum == fnum) if hasattr(models.Nominal_Roll, 'fnum') else (models.Nominal_Roll.f_num == fnum)
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
        print(f"❌ Archive Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to migrate record: {str(e)}")

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

@app.get("/api/v1/activity-logs")
def get_activity_logs(current_user = Depends(require_admin)):
    # FIXED: Now securely fetching from the Neon Logs DB Branch
    db_logs = SessionLogsLocal()
    try:
        logs = db_logs.query(models.Activity_Logs).order_by(models.Activity_Logs.created_at.desc()).limit(1000).all()
        
        eat_tz = pytz.timezone("Africa/Nairobi")
        clean_logs = []
        
        for log in logs:
            local_time = log.created_at
            if local_time:
                if local_time.tzinfo is None:
                    local_time = pytz.utc.localize(local_time)
                local_time = local_time.astimezone(eat_tz)
                formatted_time = local_time.strftime("%Y-%m-%d %H:%M:%S")
            else:
                formatted_time = "Unknown Time"
                
            clean_logs.append({
                "id": log.id,
                "fnum": log.fnum,
                "action": log.action,
                "module": log.module,
                "details": log.details,
                "created_at": formatted_time
            })
            
        return clean_logs
    finally:
        db_logs.close()

# ==========================================
# COMMAND COMMUNICATION ROUTE (SMART INBOX)
# ==========================================

@app.post("/api/v1/communications")
def create_admin_communication(comm: Admin_CommunicationCreate, db: Session = Depends(get_db)):
    try:
        db_comm = models.Admin_Communication(
            sender_fnum=comm.sender_fnum,
            sender_name=comm.sender_name,
            target_audience=comm.target_audience,
            target_region=comm.target_region,
            message_type=comm.message_type,
            subject=comm.subject,
            message=comm.message
        )
        db.add(db_comm)
        db.commit()
        return {"status": "success", "message": "Broadcast sent."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/communications/{comm_id}/acknowledge")
def acknowledge_message(comm_id: int, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    """Records the exact moment an officer acknowledges a dispatch."""
    if not hasattr(models, 'Communication_Reads'):
        return {"status": "error", "detail": "Read receipts table not initialized."}
        
    existing = db.query(models.Communication_Reads).filter(
        models.Communication_Reads.comm_id == comm_id,
        models.Communication_Reads.fnum == current_user.fnum
    ).first()
    
    if not existing:
        eat_tz = pytz.timezone("Africa/Kampala")
        uganda_time = datetime.now(eat_tz).replace(tzinfo=None)
        
        new_read = models.Communication_Reads(
            comm_id=comm_id,
            fnum=current_user.fnum,
            read_at=uganda_time
        )
        db.add(new_read)
        db.commit()
    return {"status": "success"}

@app.get("/api/v1/communications/{comm_id}/readers")
def get_message_readers(comm_id: int, db: Session = Depends(get_db), current_user: models.Users = Depends(require_admin)):
    """Allows Admins to see exactly who read a specific dispatch."""
    if not hasattr(models, 'Communication_Reads'):
        return []
        
    readers = db.query(models.Communication_Reads).filter(models.Communication_Reads.comm_id == comm_id).all()
    
    results = []
    for r in readers:
        user = db.query(models.Users).filter(models.Users.fnum == r.fnum).first()
        name = user.name if user else "Unknown Officer"
        results.append({
            "fnum": r.fnum, 
            "name": name, 
            "read_at": r.read_at.strftime("%Y-%m-%d %H:%M:%S") if r.read_at else "Unknown Time"
        })
    return results

@app.get("/api/v1/Admin_Communication")
def get_admin_communications(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    query = db.query(models.Admin_Communication)

    if current_user.role != "SUPER_ADMIN":
        # 🛡️ THE FIX: Allow both "ALL" and "ALL_USERS" through the firewall
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
    
    eat_tz = pytz.timezone("Africa/Kampala")
    clean_comms = []
    
    for c in comms:
        # Check if the current user has already acknowledged this message
        is_read = False
        if hasattr(models, 'Communication_Reads'):
            read_record = db.query(models.Communication_Reads).filter(
                models.Communication_Reads.comm_id == c.id,
                models.Communication_Reads.fnum == current_user.fnum
            ).first()
            if read_record:
                is_read = True

        local_time = c.created_at
        if local_time:
            if local_time.tzinfo is None:
                local_time = pytz.utc.localize(local_time)
            local_time = local_time.astimezone(eat_tz)
            formatted_time = local_time.strftime("%Y-%m-%d %H:%M")
        else:
            formatted_time = "Unknown Time"
            
        clean_comms.append({
            "id": c.id,
            "sender_fnum": c.sender_fnum,
            "sender_name": c.sender_name,
            "target_audience": c.target_audience,
            "target_region": c.target_region,
            "message_type": c.message_type,
            "subject": c.subject,
            "message": c.message,
            "created_at": formatted_time,
            "acknowledged": is_read # Passes the read status to React
        })

    return clean_comms

# ==========================================
# USER AUTHENTICATION & SIGNUP ROUTE
# ==========================================

@app.post("/api/v1/users/upload-profile")
async def upload_profile_photo(
    file: UploadFile = File(...),
    fnum: str = Form("PENDING_REGISTRATION"),
    category: str = Form("user_profile"),
    narrative: str = Form("Officer Profile Photo")
):
    try:
        import uuid # Using uuid since it's already used elsewhere in your file
        
        # Generate a secure, unique key for S3
        file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
        unique_id = uuid.uuid4().hex[:8]
        clean_fnum = fnum.replace("/", "_")
        s3_key = f"profile_photos/{clean_fnum}_{unique_id}.{file_extension}"

        # Upload directly to S3 bucket using your existing BUCKET_NAME
        s3_client.upload_fileobj(
            file.file,
            BUCKET_NAME,
            s3_key,
            ExtraArgs={"ContentType": file.content_type, "ServerSideEncryption": "AES256"}
        )

        # Build the exact URL format using os.getenv
        full_url = f"https://{BUCKET_NAME}.s3.{os.getenv('AWS_REGION')}.amazonaws.com/{s3_key}"
        
        return {
            "status": "success", 
            "message": "Profile photo uploaded successfully!", 
            "full_s3_url": full_url, 
            "cloud_storage_path": s3_key
        }

    except ClientError as e:
        print(f"❌ S3 Client Error: {e}")
        raise HTTPException(status_code=500, detail=f"S3 Upload failed: {str(e)}")
    except Exception as e:
        print(f"❌ General Error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    finally:
        file.file.close()

@app.post("/api/v1/auth/signup")
def register_user(
    fnum: str = Form(...),
    rank: str = Form(...),
    name: str = Form(...),
    ipps: str = Form(...),
    region: str = Form(...),
    station: str = Form(...),
    position: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    password: str = Form(...), 
    
    sex: Optional[str] = Form(None),
    division: Optional[str] = Form(None),
    role: str = Form("USER"), 
    
    profile_photo_path: str = Form(""), 
    db: Session = Depends(get_db)
):
    existing_user = db.query(models.Users).filter(models.Users.fnum == fnum).first()
    if existing_user:
         raise HTTPException(status_code=400, detail="User with this fnum already exists.")
         
    if role != "SUPER_ADMIN" and not profile_photo_path:
        raise HTTPException(
            status_code=400, 
            detail="A profile photo is mandatory for non-admin users."
        )

    try:
        new_user = models.Users(
            fnum=fnum,
            rank=rank,
            name=name,
            sex=sex,
            ipps=ipps,
            region=region,
            division=division,
            station=station,
            position=position,
            email=email,
            phone=phone,
            hashed_password=security.get_password_hash(password) if hasattr(security, 'get_password_hash') else password,
            role=role,
            profile_photo_path=profile_photo_path # <--- EXACT MATCH TO YOUR MODELS.PY
        )
        db.add(new_user)
        db.commit()
        return {"status": "success", "message": "User registered successfully!"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database write failed: {str(e)}")

# ==========================================
# ADMIN APPROVAL ROUTES
# ==========================================

@app.get("/api/v1/admin/pending-users")
def get_pending_users(db: Session = Depends(get_db)):
    """Fetches all registered officers awaiting Command approval."""
    try:
        # Queries the Users table for anyone where is_approved is False
        pending = db.query(models.Users).filter(models.Users.is_approved == False).all()
        return pending
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch pending users: {str(e)}")

@app.patch("/api/v1/admin/approve-user/{fnum}")
def approve_user(fnum: str, db: Session = Depends(get_db)):
    """Switches an officer's is_approved status to True."""
    user = db.query(models.Users).filter(models.Users.fnum == fnum).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Officer not found in database.")
    
    try:
        user.is_approved = True
        db.commit()
        return {"status": "success", "message": f"Officer {fnum} successfully authorized."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database update failed: {str(e)}")

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
            raise HTTPException(status_code=400, detail=f"Quota full: Maximum 3 active {target_user.position}s allowed in {target_user.station}.")

    target_user.is_approved = True
    db.commit()
    return {"message": "User approved successfully."}

# ==========================================
# SYSTEM ROSTER ROUTE
# ==========================================
@app.get("/api/v1/users")
def get_all_active_users(db: Session = Depends(get_db)):
    """Fetches all approved users with full profile details for the System Roster."""
    try:
        users = db.query(models.Users).filter(models.Users.is_approved == True).all()
        # Returns the comprehensive profile without exposing the hashed_password
        return [
            {
                "fnum": u.fnum, 
                "name": u.name, 
                "rank": u.rank, 
                "role": u.role, 
                "station": u.station, 
                "region": u.region,
                "division": u.division,
                "position": u.position,
                "email": u.email,
                "phone": u.phone,
                "ipps": u.ipps,
                "sex": u.sex,
                "profile_photo_path": u.profile_photo_path,
                "permissions": u.permissions
            } for u in users
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/requests")
def submit_modification_request(req: ProfileModRequest, db: Session = Depends(get_db)):
    """Receives the POST request from the user profile."""
    
    # 🛡️ SECURITY FIX: Prevent duplicate pending requests
    existing_request = db.query(models.Modification_Requests).filter(
        models.Modification_Requests.fnum == req.fnum,
        models.Modification_Requests.status == "PENDING"
    ).first()
    
    if existing_request:
        raise HTTPException(
            status_code=400, 
            detail="You already have a modification request pending Command approval. Please wait for it to be reviewed."
        )

    try:
        new_req = models.Modification_Requests(
            fnum=req.fnum,
            requested_name=req.requested_name,
            requested_rank=req.requested_rank,
            requested_region=req.requested_region,
            requested_station=req.requested_station,
            status="PENDING"
        )
        db.add(new_req)
        db.commit()
        return {"status": "success", "message": "Request submitted."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/requests")
def get_modification_requests(db: Session = Depends(get_db)):
    """Feeds the pending requests to the Admin Dashboard."""
    try:
        return db.query(models.Modification_Requests).filter(models.Modification_Requests.status == "PENDING").all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/v1/requests/{req_id}")
def review_modification_request(req_id: int, action: ReviewAction, db: Session = Depends(get_db)):
    """Allows the Super Admin to Approve or Reject the request."""
    req = db.query(models.Modification_Requests).filter(models.Modification_Requests.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    
    try:
        req.status = action.status
        # If approved, automatically update the user's actual profile!
        if action.status == "APPROVED":
            user = db.query(models.Users).filter(models.Users.fnum == req.fnum).first()
            if user:
                if req.requested_name: user.name = req.requested_name
                if req.requested_rank: user.rank = req.requested_rank
                if req.requested_region: user.region = req.requested_region
                if req.requested_station: user.station = req.requested_station
        
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.middleware("http")
async def global_activity_tracker(request: Request, call_next):
    response = await call_next(request)

    if request.method in ["POST", "PUT", "DELETE"]:
        db_logs = SessionLogsLocal()
        try:
            user_fnum = request.headers.get("X-User-FNum", "SYSTEM")
            
            # --- FORCE EAST AFRICA TIME ---
            eat_tz = pytz.timezone("Africa/Kampala")
            uganda_time = datetime.now(eat_tz).replace(tzinfo=None)
            
            new_activity = models.Activity_Logs( 
                fnum=user_fnum,
                action=f"{request.method} {request.url.path}",
                module="AUTO_SYSTEM_LOG",
                details=f"Status: {response.status_code}",
                created_at=uganda_time  # Explicitly save EAT to the database
            )
            db_logs.add(new_activity)
            db_logs.commit()
        except Exception as e:
            print(f"Logging Failed: {e}")
            db_logs.rollback()
        finally:
            db_logs.close()

    return response

# Note: Host changed to 0.0.0.0 to allow network/cloud access
if __name__ == "__main__":
    uvicorn.run("api_backend:app", host="0.0.0.0", port=8000, reload=True)