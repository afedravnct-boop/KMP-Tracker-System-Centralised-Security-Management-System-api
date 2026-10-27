# api_backend.py
import io
import os
import gc
import re
import html
import uuid
import asyncio
import secrets  
import string   
import json
import base64
from datetime import datetime, timedelta
from typing import Optional, List, Union

import pytz
import uvicorn
import pyzipper
import pandas as pd
import numpy as np

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks, Request, Query
from fastapi.responses import StreamingResponse, FileResponse, RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm.attributes import flag_modified
from passlib.context import CryptContext
import openpyxl
from openpyxl.styles import Alignment, PatternFill, Font

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Internal Imports
from app import models, schemas, database
from app.database import engine, get_db, get_logs_db, SQLALCHEMY_DATABASE_URL
from app.core import security
from auth import router as auth_router, get_current_user
from routers.activity_logger import record_neon_activity, SystemActivityMiddleware
from routers.weekly_briefing import run_weekly_tactical_briefing_job

# ==========================================
# 0. LOAD ENVIRONMENT VARIABLES & CONFIG
# ==========================================
load_dotenv()

app = FastAPI(title="KMP Centralised Security Data Management System")

# Import all modular routers
from routers import (
    document_upload,
    general_documents,
    command_templates,
    agric_summary,
    nominal_roll,
    crime_registry,
    lockup_matrix,
    establishments,
    success_stories,
    admin_communication,
    ai_router,
    analytics_export,
    statistics,
    exhibits,
    hr_router,
    consolidated_ledger,
    admin_users
)

# ==========================================
# ROUTER INCLUSIONS
# ==========================================
app.include_router(document_upload.router)
app.include_router(general_documents.router)
app.include_router(command_templates.router)
app.include_router(agric_summary.router)
app.include_router(nominal_roll.router)
app.include_router(crime_registry.router)
app.include_router(lockup_matrix.router)
app.include_router(establishments.router)
app.include_router(success_stories.router)
app.include_router(analytics_export.router)
app.include_router(admin_communication.router)
app.include_router(ai_router.router)
app.include_router(auth_router)
app.include_router(exhibits.router)
app.include_router(hr_router.router)
app.include_router(consolidated_ledger.router)
app.include_router(statistics.router)
app.include_router(admin_users.router)

