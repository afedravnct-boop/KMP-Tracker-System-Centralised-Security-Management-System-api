# routers/admin_communications.py
import os
import asyncio
import json
import traceback
import sys
from datetime import datetime
from typing import Optional, List, Union
from urllib.parse import unquote

import pytz
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, Query
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, text
from pydantic import BaseModel
from google import genai
from google.genai import types

from app import models, schemas
from app.database import get_db, get_logs_db
from auth import get_current_user
from routers.activity_logger import record_neon_activity

router = APIRouter(prefix="/api/v1", tags=["Admin Communications"])

# 🟢 Enriched hierarchy ensuring both "REGION HEADQUARTERS" and "REGION" designations exist
REGIONAL_HIERARCHY = {
    "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
    "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
    "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
    "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
    "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
}

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

def get_fnum_col(model_class):
    """Dynamically locates the fnum column to prevent TypeError crashes."""
    return getattr(model_class, 'fnum', getattr(model_class, 'f_num', getattr(model_class, 'user_fnum', None)))

def check_global_view(user):
    user_role = str(user.role).strip().upper() if user.role else ""
    user_pos = str(user.position).strip().upper() if user.position else ""
    user_reg = str(user.region).strip().upper() if user.region else ""

    perms = user.permissions or {}
    if isinstance(perms, str):
        try: perms = json.loads(perms)
        except Exception: perms = {}

    return (
        user_role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN", "RPC", "DEPUTY COMMANDER"] or
        "KMP COMMANDER" in user_pos or
        "DEPUTY KMP COMMANDER" in user_pos or
        user_reg in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"] or
        perms.get("view_global_roster") is True or
        perms.get("global_observer") is True
    )

def is_regional_admin_or_above(user):
    role = str(user.role or "").strip().upper()
    pos = str(user.position or "").strip().upper()
    return role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN", "RPC", "DEPUTY COMMANDER"] or "COMMANDER" in pos or "RPC" in pos

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

class GlitchTelemetryPayload(BaseModel):
    console_logs: Optional[List[str]] = []
    network_errors: Optional[List[str]] = []
    current_page: Optional[str] = "Unknown"
    screenshot_base64: Optional[str] = None
    auto_probe: Optional[bool] = True
    glitch_category: Optional[str] = "FRONTEND_UNHANDLED_CRASH_WSOD"
    element_point: Optional[str] = "React Component Tree"
    description: Optional[str] = "Automated telemetry capture"

