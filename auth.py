# auth.py
import os
import io
import re
import traceback
import asyncio
import boto3
from typing import Optional, List
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_

from fastapi import APIRouter, Depends, HTTPException, status, Form, UploadFile, File, Request, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema

from app.core import security
from app import database, models, schemas
from app.database import get_logs_db

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION")
)
BUCKET_NAME = os.getenv("AWS_BUCKET_NAME")

# Configure Mail (pulling from environment variables)
conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME", ""),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", ""),
    MAIL_FROM=os.getenv("MAIL_FROM", os.getenv("MAIL_USERNAME", "no-reply@upf.go.ug")),
    MAIL_PORT=int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False
)

async def send_auth_notification(email_to: List[str], subject: str, html_body: str):
    if not email_to or not conf.MAIL_USERNAME or not conf.MAIL_PASSWORD:
        return
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
        print(f"❌ Failed to dispatch auth notification email: {e}")

# ====================================================================
# HELPERS & VALIDATORS
# ====================================================================
def normalize_fnum(fnum_str: str) -> str:
    """Normalizes both Officer File Numbers (e.g. A/2408) and NCO Force Numbers (e.g. 63034)."""
    if not fnum_str:
        return ""
    return str(fnum_str).strip().upper()

def validate_and_normalize_nin(nin_str: Optional[str]) -> Optional[str]:
    """Validates that NIN starts with CM or CF and consists of exactly 14 characters."""
    if not nin_str or str(nin_str).strip().lower() in ['nan', 'none', 'null', '', 'n/a']:
        return None
    
    clean_nin = str(nin_str).strip().upper()
    
    if len(clean_nin) != 14:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid NIN: Must be exactly 14 characters long. You entered {len(clean_nin)} characters."
        )
        
    if not re.match(r"^C[MF][A-Z0-9]{12}$", clean_nin):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid NIN format: Must start with CM or CF."
        )
    return clean_nin

def validate_and_normalize_phone(phone_str: Optional[str]) -> Optional[str]:
    """Validates that the phone number contains exactly 10 digits."""
    if not phone_str or str(phone_str).strip().lower() in ['nan', 'none', 'null', '', 'n/a']:
        return None
        
    clean_phone = re.sub(r'\D', '', str(phone_str))
    
    if len(clean_phone) != 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid Phone Number: Must be exactly 10 digits. You entered {len(clean_phone)} digits."
        )
    return clean_phone

def get_eat_time():
    import pytz
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

# ====================================================================
# AUTHENTICATION DEPENDENCY
# ====================================================================
def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme), 
    db: Session = Depends(database.get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        fnum: str = payload.get("sub")
        if fnum is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    clean_fnum = normalize_fnum(fnum)
    alt_fnum = clean_fnum.replace("/", "")
    
    user = db.query(models.Users).filter(
        or_(
            func.trim(func.upper(models.Users.fnum)) == clean_fnum,
            func.trim(func.upper(models.Users.fnum)) == alt_fnum
        )
    ).first()

    if user is None:
        raise credentials_exception
    return user

# ====================================================================
# ROLE & CLEARANCE PERMISSION DEPENDENCIES
# ====================================================================
def require_admin(current_user: models.Users = Depends(get_current_user)):
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    if "ADMIN" not in user_role and "RPC" not in user_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: Administrator clearance required."
        )
    return current_user

def require_export_privilege(current_user: models.Users = Depends(get_current_user)):
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    perms = current_user.permissions or {}
    
    if (
        user_role not in ["ADMIN", "SUPER_ADMIN", "RPC"] 
        and not perms.get("export_data", False)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Clearance Denied: Forensic Data Export privileges required."
        )
    return current_user

