from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from datetime import datetime, timedelta
import pytz
import asyncio
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
import os

from app import models
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["Admin Communications"])

# Configure Mail (pulling from environment variables)
conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_PORT=587,
    MAIL_SERVER="smtp.gmail.com",
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False
)

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

@router.post("/communications")
def create_admin_communication(
    comm: schemas.Admin_CommunicationCreate, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        pos = (current_user.position or "OFFICER").upper().strip()
        stat = (current_user.station or "HQ").upper().strip().replace(" ", "")
        reg = (current_user.region or "KMP").upper().strip().replace(" ", "")

        if pos in ["IGP", "DIGP"]:
            origin_tag = "UPF/HQTRS/GENPOL"
        elif "DIRECTOR OPS" in pos or "DIRECTOR OPERATIONS" in pos:
            origin_tag = "UPF/HQTRS/OPS"
        elif pos.startswith("DIRECTOR "):
            abbrev = pos.replace("DIRECTOR ", "").strip()
            if abbrev == "LOGISTICS & ENGINEERING": abbrev = "L&E"
            origin_tag = f"UPF/HQTRS/{abbrev}"
        elif current_user.region == "KMP HEADQUARTERS" or current_user.station == "KMP HEADQUARTERS":
            clean_pos = "COMD KMP" if pos == "KMP COMMANDER" else pos.replace(" ", "")
            origin_tag = f"UPF/OPS/KMP/HQTRS/{clean_pos}"
        elif "RPC" in pos or "DEPUTY COMMANDER" in pos or ("COMMANDER" in pos and "DIV" not in pos):
            clean_pos = pos.replace("KMP SOUTH COMMANDER", "RPC KMP SOUTH").replace("KMP NORTH COMMANDER", "RPC KMP NORTH").replace("KMP EAST COMMANDER", "RPC KMP EAST")
            origin_tag = f"UPF/OPS/{reg}/RHQTRS/{clean_pos}"
        else:
            clean_pos_stat = f"{pos.replace(' ', '')}{stat}"
            origin_tag = f"UPF/OPS/{reg}/DHQTRS/{clean_pos_stat}"
            
        count = db.query(models.Admin_Communication).filter(models.Admin_Communication.msg_ref.like(f"{origin_tag}/%")).count()
        generated_msg_ref = f"{origin_tag}/{count + 1:03d}"

        db_comm = models.Admin_Communication(
            msg_ref=generated_msg_ref,
            sender_fnum=comm.sender_fnum, 
            sender_name=comm.sender_name,
            target_audience=comm.target_audience, 
            target_region=comm.target_region,
            target_fnum=comm.target_fnum, 
            message_type=comm.message_type, 
            subject=comm.subject, 
            message=comm.message
        )
        db.add(db_comm)
        db.commit()
        db.refresh(db_comm)

        if comm.send_email:
            query = db.query(models.Users.email).filter(
                models.Users.email.isnot(None),
                models.Users.is_approved == True
            )
            
            if comm.target_audience == 'ADMINS_ONLY': 
                query = query.filter(models.Users.role.in_(['ADMIN', 'SUPER_ADMIN']))
            elif comm.target_audience == 'RPC_ONLY': 
                query = query.filter(models.Users.role == 'RPC')
            elif comm.target_audience == 'SPECIFIC_REGION': 
                query = query.filter(func.upper(models.Users.region) == comm.target_region.strip().upper())
            elif comm.target_audience == 'SPECIFIC_USER': 
                query = query.filter(models.Users.fnum == comm.target_fnum)
                
            emails = [u[0] for u in query.all() if u[0]]
            
            if emails:
                html_body = f"""
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #b91c1c;">[{comm.message_type.replace('_', ' ')}] {comm.subject}</h2>
                    <p style="font-family: monospace; font-size: 14px; background: #f1f5f9; padding: 8px; border: 1px solid #cbd5e1;">
                        <strong>Command Ref:</strong> {generated_msg_ref}
                    </p>
                    <p><strong>Dispatched By:</strong> {comm.sender_name} ({comm.sender_fnum})</p>
                    <hr/>
                    <div>{comm.message}</div>
                    <hr/>
                    <p style="font-size: 10px; color: gray;">Official dispatch from KMP Centralised Security Data Management System.</p>
                </div>
                """
                def send_email_sync():
                    asyncio.run(send_command_briefing(emails, comm.subject, html_body))
                
                background_tasks.add_task(send_email_sync)

        return {"status": "success", "id": db_comm.id, "msg_ref": generated_msg_ref}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/Admin_Communication")
def get_admin_communications(
    start_date: Optional[str] = None, end_date: Optional[str] = None,
    db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)
):
    query = db.query(models.Admin_Communication)

    if current_user.role != "SUPER_ADMIN":
        user_region = (current_user.region or "").strip().upper()
        
        visibility_conditions = [
            or_(
                models.Admin_Communication.target_audience == "ALL",
                models.Admin_Communication.target_audience == "ALL_USERS"
            ),
            models.Admin_Communication.sender_fnum == current_user.fnum,
            and_(
                models.Admin_Communication.target_audience == "SPECIFIC_USER", 
                models.Admin_Communication.target_fnum == current_user.fnum
            ),
            and_(
                models.Admin_Communication.target_audience == "SPECIFIC_REGION", 
                func.upper(models.Admin_Communication.target_region) == user_region
            ),
            and_(
                models.Admin_Communication.target_audience == "REGIONAL_BROADCAST",
                func.upper(models.Admin_Communication.target_region) == user_region
            )
        ]
        
        if current_user.role == "ADMIN": 
            visibility_conditions.append(models.Admin_Communication.target_audience == "ADMINS_ONLY")
        if current_user.role == "RPC": 
            visibility_conditions.append(models.Admin_Communication.target_audience == "RPC_ONLY")
            
        query = query.filter(or_(*visibility_conditions))

    if start_date: query = query.filter(models.Admin_Communication.created_at >= start_date)
    if end_date: query = query.filter(models.Admin_Communication.created_at <= f"{end_date} 23:59:59")

    comms = query.order_by(models.Admin_Communication.created_at.desc()).all()
 
    clean_user_fnum = (current_user.fnum or "").strip().upper()
    read_records = db.query(models.Communication_Reads.comm_id).filter(
        func.trim(func.upper(models.Communication_Reads.fnum)) == clean_user_fnum
    ).all()
    read_comm_ids = {r[0] for r in read_records} 
    
    eat_tz = pytz.timezone("Africa/Kampala")
    
    clean_comms = []
    for c in comms:
        sender_clean = (c.sender_fnum or "").strip().upper()
        is_read = (c.id in read_comm_ids) or (sender_clean == clean_user_fnum)
        
        local_time = c.created_at
        if local_time:
            if local_time.tzinfo is None: local_time = pytz.utc.localize(local_time)
            formatted_time = local_time.astimezone(eat_tz).strftime("%Y-%m-%d %H:%M")
        else: formatted_time = "Unknown Time"
            
        clean_comms.append({
            "id": c.id, "msg_ref": getattr(c, 'msg_ref', 'UPF/UNKNOWN/000'), 
            "sender_fnum": c.sender_fnum, "sender_name": c.sender_name,
            "target_audience": c.target_audience, "target_region": c.target_region,
            "target_fnum": getattr(c, 'target_fnum', None), 
            "message_type": c.message_type, "subject": c.subject, "message": c.message,
            "created_at": formatted_time, "acknowledged": is_read
        })

    return clean_comms

