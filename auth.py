import os
import io
import re
import boto3
from typing import Optional
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from fastapi import APIRouter, Depends, HTTPException, status, Form, UploadFile, File, Request
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from fastapi.responses import JSONResponse

from app.core import security
from app import database, models, schemas

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION")
)
BUCKET_NAME = os.getenv("AWS_BUCKET_NAME")


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
    if not re.match(r"^C[MF][A-Z0-9]{12}$", clean_nin):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid NIN: National ID must start with CM or CF and contain exactly 14 characters."
        )
    return clean_nin


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
    user = db.query(models.Users).filter(
        func.trim(func.upper(models.Users.fnum)) == clean_fnum
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
# 1. LOGIN ENDPOINT (Supports JSON, Form, and OAuth2 formats)
# ====================================================================
@router.post("/login")
@router.post("/api/auth/login")
@router.post("/api/v1/auth/login")
async def login(
    request: Request,
    db: Session = Depends(database.get_db)
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

    if not user or not security.verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Force Number or password"
        )

    if not user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account pending Command approval. Please contact the administrator."
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
        "profile_photo_path": getattr(user, 'profile_photo_path', '') or ''
    }


# ====================================================================
# 2. SIGNUP ENDPOINT (Handles /signup, /api/auth/signup, /api/v1/auth/signup)
# ====================================================================
@router.post("/signup", status_code=status.HTTP_201_CREATED)
@router.post("/api/auth/signup", status_code=status.HTTP_201_CREATED)
@router.post("/api/v1/auth/signup", status_code=status.HTTP_201_CREATED)
async def signup(
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
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(database.get_db)
):
    if len(password) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password exceeds maximum allowed length."
        )

    clean_fnum = normalize_fnum(fnum)
    clean_nin = validate_and_normalize_nin(nin)
    clean_ipps = str(ipps).strip() if ipps else None

    # Check for duplicate Force Number, IPPS, or NIN
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
        region=str(region).strip().upper(),
        division=str(division or station).strip().upper(),
        station=str(station).strip().upper(),
        position=str(position).strip().upper() if position else "GENERAL DUTIES",
        email=str(email).strip() if email else None,
        phone=str(phone).strip() if phone else None,
        role=str(role).strip().upper() if role else "USER",
        hashed_password=hashed_password,
        profile_photo_path=uploaded_photo_url or "",
        is_approved=False,
        permissions={},
        comments=None
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return {
            "status": "success",
            "message": "Access authorization request submitted. Awaiting Command approval."
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration database error: {str(e)}"
        )


# ====================================================================
# 3. PROFILE PHOTO UPLOAD ENDPOINT
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
# 4. PASSWORD RESET REQUEST ENDPOINT
# ====================================================================
@router.post("/request-reset")
@router.post("/api/v1/auth/request-reset")
async def request_password_reset(
    fnum: str = Form(...),
    db: Session = Depends(database.get_db)
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

    return {"status": "success", "message": "Password reset request submitted to Command."}


# ====================================================================
# 5. USER PASSWORD & PROFILE UPDATE
# ====================================================================
@router.put("/change-password")
@router.put("/api/v1/users/change-password")
def change_password(
    data: schemas.PasswordChangeReq,
    current_user: models.Users = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    if not security.verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password incorrect.")

    if len(data.new_password) < 6 or len(data.new_password) > 72:
        raise HTTPException(status_code=400, detail="New password must be between 6 and 72 characters.")

    current_user.hashed_password = security.get_password_hash(data.new_password)
    db.commit()
    return {"status": "success", "message": "Password successfully updated."}


@router.put("/profile/update")
@router.put("/api/v1/users/profile/update")
def update_profile(
    data: schemas.UserUpdate,
    current_user: models.Users = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    if data.name: current_user.name = str(data.name).strip().upper()
    if data.rank: current_user.rank = str(data.rank).strip().upper()
    if data.region: current_user.region = str(data.region).strip().upper()
    if data.station: current_user.station = str(data.station).strip().upper()
    if data.email: current_user.email = str(data.email).strip()
    if data.phone: current_user.phone = str(data.phone).strip()
    if getattr(data, 'nin', None): current_user.nin = validate_and_normalize_nin(data.nin)
    if data.profile_photo_path: current_user.profile_photo_path = data.profile_photo_path

    db.commit()
    db.refresh(current_user)
    return {"status": "success", "message": "Profile updated successfully."}