# ==========================================
# GLOBAL EXCEPTION HANDLER
# ==========================================
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    
    origin = request.headers.get("origin", "*")
    
    return JSONResponse(
        status_code=500,
        content={"detail": f"Backend System Crash: {str(exc)}"},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

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
# REGIONAL HIERARCHY & DUAL-EQUIVALENCE
# ==========================================
REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

def format_crime_category(cat: str) -> str:
    """🟢 Normalizes raw database category phrases into clean English titles."""
    if not cat:
        return "GENERAL INCIDENT"
    c = str(cat).strip().upper()
    mapping = {
        "DEATH SUDDEN": "Sudden Death",
        "DEATH_SUDDEN": "Sudden Death",
        "FIREOUTBREAK": "Fire Outbreak",
        "FIRE OUTBREAK": "Fire Outbreak",
        "BY DEATH DROWNING": "Death by Drowning",
        "DEATH DROWNING": "Death by Drowning",
        "AGGRAVATED ROBBERY": "Aggravated Robbery",
        "MURDER SUSPECTED": "Suspected Murder",
        "ATTEMPTED MURDER": "Attempted Murder",
        "DEFILEMENT / RAPE": "Defilement / Rape"
    }
    return mapping.get(c, c.replace("_", " ").title())

def is_station_equivalent(stat_a: Optional[str], stat_b: Optional[str]) -> bool:
    a = (stat_a or "").strip().upper()
    b = (stat_b or "").strip().upper()
    if not a or not b:
        return False
    if a == b:
        return True
    clean_a = re.sub(r'(\s+HEADQUARTERS|\s+HQ)$', '', a)
    clean_b = re.sub(r'(\s+HEADQUARTERS|\s+HQ)$', '', b)
    return clean_a == clean_b and len(clean_a) > 0

def apply_opsec_scope(current_user, query, ModelClass):
    if not ModelClass or not current_user:
        return query.filter(text("1=0"))
    
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    user_pos = str(current_user.position).strip().upper() if current_user.position else ""
    user_reg = str(current_user.region).strip().upper() if current_user.region else ""
    user_stn = str(current_user.station).strip().upper() if current_user.station else ""

    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}

    is_absolute_global = (
        user_role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN", "RPC", "DEPUTY COMMANDER"] or
        "KMP COMMANDER" in user_pos or
        "DEPUTY KMP COMMANDER" in user_pos or
        "KMP ADMIN" in user_pos or
        perms.get("view_global_roster") is True or
        perms.get("global_observer") is True
    )

    is_kmp_sys_mgr = (
        user_role == "SYSTEM_MANAGER" and
        user_reg in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"] and
        "KMP" in user_pos
    )

    is_regional_command = (
        user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN", "DIVISION_ADMIN", "STATION_ADMIN"] or
        "HR" in user_pos
    )

    if is_absolute_global or is_kmp_sys_mgr:
        return query
        
    elif is_regional_command or user_reg in REGIONAL_HIERARCHY:
        conds = []
        if hasattr(ModelClass, 'region'):
            conds.append(func.upper(ModelClass.region) == user_reg)
        
        if hasattr(ModelClass, 'station') and user_reg in REGIONAL_HIERARCHY:
            expanded_stns = set()
            for s in REGIONAL_HIERARCHY[user_reg]:
                expanded_stns.add(s)
                expanded_stns.add(s.replace(' HEADQUARTERS', '').replace(' HQ', ''))
                expanded_stns.add(s + ' HEADQUARTERS')
                expanded_stns.add(s + ' HQ')
            
            conds.append(func.upper(ModelClass.station).in_(list(expanded_stns)))
            
        if conds:
            return query.filter(or_(*conds))
        return query.filter(text("1=0"))
        
    elif hasattr(ModelClass, 'station'):
        if perms.get("acc_documents") is True or perms.get("global_observer") is True:
            return query
        return query.filter(func.upper(ModelClass.station) == user_stn)
        
    return query.filter(text("1=0"))

# ==========================================
# UNIVERSAL EXPORT HELPERS
# ==========================================
def clean_html_for_export(raw_text):
    if not raw_text or not isinstance(raw_text, str):
        return raw_text
    text = html.unescape(raw_text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def serialize_model_row(row):
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
        elif hasattr(v, '__float__') and not isinstance(v, (int, float, str, bool)):
            d[k] = float(v)
        elif k in ['category', 'offence', 'type'] and isinstance(v, str):
            d[k] = format_crime_category(v)
    return d

def get_model_safe(*model_names):
    for name in model_names:
        if hasattr(models, name):
            return getattr(models, name)
    return None

def get_eat_time():
    eat_tz = pytz.timezone('Africa/Nairobi')
    return datetime.now(eat_tz).strftime('%Y-%m-%d %H:%M:%S')

def log_independent_activity(logs_db: Session, fnum: str, action: str, module: str, details: str):
    try:
        new_activity = models.Activity_Logs(
            fnum=str(fnum or "SYSTEM").strip().upper(),
            action=str(action or "ACTION").strip().upper(),
            module=str(module or "GENERAL").strip().upper(),
            details=details,
            created_at=get_eat_time()
        )
        logs_db.add(new_activity)
        logs_db.commit()
    except Exception as e:
        logs_db.rollback()
        print(f"⚠️ Neon Activity Log Failure [{action}]: {str(e)}")

def require_admin_or_observer(current_user: models.Users = Depends(get_current_user)):
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    if "ADMIN" in user_role or "RPC" in user_role:
        return current_user
        
    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}
            
    if perms.get("global_observer") is True or perms.get("view_global_roster") is True:
        return current_user
        
    raise HTTPException(status_code=403, detail="Clearance Denied: Admin or Global Observer privileges required.")

