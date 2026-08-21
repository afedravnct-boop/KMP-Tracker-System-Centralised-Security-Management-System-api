import os
import asyncio
from datetime import datetime
from typing import Optional, List, Union

import pytz
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_

from app import models, schemas
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["Admin Communications"])

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

def get_comm_model():
    model = getattr(models, 'Admin_Communication', getattr(models, 'AdminCommunication', None))
    if not model:
        raise HTTPException(status_code=500, detail="Admin Communication database model not configured.")
    return model

def get_reads_model():
    model = getattr(models, 'Communication_Reads', getattr(models, 'CommunicationReads', None))
    if not model:
        raise HTTPException(status_code=500, detail="Communication Reads database model not configured.")
    return model

async def send_command_briefing(email_to: List[str], subject: str, html_body: str):
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
        print(f"❌ Failed to dispatch command email: {e}")

@router.post("/communications")
@router.post("/Admin_Communication")
def create_admin_communication(
    comm: schemas.Admin_CommunicationCreate, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    CommModel = get_comm_model()
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
            
        count = db.query(CommModel).filter(CommModel.msg_ref.like(f"{origin_tag}/%")).count()
        generated_msg_ref = f"{origin_tag}/{count + 1:03d}"

        # Normalize target_fnum if passed as a list
        target_fnum_val = comm.target_fnum
        if isinstance(target_fnum_val, list):
            target_fnum_val = ",".join(target_fnum_val)

        eat_tz = pytz.timezone("Africa/Nairobi")
        uganda_now = datetime.now(eat_tz).replace(tzinfo=None)

        db_comm = CommModel(
            msg_ref=generated_msg_ref,
            sender_fnum=comm.sender_fnum, 
            sender_name=comm.sender_name,
            target_audience=comm.target_audience, 
            target_region=comm.target_region,
            target_fnum=target_fnum_val, 
            message_type=comm.message_type, 
            subject=comm.subject, 
            message=comm.message,
            created_at=uganda_now
        )
        db.add(db_comm)
        db.commit()
        db.refresh(db_comm)

        if comm.send_email:
            query = db.query(models.Users.email).filter(
                models.Users.email.isnot(None),
                models.Users.is_approved == True,
                models.Users.role != 'REVOKED'
            )
            
            if comm.target_audience == 'ADMINS_ONLY': 
                query = query.filter(models.Users.role.in_(['ADMIN', 'SUPER_ADMIN']))
            elif comm.target_audience == 'RPC_ONLY': 
                query = query.filter(models.Users.role.in_(['RPC', 'SUPER_ADMIN']))
            elif comm.target_audience == 'SPECIFIC_REGION' and comm.target_region: 
                query = query.filter(func.upper(models.Users.region) == comm.target_region.strip().upper())
            elif comm.target_audience == 'SPECIFIC_USER' and target_fnum_val: 
                target_fnums = [f.strip().upper() for f in str(target_fnum_val).split(',') if f.strip()]
                query = query.filter(func.upper(models.Users.fnum).in_(target_fnums))
                
            emails = [u[0] for u in query.all() if u[0] and "@" in u[0]]
            
            if emails:
                html_body = f"""
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #b91c1c; margin-top: 0;">[{comm.message_type.replace('_', ' ')}] {comm.subject}</h2>
                    <p style="font-family: monospace; font-size: 13px; background: #f1f5f9; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
                        <strong>Command Reference:</strong> {generated_msg_ref}
                    </p>
                    <p><strong>Dispatched By:</strong> {comm.sender_name} ({comm.sender_fnum})</p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0;"/>
                    <div style="margin: 15px 0; line-height: 1.6;">{comm.message}</div>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0;"/>
                    <p style="font-size: 11px; color: #64748b; margin-bottom: 0;">
                        Official dispatch from KMP Centralised Security Data Management System.
                    </p>
                </div>
                """
                
                def send_email_sync():
                    asyncio.run(send_command_briefing(emails, comm.subject, html_body))
                
                background_tasks.add_task(send_email_sync)

        assigned_id = getattr(db_comm, 'id', getattr(db_comm, 'sn', 1))
        return {"status": "success", "id": assigned_id, "msg_ref": generated_msg_ref}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to post communication: {str(e)}")

@router.get("/Admin_Communication")
@router.get("/communications")
def get_admin_communications(
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    CommModel = get_comm_model()
    ReadsModel = get_reads_model()
    
    query = db.query(CommModel)
    clean_user_fnum = (current_user.fnum or "").strip().upper()
    user_region = (current_user.region or "").strip().upper()

    if current_user.role != "SUPER_ADMIN":
        visibility_conditions = [
            or_(
                CommModel.target_audience == "ALL",
                CommModel.target_audience == "ALL_USERS",
                CommModel.target_audience == "ALL_REGIONS"
            ),
            CommModel.sender_fnum == current_user.fnum,
            and_(
                CommModel.target_audience == "SPECIFIC_USER", 
                CommModel.target_fnum.like(f"%{current_user.fnum}%")
            ),
            and_(
                CommModel.target_audience == "SPECIFIC_REGION", 
                func.upper(CommModel.target_region) == user_region
            ),
            and_(
                CommModel.target_audience == "REGIONAL_BROADCAST",
                func.upper(CommModel.target_region) == user_region
            )
        ]
        
        if current_user.role in ["ADMIN", "SYSTEM_ADMIN"]: 
            visibility_conditions.append(CommModel.target_audience == "ADMINS_ONLY")
        if current_user.role in ["RPC", "Deputy Commander"]: 
            visibility_conditions.append(CommModel.target_audience.in_(["RPC_ONLY", "ADMINS_ONLY"]))
            
        query = query.filter(or_(*visibility_conditions))

    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(CommModel.created_at >= start_dt)
        except ValueError:
            pass # Ignore malformed date strings
            
    if end_date:
        try:
            end_dt = datetime.strptime(f"{end_date} 23:59:59", "%Y-%m-%d %H:%M:%S")
            query = query.filter(CommModel.created_at <= end_dt)
        except ValueError:
            pass # Ignore malformed date strings  

    comms = query.order_by(CommModel.created_at.desc()).all()
 
    read_records = db.query(ReadsModel.comm_id).filter(
        func.trim(func.upper(ReadsModel.fnum)) == clean_user_fnum
    ).all()
    read_comm_ids = {r[0] for r in read_records} 
    
    eat_tz = pytz.timezone("Africa/Nairobi")
    clean_comms = []
    
    for c in comms:
        sender_clean = (c.sender_fnum or "").strip().upper()
        comm_id = getattr(c, 'id', getattr(c, 'sn', 1))
        is_read = (comm_id in read_comm_ids) or (sender_clean == clean_user_fnum)
        
        local_time = getattr(c, 'created_at', None)
        if local_time:
            if isinstance(local_time, datetime):
                if local_time.tzinfo is None:
                    local_time = pytz.utc.localize(local_time)
                formatted_time = local_time.astimezone(eat_tz).strftime("%Y-%m-%d %H:%M")
            else:
                formatted_time = str(local_time)
        else: 
            formatted_time = "Unknown Time"
            
        clean_comms.append({
            "id": comm_id, 
            "msg_ref": getattr(c, 'msg_ref', 'UPF/COMMAND/000'), 
            "sender_fnum": c.sender_fnum, 
            "sender_name": c.sender_name,
            "target_audience": c.target_audience, 
            "target_region": c.target_region,
            "target_fnum": getattr(c, 'target_fnum', None), 
            "message_type": c.message_type, 
            "subject": c.subject, 
            "message": c.message,
            "created_at": formatted_time, 
            "acknowledged": is_read
        })

    return clean_comms

@router.post("/communications/{comm_id}/acknowledge")
@router.post("/Admin_Communication/{comm_id}/acknowledge")
def acknowledge_communication(
    comm_id: int, 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    ReadsModel = get_reads_model()
    try:
        clean_fnum = (current_user.fnum or "").strip().upper()
        
        existing_read = db.query(ReadsModel).filter(
            ReadsModel.comm_id == comm_id,
            func.trim(func.upper(ReadsModel.fnum)) == clean_fnum
        ).first()

        if not existing_read:
            eat_tz = pytz.timezone("Africa/Nairobi")
            uganda_time = datetime.now(eat_tz).replace(tzinfo=None)
            new_read = ReadsModel(
                comm_id=comm_id, 
                fnum=clean_fnum, 
                read_at=uganda_time
            )
            db.add(new_read)
            db.commit()
            
        return {"status": "success", "message": "Receipt safely recorded."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record receipt: {str(e)}")

@router.get("/communications/{comm_id}/readers")
@router.get("/Admin_Communication/{comm_id}/readers")
def get_communication_readers(
    comm_id: int, 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    ReadsModel = get_reads_model()
    position_str = (current_user.position or "").upper()
    user_role = (current_user.role or "").upper()
    
    is_cleared = (
        user_role in ["ADMIN", "SUPER_ADMIN", "RPC", "Deputy Commander"] or
        "COMMANDER" in position_str or
        "DEPUTY" in position_str or
        "RPC" in position_str
    )
    
    if not is_cleared:
        raise HTTPException(status_code=403, detail="Clearance Denied: High Command privileges required.")
    
    try:
        readers = db.query(
            ReadsModel.read_at, models.Users.name, models.Users.fnum, models.Users.rank
        ).join(
            models.Users, func.trim(func.upper(ReadsModel.fnum)) == func.trim(func.upper(models.Users.fnum))
        ).filter(ReadsModel.comm_id == comm_id).order_by(ReadsModel.read_at.desc()).all()

        eat_tz = pytz.timezone("Africa/Nairobi")
        results = []
        for r in readers:
            local_time = r.read_at
            if local_time:
                if isinstance(local_time, datetime):
                    if local_time.tzinfo is None:
                        local_time = pytz.utc.localize(local_time)
                    formatted_time = local_time.astimezone(eat_tz).strftime("%Y-%m-%d %H:%M:%S")
                else:
                    formatted_time = str(local_time)
            else:
                formatted_time = "Unknown Time"
                
            results.append({
                "rank": r.rank,
                "name": r.name, 
                "fnum": r.fnum, 
                "read_at": formatted_time
            })
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch reader logs: {str(e)}")