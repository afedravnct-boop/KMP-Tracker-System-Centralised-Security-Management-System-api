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
import fitz

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
from ai_router import router as ai_router

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
    admin_users, 
    nominal_roll, 
    crime_registry, 
    lockup_matrix, 
    establishments, 
    success_stories, 
    admin_communication
)

app.include_router(admin_users.router)
app.include_router(nominal_roll.router)
app.include_router(crime_registry.router)
app.include_router(lockup_matrix.router)
app.include_router(establishments.router)
app.include_router(success_stories.router)
app.include_router(admin_communication.router)

app.include_router(auth_router, prefix="/api/auth")
app.include_router(ai_router)

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
# 3. SECURITY & DEPENDENCIES
# ==========================================
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_eat_time():
    eat_tz = pytz.timezone('Africa/Nairobi')
    return datetime.now(eat_tz).strftime('%Y-%m-%d %H:%M:%S')

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        fnum: str = payload.get("sub")
        if fnum is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    clean_fnum = fnum.strip().upper()
    user = db.query(models.Users).filter(
        func.trim(func.upper(models.Users.fnum)) == clean_fnum
    ).first()
    
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if user.role != "SUPER_ADMIN":
        config_check = db.query(models.SystemConfig).filter(
            models.SystemConfig.config_key == "peer_delegation_active"
        ).first()
        
        if config_check and str(config_check.config_value).strip().upper() == "FALSE":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Application Lockdown: System access is currently restricted by command configuration."
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
        
        new_audit = models.Audit_Logs(
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

if __name__ == "__main__":
    uvicorn.run("api_backend:app", host="0.0.0.0", port=8000, reload=True)