def require_export_privilege(current_user: models.Users = Depends(get_current_user)):
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}
        
    if (
        user_role not in ["ADMIN", "SUPER_ADMIN", "RPC"] and 
        not perms.get("export_data", False) and 
        not perms.get("global_observer", False) and
        not perms.get("view_global_roster", False)
    ):
        raise HTTPException(status_code=403, detail="Clearance Denied: Data Export Privileges Required.")
    return current_user

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

app.add_middleware(SystemActivityMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173",
        "https://kmp-tracker-system-centralised-secu.vercel.app",
        "https://kmp-tracker-system-centralised-security-management-adj4h23x4.vercel.app",
        "https://kmp-tracker-system-centralised-security-management-od0odfzxy.vercel.app",
        "https://kmp-tracker-system-centr-aip-afedra-vincent-uganda-police-force.vercel.app"
    ],
    allow_origin_regex=r"https://kmp-tracker.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)


# ==========================================
# 3. CORE SYSTEM ENDPOINTS (Users, Heartbeat, Audit Logs)
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

@app.get("/api/v1/audit-logs")
def get_audit_logs(
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(require_admin_or_observer)
):
    log_independent_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action="VIEW_AUDIT_LOGS",
        module="AUDIT_LOGS",
        details=f"Officer {current_user.name} ({current_user.fnum}) accessed the secure System Audit Logs tab."
    )
    try:
        # 1. Point to the NeonDB Activity_Logs model
        ActivityModel = getattr(models, 'Activity_Logs', getattr(models, 'ActivityLogs', None))
        if not ActivityModel:
            return []
            
        # 2. Define the exact "package" of modules this tab should fetch
        admin_auth_modules = [
            "USER_AUTHENTICATION", 
            "SESSION", 
            "SESSION_TELEMETRY",
            "USER_ACCOUNTS", 
            "PASSWORD_RESETS", 
            "SECURITY_VAULT", 
            "ACCESS_MATRIX"
        ]
        
        # 3. Query logs_db and filter out general system activity
        logs = logs_db.query(ActivityModel).filter(
            ActivityModel.module.in_(admin_auth_modules)
        ).order_by(ActivityModel.id.desc()).limit(100).all()
        
        # 4. Map the NeonDB columns perfectly to your React frontend UI expectations
        return [
            {
                "id": log.id,
                "event_type": getattr(log, 'action', 'ACTION'),
                "target_user": getattr(log, 'module', ''),
                "status": "SUCCESS",
                "details": getattr(log, 'details', ''),
                "user_fnum": getattr(log, 'fnum', ''),
                "user_name": "", 
                "created_at": str(getattr(log, 'created_at', ''))
            } for log in logs
        ]
    except Exception as e:
        print(f"Audit log fetch error: {e}")
        return []

