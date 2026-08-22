import io
import os
import gc
import re
import html
import uuid
import asyncio
import secrets  
import string   
from datetime import datetime, timedelta
from typing import Optional, List, Union
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
import urllib.parse
import pymupdf
import zipfile

import pytz
import uvicorn
import pyzipper
import pandas as pd
import numpy as np

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks, Request
from fastapi.responses import StreamingResponse, FileResponse, RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from routers import ai_router

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import Column, Integer, text
from docx.shared import Pt, RGBColor
import openpyxl
from openpyxl.styles import Alignment 
from pptx import Presentation
from pptx.util import Inches, Pt as PPTXPt
from pptx.dml.color import RGBColor as PPTXRGBColor
from sqlalchemy.orm.attributes import flag_modified
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

from urllib.parse import unquote
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Internal Imports
from app import models, schemas, database
from app.database import engine, get_db, get_logs_db, SQLALCHEMY_DATABASE_URL
from app.core import security
from auth import router as auth_router
from docx import Document
from app.schemas import AgricStatsCreate, AgricStatsResponse

# ==========================================
# 0. LOAD ENVIRONMENT VARIABLES & CONFIG
# ==========================================
load_dotenv()

app = FastAPI(title="KMP Centralised Security Data Management System")

from routers import (
    document_upload,
    general_documents,
    command_templates,
    nominal_roll,
    crime_registry,
    lockup_matrix,
    establishments,
    success_stories,
    admin_communication,
    ai_router,
)

# Include them once
app.include_router(document_upload.router)
app.include_router(general_documents.router)
app.include_router(command_templates.router)
app.include_router(nominal_roll.router)
app.include_router(crime_registry.router)
app.include_router(lockup_matrix.router)
app.include_router(establishments.router)
app.include_router(success_stories.router)
app.include_router(admin_communication.router)
app.include_router(auth_router, prefix="/api/auth")

# Include the AI router properly as an APIRouter instance
app.include_router(ai_router.router)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"Internal Command Error Traceback: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal command processing error occurred. Please try again later."},
    )

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ==========================================
# 1. ROUTER INCLUSIONS (MODULAR ARCHITECTURE)
# ==========================================
from routers import (
    nominal_roll, 
    crime_registry, 
    lockup_matrix, 
    establishments, 
    success_stories, 
    admin_communication,
    document_upload 
)

app.include_router(nominal_roll.router)
app.include_router(crime_registry.router)
app.include_router(lockup_matrix.router)
app.include_router(establishments.router)
app.include_router(success_stories.router)
app.include_router(admin_communication.router)
app.include_router(document_upload.router) 

app.include_router(auth_router, prefix="/api/auth")
app.include_router(ai_router.router)

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

def get_officer_signature(user):
    if not user:
        return "UNKNOWN COMMANDER"
    fnum = (user.fnum or "").strip()
    rank = (user.rank or "").strip()
    name = (user.name or "").strip()
    return f"{fnum} {rank} {name}".strip().upper()

def sanitize_df_for_excel(df: pd.DataFrame) -> pd.DataFrame:
    """Removes all timezone metadata from pandas DataFrames for openpyxl / Excel compatibility."""
    if df.empty:
        return df
    
    # 1. Strip timezone from any datetime-like columns
    for col in df.select_dtypes(include=['datetimetz', 'datetime', 'datetime64[ns, UTC]', 'datetime64[ns]']).columns:
        try:
            df[col] = df[col].dt.tz_localize(None)
        except Exception:
            df[col] = df[col].astype(str)
            
    # 2. Safety pass on object columns containing raw datetime objects
    for col in df.select_dtypes(include=['object']).columns:
        df[col] = df[col].apply(lambda x: x.replace(tzinfo=None) if isinstance(x, datetime) and x.tzinfo is not None else x)
        
    return df

def serialize_model_row(row):
    """Safely converts an SQLAlchemy instance or dictionary into a JSON-serializable dict."""
    if not row:
        return {}
        
    if isinstance(row, dict):
        d = row.copy()
    elif hasattr(row, '__dict__'):
        d = row.__dict__.copy()
        d.pop('_sa_instance_state', None)
    else:
        return {}

    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.strftime("%Y-%m-%d %H:%M:%S")
        elif hasattr(v, 'isoformat'):
            d[k] = v.isoformat()
        # Safely catch Decimal/Numeric fields from PostgreSQL NeonDB
        elif hasattr(v, '__float__') and not isinstance(v, (int, float, str, bool)):
            d[k] = float(v)
    return d

# ==========================================
# 2. STARTUP & MIDDLEWARE
# ==========================================
@app.get("/")
@app.head("/")
def health_check():
    return {
        "status": "online", 
        "message": "KMP Centralised Security API is running securely."
    }

try:
    models.Base.metadata.create_all(bind=engine, checkfirst=True)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP"))