def process_and_diagnose_client_glitch_bg(payload: GlitchTelemetryPayload, current_user_dict: dict):
    """
    Background worker that queries Gemini for authenticated crash faults, logs the 
    AI diagnostics to AI_Command_Logs, saves to Admin Communications, and dispatches email alerts.
    """
    db_gen = get_db()
    logs_db_gen = get_logs_db()
    db = next(db_gen)
    logs_db = next(logs_db_gen)

    try:
        captured_logs = payload.console_logs or []
        if payload.auto_probe and not captured_logs:
            captured_logs.append(f"Runtime telemetry probe active for user {current_user_dict['fnum']} at state: {payload.current_page}")

        network_logs = payload.network_errors or []
        
        ai_diagnosis = "Autonomous diagnosis unavailable (AI bypass or timeout)."
        api_key = os.getenv("GEMINI_API_KEY")
        
        prompt_text = (
            f"Analyze this UI glitch on page '{payload.current_page}'.\n"
            f"User Identity: {current_user_dict['fnum']} ({current_user_dict['name']})\n"
            f"Console: {json.dumps(captured_logs)}\n"
            f"Network: {json.dumps(network_logs)}\n"
            f"User Description: {payload.description}\n\n"
            "Provide a clean, plain-text technical report addressing strictly these 4 points:\n"
            "1. The Glitch: What exactly failed?\n"
            "2. The Location: Where in the UI or codebase is it happening?\n"
            "3. The User: Who experienced this?\n"
            "4. The Remedy: Actionable fix for the development/admin team."
        )
        
        if api_key and (captured_logs or network_logs):
            try:
                client = genai.Client(api_key=api_key)
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt_text,
                    config=types.GenerateContentConfig(
                        system_instruction="You are a strict QA system debugger for law enforcement software. Return only the requested report concisely."
                    )
                )
                ai_diagnosis = response.text if hasattr(response, 'text') else str(response)
            except Exception as ai_err:
                print(f"AI Auto-Diagnosis skipped: {ai_err}")

        # 1. Save to AI Command Logs Table
        LogModel = getattr(models, 'AI_Command_Logs', getattr(models, 'AICommandLogs', None))
        if LogModel:
            new_ai_log = LogModel(
                fnum=current_user_dict['fnum'],
                prompt=f"DIAGNOSTIC FOR {payload.current_page}: {payload.description} | CONSOLE: {json.dumps(captured_logs)}",
                response=ai_diagnosis,
                target_region=current_user_dict.get('region', 'KMP HEADQUARTERS'),
                target_station="KMP HEADQUARTERS"
            )
            db.add(new_ai_log)

        # 2. Assemble the Final Command Dispatch
        glitch_summary = (
            f"<div style='background-color: #fef2f2; border-left: 4px solid #b91c1c; padding: 15px; margin-bottom: 20px;'>"
            f"<h3 style='color: #991b1b; margin-top: 0;'>AUTOMATED TECHNICAL FAULT TELEMETRY</h3>"
            f"<p><strong>Reporting Officer:</strong> {current_user_dict['fnum']} {current_user_dict['rank']} {current_user_dict['name']}</p>"
            f"<p><strong>Category:</strong> {payload.glitch_category}</p>"
            f"<p><strong>Malfunctioning Page:</strong> {payload.current_page}</p>"
            f"<p><strong>Element/Point:</strong> {payload.element_point}</p>"
            f"<p><strong>Description:</strong> {payload.description}</p>"
            f"</div>"
            f"<div style='background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 15px; white-space: pre-wrap;'>"
            f"<h4 style='color: #1e293b; margin-top: 0;'>🤖 AI ROOT-CAUSE ANALYSIS</h4>"
            f"{ai_diagnosis}"
            f"</div>"
            f"<hr/><p style='font-size: 11px; color: #64748b;'><strong>Console Trace:</strong><br/>{json.dumps(captured_logs)}</p>"
        )

        eat_tz = pytz.timezone("Africa/Nairobi")
        uganda_now = datetime.now(eat_tz).replace(tzinfo=None)

        # 3. Identify High Command for targeting
        high_command_users = db.query(models.Users.fnum).filter(
            models.Users.is_approved == True,
            or_(
                models.Users.role.in_(['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN']),
                func.upper(models.Users.position).like('%KMP COMMANDER%'),
                func.upper(models.Users.position).like('%DEPUTY KMP COMMANDER%')
            )
        ).all()
        admin_fnums = [hc[0] for hc in high_command_users if hc[0]]
        target_fnum_val = ",".join(admin_fnums)

        # 4. Save to Admin Communications Table
        CommModel = get_comm_model()
        if CommModel:
            auto_dispatch = CommModel(
                msg_ref=f"UPF/OPS/TECH-GLITCH/{datetime.now().strftime('%Y%m%d%H%M%S')}",
                sender_fnum=current_user_dict['fnum'],
                sender_name=f"{current_user_dict['fnum']}, {current_user_dict['rank']}, {current_user_dict['name']} (SYSTEM TELEMETRY)",
                target_audience="SPECIFIC_USER",
                target_region=current_user_dict['region'],
                target_fnum=target_fnum_val,
                message_type="TECHNICAL_GLITCH_ALERT",
                subject=f"⚠️ TECHNICAL FAULT ISOLATED: {payload.current_page}",
                message=glitch_summary,
                created_at=uganda_now
            )
            db.add(auto_dispatch)
        
        db.commit()

        # 🟢 5. FIX: Automatically send email dispatch to High Command for automated glitch telemetry
        high_command_emails = [
            email[0] for email in db.query(models.Users.email).filter(
                models.Users.is_approved == True,
                models.Users.email.isnot(None),
                models.Users.role != 'REVOKED',
                or_(
                    models.Users.role.in_(['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN']),
                    func.upper(models.Users.position).like('%KMP COMMANDER%'),
                    func.upper(models.Users.position).like('%DEPUTY KMP COMMANDER%')
                )
            ).all() if email[0] and "@" in email[0]
        ]
        
        if high_command_emails:
            email_html = f"""
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #b91c1c; margin-top: 0;">AUTOMATED TECHNICAL FAULT TELEMETRY</h2>
                {glitch_summary}
            </div>
            """
            try:
                asyncio.run(send_command_briefing(
                    high_command_emails,
                    f"⚠️ TECHNICAL FAULT ISOLATED: {payload.current_page}",
                    email_html
                ))
            except Exception as mail_err:
                print(f"❌ Failed to dispatch automated glitch alert email: {mail_err}")

        # 6. Log System Activity
        from routers.activity_logger import log_independent_activity
        log_independent_activity(
            logs_db=logs_db,
            fnum=current_user_dict['fnum'],
            action="DIAGNOSE_GLITCH",
            module="FRONTEND_TELEMETRY",
            details=f"Automated AI crash diagnostic generated for page [{payload.current_page}] and routed to High Command via database and email."
        )

    except Exception as e:
        db.rollback()
        logs_db.rollback()
        print(f"🚨 Background Authenticated Glitch Processor Failed: {str(e)}")
    finally:
        db.close()
        logs_db.close()