@app.get("/api/v1/audit-logs/export")
def export_audit_logs_excel(
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(require_export_privilege)
):
    try:
        log_independent_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action="AUDIT_LOGS_EXPORT",
            module="EXCEL_EXPORTS",
            details=f"Officer {current_user.name} ({current_user.fnum}) downloaded the encrypted audit logs vault archive."
        )

        AuditModel = getattr(models, 'Audit_Logs', getattr(models, 'AuditLogs', None))
        logs = db.query(AuditModel).order_by(AuditModel.id.desc()).all()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Command Audit Logs"
        ws.append(["ID", "Event Type", "Target User", "Status", "Details", "Created At", "User FNUM", "User Name"])

        header_fill = PatternFill(start_color="002060", end_color="002060", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for log in logs:
            details_clean = clean_html_for_export(getattr(log, 'details', ''))
            
            raw_time = getattr(log, 'created_at', '')
            if hasattr(raw_time, 'strftime'):
                formatted_time = raw_time.strftime("%Y-%m-%d %H:%M:%S")
            else:
                formatted_time = str(raw_time).replace("+00:00", "").replace("T", " ")

            user_fnum = str(getattr(log, 'user_fnum', '') or getattr(log, 'fnum', '')).strip()
            user_name = str(getattr(log, 'user_name', '')).strip().upper()

            ws.append([
                getattr(log, 'id', ''), 
                getattr(log, 'event_type', ''), 
                getattr(log, 'target_user', ''), 
                getattr(log, 'status', ''), 
                details_clean, 
                formatted_time, 
                user_fnum or "SYSTEM",
                user_name or "N/A"
            ])

        for col in ws.columns:
            col_letter = col[0].column_letter
            max_len = max([len(str(cell.value or '')) for cell in col], default=0)
            if col[0].value == "Details":
                ws.column_dimensions[col_letter].width = 50
                for cell in col:
                    if cell.row > 1:
                        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
            else:
                ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 35)
                for cell in col:
                    if cell.row > 1:
                        cell.alignment = Alignment(horizontal="center", vertical="center")

        excel_stream = io.BytesIO()
        wb.save(excel_stream)
        excel_stream.seek(0)
        
        zip_stream = io.BytesIO()
        eat_time = datetime.now(pytz.timezone("Africa/Nairobi")).replace(tzinfo=None)
        fnum_clean = str(current_user.fnum).replace('/', '_').upper()
        
        with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(str(current_user.fnum).strip().encode('utf-8'))
            zf.writestr(f"{fnum_clean}_Audit_Logs_{eat_time.strftime('%Y%m%d')}.xlsx", excel_stream.getvalue())

        zip_stream.seek(0)
        return StreamingResponse(
            zip_stream, media_type="application/zip",
            headers={'Content-Disposition': f'attachment; filename="SECURE_AUDIT_LOGS_{eat_time.strftime("%y%m%d")}.zip"', 'Access-Control-Expose-Headers': 'Content-Disposition'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export audit logs: {str(e)}")

# 🟢 NATIVE ALIAS: Catches the exact 404 URL for HR Transfers bridging directly to admin approvals
@app.get("/api/v1/requests")
def get_global_hr_requests_fallback(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    from routers.admin_users import get_admin_transfer_requests
    return get_admin_transfer_requests(db=db, logs_db=logs_db, current_user=current_user)


class HeartbeatPayload(BaseModel):
    fnum: Optional[str] = None

@app.post("/api/v1/users/heartbeat")
@app.post("/api/v1/users/heartbeat/")
def heartbeat(
    request: Request,
    payload: Optional[HeartbeatPayload] = None,
    db: Session = Depends(database.get_db)
):
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    if not token:
        token = request.cookies.get("access_token") or request.cookies.get("kmp_authToken")

    user = None
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

    if not user and payload and payload.fnum:
        user = db.query(models.Users).filter(
            func.trim(func.upper(models.Users.fnum)) == str(payload.fnum).strip().upper()
        ).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session credentials")

    try:
        eat_tz = pytz.timezone('Africa/Nairobi')
        user.last_active_at = datetime.now(eat_tz).replace(tzinfo=None)
        db.commit()
        
        expire = datetime.utcnow() + timedelta(minutes=60)
        new_token = jwt.encode(
            {"sub": str(user.fnum).strip().upper(), "exp": expire},
            security.SECRET_KEY, algorithm=security.ALGORITHM
        )
        return {"status": "alive", "user": user.fnum, "new_token": new_token}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/users/online")
def get_online_users(db: Session = Depends(database.get_db)):
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

# ====================================================================
# 6. FULLY DYNAMIC INTELLIGENCE & EVENT-DRIVEN SCHEDULER (Local Only)
# ====================================================================
eat_tz = pytz.timezone('Africa/Nairobi')
scheduler = BackgroundScheduler(timezone=eat_tz)

# Existing Tactical Briefing
scheduler.add_job(
    lambda: run_weekly_tactical_briefing_job(conf), 
    CronTrigger(day_of_week='mon', hour=6, minute=0, timezone=eat_tz),
    id='monday_tactical_briefing',
    replace_existing=True,
    misfire_grace_time=3600
)

def run_automated_compliance_sweep():
    print("⏰ Executing 11:00 AM Lockup Matrix Compliance Sweep...")
    db_gen = get_db()
    db = next(db_gen)
    
    # Create a mock BackgroundTasks instance to satisfy the router function signature
    class DummyBackgroundTasks(BackgroundTasks):
        def add_task(self, func, *args, **kwargs):
            try:
                func(*args, **kwargs)
            except Exception as e:
                print(f"Background task failed: {e}")
                
    dummy_tasks = DummyBackgroundTasks()
    
    try:
        from routers.lockup_matrix import execute_daily_compliance_sweep
        result = execute_daily_compliance_sweep(background_tasks=dummy_tasks, db=db)
        print(f"✅ Compliance Sweep Result: {result.get('message', result.get('action', 'Success'))}")
    except Exception as e:
        print(f"🚨 Scheduled Compliance Sweep Failed: {str(e)}")
    finally:
        db.close()

scheduler.add_job(
    run_automated_compliance_sweep,
    CronTrigger(hour=11, minute=0, timezone=eat_tz),
    id='daily_lockup_compliance_sweep',
    replace_existing=True,
    misfire_grace_time=3600
)

@app.on_event("startup")
def start_scheduler():
    if not scheduler.running:
        scheduler.start()
        print("✅ BackgroundScheduler started successfully in EAT timezone.")

@app.on_event("shutdown")
def shutdown_scheduler():
    if scheduler.running:
        scheduler.shutdown()

# ==========================================
# 🟢 MASTER DOWNLOAD (MULTI-SHEET EXPORT)
# ==========================================
@app.get("/api/v1/export-master")
@app.get("/api/v1/export-master-database")
@app.get("/api/v1/database/export")
def export_master_database(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(require_export_privilege)
):
    try:
        log_independent_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action="MASTER_DATABASE_EXPORT",
            module="EXCEL_EXPORTS",
            details=f"Officer {current_user.name} ({current_user.fnum}) downloaded the fully encrypted multi-sheet master database."
        )

        wb = openpyxl.Workbook()
        
        # 🟢 UPDATED HELPER: Now supports 'exclude_cols' for creating clean (Print) sheets
        def create_sheet(sheet_title, *model_names, is_first=False, exclude_cols=None):
            ModelClass = get_model_safe(*model_names)
            ws = wb.active if is_first else wb.create_sheet(title=sheet_title)
            if not is_first:
                ws.title = sheet_title
            
            if not ModelClass:
                ws.append(["Model not found in system architecture."])
                return

            query = apply_opsec_scope(current_user, db.query(ModelClass), ModelClass)
            records = query.order_by(ModelClass.id.desc()).all() if hasattr(ModelClass, 'id') else query.all()
            
            if not records:
                ws.append(["No Records Found in Your Authorized Jurisdiction."])
                return
            
            first_record = serialize_model_row(records[0])
            headers = list(first_record.keys())
            
            # Apply column exclusions for print-optimized sheets
            if exclude_cols:
                headers = [h for h in headers if h.lower() not in exclude_cols]
                
            ws.append([h.upper() for h in headers])

            header_fill = PatternFill(start_color="002060", end_color="002060", fill_type="solid")
            header_font = Font(color="FFFFFF", bold=True)
            for cell in ws[1]:
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal="center", vertical="center")

            for record in records:
                row_data = serialize_model_row(record)
                ws.append([clean_html_for_export(str(row_data.get(h, ''))) for h in headers])

            for col in ws.columns:
                col_letter = col[0].column_letter
                if col[0].value in ["NARRATIVE", "DETAILS", "REMARKS", "STORY", "CRIME_REPORT", "DESCRIPTION", "ACTION_TAKEN"]:
                    ws.column_dimensions[col_letter].width = 65
                    for cell in col:
                        if cell.row > 1:
                            cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
                else:
                    max_len = max([len(str(cell.value or '')) for cell in col], default=0)
                    ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 35)
                    for cell in col:
                        if cell.row > 1:
                            cell.alignment = Alignment(horizontal="center", vertical="center")

        # 🟢 GENERATE ALL TABS IN EXACT SCREENSHOT ORDER WITH PRINT VERSIONS
        create_sheet("Crime Registry (Print)", "Crime_Registry", "CrimeRegistry", is_first=True, exclude_cols=["id", "narrative", "daily_lock_up", "created_at"])
        create_sheet("Crime Registry", "Crime_Registry", "CrimeRegistry")
        
        create_sheet("Documents & Reports (Print)", "General_Documents", "GeneralDocuments", "Documents", exclude_cols=["id", "file_path"])
        create_sheet("Documents & Reports", "General_Documents", "GeneralDocuments", "Documents")

        # OPSEC: Only append AI Command Logs if the user is a Super Admin
        user_role = str(current_user.role).strip().upper() if current_user.role else ""
        if user_role == "SUPER_ADMIN":
            create_sheet("AI Command (Print)", "AI_Logs", "AILogs", "AICommandLogs", "AI_Command_Logs", exclude_cols=["id", "created_at", "updated_at"])
            create_sheet("AI Command", "AI_Logs", "AILogs", "AICommandLogs", "AI_Command_Logs")

        create_sheet("Success Stories", "Success_Stories", "SuccessStories")
        create_sheet("Nominal Roll", "Nominal_Roll", "NominalRoll")
        create_sheet("Archived Personnel", "Nominal_Roll_Archives", "NominalRollArchives", "Archived_Personnel")
        create_sheet("Impounded Exhibits", "Exhibits", "Impounded_Exhibits", "ImpoundedExhibits")
        
        # Save Excel to memory
        excel_stream = io.BytesIO()
        wb.save(excel_stream)
        excel_stream.seek(0)
        
        # Package in AES-256 Encrypted Zip
        zip_stream = io.BytesIO()
        eat_time = datetime.now(pytz.timezone("Africa/Nairobi")).replace(tzinfo=None)
        fnum_clean = str(current_user.fnum).replace('/', '_').upper()
        
        with pyzipper.AESZipFile(zip_stream, 'w', compression=pyzipper.ZIP_DEFLATED, encryption=pyzipper.WZ_AES) as zf:
            zf.setpassword(str(current_user.fnum).strip().encode('utf-8'))
            zf.writestr(f"{fnum_clean}_Master_Database_{eat_time.strftime('%Y%m%d')}.xlsx", excel_stream.getvalue())

        zip_stream.seek(0)
        return StreamingResponse(
            zip_stream, media_type="application/zip",
            headers={
                'Content-Disposition': f'attachment; filename="SECURE_MASTER_DATABASE_{eat_time.strftime("%y%m%d")}.zip"', 
                'Access-Control-Expose-Headers': 'Content-Disposition'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate master export: {str(e)}")

# ====================================================================
# 7. EXTERNAL CRON TRIGGERS (TO BYPASS RENDER SLEEP)
# ====================================================================
# Use these endpoints in cron-job.org to wake up the server and run your tasks natively.
CRON_SECRET = os.getenv("CRON_SECRET_KEY", "kmp-cron-secure-key-2026")

@app.get("/api/v1/cron/trigger-compliance")
@app.post("/api/v1/cron/trigger-compliance")
def external_trigger_compliance(background_tasks: BackgroundTasks, db: Session = Depends(get_db), key: str = Query(None)):
    if key != CRON_SECRET:
        raise HTTPException(status_code=403, detail="Unauthorized Cron Trigger")
    
    try:
        from routers.lockup_matrix import execute_daily_compliance_sweep
        # 🟢 FIX: Execute synchronously so the DB session stays open during the sweep.
        # It will queue the actual email dispatching into the 'background_tasks' object.
        result = execute_daily_compliance_sweep(background_tasks=background_tasks, db=db)
        
        return {"status": "success", "message": "Compliance sweep executed successfully.", "details": result}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Compliance sweep failed: {str(e)}")

@app.get("/api/v1/cron/trigger-briefing")
@app.post("/api/v1/cron/trigger-briefing")
def external_trigger_briefing(background_tasks: BackgroundTasks, key: str = Query(None)):
    if key != CRON_SECRET:
        raise HTTPException(status_code=403, detail="Unauthorized Cron Trigger")
    
    # 🟢 FIX: Execute synchronously to prevent background queue locking issues
    try:
        run_weekly_tactical_briefing_job(conf)
        return {"status": "success", "message": "Weekly tactical briefing generated and dispatched."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Briefing generation failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("api_backend:app", host="0.0.0.0", port=8000, reload=True)