# ====================================================================
# 1. LOGIN ENDPOINT
# ====================================================================
@router.post("/login")
@router.post("/api/auth/login")
@router.post("/api/v1/auth/login")
async def login(
    request: Request,
    db: Session = Depends(database.get_db),
    logs_db: Session = Depends(get_logs_db)
):
    username = None
    password = None

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
        username = body.get("username") or body.get("fnum")
        password = body.get("password")
    else:
        form_data = await request.form()
        username = form_data.get("username") or form_data.get("fnum")
        password = form_data.get("password")

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Force Number and Password are required."
        )

    clean_username = normalize_fnum(username)
    alt_username = clean_username.replace("/", "")
    
    user = db.query(models.Users).filter(
        or_(
            func.trim(func.upper(models.Users.fnum)) == clean_username,
            func.trim(func.upper(models.Users.fnum)) == alt_username
        )
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Force Number or password"
        )

    if str(user.role).strip().upper() == "REVOKED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ACCESS DENIED: Your system access credentials have been revoked by Command. Please contact your Regional Administrator."
        )

    if not user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account pending Command approval. Please contact the administrator."
        )

    if not security.verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Force Number or password"
        )

    log_independent_activity(
        logs_db=logs_db,
        fnum=user.fnum,
        action="USER_AUTHENTICATION",
        module="USER_AUTHENTICATION",
        details=f"Officer {user.fnum} successfully authenticated into session."
    )

    access_token = security.create_access_token(
        data={"sub": user.fnum},
        expires_delta=timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "fnum": user.fnum,
        "rank": user.rank or "PC",
        "role": user.role or "USER",
        "name": user.name or "OFFICER",
        "sex": user.sex or "MALE",
        "ipps": user.ipps or "",
        "nin": getattr(user, "nin", "") or "",
        "region": user.region or "KMP HEADQUARTERS",
        "division": user.division or user.station or "HQ",
        "station": user.station or "HQ",
        "position": user.position or "GENERAL DUTIES",
        "email": user.email or "",
        "phone": user.phone or "",
        "permissions": user.permissions or {},
        "profile_photo_path": getattr(user, 'profile_photo_path', '') or '',
        "policy_accepted": getattr(user, 'policy_accepted', True)
    }