except Exception as e:
    print(f"Startup metadata notice: {e}")

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
    allow_origin_regex=r"https://kmp-tracker.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# ==========================================
# 3. SECURITY & DEPENDENCIES (RAM-ONLY SECURE)
# ==========================================
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def get_eat_time():
    eat_tz = pytz.timezone('Africa/Nairobi')
    return datetime.now(eat_tz).strftime('%Y-%m-%d %H:%M:%S')

def get_current_user(request: Request, db: Session = Depends(get_db)):
    token = None
    
    # 1. Try extracting token from Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    
    # 2. Fallback: Try extracting token from secure cookies if header is missing
    if not token:
        token = request.cookies.get("access_token") or request.cookies.get("kmp_authToken")

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        fnum: str = payload.get("sub")
        if fnum is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    
    clean_fnum = str(fnum).strip().upper()
    user = db.query(models.Users).filter(
        func.trim(func.upper(models.Users.fnum)) == clean_fnum
    ).first()
    
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # 🟢 PASSIVE HEARTBEAT: Any active in-memory API call automatically keeps user online
    try:
        eat_tz = pytz.timezone('Africa/Nairobi')
        user.last_active_at = datetime.now(eat_tz).replace(tzinfo=None)
        db.commit()
    except Exception:
        db.rollback()

    if user.role != "SUPER_ADMIN":
        config_check = db.query(models.SystemConfig).filter(
            models.SystemConfig.config_key == "peer_delegation_active"
        ).first()
        if config_check and str(config_check.config_value).strip().upper() == "FALSE":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Application Lockdown: System access restricted."
            )

    return user

def require_admin(current_user: models.Users = Depends(get_current_user)):
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    valid_roles = ["SUPER_ADMIN", "SYSTEM_ADMIN", "REGIONAL_ADMIN", "DIVISION_ADMIN", "STATION_ADMIN", "ADMIN", "RPC"]
    if user_role not in valid_roles:
        raise HTTPException(status_code=403, detail="Clearance Denied: Admin privileges required.")
    return current_user

def require_export_privilege(current_user: models.Users = Depends(get_current_user)):
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    perms = current_user.permissions or {}
    if user_role not in ["ADMIN", "SUPER_ADMIN", "RPC"] and not perms.get("export_data", False):
        raise HTTPException(status_code=403, detail="Clearance Denied: Data Export Privileges Required.")
    return current_user

def log_semantic_audit(db, fnum: str, action: str, target_identifier: str, changes: dict, remarks: str = ""):
    try:
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
                created_at=get_eat_time()
            )
            db.add(new_audit)
            db.commit()
    except Exception as e:
        print(f"Audit Log Failed: {e}")
        db.rollback()