@router.post("/communications/{comm_id}/acknowledge")
def acknowledge_communication(comm_id: int, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        clean_fnum = (current_user.fnum or "").strip().upper()
        
        existing_read = db.query(models.Communication_Reads).filter(
            models.Communication_Reads.comm_id == comm_id,
            func.trim(func.upper(models.Communication_Reads.fnum)) == clean_fnum
        ).first()

        if not existing_read:
            eat_tz = pytz.timezone("Africa/Kampala")
            uganda_time = datetime.now(eat_tz).replace(tzinfo=None)
            new_read = models.Communication_Reads(
                comm_id=comm_id, fnum=clean_fnum, read_at=uganda_time
            )
            db.add(new_read)
            db.commit()
            
        return {"status": "success", "message": "Receipt safely logged in database"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/communications/{comm_id}/readers")
def get_communication_readers(comm_id: int, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    position_str = (current_user.position or "").upper()
    user_role = (current_user.role or "").upper()
    
    is_cleared = (
        user_role in ["ADMIN", "SUPER_ADMIN", "RPC"] or
        "COMMANDER" in position_str or
        "DEPUTY" in position_str or
        "RPC" in position_str
    )
    
    if not is_cleared:
        raise HTTPException(status_code=403, detail="Clearance Denied: High Command privileges required.")
    
    try:
        readers = db.query(
            models.Communication_Reads.read_at, models.Users.name, models.Users.fnum
        ).join(
            models.Users, func.trim(func.upper(models.Communication_Reads.fnum)) == func.trim(func.upper(models.Users.fnum))
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