# ====================================================================
# 2. SIGNUP ENDPOINT (WITH HIERARCHICAL APPROVER NOTIFICATIONS)
# ====================================================================
@router.post("/signup", status_code=status.HTTP_201_CREATED)
@router.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
@router.post("/api/v1/auth/signup", status_code=status.HTTP_201_CREATED)
async def signup(
    background_tasks: BackgroundTasks,
    fnum: str = Form(...),
    ipps: str = Form(...),
    nin: Optional[str] = Form(None),
    name: str = Form(...),
    rank: str = Form(...),
    sex: str = Form("MALE"),
    region: str = Form(...),
    station: str = Form(...),
    position: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    password: str = Form(...),
    role: str = Form("USER"),
    division: Optional[str] = Form(None),
    profile_photo_path: Optional[str] = Form(None),
    policy_accepted: bool = Form(False),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(database.get_db),
    logs_db: Session = Depends(get_logs_db)
):
    if not policy_accepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error: You must accept the Terms, Information Security Policy & User Guide to register."
        )

    if len(password) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password exceeds maximum allowed length."
        )

    clean_fnum = normalize_fnum(fnum)
    clean_nin = validate_and_normalize_nin(nin)
    clean_phone = validate_and_normalize_phone(phone)
    clean_ipps = str(ipps).strip() if ipps else None
    clean_region = str(region).strip().upper()
    clean_station = str(station).strip().upper()
    clean_role = str(role).strip().upper()
    clean_position = str(position).strip().upper()

    duplicate_filters = [
        func.trim(func.upper(models.Users.fnum)) == clean_fnum
    ]
    if clean_ipps:
        duplicate_filters.append(func.trim(models.Users.ipps) == clean_ipps)
    if clean_nin:
        duplicate_filters.append(func.trim(func.upper(models.Users.nin)) == clean_nin)

    existing_user = db.query(models.Users).filter(or_(*duplicate_filters)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration Error: Force/File Number, IPPS, or NIN is already registered."
        )

    uploaded_photo_url = profile_photo_path
    if file and BUCKET_NAME:
        try:
            file_bytes = await file.read()
            ext = file.filename.split('.')[-1].lower() if '.' in file.filename else 'jpg'
            s3_key = f"user_profiles/{clean_fnum.replace('/', '_')}_{int(datetime.utcnow().timestamp())}.{ext}"
            s3_client.put_object(
                Bucket=BUCKET_NAME,
                Key=s3_key,
                Body=file_bytes,
                ContentType=file.content_type or 'image/jpeg'
            )
            uploaded_photo_url = f"https://{BUCKET_NAME}.s3.{os.getenv('AWS_REGION', 'eu-central-1')}.amazonaws.com/{s3_key}"
        except Exception as upload_err:
            print(f"S3 Direct Upload fallback notice: {upload_err}")

    hashed_password = security.get_password_hash(password)

    new_user = models.Users(
        fnum=clean_fnum, 
        ipps=clean_ipps,
        nin=clean_nin,
        name=str(name).strip().upper(),
        rank=str(rank).strip().upper(),
        sex=str(sex).strip().upper(),
        region=clean_region,
        division=str(division or station).strip().upper(),
        station=clean_station,
        position=clean_position if clean_position else "GENERAL DUTIES",
        email=str(email).strip() if email else None,
        phone=clean_phone,
        role=clean_role if clean_role else "USER",
        hashed_password=hashed_password,
        profile_photo_path=uploaded_photo_url or "",
        is_approved=False,
        permissions={},
        comments=None,
        policy_accepted=True,
        policy_accepted_at=datetime.utcnow()
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        log_independent_activity(
            logs_db=logs_db,
            fnum=clean_fnum,
            action="USER_REGISTRATION",
            module="USER_ACCOUNTS",
            details=f"New officer account registered: {name} ({rank}) for station {clean_station}."
        )

        # 🟢 HIERARCHICAL APPROVER NOTIFICATION:
        # 1. Super Admins & Assistant Super Admins receive GLOBALLY.
        # 2. Regional Commanders / Division Admins / Station Admins receive STRICTLY for their matching jurisdiction.
        approvers = db.query(models.Users).filter(
            models.Users.is_approved == True,
            models.Users.email.isnot(None),
            or_(
                # Global top tier commanders
                func.upper(models.Users.role).in_(["SUPER_ADMIN", "ASSISTANT_SUPER_ADMIN"]),
                # Regional commanders/admins matching the region
                and_(
                    func.upper(models.Users.region) == clean_region,
                    func.upper(models.Users.role).in_(["RPC", "SYSTEM_MANAGER", "REGIONAL_ADMIN", "DIVISION_ADMIN"])
                ),
                # Station administrators matching the exact station
                and_(
                    func.upper(models.Users.station) == clean_station,
                    func.upper(models.Users.role) == "STATION_ADMIN"
                )
            )
        ).all()

        approver_emails = [appr.email for appr in approvers if appr.email and "@" in appr.email]
        if approver_emails:
            subject = f"Pending User Approval Request: {rank} {name}".strip()
            html_body = f"""
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #b91c1c; margin-top: 0;">New User Account Awaiting Approval</h2>
                <p>An officer has signed up and is requesting clearance within your command jurisdiction:</p>
                <ul style="line-height: 1.6; background: #f8fafc; padding: 15px; border-radius: 6px;">
                    <li><strong>Name & Rank:</strong> {rank} {name}</li>
                    <li><strong>F-Number / IPPS:</strong> {clean_fnum}</li>
                    <li><strong>Requested Station:</strong> {clean_station}</li>
                    <li><strong>Requested Region:</strong> {clean_region}</li>
                </ul>
                <p>Please log in to the KMP Centralised Security Data Management System to review and authorize this request.</p>
            </div>
            """
            def send_alerts():
                asyncio.run(send_auth_notification(list(set(approver_emails)), subject, html_body))
            background_tasks.add_task(send_alerts)

        return {
            "status": "success",
            "message": "Access authorization request submitted. Awaiting Command approval."
        }
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration database error: {str(e)}"
        )

