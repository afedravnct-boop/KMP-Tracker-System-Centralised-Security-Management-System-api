import os
import uuid
import boto3
import json
from datetime import datetime
import pytz
from fastapi import FastAPI, File, UploadFile, Form, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional, List

# Import our database and models
from database import get_db, engine
import models
from auth import get_current_user

# Ensure tables exist
models.Base.metadata.create_all(bind=engine)
load_dotenv()

app = FastAPI(title="KMP Tracker Central API")

# ==========================================
# CORS SECURITY SETUP
# ==========================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://kmp-tracker-system-centralised-secu.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000"
    ],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION")
)
BUCKET_NAME = os.getenv("AWS_BUCKET_NAME")

# ==========================================
# OPSEC & DUAL-EQUIVALENCE ENGINE
# ==========================================
REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

def get_scoped_query(db: Session, current_user: models.User, ModelClass):
    """Dynamically scopes SQL queries based on Command Tier and Regional mapping."""
    if not ModelClass:
        return []
    
    q = db.query(ModelClass)
    
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    user_pos = str(current_user.position).strip().upper() if current_user.position else ""
    user_reg = str(current_user.region).strip().upper() if current_user.region else ""
    user_stn = str(current_user.station).strip().upper() if current_user.station else ""

    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}

    is_absolute_global = (
        user_role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN"] or
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

    is_kmp_specialist = (
        user_role == "ASSISTANT_SYSTEM_MANAGER" and
        user_reg in ["KMP HEADQUARTERS", "POLICE HEADQUARTERS"] and
        "KMP" in user_pos
    )

    is_regional_command = (
        user_role in ["RPC", "DEPUTY_RPC", "SYSTEM_MANAGER", "ASSISTANT_SYSTEM_MANAGER", "REGIONAL_ADMIN", "ASSISTANT_REGIONAL_ADMIN"] and
        not is_kmp_sys_mgr and
        not is_kmp_specialist
    )

    if is_absolute_global or is_kmp_sys_mgr:
        return q
        
    elif is_kmp_specialist:
        if hasattr(ModelClass, 'region'):
            return q.filter(func.upper(ModelClass.region) == user_reg)
        return q
        
    elif is_regional_command:
        conds = []
        if hasattr(ModelClass, 'region'):
            conds.append(func.upper(ModelClass.region) == user_reg)
        
        # 🟢 Station Dual-Equivalence Check for missing regional tags
        if hasattr(ModelClass, 'station') and user_reg in REGIONAL_HIERARCHY:
            expanded_stns = set()
            for s in REGIONAL_HIERARCHY[user_reg]:
                expanded_stns.add(s)
                expanded_stns.add(s.replace(' HEADQUARTERS', '').replace(' HQ', ''))
                expanded_stns.add(s + ' HEADQUARTERS')
                expanded_stns.add(s + ' HQ')
            
            conds.append(func.upper(ModelClass.station).in_(list(expanded_stns)))
            
        if conds:
            return q.filter(or_(*conds))
        return q.filter(text("1=0"))
        
    elif hasattr(ModelClass, 'station'):
        return q.filter(func.upper(ModelClass.station) == user_stn)
        
    return q.filter(text("1=0"))

# ==========================================
# PYDANTIC SCHEMAS (Matches React Data)
# ==========================================
class CrimeReportPayload(BaseModel):
    sdRef: str
    region: str
    station: str
    date: str
    time: str
    offence: str 
    narrative: str
    status: str
    suspects: int
    lastUpdatedBy: str

class OperationalStatisticPayload(BaseModel):
    region: str
    station: str
    date: str
    arrested: int = 0
    givenBond: int = 0
    cautioned: int = 0
    pendingCourt: int = 0
    takenToCourt: int = 0
    released: int = 0
    remanded: int = 0
    convicted: int = 0
    lastUpdatedBy: str

class EstablishmentPayload(BaseModel):
    region: str
    division: str
    station: str
    subStation: Optional[str] = None
    personnelInStation: int = 0
    post: Optional[str] = None
    personnelInPost: int = 0
    booths: int = 0
    personnelInBooth: int = 0
    installedBy: Optional[str] = None
    location: Optional[str] = None
    status: str = "OPERATIONAL"
    comment: Optional[str] = None
    lastUpdatedBy: str

class NominalRollPayload(BaseModel):
    fnum: str
    rank: str
    name: str
    sex: str
    position: str
    dob: Optional[str] = None
    doe: Optional[str] = None
    doPost: Optional[str] = None
    doPro: Optional[str] = None
    contact: Optional[str] = None
    educLevel: Optional[str] = None
    ipps: str
    tin: Optional[str] = None
    nin: Optional[str] = None
    homeDist: Optional[str] = None
    tribe: Optional[str] = None
    accNo: Optional[str] = None
    bankBranch: Optional[str] = None
    station: str
    district: Optional[str] = None
    region: str
    section: Optional[str] = None
    dir: Optional[str] = None
    status: str = "ACTIVE"
    lastUpdatedBy: str

class ArchivePayload(BaseModel):
    fnum: str
    archiveReason: str

class CommunicationPayload(BaseModel):
    sender_fnum: str
    sender_name: str
    target_audience: str
    target_region: Optional[str] = None
    message_type: str
    subject: str
    message: str
    send_email: bool = False

# ==========================================
# TEXT DATA ROUTES
# ==========================================

# --- 1. CRIME REPORTS ---
@app.get("/api/v1/reports")
def get_reports(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = get_scoped_query(db, current_user, models.CrimeReport)
    reports = query.order_by(models.CrimeReport.sn.desc()).all()
    return [{
        "sn": r.sn, "sdRef": r.sd_ref, "region": r.region, "station": r.station,
        "date": r.date, "time": r.time, "offence": r.offence, "narrative": r.narrative, 
        "status": r.status, "suspects": r.suspects, "lastUpdatedBy": r.last_updated_by
    } for r in reports]

@app.post("/api/v1/reports")
def create_report(payload: CrimeReportPayload, db: Session = Depends(get_db)):
    try:
        new_report = models.CrimeReport(
            sd_ref=payload.sdRef, region=payload.region,
            station=payload.station, date=payload.date, time=payload.time,
            offence=payload.offence, narrative=payload.narrative, status=payload.status,
            suspects=payload.suspects, last_updated_by=payload.lastUpdatedBy
        )
        db.add(new_report)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database write failed.")

# --- 2. DISRUPTIVE OPS ---
@app.get("/api/v1/statistics")
def get_statistics(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = get_scoped_query(db, current_user, models.OperationalStatistic)
    stats = query.order_by(models.OperationalStatistic.sn.desc()).all()
    return [{
        "sn": s.sn, "region": s.region, "station": s.station, "date": s.date,
        "arrested": s.arrested, "givenBond": s.given_bond, "cautioned": s.cautioned,
        "pendingCourt": s.pending_court, "takenToCourt": s.taken_to_court,
        "released": s.released, "remanded": s.remanded, "convicted": s.convicted,
        "lastUpdatedBy": s.last_updated_by
    } for s in stats]

@app.post("/api/v1/statistics")
def create_statistic(payload: OperationalStatisticPayload, db: Session = Depends(get_db)):
    try:
        new_stat = models.OperationalStatistic(
            region=payload.region, station=payload.station, date=payload.date,
            arrested=payload.arrested, given_bond=payload.givenBond, cautioned=payload.cautioned,
            pending_court=payload.pendingCourt, taken_to_court=payload.takenToCourt,
            released=payload.released, remanded=payload.remanded, convicted=payload.convicted,
            last_updated_by=payload.lastUpdatedBy
        )
        db.add(new_stat)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database write failed.")

# --- 3. ESTABLISHMENTS ---
@app.get("/api/v1/establishments")
def get_establishments(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = get_scoped_query(db, current_user, models.Establishment)
    ests = query.order_by(models.Establishment.sn.desc()).all()
    return [{
        "id": e.id, "region": e.region, "division": e.division, "station": e.station,
        "sub_Station": e.sub_station, "personnel_In_Sub_Station": e.personnel_in_sub_station,
        "post": e.post, "personnelInPost": e.personnel_in_post, "booths": e.booths,
        "personnelInBooth": e.personnel_in_booth, "installedBy": e.installed_by,
        "location": e.location, "status": e.status, "comment": e.comment,
        "lastUpdatedBy": e.last_updated_by
    } for e in ests]

@app.post("/api/v1/establishments")
def create_establishment(payload: EstablishmentPayload, db: Session = Depends(get_db)):
    try:
        new_est = models.Establishment(
            region=payload.region, division=payload.division, station=payload.station,
            sub_station=payload.subStation, personnel_in_station=payload.personnelInStation,
            post=payload.post, personnel_in_post=payload.personnelInPost, booths=payload.booths,
            personnel_in_booth=payload.personnelInBooth, installed_by=payload.installedBy,
            location=payload.location, status=payload.status, comment=payload.comment,
            last_updated_by=payload.lastUpdatedBy
        )
        db.add(new_est)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database write failed.")

# --- 4. NOMINAL ROLL ---
@app.get("/api/v1/nominal-roll")
def get_nominal_roll(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = get_scoped_query(db, current_user, models.NominalRoll)
    rolls = query.filter(models.NominalRoll.status != "ARCHIVED").order_by(models.NominalRoll.sn.desc()).all()
    return [{
        "sn": r.sn, "fnum": r.fnum, "rank": r.rank, "name": r.name, "sex": r.sex,
        "position": r.position, "dob": r.dob, "doe": r.doe, "doPost": r.do_post,
        "doPro": r.do_pro, "contact": r.contact, "educLevel": r.educ_level,
        "ipps": r.ipps, "tin": r.tin, "nin": r.nin, "homeDist": r.home_dist,
        "tribe": r.tribe, "accNo": r.acc_no, "bankBranch": r.bank_branch,
        "station": r.station, "district": r.district, "region": r.region,
        "section": r.section, "dir": r.dir, "status": r.status, "lastUpdatedBy": r.last_updated_by
    } for r in rolls]

@app.post("/api/v1/nominal-roll")
def create_nominal_roll(payload: NominalRollPayload, db: Session = Depends(get_db)):
    try:
        new_entry = models.NominalRoll(
            fnum=payload.fnum, rank=payload.rank, name=payload.name,
            sex=payload.sex, position=payload.position, dob=payload.dob, doe=payload.doe,
            do_post=payload.doPost, do_pro=payload.doPro, contact=payload.contact,
            educ_level=payload.educLevel, ipps=payload.ipps, tin=payload.tin,
            nin=payload.nin, home_dist=payload.homeDist, tribe=payload.tribe,
            acc_no=payload.accNo, bank_branch=payload.bankBranch, station=payload.station,
            district=payload.district, region=payload.region, section=payload.section,
            dir=payload.dir, status=payload.status, last_updated_by=payload.lastUpdatedBy
        )
        db.add(new_entry)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database write failed. Check for duplicate Force Number or IPPS.")

@app.put("/api/v1/nominal-roll/archive")
def archive_personnel(payload: ArchivePayload, db: Session = Depends(get_db)):
    officer = db.query(models.NominalRoll).filter(models.NominalRoll.fnum == payload.fnum).first()
    if not officer:
        raise HTTPException(status_code=404, detail="Officer not found.")
    
    try:
        officer.status = "ARCHIVED"
        officer.archive_reason = payload.archiveReason
        officer.archive_date = datetime.now(pytz.utc).strftime("%Y-%m-%d %H:%M:%S")
        db.commit()
        return {"status": "success", "message": f"{payload.fnum} successfully archived."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to archive personnel.")

# ==========================================
# FILE UPLOAD ROUTE (Success Stories)
# ==========================================
@app.get("/api/v1/success-stories")
def get_success_stories(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = get_scoped_query(db, current_user, models.SuccessStory)
    stories = query.order_by(models.SuccessStory.sn.desc()).all()
    return [{
        "sn": s.sn, "region": s.region, "station": s.station, "date": s.date,
        "time": s.time, "narrative": s.narrative, "photoUrl": s.photo_url, 
        "status": s.status, "lastUpdatedBy": s.last_updated_by
    } for s in stories]

@app.post("/api/v1/success-stories/upload/")
def submit_success_story_with_file(
    region: str = Form(...),
    station: str = Form(...),
    date: str = Form(...),
    time: str = Form(...),
    narrative: str = Form(...),
    status: str = Form("COMPLETED / SUCCESS"),
    lastUpdatedBy: str = Form(...),
    file: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    s3_key = None
    full_s3_url = None

    if file and file.filename: 
        file_extension = file.filename.split('.')[-1]
        unique_id = uuid.uuid4().hex[:8]
        clean_station = str(station).replace(" ", "_").replace("/", "_")
        s3_key = f"success_stories/{region}/{clean_station}/{unique_id}.{file_extension}"

        try:
            s3_client.upload_fileobj(
                file.file, BUCKET_NAME, s3_key,
                ExtraArgs={"ContentType": file.content_type, "ServerSideEncryption": "AES256"}
            )
            full_s3_url = f"https://{BUCKET_NAME}.s3.{os.getenv('AWS_REGION')}.amazonaws.com/{s3_key}"
        except ClientError as e:
            print(f"❌ S3 Error: {e}")
            raise HTTPException(status_code=500, detail="Cloud upload failed.")
        finally:
            file.file.close()

    try:
        new_story = models.SuccessStory(
            region=region, station=station, date=date, time=time,
            narrative=narrative, status=status, photo_url=full_s3_url or s3_key,
            last_updated_by=lastUpdatedBy
        )
        db.add(new_story)
        db.commit()
        db.refresh(new_story)
        
        return {
            "status": "success", "record_id": new_story.id,
            "cloud_storage_path": s3_key, "full_s3_url": full_s3_url 
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database transaction failed.")

# ==========================================
# FILE UPLOAD ROUTE (Investigations)
# ==========================================
@app.post("/api/v1/investigation/upload/")
def upload_investigation_file(file: UploadFile = File(...)):
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
            "url": full_s3_url
        }
        
    except ClientError as e:
        print(f"❌ S3 Error: {e}")
        raise HTTPException(status_code=500, detail="Cloud upload failed.")
    finally:
        file.file.close()

# ==========================================
# COMMAND COMMUNICATION ROUTE
# ==========================================
@app.post("/api/v1/Admin_Communications")
def create_admin_communication(payload: CommunicationPayload, db: Session = Depends(get_db)):
    try:
        new_comm = models.Admin_Communication(
            sender_fnum=payload.sender_fnum,
            sender_name=payload.sender_name,
            target_audience=payload.target_audience,
            target_region=payload.target_region,
            message_type=payload.message_type,
            subject=payload.subject,
            message=payload.message
        )
        db.add(new_comm)
        db.commit()
        return {"status": "success", "message": "Broadcast sent."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to log Admin_Communication.")

@app.get("/api/v1/Admin_Communication")
def get_admin_communications(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user_reg = str(current_user.region).strip().upper() if current_user.region else "UNKNOWN"
    user_role = str(current_user.role).strip().upper() if current_user.role else "USER"
    
    q = db.query(models.Admin_Communication)
    
    if user_role not in ["SUPER_ADMIN", "ADMIN"]:
        conds = [
            func.upper(models.Admin_Communication.target_audience) == "ALL",
            func.upper(models.Admin_Communication.target_region) == "ALL REGIONS",
            func.upper(models.Admin_Communication.target_region) == user_reg
        ]
        q = q.filter(or_(*conds))
        
    comms = q.order_by(models.Admin_Communication.created_at.desc()).all()
    return [{
        "id": getattr(c, 'id', None),
        "sender_fnum": c.sender_fnum,
        "sender_name": c.sender_name,
        "target_audience": c.target_audience,
        "target_region": c.target_region,
        "message_type": c.message_type,
        "subject": c.subject,
        "message": c.message,
        "created_at": c.created_at
    } for c in comms]

# ==========================================
# ACTIVITY LOGS
# ==========================================
def record_activity(db: Session, fnum: str, action: str, details: str, module: str = "GENERAL"):
    """Helper function to record activities from anywhere in the app"""
    try:
        new_activity = models.Activity_Logs( 
            fnum=fnum,
            action=action,
            module=module,
            details=details
        )
        db.add(new_activity)
        db.commit()
    except Exception as e:
        print(f"Failed to record activity: {e}")
        db.rollback()

# ==========================================
# USER AUTHENTICATION & SIGNUP ROUTE
# ==========================================
@app.post("/api/v1/auth/signup")
def register_user(
    fnum: str = Form(...),
    rank: str = Form(...),
    name: str = Form(...),
    sex: str = Form(None),
    ipps: str = Form(...),
    region: str = Form(...),
    station: str = Form(...),
    position: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    password: str = Form(...), 
    division: Optional[str] = Form(None),
    role: str = Form("USER"), 
    policy_accepted: bool = Form(True),
    file: UploadFile = File(None),  
    db: Session = Depends(get_db)
):
    clean_fnum = fnum.strip().upper()
    
    existing_user = db.query(models.User).filter(models.User.fNum == clean_fnum).first()
    if existing_user:
         raise HTTPException(status_code=400, detail="User with this Force Number already exists.")
         
    if role != "SUPER_ADMIN" and (not file or not file.filename):
        raise HTTPException(
            status_code=400, 
            detail="A profile photo is mandatory for non-admin users."
        )

    photo_url = ""
    if file and file.filename:
        file_extension = file.filename.split('.')[-1]
        unique_id = uuid.uuid4().hex[:8]
        clean_file_fnum = clean_fnum.replace("/", "_") 
        s3_key = f"profile_photos/{clean_file_fnum}_{unique_id}.{file_extension}"

        try:
            s3_client.upload_fileobj(
                file.file, BUCKET_NAME, s3_key,
                ExtraArgs={"ContentType": file.content_type, "ServerSideEncryption": "AES256"}
            )
            photo_url = f"https://{BUCKET_NAME}.s3.{os.getenv('AWS_REGION')}.amazonaws.com/{s3_key}"
        except ClientError as e:
            print(f"❌ S3 Error: {e}")
            raise HTTPException(status_code=500, detail="Profile photo upload failed.")
        finally:
            file.file.close()

    try:
        from app.core.security import get_password_hash
        hashed_pwd = get_password_hash(password)

        new_user = models.User(
            fNum=clean_fnum,  
            rank=rank.strip().upper(),
            name=name.strip().upper(),
            sex=sex.strip().upper() if sex else "MALE",
            ipps=ipps.strip(),
            region=region.strip().upper(),
            division=division.strip().upper() if division else None,
            station=station.strip().upper(),
            position=position.strip().upper(),
            email=email.strip(),
            phone=phone.strip(),
            hashed_password=hashed_pwd, 
            role=role.strip().upper(),
            photoUrl=photo_url,
            policy_accepted=policy_accepted,
            policy_accepted_at=datetime.now(pytz.utc)
        )
        db.add(new_user)
        db.commit()
        return {"status": "success", "message": "User registered successfully!"}
        
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Database write failed: {str(e)}")