@router.post("/communications/diagnose-glitch")
@router.post("/Admin_Communication/diagnose-glitch")
def diagnose_client_glitch(
    payload: GlitchTelemetryPayload,
    background_tasks: BackgroundTasks,
    current_user: models.Users = Depends(get_current_user)
):
    """
    Instantly accepts authenticated fault telemetry and routes the payload to a 
    background AI processor for diagnostics, secure logging, and dispatch.
    """
    try:
        current_user_dict = {
            "fnum": current_user.fnum,
            "rank": current_user.rank or "",
            "name": current_user.name or "",
            "region": current_user.region or ""
        }
        background_tasks.add_task(process_and_diagnose_client_glitch_bg, payload=payload, current_user_dict=current_user_dict)
        
        return {
            "status": "success",
            "diagnostic": {
                "glitch_category": payload.glitch_category,
                "page_name": payload.current_page,
                "element_point": payload.element_point,
                "description": payload.description
            }
        }
    except Exception as e:
        print(f"🚨 Authenticated Telemetry Receiver Failed: {str(e)}")
        return {
            "status": "error",
            "diagnostic": {
                "glitch_category": "Data synchronization failure",
                "page_name": payload.current_page or "Dashboard",
                "element_point": "API / State Controller",
                "description": f"Automated console probe intercepted exception: {str(e)}"
            }
        }