# ====================================================================
# 3. USER APPROVAL ENDPOINT (WITH USER NOTIFICATION EMAIL)
# ====================================================================
@router.put("/users/{user_id}/approve")
@router.put("/api/v1/users/{user_id}/approve")
def approve_user_account(
    user_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    if str(current_user.role).strip().upper() not in ["SUPER_ADMIN", "ADMIN", "RPC", "SYSTEM_MANAGER"]:
        raise HTTPException(status_code=403, detail="Clearance Denied: Administrator rights required.")

    target_user = db.query(models.Users).filter(models.Users.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User account not found.")

    target_user.is_approved = True
    db.commit()
    db.refresh(target_user)

    log_independent_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action="APPROVE_USER",
        module="USER_ACCOUNTS",
        details=f"User account approved for {target_user.fnum} ({target_user.name})."
    )

    if target_user.email and "@" in target_user.email:
        subject = "Account Approved: KMP Centralised Security System Clearance Granted"
        html_body = f"""
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #16a34a; margin-top: 0;">✅ Account Approval Granted</h2>
            <p>Dear {target_user.rank or ''} {target_user.name},</p>
            <p>Your account request for the <strong>KMP Centralised Security Data Management System</strong> has been officially reviewed and approved by command authority.</p>
            <p>You can now log in using your registered credentials to access your designated modules:</p>
            <ul style="line-height: 1.6; background: #f8fafc; padding: 15px; border-radius: 6px;">
                <li><strong>Assigned Station:</strong> {target_user.station}</li>
                <li><strong>Assigned Region:</strong> {target_user.region}</li>
                <li><strong>F-Number / ID:</strong> {target_user.fnum}</li>
            </ul>
            <p style="margin-top: 20px;">Welcome aboard, officer.</p>
        </div>
        """
        def send_user_email():
            asyncio.run(send_auth_notification([target_user.email], subject, html_body))
        background_tasks.add_task(send_user_email)

    return {"status": "success", "message": f"User {target_user.name} has been successfully approved and notified."}

# ====================================================================
# 4. PROFILE PHOTO UPLOAD ENDPOINT
# ====================================================================
@router.post("/upload-profile")
@router.post("/api/v1/users/upload-profile")
async def upload_user_profile_photo(
    file: UploadFile = File(...),
    fnum: Optional[str] = Form("NEW_USER"),
    category: Optional[str] = Form("user_profile")
):
    try:
        contents = await file.read()
        clean_fnum = normalize_fnum(fnum).replace("/", "_")
        ext = file.filename.split('.')[-1].lower() if '.' in file.filename else 'jpg'
        s3_key = f"user_profiles/{clean_fnum}_{int(datetime.utcnow().timestamp())}.{ext}"

        if BUCKET_NAME:
            try:
                s3_client.put_object(
                    Bucket=BUCKET_NAME,
                    Key=s3_key,
                    Body=contents,
                    ContentType=file.content_type or 'image/jpeg'
                )
                s3_url = f"https://{BUCKET_NAME}.s3.{os.getenv('AWS_REGION', 'eu-central-1')}.amazonaws.com/{s3_key}"
                return {
                    "full_s3_url": s3_url,
                    "cloud_storage_path": s3_key
                }
            except Exception as s3_err:
                print(f"S3 Upload failed, saving locally: {s3_err}")

        os.makedirs("uploads/profiles", exist_ok=True)
        local_filename = f"{clean_fnum}_{int(datetime.utcnow().timestamp())}.{ext}"
        local_path = os.path.join("uploads/profiles", local_filename)
        with open(local_path, "wb") as f:
            f.write(contents)

        return {
            "full_s3_url": f"/uploads/profiles/{local_filename}",
            "cloud_storage_path": f"uploads/profiles/{local_filename}"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")

# ====================================================================
# 5. PASSWORD RESET REQUEST ENDPOINT
# ====================================================================
@router.post("/request-reset")
@router.post("/api/v1/auth/request-reset")
async def request_password_reset(
    fnum: str = Form(...),
    db: Session = Depends(database.get_db),
    logs_db: Session = Depends(get_logs_db)
):
    clean_fnum = normalize_fnum(fnum)
    user = db.query(models.Users).filter(
        func.trim(func.upper(models.Users.fnum)) == clean_fnum
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Officer with Force/File number '{clean_fnum}' is not registered."
        )

    ResetModel = getattr(models, 'Password_Reset_Requests', getattr(models, 'PasswordResetRequests', None))
    if ResetModel:
        existing_req = db.query(ResetModel).filter(
            func.trim(func.upper(ResetModel.fnum)) == clean_fnum,
            ResetModel.status == "PENDING"
        ).first()

        if not existing_req:
            new_req = ResetModel(
                fnum=clean_fnum,
                name=user.name,
                rank=user.rank,
                station=user.station,
                region=user.region,
                status="PENDING"
            )
            db.add(new_req)
            db.commit()

            log_independent_activity(
                logs_db=logs_db,
                fnum=clean_fnum,
                action="PASSWORD_RESET_REQUEST",
                module="PASSWORD_RESETS",
                details="Password recovery requested."
            )

    return {"status": "success", "message": "Password reset request submitted to Command."}

# ====================================================================
# 6. USER PASSWORD, PROFILE UPDATE, REVOCATION & PERMANENT DELETION
# ====================================================================
@router.put("/change-password")
@router.put("/api/v1/users/change-password")
def change_password(
    data: schemas.PasswordChangeReq,
    current_user: models.Users = Depends(get_current_user),
    logs_db: Session = Depends(get_logs_db),
    db: Session = Depends(database.get_db)
):
    if not security.verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password incorrect.")

    if data.old_password == data.new_password:
        raise HTTPException(
            status_code=400, 
            detail="Security Error: Your new password cannot be the same as your current password. Please choose a unique key."
        )

    current_user.hashed_password = security.get_password_hash(data.new_password)
    
    try:
        db.commit()
        
        log_independent_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action="PASSWORD_CHANGE",
            module="SECURITY_VAULT",
            details="Security key (password) updated successfully."
        )
        
        return {"status": "success", "message": "Security Key successfully updated. Previous password has been invalidated."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit error: {str(e)}")

@router.put("/profile/update")
@router.put("/api/v1/users/profile/update")
def update_profile(
    data: schemas.UserUpdate,
    current_user: models.Users = Depends(get_current_user),
    logs_db: Session = Depends(get_logs_db),
    db: Session = Depends(database.get_db)
):
    if data.name: current_user.name = str(data.name).strip().upper()
    if data.rank: current_user.rank = str(data.rank).strip().upper()
    if data.region: current_user.region = str(data.region).strip().upper()
    if data.station: current_user.station = str(data.station).strip().upper()
    if data.email: current_user.email = str(data.email).strip()
    if data.phone: 
        current_user.phone = validate_and_normalize_phone(data.phone)
    if getattr(data, 'nin', None): 
        current_user.nin = validate_and_normalize_nin(data.nin)
    if getattr(data, 'sex', None): 
        current_user.sex = str(data.sex).strip().upper()
    if data.profile_photo_path: current_user.profile_photo_path = data.profile_photo_path

    db.commit()
    db.refresh(current_user)

    log_independent_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action="PROFILE_UPDATE",
        module="USER_PROFILE",
        details="Officer profile metadata updated."
    )

    return {"status": "success", "message": "Profile updated successfully."}

@router.delete("/users/{fnum:path}/revoke")
@router.delete("/api/v1/users/{fnum:path}/revoke")
def revoke_user_access(
    fnum: str,
    reason: str = "Administrative Revocation",
    db: Session = Depends(database.get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(require_admin)
):
    clean_fnum = normalize_fnum(fnum)
    target_user = db.query(models.Users).filter(
        func.trim(func.upper(models.Users.fnum)) == clean_fnum
    ).first()

    if not target_user:
        raise HTTPException(status_code=404, detail="User record not found.")

    target_user.role = "REVOKED"
    target_user.is_approved = False

    try:
        db.commit()

        log_independent_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action="REVOKE_USER_ACCESS",
            module="ACCESS_MATRIX",
            details=f"User access revoked for {clean_fnum}. Reason: {reason}"
        )

        return {"status": "success", "message": f"Access successfully revoked for {clean_fnum}."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database revocation error: {str(e)}")

@router.delete("/users/{fnum:path}/permanent-delete")
@router.delete("/api/v1/users/{fnum:path}/permanent-delete")
def permanent_delete_user(
    fnum: str,
    db: Session = Depends(database.get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(require_admin)
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Clearance Denied: Only Super Admins can permanently delete accounts.")

    clean_fnum = normalize_fnum(fnum)
    target_user = db.query(models.Users).filter(
        func.trim(func.upper(models.Users.fnum)) == clean_fnum
    ).first()

    if not target_user:
        raise HTTPException(status_code=404, detail="Command user record not found.")

    try:
        db.delete(target_user)
        db.commit()

        log_independent_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action="PERMANENT_ACCOUNT_PURGE",
            module="SECURITY_VAULT",
            details=f"Account {clean_fnum} permanently purged from database."
        )

        return {"status": "success", "message": f"Account {clean_fnum} permanently deleted from database."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database deletion error: {str(e)}")