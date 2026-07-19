import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from app import models, database, schemas

router = APIRouter()

# Helper for Activity Logging
def log_activity(database: Session, event_type: str, user: str, status: str, details: str):
    new_log = models.ActivityLog(
        time=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        type=event_type,
        user=user,
        status=status,
        details=details
    )
    database.add(new_log)
    database.commit()

# ==========================================
# AUTHENTICATION & USERS
# ==========================================

@router.post("/auth/register")
async def register_officer(req: schemas.SignupRequest, database: Session = Depends(database.get_database)):
    existing_user = database.query(models.User).filter(func.lower(models.User.fNum) == req.fNum.lower()).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Force Number already exists")

    hashed = bcrypt.hashpw(req.password.encode('utf-8'), bcrypt.gensalt())
    
    new_user = models.User(
        fNum=req.fNum.upper(),
        ipps=req.ipps,
        name=req.name,
        rank=req.rank,
        position=req.position,
        email=req.email,
        phone=req.phone,
        region=req.region,
        station=req.station,
        role=req.role,
        password=hashed.decode('utf-8'),
        is_approved="FALSE"
    )
    database.add(new_user)
    
    log_activity(database, "SIGNUP_REQUEST", req.fNum.upper(), "PENDING", f"Requested access. Auto-Assigned Role: {req.role}")
    return {"status": "success", "message": "Account Request Submitted"}

@router.post("/auth/login")
async def login_officer(req: schemas.LoginRequest, database: Session = Depends(database.get_database)):
    user = database.query(models.User).filter(func.lower(models.User.fNum) == req.fNum.lower()).first()
    
    if not user or not bcrypt.checkpw(req.password.encode('utf-8'), user.password.encode('utf-8')):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if user.is_approved != "TRUE" and user.role not in ["SUPER_ADMIN", "ADMIN"]:
         raise HTTPException(status_code=403, detail="Account pending admin approval")

    return {
        "status": "success",
        "user": {
            "fNum": user.fNum,
            "name": user.name,
            "role": user.role,
            "region": user.region,
            "station": user.station
        }
    }

# ==========================================
# REPORTS (LIVE REGISTRY)
# ==========================================
@router.get("/reports", response_model=list[schemas.ReportResponse])
def get_reports(database: Session = Depends(database.get_database)):
    return database.query(models.Report).order_by(models.Report.sn.desc()).all()

@router.post("/reports", response_model=schemas.ReportResponse)
def create_report(req: schemas.ReportBase, database: Session = Depends(database.get_database)):
    new_report = models.Report(**req.model_dump())
    database.add(new_report)
    database.commit()
    database.refresh(new_report)
    return new_report

@router.put("/reports/{sn}", response_model=schemas.ReportResponse)
def update_report(sn: int, req: schemas.ReportBase, database: Session = Depends(database.get_database)):
    report = database.query(models.Report).filter(models.Report.sn == sn).first()
    if not report: raise HTTPException(status_code=404, detail="Report not found")
    
    for key, value in req.model_dump().items():
        setattr(report, key, value)
    
    database.commit()
    database.refresh(report)
    return report

# ==========================================
# STATISTICS
# ==========================================
@router.get("/stats", response_model=list[schemas.StatisticResponse])
def get_stats(database: Session = Depends(database.get_database)):
    return database.query(models.Statistic).order_by(models.Statistic.sn.desc()).all()

@router.post("/stats", response_model=schemas.StatisticResponse)
def create_stat(req: schemas.StatisticBase, database: Session = Depends(database.get_database)):
    new_stat = models.Statistic(**req.model_dump())
    database.add(new_stat)
    database.commit()
    database.refresh(new_stat)
    return new_stat

@router.put("/stats/{sn}", response_model=schemas.StatisticResponse)
def update_stat(sn: int, req: schemas.StatisticBase, database: Session = Depends(database.get_database)):
    stat = database.query(models.Statistic).filter(models.Statistic.sn == sn).first()
    if not stat: raise HTTPException(status_code=404, detail="Record not found")
    
    for key, value in req.model_dump().items():
        setattr(stat, key, value)
        
    database.commit()
    database.refresh(stat)
    return stat

# ==========================================
# SUCCESS STORIES
# ==========================================
@router.get("/stories", response_model=list[schemas.StoryResponse])
def get_stories(database: Session = Depends(database.get_database)):
    return database.query(models.SuccessStory).order_by(models.SuccessStory.sn.desc()).all()

@router.post("/stories", response_model=schemas.StoryResponse)
def create_story(req: schemas.StoryBase, database: Session = Depends(database.get_database)):
    new_story = models.SuccessStory(**req.model_dump())
    database.add(new_story)
    database.commit()
    database.refresh(new_story)
    return new_story

@router.put("/stories/{sn}", response_model=schemas.StoryResponse)
def update_story(sn: int, req: schemas.StoryBase, database: Session = Depends(database.get_database)):
    story = database.query(models.SuccessStory).filter(models.SuccessStory.sn == sn).first()
    if not story: raise HTTPException(status_code=404, detail="Story not found")
    
    for key, value in req.model_dump().items():
        setattr(story, key, value)
        
    database.commit()
    database.refresh(story)
    return story