@router.post("/communications")
@router.post("/Admin_Communication")
def create_admin_communication(
    comm: schemas.Admin_CommunicationCreate, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    CommModel = get_comm_model()
    try:
        pos = (getattr(current_user, 'position', None) or "OFFICER").upper().strip()
        stat = (getattr(current_user, 'station', None) or "HQ").upper().strip().replace(" ", "")
        reg = (getattr(current_user, 'region', None) or "KMP").upper().strip().replace(" ", "")

        fnum_val = (current_user.fnum or "").strip()
        rank_val = (current_user.rank or "").strip()
        name_val = (current_user.name or "").strip()
        formatted_sender_name = f"{fnum_val}, {rank_val}, {name_val} ({pos} - {stat})"

        is_glitch_alert = (comm.message_type == "TECHNICAL_GLITCH_ALERT")
        target_fnum_val = comm.target_fnum

        if is_glitch_alert:
            high_command_users = db.query(models.Users.fnum).filter(
                models.Users.is_approved == True,
                or_(
                    models.Users.role.in_(['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN']),
                    func.upper(models.Users.position).like('%KMP COMMANDER%'),
                    func.upper(models.Users.position).like('%DEPUTY KMP COMMANDER%')
                )
            ).all()
            admin_fnums = [hc[0] for hc in high_command_users if hc[0]]
            target_fnum_val = ",".join(admin_fnums)
            comm.target_audience = "SPECIFIC_USER"

        # 🟢 1. Check if any targeted recipient is currently away on leave / delegation
        absence_notices = []
        if comm.target_audience == 'SPECIFIC_USER' and target_fnum_val:
            target_fnums = [f.strip().upper() for f in str(target_fnum_val).split(',') if f.strip()]
            target_users = db.query(models.Users).filter(func.upper(models.Users.fnum).in_(target_fnums)).all()
            for tu in target_users:
                t_perms = tu.permissions or {}
                if isinstance(t_perms, str):
                    try: t_perms = json.loads(t_perms)
                    except: t_perms = {}
                if t_perms.get("manual_delegation"):
                    reason = t_perms.get("absence_reason", "On Official Leave")
                    absence_notices.append(f"Notice: {tu.rank} {tu.name} ({tu.fnum}) is currently away ({reason}). Communication routed to acting delegate.")

        if not is_regional_admin_or_above(current_user) and comm.target_audience in ["ALL_USERS", "RPC_ONLY", "ADMINS_ONLY"]:
            if comm.target_audience not in ["SPECIFIC_REGION", "SPECIFIC_USER"]:
                raise HTTPException(status_code=403, detail="Standard regional officers cannot broadcast universally. Scope restricted to region/station.")

        if pos in ["IGP", "DIGP"]:
            origin_tag = "UPF/HQTRS/GENPOL"
        elif "DIRECTOR OPS" in pos or "DIRECTOR OPERATIONS" in pos:
            origin_tag = "UPF/HQTRS/DIR/OPS"
        elif pos.startswith("DIRECTOR "):
            abbrev = pos.replace("DIRECTOR ", "").strip()
            if abbrev == "LOGISTICS & ENGINEERING": abbrev = "L&E"
            origin_tag = f"UPF/HQTRS/{abbrev}"
        elif reg == "KMP HEADQUARTERS" or stat == "KMP HEADQUARTERS":
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

        if isinstance(target_fnum_val, list):
            target_fnum_val = ",".join(target_fnum_val)

        eat_tz = pytz.timezone("Africa/Nairobi")
        uganda_now = datetime.now(eat_tz).replace(tzinfo=None)

        db_comm = CommModel(
            msg_ref=generated_msg_ref,
            sender_fnum=current_user.fnum, 
            sender_name=formatted_sender_name,
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

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="REGISTER",
            module="COMMAND_COMMS",
            target_id=generated_msg_ref,
            changes_summary=f"{formatted_sender_name} dispatched official command memo ref [{generated_msg_ref}] of type [{comm.message_type}] to audience [{comm.target_audience}]. Subject: '{comm.subject}'."
        )

        if comm.send_email or is_glitch_alert:
            query = db.query(models.Users.email).filter(
                models.Users.email.isnot(None),
                models.Users.is_approved == True,
                models.Users.role != 'REVOKED'
            )
             
            if is_glitch_alert:
                query = query.filter(
                    or_(
                        models.Users.role.in_(['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN']),
                        func.upper(models.Users.position).like('%KMP COMMANDER%'),
                        func.upper(models.Users.position).like('%DEPUTY KMP COMMANDER%')
                    )
                )
            elif comm.target_audience == 'ADMINS_ONLY': 
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
                    <p><strong>Dispatched By:</strong> {formatted_sender_name}</p>
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
        response_payload = {"status": "success", "id": assigned_id, "msg_ref": generated_msg_ref}
        if absence_notices:
            response_payload["absence_advisory"] = " | ".join(absence_notices)
        return response_payload
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to post communication: {str(e)}")

@router.get("/Admin_Communication")
@router.get("/communications")
def get_admin_communications(
    search: Optional[str] = Query(default=None),
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None,
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    CommModel = get_comm_model()
    ReadsModel = get_reads_model()
    read_fnum_col = get_fnum_col(ReadsModel)
     
    query = db.query(CommModel)
    clean_user_fnum = (current_user.fnum or "").strip().upper()
    user_region = (current_user.region or "").strip().upper()
    user_role = (current_user.role or "").strip().upper()

    target_fnums_list = [f.strip().upper() for f in clean_user_fnum.split(',')]
    individual_match_conditions = [CommModel.target_fnum == clean_user_fnum]
    for fnum_item in target_fnums_list:
        if fnum_item:
            individual_match_conditions.append(CommModel.target_fnum.ilike(f"%{fnum_item}%"))

    visibility_conditions = [
        CommModel.sender_fnum == current_user.fnum,
        and_(
            CommModel.target_audience == "SPECIFIC_USER",
            or_(*individual_match_conditions)
        )
    ]

    if check_global_view(current_user):
        visibility_conditions.extend([
            or_(
                CommModel.target_audience == "ALL",
                CommModel.target_audience == "ALL_USERS",
                CommModel.target_audience == "ALL_REGIONS",
                CommModel.target_audience == "ADMINS_ONLY",
                CommModel.target_audience == "RPC_ONLY",
                CommModel.target_audience == "REGIONAL_BROADCAST"
            )
        ])
    else:
        visibility_conditions.extend([
            or_(
                CommModel.target_audience == "ALL",
                CommModel.target_audience == "ALL_USERS",
                CommModel.target_audience == "ALL_REGIONS"
            ),
            and_(
                CommModel.target_audience == "SPECIFIC_REGION", 
                func.upper(CommModel.target_region) == user_region
            ),
            and_(
                CommModel.target_audience == "REGIONAL_BROADCAST",
                func.upper(CommModel.target_region) == user_region
            )
        ])
        if user_role in ["ADMIN", "SYSTEM_ADMIN"]:
            visibility_conditions.append(CommModel.target_audience == "ADMINS_ONLY")
        if user_role in ["RPC", "DEPUTY COMMANDER"]:
            visibility_conditions.append(CommModel.target_audience.in_(["RPC_ONLY", "ADMINS_ONLY"]))

    query = query.filter(or_(*visibility_conditions))

    if search:
        term = f"%{search.strip().upper()}%"
        search_conds = []
        if hasattr(CommModel, 'subject'): search_conds.append(CommModel.subject.ilike(term))
        if hasattr(CommModel, 'message'): search_conds.append(CommModel.message.ilike(term))
        if hasattr(CommModel, 'msg_ref'): search_conds.append(CommModel.msg_ref.ilike(term))
        if hasattr(CommModel, 'sender_name'): search_conds.append(CommModel.sender_name.ilike(term))
        if search_conds:
            query = query.filter(or_(*search_conds))

    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(CommModel.created_at >= start_dt)
        except ValueError:
            pass
             
    if end_date:
        try:
            end_dt = datetime.strptime(f"{end_date} 23:59:59", "%Y-%m-%d %H:%M:%S")
            query = query.filter(CommModel.created_at <= end_dt)
        except ValueError:
            pass  

    comms = query.order_by(CommModel.created_at.desc()).all()
 
    read_records = db.query(ReadsModel.comm_id).filter(
        func.trim(func.upper(read_fnum_col)) == clean_user_fnum
    ).all()
     
    read_comm_ids = {r[0] for r in read_records} 
     
    eat_tz = pytz.timezone("Africa/Nairobi")
    clean_comms = []
     
    user_created_at = getattr(current_user, 'created_at', None)

    for c in comms:
        sender_clean = (c.sender_fnum or "").strip().upper()
        comm_id = getattr(c, 'id', getattr(c, 'sn', 1))
         
        is_older_than_user = False
        if user_created_at and c.created_at and isinstance(c.created_at, datetime):
            msg_dt = c.created_at.replace(tzinfo=None) if c.created_at.tzinfo else c.created_at
            usr_dt = user_created_at.replace(tzinfo=None) if user_created_at.tzinfo else user_created_at
            if msg_dt < usr_dt:
                is_older_than_user = True

        is_read = (comm_id in read_comm_ids) or (sender_clean == clean_user_fnum and comm_id in read_comm_ids)
        if comm_id in read_comm_ids:
            is_read = True
         
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

@router.post("/communications/{comm_id:path}/acknowledge")
@router.post("/Admin_Communication/{comm_id:path}/acknowledge")
def acknowledge_communication(
    comm_id: str, 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    clean_comm_id_str = unquote(unquote(comm_id)).strip()
    clean_comm_id = int(clean_comm_id_str) if clean_comm_id_str.isdigit() else clean_comm_id_str

    ReadsModel = get_reads_model()
    CommModel = get_comm_model()
    read_fnum_col = get_fnum_col(ReadsModel)

    query_filters = [CommModel.id == clean_comm_id]
    if hasattr(CommModel, 'sn'):
        query_filters.append(CommModel.sn == clean_comm_id)

    comm = db.query(CommModel).filter(or_(*query_filters)).first()
    if not comm:
        raise HTTPException(status_code=404, detail="Communication not found.")

    clean_user_fnum = (current_user.fnum or "").strip().upper()

    try:
        existing_read = db.query(ReadsModel).filter(
            ReadsModel.comm_id == clean_comm_id,
            func.trim(func.upper(read_fnum_col)) == clean_user_fnum
        ).first()

        if not existing_read:
            eat_tz = pytz.timezone("Africa/Nairobi")
            uganda_time = datetime.now(eat_tz).replace(tzinfo=None)
             
            new_read = ReadsModel(
                comm_id=clean_comm_id, 
                read_at=uganda_time
            )
             
            if hasattr(ReadsModel, 'fnum'):
                new_read.fnum = clean_user_fnum
            elif hasattr(ReadsModel, 'f_num'):
                new_read.f_num = clean_user_fnum
            elif hasattr(ReadsModel, 'user_fnum'):
                new_read.user_fnum = clean_user_fnum

            db.add(new_read)
            db.commit()

        return {"status": "success", "message": "Receipt safely recorded."}
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record receipt: {str(e)}")

@router.get("/communications/{comm_id:path}/readers")
@router.get("/Admin_Communication/{comm_id:path}/readers")
def get_communication_readers(
    comm_id: str, 
    db: Session = Depends(get_db), 
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    clean_comm_id_str = unquote(unquote(comm_id)).strip()
    clean_comm_id = int(clean_comm_id_str) if clean_comm_id_str.isdigit() else clean_comm_id_str

    CommModel = get_comm_model()
    ReadsModel = get_reads_model()
    read_fnum_col = get_fnum_col(ReadsModel)

    query_filters = [CommModel.id == clean_comm_id]
    if hasattr(CommModel, 'sn'):
        query_filters.append(CommModel.sn == clean_comm_id)

    comm = db.query(CommModel).filter(or_(*query_filters)).first()
    if not comm:
        raise HTTPException(status_code=404, detail="Communication record not found.")

    try:
        readers = db.query(
            ReadsModel.read_at, models.Users.name, models.Users.fnum, models.Users.rank
        ).join(
            models.Users, func.trim(func.upper(read_fnum_col)) == func.trim(func.upper(models.Users.fnum))
        ).filter(ReadsModel.comm_id == clean_comm_id).order_by(ReadsModel.read_at.desc()).all()

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

class BulkAcknowledgePayload(BaseModel):
    comm_ids: List[int]

@router.post("/communications/acknowledge-bulk")
@router.post("/Admin_Communication/acknowledge-bulk")
def acknowledge_bulk_communications(
    payload: BulkAcknowledgePayload,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    ReadsModel = get_reads_model()
    read_fnum_col = get_fnum_col(ReadsModel)
    clean_user_fnum = (current_user.fnum or "").strip().upper()
    eat_tz = pytz.timezone("Africa/Nairobi")
    uganda_time = datetime.now(eat_tz).replace(tzinfo=None)

    existing = db.query(ReadsModel.comm_id).filter(
        ReadsModel.comm_id.in_(payload.comm_ids),
        func.trim(func.upper(read_fnum_col)) == clean_user_fnum
    ).all()
    existing_ids = {r[0] for r in existing}

    to_insert = set(payload.comm_ids) - existing_ids
    if not to_insert:
        return {"status": "success"}

    new_reads = []
    for cid in to_insert:
        new_read = ReadsModel(comm_id=cid, read_at=uganda_time)
        if hasattr(ReadsModel, 'fnum'): new_read.fnum = clean_user_fnum
        elif hasattr(ReadsModel, 'f_num'): new_read.f_num = clean_user_fnum
        elif hasattr(ReadsModel, 'user_fnum'): new_read.user_fnum = clean_user_fnum
        new_reads.append(new_read)

    try:
        db.bulk_save_objects(new_reads)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/communications/acknowledge-all")
@router.post("/Admin_Communication/acknowledge-all")
def acknowledge_all_communications(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    ReadsModel = get_reads_model()
    CommModel = get_comm_model()
    read_fnum_col = get_fnum_col(ReadsModel)
    clean_user_fnum = (current_user.fnum or "").strip().upper()
    eat_tz = pytz.timezone("Africa/Nairobi")
    uganda_time = datetime.now(eat_tz).replace(tzinfo=None)

    query = db.query(CommModel.id)
    user_region = (current_user.region or "").strip().upper()
    user_role = (current_user.role or "").strip().upper()

    if not check_global_view(current_user):
        target_fnums_list = [f.strip().upper() for f in clean_user_fnum.split(',')]
        individual_match_conditions = [CommModel.target_fnum == clean_user_fnum]
        for fnum_item in target_fnums_list:
            if fnum_item:
                individual_match_conditions.append(CommModel.target_fnum.ilike(f"%{fnum_item}%"))

        visibility_conditions = [
            or_(
                CommModel.target_audience == "ALL",
                CommModel.target_audience == "ALL_USERS",
                CommModel.target_audience == "ALL_REGIONS"
            ),
            CommModel.sender_fnum == current_user.fnum,
            and_(CommModel.target_audience == "SPECIFIC_USER", or_(*individual_match_conditions)),
            and_(CommModel.target_audience == "SPECIFIC_REGION", func.upper(CommModel.target_region) == user_region),
            and_(CommModel.target_audience == "REGIONAL_BROADCAST", func.upper(CommModel.target_region) == user_region)
        ]
        if user_role in ["ADMIN", "SYSTEM_ADMIN"]: visibility_conditions.append(CommModel.target_audience == "ADMINS_ONLY")
        if user_role in ["RPC", "DEPUTY COMMANDER"]: visibility_conditions.append(CommModel.target_audience.in_(["RPC_ONLY", "ADMINS_ONLY"]))
        query = query.filter(or_(*visibility_conditions))

    all_comm_ids = {c[0] for c in query.all()}
    read_comm_ids = {r[0] for r in db.query(ReadsModel.comm_id).filter(func.trim(func.upper(read_fnum_col)) == clean_user_fnum).all()}
     
    unread_ids = all_comm_ids - read_comm_ids
    if not unread_ids:
        return {"status": "success", "message": "All caught up."}

    new_reads = []
    for cid in unread_ids:
        new_read = ReadsModel(comm_id=cid, read_at=uganda_time)
        if hasattr(ReadsModel, 'fnum'): new_read.fnum = clean_user_fnum
        elif hasattr(ReadsModel, 'f_num'): new_read.f_num = clean_user_fnum
        elif hasattr(ReadsModel, 'user_fnum'): new_read.user_fnum = clean_user_fnum
        new_reads.append(new_read)

    try:
        db.bulk_save_objects(new_reads)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        logs_db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/communications/ping-unread")
@router.get("/Admin_Communication/ping-unread")
def ping_unread_communications(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    CommModel = get_comm_model()
    ReadsModel = get_reads_model()
    read_fnum_col = get_fnum_col(ReadsModel)
     
    query = db.query(CommModel.id, CommModel.sender_fnum, CommModel.created_at, CommModel.target_audience, CommModel.target_fnum)
    clean_user_fnum = (current_user.fnum or "").strip().upper()
    user_region = (current_user.region or "").strip().upper()
    user_role = (current_user.role or "").strip().upper()

    target_fnums_list = [f.strip().upper() for f in clean_user_fnum.split(',')]
    individual_match_conditions = [CommModel.target_fnum == clean_user_fnum]
    for fnum_item in target_fnums_list:
        if fnum_item:
            individual_match_conditions.append(CommModel.target_fnum.ilike(f"%{fnum_item}%"))

    visibility_conditions = [
        CommModel.sender_fnum == current_user.fnum,
        and_(
            CommModel.target_audience == "SPECIFIC_USER",
            or_(*individual_match_conditions)
        )
    ]

    if check_global_view(current_user):
        visibility_conditions.append(
            or_(
                CommModel.target_audience == "ALL",
                CommModel.target_audience == "ALL_USERS",
                CommModel.target_audience == "ALL_REGIONS",
                CommModel.target_audience == "ADMINS_ONLY",
                CommModel.target_audience == "RPC_ONLY",
                CommModel.target_audience == "REGIONAL_BROADCAST"
            )
        )
    else:
        visibility_conditions.extend([
            or_(
                CommModel.target_audience == "ALL",
                CommModel.target_audience == "ALL_USERS",
                CommModel.target_audience == "ALL_REGIONS"
            ),
            and_(
                CommModel.target_audience == "SPECIFIC_REGION", 
                func.upper(CommModel.target_region) == user_region
            ),
            and_(
                CommModel.target_audience == "REGIONAL_BROADCAST",
                func.upper(CommModel.target_region) == user_region
            )
        ])
        if user_role in ["ADMIN", "SYSTEM_ADMIN"]:
            visibility_conditions.append(CommModel.target_audience == "ADMINS_ONLY")
        if user_role in ["RPC", "DEPUTY COMMANDER"]:
            visibility_conditions.append(CommModel.target_audience.in_(["RPC_ONLY", "ADMINS_ONLY"]))

    query = query.filter(or_(*visibility_conditions))

    comms = query.order_by(CommModel.created_at.desc()).limit(50).all()
     
    read_records = db.query(ReadsModel.comm_id).filter(func.trim(func.upper(read_fnum_col)) == clean_user_fnum).all()
    read_comm_ids = {r[0] for r in read_records} 
     
    has_unread = False
    user_created_at = getattr(current_user, 'created_at', None)

    for c_id, c_sender, c_created, c_audience, c_target_fnum in comms:
        if c_id in read_comm_ids:
            continue
        
        if user_created_at and c_created and isinstance(c_created, datetime):
            msg_dt = c_created.replace(tzinfo=None) if c_created.tzinfo else c_created
            usr_dt = user_created_at.replace(tzinfo=None) if user_created_at.tzinfo else user_created_at
            if msg_dt < usr_dt:
                continue

        if (c_sender or "").strip().upper() == clean_user_fnum:
            continue
         
        has_unread = True
        break

    return {"absence_advisory": None, "hasUnread": has_unread}