# ==========================================
# 4. USERS, HEARTBEAT & ACTIVITY LOGS
# ==========================================
@app.get("/api/v1/users")
def get_all_active_users(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        users = db.query(models.Users).filter(models.Users.is_approved == True).all()
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

# ====================================================================
# STRICTLY ISOLATED ROUTES: DOCUMENTS, TEMPLATES, & WEEKLY REPORTS
# ====================================================================

# 1. GENERAL DOCUMENTS (Strictly General Docs, No Fallbacks)
@app.get("/api/v1/general-documents")
def get_general_documents(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        DocModel = getattr(models, 'GeneralDocuments', getattr(models, 'General_Documents', None))
        if not DocModel:
            return []
            
        docs = db.query(DocModel).order_by(DocModel.id.desc()).all()
        return [serialize_model_row(d) for d in docs]
    except Exception as e:
        print(f"General Documents Fetch Error: {e}")
        return []

# 2. COMMAND TEMPLATES (Strictly Templates)
@app.get("/api/v1/templates/list")
def get_command_templates(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        TemplateModel = getattr(models, 'CommandTemplate', getattr(models, 'command_templates', None))
        if not TemplateModel:
            return []
            
        templates = db.query(TemplateModel).order_by(TemplateModel.id.desc()).all()
        results = []
        for t in templates:
            filename = getattr(t, 'file_name', None) or getattr(t, 's3_url', '') or "document"
            ext = filename.split('.')[-1].lower() if '.' in filename else "unknown"
            
            if ext in ['docx', 'doc']: file_type = "Word Document"
            elif ext in ['xlsx', 'xls']: file_type = "Excel Spreadsheet"
            elif ext in ['pptx', 'ppt']: file_type = "PowerPoint Presentation"
            elif ext == 'pdf': file_type = "PDF Document"
            else: file_type = "Command Template"

            last_up = getattr(t, 'upload_date', getattr(t, 'created_at', None))
            date_str = last_up.strftime("%Y-%m-%d") if isinstance(last_up, datetime) else str(last_up or "")

            results.append({
                "id": getattr(t, 'id', 1),
                "name": filename,
                "type": file_type,
                "date": date_str,
                "size": getattr(t, 'file_size', "N/A"),
                "file_path": getattr(t, 'file_path', getattr(t, 's3_url', '')),
                "region": getattr(t, 'region', "KMP HEADQUARTERS"),
                "station": getattr(t, 'station', "HQ")
            })
        return results
    except Exception as e:
        print(f"Templates List Error Traceback: {str(e)}")
        return []

# 3. WEEKLY REPORTS / SITREPS (Strictly Reports)
@app.get("/api/v1/weekly-reports/list")
def get_weekly_reports_list(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        ReportModel = getattr(models, 'WeeklyReports', getattr(models, 'weekly_reports', getattr(models, 'Reports', None)))
        if not ReportModel:
            return []
            
        reports = db.query(ReportModel).order_by(ReportModel.id.desc()).all()
        return [serialize_model_row(r) for r in reports]
    except Exception as e:
        print(f"Weekly Reports Fetch Error: {e}")
        return []

@app.get("/api/v1/admin/pending-users")
def get_pending_users(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        if current_user.role not in ["ADMIN", "SUPER_ADMIN", "RPC"]:
            raise HTTPException(status_code=403, detail="Unauthorized access.")
        pending = db.query(models.Users).filter(models.Users.is_approved == False).all()
        return [
            {
                "id": getattr(u, 'id', 0),
                "fnum": u.fnum, "name": u.name, "rank": u.rank,
                "station": u.station, "region": u.region, "role": u.role,
                "email": u.email, "phone": u.phone, "ipps": u.ipps, "sex": u.sex
            } for u in pending
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/requests")
def get_system_requests(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        if current_user.role not in ["ADMIN", "SUPER_ADMIN", "RPC"]:
            raise HTTPException(status_code=403, detail="Unauthorized access.")
        requests = db.query(models.Users).filter(models.Users.is_approved == False).all()
        return [
            {
                "id": getattr(r, 'id', 0),
                "fnum": r.fnum, "name": r.name, "rank": r.rank,
                "station": r.station, "region": r.region, "role": r.role
            } for r in requests
        ]
    except Exception as e:
        return []

@app.get("/api/v1/audit-logs")
def get_audit_logs(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        if current_user.role not in ["ADMIN", "SUPER_ADMIN", "RPC"]:
            raise HTTPException(status_code=403, detail="Unauthorized access.")
        
        # Fallback resolver for different table name casings
        AuditModel = getattr(models, 'Audit_Logs', getattr(models, 'AuditLogs', None))
        if not AuditModel:
            return []

        logs = db.query(AuditModel).order_by(AuditModel.id.desc()).limit(100).all()
        return [
            {
                "id": log.id,
                "event_type": getattr(log, 'event_type', 'ACTION'),
                "target_user": getattr(log, 'target_user', ''),
                "status": getattr(log, 'status', 'SUCCESS'),
                "details": getattr(log, 'details', ''),
                "user_fnum": getattr(log, 'user_fnum', ''),
                "created_at": str(getattr(log, 'created_at', ''))
            } for log in logs
        ]
    except Exception as e:
        print(f"Audit log fetch error: {e}")
        return []

@app.put("/api/v1/users/{fnum}/access")
@app.post("/api/v1/admin/bulk-permissions")
@app.put("/api/v1/admin/bulk-permissions")
def update_user_access(
    data: dict, 
    fnum: Optional[str] = None, 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(require_admin)
):
    target_fnum = fnum or data.get("fnum") or data.get("user_fnum")
    if not target_fnum:
        raise HTTPException(status_code=400, detail="Officer force number (fnum) is required.")

    clean_fnum = str(target_fnum).strip().upper()
    user = db.query(models.Users).filter(
        func.trim(func.upper(models.Users.fnum)) == clean_fnum
    ).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Officer record not found.")

    if "role" in data and data["role"]:
        user.role = str(data["role"]).strip().upper()

    if "permissions" in data and data["permissions"] is not None:
        merged_perms = dict(user.permissions or {})
        if isinstance(data["permissions"], dict):
            merged_perms.update(data["permissions"])
        user.permissions = merged_perms
        flag_modified(user, "permissions")

    try:
        db.commit()
        db.refresh(user)
        return {
            "status": "success",
            "message": f"Access matrix permanently committed for {user.fnum}",
            "permissions": user.permissions,
            "role": user.role
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit error: {str(e)}")

@app.get("/api/v1/admin/reset-requests")
def get_reset_requests(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        if current_user.role not in ["ADMIN", "SUPER_ADMIN", "RPC"]:
            raise HTTPException(status_code=403, detail="Unauthorized access.")
        target_model = getattr(models, 'Password_Reset_Requests', getattr(models, 'PasswordResetRequests', None))
        if target_model:
            resets = db.query(target_model).all()
            return [{"id": r.id, "fnum": r.fnum, "status": r.status} for r in resets]
        return []
    except Exception as e:
        return []

@app.post("/api/v1/admin/execute-reset/{req_id}")
def execute_password_reset(
    req_id: int,
    action: str = Form(...),
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    if current_user.role not in ["ADMIN", "SUPER_ADMIN", "RPC"]:
        raise HTTPException(status_code=403, detail="Unauthorized access.")

    TargetModel = getattr(models, 'Password_Reset_Requests', getattr(models, 'PasswordResetRequests', None))
    if not TargetModel:
        raise HTTPException(status_code=404, detail="Password reset model not initialized.")

    reset_req = db.query(TargetModel).filter(TargetModel.id == req_id).first()
    if not reset_req:
        raise HTTPException(status_code=404, detail="Password reset request not found.")

    if action.upper() == "APPROVE":
        # 1. Generate temporary secure password
        temp_password = "UPF" + secrets.token_hex(3).upper()
        hashed_pw = pwd_context.hash(temp_password)

        # 2. Update user's password in the users table
        target_user = db.query(models.Users).filter(
            func.trim(func.upper(models.Users.fnum)) == str(reset_req.fnum).strip().upper()
        ).first()

        if target_user:
            target_user.hashed_password = hashed_pw

        # 3. Remove the reset request from the queue
        db.delete(reset_req)
        db.commit()

        return {"status": "success", "new_password": temp_password}
    else:
        # Reject and remove request
        db.delete(reset_req)
        db.commit()
        return {"status": "success", "message": "Password reset request rejected."}

class HeartbeatPayload(BaseModel):
    fnum: Optional[str] = None

@app.post("/api/v1/users/heartbeat")
@app.post("/api/v1/users/heartbeat/")
def heartbeat(
    payload: Optional[HeartbeatPayload] = None,
    token: Optional[str] = Depends(OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)),
    db: Session = Depends(get_db)
):
    user = None

    # 1. Primary Authentication: Validate JWT Bearer token if present
    if token:
        try:
            jwt_data = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
            token_fnum = jwt_data.get("sub")
            if token_fnum:
                user = db.query(models.Users).filter(
                    func.trim(func.upper(models.Users.fnum)) == str(token_fnum).strip().upper()
                ).first()
        except JWTError:
            pass

    # 2. Fallback Identification: Recover via body payload if token is refreshing
    if not user and payload and payload.fnum:
        user = db.query(models.Users).filter(
            func.trim(func.upper(models.Users.fnum)) == str(payload.fnum).strip().upper()
        ).first()

    # 3. Deny if neither token nor payload yields an active record
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session credentials")

    try:
        eat_tz = pytz.timezone('Africa/Nairobi')
        user.last_active_at = datetime.now(eat_tz).replace(tzinfo=None)
        db.commit()
        return {"status": "alive", "user": user.fnum}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/users/online")
def get_online_users(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    eat_tz = pytz.timezone('Africa/Nairobi')
    now_eat = datetime.now(eat_tz).replace(tzinfo=None)
    threshold = now_eat - timedelta(minutes=2)
    
    active_users = db.query(models.Users).filter(
        models.Users.is_approved == True,
        models.Users.last_active_at >= threshold
    ).all()
    
    return [
        {
            "fnum": u.fnum,
            "name": u.name,
            "station": u.station,
            "profile_photo_path": u.profile_photo_path
        } for u in active_users
    ]

@app.get("/api/v1/activity-logs")
def get_system_activity_logs(db: Session = Depends(get_logs_db), current_user: models.Users = Depends(get_current_user)):
    try:
        if current_user.role not in ["ADMIN", "SUPER_ADMIN", "RPC"]:
            raise HTTPException(status_code=403, detail="Unauthorized access.")
        
        logs = db.query(models.Activity_Logs).order_by(models.Activity_Logs.id.desc()).limit(100).all()
        return [
            {
                "id": log.id,
                "created_at": log.created_at.isoformat() if hasattr(log.created_at, 'isoformat') else str(log.created_at),
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
        page = data.get("module", data.get("page_accessed", "UNKNOWN"))
        act = data.get("action", "PAGE_ACCESS")
        details = data.get("details", f"Officer {current_user.name} ({current_user.fnum}) accessed {page}")
        
        new_activity = models.Activity_Logs(
            fnum=current_user.fnum,
            action=act,
            module=page,
            details=details,
            created_at=get_eat_time()
        )
        db.add(new_activity)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        return {"status": "error", "detail": str(e)}

@app.post("/api/v1/system/log-session")
def log_user_session(data: dict, db: Session = Depends(get_db)):
    fnum = data.get("fnum")
    if hasattr(models, 'Audit_Logs') and fnum:
        log_semantic_audit(
            db=db, fnum=fnum, action="OFFICER_AUTHENTICATION", 
            target_identifier="SYSTEM", changes={}, remarks="Secure session initiated via Dashboard Gateway"
        )
    return {"status": "success"}

# ====================================================================
# 5. RECIPIENTS, ESTABLISHMENTS JSON & CONSOLIDATED LEDGER
# ====================================================================
@app.get("/api/v1/users/recipients-list")
@app.get("/api/v1/communications/recipients-list")
def get_recipients_list(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        users = db.query(models.Users).filter(
            models.Users.role != 'REVOKED',
            models.Users.is_approved == True
        ).all()
        return [
            {
                "fnum": u.fnum,
                "name": u.name,
                "rank": u.rank,
                "region": u.region,
                "station": u.station,
                "position": u.position,
                "role": u.role
            } for u in users
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch recipients: {str(e)}")

@app.get("/api/v1/hr/export-ledger")
def export_hr_ledger_alias(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Alias route to catch the HR export request and pass it to the master export workflow."""
    return export_master_database(db=db, current_user=current_user)

@app.get("/api/v1/reports/establishments-json")
def get_establishments_json(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        est_model = getattr(models, 'Establishments', getattr(models, 'establishments', None))
        nom_model = getattr(models, 'Nominal_Roll', getattr(models, 'NominalRoll', None))
        
        est = db.query(est_model).all() if est_model else []
        nom = db.query(nom_model).all() if nom_model else []
        
        return {
            "establishments": [serialize_model_row(e) for e in est],
            "nominal_rolls": [serialize_model_row(n) for n in nom]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compile HR Ledger: {str(e)}")

@app.get("/api/v1/reports/consolidated-ledger")
def get_consolidated_ledger(
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None, 
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    try:
        # Dynamic model resolution for both camelCase and snake_case models
        CrimeModel = getattr(models, 'Crime_Reports', getattr(models, 'CrimeReports', None))
        StatsModel = getattr(models, 'Operational_Statistics', getattr(models, 'OperationalStatistics', None))
        StoryModel = getattr(models, 'Success_Stories', getattr(models, 'SuccessStories', None))
        EstModel = getattr(models, 'Establishments', getattr(models, 'establishments', None))
        NomModel = getattr(models, 'Nominal_Roll', getattr(models, 'NominalRoll', None))

        crimes = db.query(CrimeModel).all() if CrimeModel else []
        stats = db.query(StatsModel).all() if StatsModel else []
        stories = db.query(StoryModel).all() if StoryModel else []
        establishments = db.query(EstModel).all() if EstModel else []
        nominal_roll = db.query(NomModel).all() if NomModel else []
        
        return {
            "status": "success",
            "crimes": [serialize_model_row(c) for c in crimes],
            "statistics": [serialize_model_row(s) for s in stats],
            "stories": [serialize_model_row(st) for st in stories],
            "establishments": [serialize_model_row(e) for e in establishments],
            "nominal_rolls": [serialize_model_row(n) for n in nominal_roll]
        }
    except Exception as e:
        print(f"Consolidated Ledger DB Query Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch consolidated data: {str(e)}")


# ====================================================================
# FULLY DYNAMIC INTELLIGENCE & EVENT-DRIVEN SCHEDULER
# ====================================================================
from datetime import datetime, timedelta
import pytz
from sqlalchemy import text

def run_weekly_tactical_briefing_job():
    eat_tz = pytz.timezone('Africa/Nairobi')
    now_eat = datetime.now(eat_tz).replace(tzinfo=None)
    one_week_ago = now_eat - timedelta(days=7)
    
    print(f"[{now_eat}] Starting Dynamic Weekly Intelligence Briefing Compilation...")
    
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        active_users = db.query(models.Users).filter(
            models.Users.is_approved == True,
            models.Users.email != None,
            models.Users.email != ""
        ).all()
        
        for user in active_users:
            station = user.station
            region = user.region
            
            is_global = user.role in ['SUPER_ADMIN', 'ADMIN', 'RPC'] or str(region).upper() in ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS']
            
            # Scoped SQL filters
            crime_filter = "" if is_global else f" AND station = '{station}'"
            stats_filter = "" if is_global else f" AND station = '{station}'"
            comms_filter = f" WHERE (target_station = '{station}' OR target_region = '{region}' OR target_audience = 'ALL_USERS')"
            
            # 1. Pull Real Weekly Crime Entries & Specific Offenses
            crimes = db.execute(text(f"SELECT offence, narrative, status FROM reports WHERE created_at >= :start {crime_filter}"), {"start": one_week_ago}).fetchall()
            
            # 2. Pull Real Operational Statistics & Arrest Totals
            ops_stats = db.execute(text(f"SELECT arrests, given_bond, cautioned, remanded, convicted FROM stats WHERE date >= :start {stats_filter}"), {"start": one_week_ago.date()}).fetchall()
            
            # 3. Pull Unread / Active Command Messages & Directives
            unread_comms = db.execute(text(f"SELECT title, sender_fnum FROM command_communications {comms_filter} ORDER BY id DESC LIMIT 5")).fetchall()
            
            # --- DYNAMIC EVENT ANALYSIS ---
            total_crimes = len(crimes)
            total_arrests = sum(row.arrests or 0 for row in ops_stats)
            total_remanded = sum(row.remanded or 0 for row in ops_stats)
            
            # Extract specific keyword triggers from real crime narratives/offences
            all_text = " ".join([f"{r.offence} {r.narrative}" for r in crimes]).upper()
            has_robbery = "ROBBERY" in all_text or "GUN" in all_text
            has_fire = "FIRE" in all_text or "ARSON" in all_text
            has_accident = "ACCIDENT" in all_text or "FATAL" in all_text
            has_murder = "MURDER" in all_text or "HOMICIDE" in all_text
            
            # Build Custom Action Items Based on Actual Weekly Events
            custom_actions = []
            
            if has_murder or has_robbery:
                custom_actions.append("🔴 <b>High-Priority Security Spike:</b> Violent crime indicators (Robbery/Homicide) identified in weekly entries. Immediate deployment of intelligence-led snap operations and heightened checkpoint patrols is directed.")
            if has_fire:
                custom_actions.append("🔥 <b>Public Safety Alert:</b> Fire or arson events logged. Ensure coordination with the Fire Directorate for forensic site reviews and public sensitization.")
            if has_accident:
                custom_actions.append("🚗 <b>Traffic Hazard Notice:</b> Traffic incidents/fatalities registered. Increase highway visibility and targeted motorist compliance checks.")
            if total_arrests > 0:
                custom_actions.append(f"⚖️ <b>Case Management:</b> {total_arrests} total arrests logged this week. Ensure expeditious file sanctioning with State Attorneys and timely court production.")
            
            if not custom_actions:
                custom_actions.append("✅ Operations stable for the period. Maintain regular community policing and perimeter defense protocols.")
                
            # Unread messages reminder
            comms_alert = ""
            if unread_comms:
                comms_list_html = "".join([f"<li><b>{c.title}</b></li>" for c in unread_comms])
                comms_alert = f"""
                <h4 style="color: #dc2626;">📬 Pending Command Communications / Directives:</h4>
                <p>You have active command updates requiring attention:</p>
                <ul>{comms_list_html}</ul>
                """

            # 4. Synthesize Custom HTML Briefing
            html_content = f"""
            <div style="font-family: Arial, sans-serif; max-width: 650px; margin: auto; border: 1px solid #e2d6c3; padding: 25px; background-color: #fbf8f3;">
                <h2 style="color: #002060; text-align: center; border-bottom: 2px solid #002060; padding-bottom: 10px;">UGANDA POLICE FORCE</h2>
                <h3 style="color: #596E47; text-align: center;">KMP Automated Tactical Intelligence & Event Brief</h3>
                
            # 5. Pull Newly Uploaded Documents / Templates from the Past Week
            doc_query = text("""
                SELECT file_name, doc_type, uploaded_by 
                FROM document_archive 
                WHERE upload_date >= :start 
                ORDER BY id DESC LIMIT 5
            """)
            recent_docs = db.execute(doc_query, {"start": one_week_ago}).fetchall()
            
            docs_alert = ""
            if recent_docs:
                doc_list_html = "".join([f"<li><b>{d.file_name}</b> ({d.doc_type or 'General Doc'}) - Uploaded by {d.uploaded_by}</li>" for d in recent_docs])
                docs_alert = f"""
                <h4 style="color: #596E47; margin-top: 20px;">📂 New Operational Documents & Templates Published:</h4>
                <p>New files added to the secure archive this week:</p>
                <ul style="margin: 0; padding-left: 15px;">{doc_list_html}</ul>
                """

                <p><b>Officer:</b> {user.rank} {user.name} ({user.fnum})</p>
                <p><b>Station / Command:</b> {station} / {region}</p>
                <p><b>Briefing Period:</b> {one_week_ago.strftime('%Y-%m-%d')} to {now_eat.strftime('%Y-%m-%d')}</p>
                
                <hr style="border: 0; border-top: 1px solid #e2d6c3; margin: 15px 0;">
                
                <h4 style="color: #3a3225;">📊 Weekly Database Activity Overview:</h4>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 15px;">
                    <tr style="background-color: #efece6;">
                        <td style="padding: 8px; border: 1px solid #d3c2a8;"><b>Registered Incidents</b></td>
                        <td style="padding: 8px; border: 1px solid #d3c2a8; text-align: center;">{total_crimes}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #d3c2a8;"><b>Disruptive Arrests</b></td>
                        <td style="padding: 8px; border: 1px solid #d3c2a8; text-align: center;">{total_arrests}</td>
                    </tr>
                    <tr style="background-color: #efece6;">
                        <td style="padding: 8px; border: 1px solid #d3c2a8;"><b>Suspects Remanded / Court</b></td>
                        <td style="padding: 8px; border: 1px solid #d3c2a8; text-align: center;">{total_remanded}</td>
                    </tr>
                </table>

                {comms_alert}
                
                <h4 style="color: #3a3225;">🎯 Custom Tactical Actions Recommended for You:</h4>
                <div style="background-color: #e9eedf; border-left: 4px solid #596E47; padding: 12px; margin-bottom: 15px;">
                    <ul style="margin: 0; padding-left: 15px;">
                        {"".join([f"<li style='margin-bottom: 6px;'>{act}</li>" for act in custom_actions])}
                    </ul>
                </div>
                
                <p style="font-size: 11px; color: #736450; text-align: center; margin-top: 30px;">
                    Generated automatically by the KMP Centralised Security Data Management System intelligence engine.
                </p>
            </div>
            """
            
            # Uncomment when ready to dispatch live via FastMail
            # message = MessageSchema(
            #     subject=f"KMP Custom Tactical Briefing - {station} ({now_eat.strftime('%b %d')})",
            #     recipients=[user.email],
            #     body=html_content,
            #     subtype="html"
            # )
            # _fm = FastMail(conf)
            # await _fm.send_message(message)
            
            print(f"-> Compiled custom event-driven briefing for {user.fnum} at {station}")

    except Exception as e:
        print(f"Dynamic scheduler error: {e}")
    finally:
        db.close()

# Initialize Scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(run_weekly_tactical_briefing_job, 'cron', day_of_week='mon', hour=6, minute=0)

@app.on_event("startup")
def start_scheduler():
    if not scheduler.running:
        scheduler.start()
        print("Dynamic Intelligence Background Scheduler started successfully.")

@app.on_event("shutdown")
def shutdown_scheduler():
    scheduler.shutdown()

# ====================================================================
# 6. MASTER DATABASE & HR EXPORTS (SINGLE MASTER WORKBOOK WITH DUAL SHEETS)
# ====================================================================
@app.get("/api/v1/reports/export")
def export_master_database(
    timeframe: str = "all", 
    scope: Optional[str] = None, 
    value: Optional[str] = None, 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(require_export_privilege)
):
    try:
        is_global = current_user.role in ['SUPER_ADMIN', 'ADMIN', 'RPC'] or str(current_user.region).upper() in ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS']
        
        def get_where(table_prefix=""):
            return "" if is_global else f" WHERE {table_prefix}region = '{current_user.region}'"

        def fetch_data(query):
            try:
                return db.execute(text(query)).fetchall()
            except Exception as e:
                print(f"Export fetch warning: {e}")
                return []

        # Fetch data across all domains including Tripartite Reports and AI Command logs
        cr_records = fetch_data(f"SELECT sd_ref, region, station, date, time, offence, status, suspects, last_updated_by FROM reports{get_where()}")
        ops_records = fetch_data(f"SELECT date, region, station, arrests, given_bond, cautioned, pending_court, taken_to_court, released, remanded, convicted FROM stats{get_where()}")
        ss_records = fetch_data(f"SELECT date, time, region, station, status, narrative FROM stories{get_where()}")
        nr_records = fetch_data(f"SELECT fnum, name, rank, sex, region, station, position, status FROM nominal_roll{get_where()}")
        est_records = fetch_data(f"SELECT region, division, station, personnel_in_station, sub_station, personnel_in_sub_station, post, personnel_in_post, booths, personnel_in_booth FROM establishments{get_where()}")
        docs_records = fetch_data(f"SELECT file_name, doc_type, file_size, region, station, uploaded_by, upload_date FROM document_archive{get_where()}")
        ai_records = fetch_data(f"SELECT event_type, details, user_fnum, created_at FROM audit_logs WHERE event_type LIKE '%AI%'")

        # Build Single Master Workbook with Dual Sheets (General + Print)
        wb = openpyxl.Workbook()
        wb.remove(wb.active) # Remove default sheet
        
        header_fill = PatternFill(start_color="002060", end_color="002060", fill_type="solid") # Dark Blue
        header_font = Font(color="FFFFFF", bold=True)
        header_align = Alignment(horizontal="center", vertical="center")

        def add_domain_sheets(title, headers, data):
            # Sheet 1: General Master Sheet
            ws_gen = wb.create_sheet(title=title)
            ws_gen.append(["SN"] + headers)
            for cell in ws_gen[1]:
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = header_align
            for idx, row in enumerate(data, 1):
                ws_gen.append([idx] + list(row))
            
            for col in ws_gen.columns:
                max_len = max((len(str(cell.value or '')) for cell in col), default=0)
                col_letter = col[0].column_letter
                ws_gen.column_dimensions[col_letter].width = min(max_len + 3, 50)

            # Sheet 2: Print-Optimized Sheet
            ws_print = wb.create_sheet(title=f"{title} (Print)")
            ws_print.append(["SN"] + headers)
            for cell in ws_print[1]:
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = header_align
            for idx, row in enumerate(data, 1):
                ws_print.append([idx] + list(row))
            
            ws_print.page_setup.orientation = ws_print.ORIENTATION_LANDSCAPE
            ws_print.page_setup.paperSize = ws_print.PAPERSIZE_A4
            ws_print.sheet_properties.pageSetUpPr.fitToPage = True
            ws_print.page_setup.fitToWidth = 1
            ws_print.page_setup.fitToHeight = 0

            for col in ws_print.columns:
                max_len = max((len(str(cell.value or '')) for cell in col), default=0)
                col_letter = col[0].column_letter
                ws_print.column_dimensions[col_letter].width = min(max_len + 2, 40)

        # Append all domains into the single file
        add_domain_sheets("Crime Registry", ["SD Ref", "Region", "Station", "Date", "Time", "Offence", "Status", "Suspects", "Logged By"], cr_records)
        add_domain_sheets("OPS Statistics", ["Date", "Region", "Station", "Arrested", "Given Bond", "Cautioned", "Pending Court", "Taken To Court", "Released", "Remanded", "Convicted"], ops_records)
        add_domain_sheets("Success Stories", ["Date", "Time", "Region", "Station", "Status", "Narrative"], ss_records)
        add_domain_sheets("Nominal Roll", ["Force Number", "Name", "Rank", "Sex", "Region", "Station", "Position", "Status"], nr_records)
        add_domain_sheets("Establishments", ["Region", "Division", "Station", "Pers(Stn)", "Sub-Station", "Pers(Sub)", "Post", "Pers(Post)", "Booths", "Pers(Booth)"], est_records)
        add_domain_sheets("Tripartite Reports", ["File Name", "Doc Type", "Size", "Region", "Station", "Uploaded By", "Upload Date"], docs_records)
        add_domain_sheets("AI Command", ["Interaction Type", "Prompt / Details", "Officer FNUM", "Timestamp"], ai_records)

        # Apply Forensic Metadata Watermark
        eat_tz = pytz.timezone("Africa/Nairobi")
        eat_time = datetime.now(eat_tz).replace(tzinfo=None)
        
        officer_fnum = (current_user.fnum or "HQ-UNKNOWN").strip().upper()
        officer_rank = (current_user.rank or "OFFICER").strip().upper()
        officer_name = (current_user.name or "UNKNOWN").strip().upper()
        officer_signature = f"{officer_fnum} {officer_rank} {officer_name}"
        command_post = f"{current_user.station or 'KMP HEADQUARTERS'}, {current_user.region or 'KMP HEADQUARTERS'}"
        stamp_id = f"KMP-STAMP-{officer_fnum}-{eat_time.strftime('%Y%m%d%H%M%S')}"
        
        compact_payload = {"f": officer_fnum, "s": stamp_id}
        encoded_token = base64.b64encode(json.dumps(compact_payload).encode('utf-8')).decode('utf-8')
        
        wb.properties.creator = officer_signature
        wb.properties.lastModifiedBy = officer_signature
        wb.properties.keywords = f"KMP_AUDIT;{encoded_token}"
        wb.properties.description = f"Export: {officer_signature} [{command_post}]. ID: {stamp_id}"
        wb.properties.category = "RESTRICTED / FORENSIC POLICE RECORD"

        excel_stream = io.BytesIO()
        wb.save(excel_stream)
        excel_stream.seek(0)

        # Secure AES-256 Zip Encrypted using the REQUESTING USER'S actual Force Number
        zip_stream = io.BytesIO()
        zip_password = str(current_user.fnum).strip().encode('utf-8')

        with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(zip_password)
            excel_filename = f"{officer_fnum.replace('/', '_')}_Master_Database_{eat_time.strftime('%Y%m%d')}.xlsx"
            zf.writestr(excel_filename, excel_stream.getvalue())

        zip_stream.seek(0)

        zip_filename = f"SECURE_MASTER_DB_{eat_time.strftime('%Y%m%d')}.zip"
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
        print(f"Master export error: {e}")
        raise HTTPException(status_code=500, detail=f"Master export failed: {str(e)}")

@app.get("/api/v1/export/establishments")
def export_establishments_summary(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        est_model = getattr(models, 'Establishments', getattr(models, 'establishments', None))
        est = db.query(est_model).all() if est_model else []
        df_est = sanitize_df_for_excel(pd.DataFrame([serialize_model_row(e) for e in est]))
        
        output = io.BytesIO()
        df_est.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=HR_Establishments_Summary.xlsx"}
        )
    except Exception as e:
        print(f"HR export error: {e}")
        raise HTTPException(status_code=500, detail=f"HR export failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("api_backend:app", host="0.0.0.0", port=8000, reload=True)