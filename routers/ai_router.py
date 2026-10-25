# routers/ai_router.py
import os
import json
import re
import time
import traceback
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect, func, or_
from google import genai
from google.genai import types
from typing import Optional

from app.database import get_db, get_logs_db, engine
from app import models
from auth import get_current_user
from routers.activity_logger import record_neon_activity

try:
    from embedding_service import get_embedding_vector
except ImportError:
    from app.embedding_service import get_embedding_vector

router = APIRouter(prefix="/api/v1/ai", tags=["Tactical AI Console"])

class QueryPayload(BaseModel):
    prompt: str
    target_region: str = "ALL REGIONS"
    target_station: str = "ALL STATIONS"

class PublicQueryPayload(BaseModel):
    prompt: str

class DiagnosisVerificationPayload(BaseModel):
    glitch_category: str
    page_name: str
    element_point: str
    description: str
    console_logs: list[str] = []
    network_errors: list[str] = []

def is_db_query_globally_enabled(user, db: Session) -> bool:
    role = (user.role or "").upper()
    if role in ["SUPER_ADMIN", "ASSISTANT_SUPER_ADMIN"]:
        return True

    ConfigModel = getattr(models, 'SystemConfig', None)
    if not ConfigModel:
        return True 
    config = db.query(ConfigModel).filter(ConfigModel.config_key == "ai_database_query_enabled").first()
    
    if config and str(config.config_value).lower() == "false":
        return False
        
    return True

def check_ai_db_query_clearance(user) -> bool:
    role = (user.role or "").upper()
    if role in ["SUPER_ADMIN", "ASSISTANT_SUPER_ADMIN"]:
        return True

    perms = user.permissions or {}
    if isinstance(perms, str):
        try:
            perms = json.loads(perms)
        except Exception:
            perms = {}

    is_super_tier = role == "ADMIN"
    has_delegated_power = perms.get("can_approve") is True or perms.get("system_admin") is True or perms.get("ai_hr_access") is True
    
    return is_super_tier or has_delegated_power

@router.post("/admin/toggle-db-query")
async def toggle_ai_database_queries(
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    role = (current_user.role or "").upper()
    if role not in ["SUPER_ADMIN", "ASSISTANT_SUPER_ADMIN", "ADMIN"]:
        perms = current_user.permissions or {}
        if isinstance(perms, str):
            try: perms = json.loads(perms)
            except Exception: perms = {}
        has_delegated_power = perms.get("can_approve") is True or perms.get("system_admin") is True or perms.get("ai_hr_access") is True
        if not has_delegated_power:
            raise HTTPException(status_code=403, detail="Clearance Denied: Super Admin, Assistant Super Admin, or delegated authorization required to toggle the global AI kill switch.")
    
    ConfigModel = getattr(models, 'SystemConfig', None)
    if not ConfigModel:
        raise HTTPException(status_code=500, detail="SystemConfig model is not initialized.")
        
    config = db.query(ConfigModel).filter(ConfigModel.config_key == "ai_database_query_enabled").first()
    
    current_state = True
    if config:
        current_state = str(config.config_value).lower() == "true"
        new_state_str = "false" if current_state else "true"
        config.config_value = new_state_str
    else:
        new_state_str = "false"
        new_config = ConfigModel(config_key="ai_database_query_enabled", config_value=new_state_str)
        db.add(new_config)
        
    db.commit()
    new_bool_state = new_state_str == "true"

    record_neon_activity(
        logs_db=logs_db,
        fnum=current_user.fnum,
        action_type="UPDATE",
        module="TACTICAL_AI",
        target_id="AI_DATABASE_KILLSWITCH",
        changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} toggled AI Database Querying kill-switch to: {new_state_str.upper()}."
    )
    
    return {
        "status": "success", 
        "ai_database_query_enabled": new_bool_state,
        "message": f"AI Database Querying has been {'ENABLED' if new_bool_state else 'DISABLED (Navigation & Docs Only for standard users)'}."
    }

def check_diagnostic_clearance(user) -> bool:
    role = (user.role or "").strip().upper()
    pos = (user.position or "").strip().upper()
    return (
        role in ["SUPER_ADMIN", "ASSISTANT_SUPER_ADMIN"] or
        "KMP COMMANDER" in pos or
        "DEPUTY KMP COMMANDER" in pos
    )

@router.post("/verify-diagnosis")
async def verify_client_diagnosis(
    payload: DiagnosisVerificationPayload,
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    if not check_diagnostic_clearance(current_user):
        raise HTTPException(
            status_code=403, 
            detail="Clearance Denied: Technical glitch diagnostics and AI verification audits are strictly restricted to Super Admins, Assistant Super Admins, KMP Commanders, and Deputy KMP Commanders."
        )

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="GEMINI_API_KEY is missing from the server environment.")

    try:
        client = genai.Client(api_key=api_key, http_options={'api_version': 'v1'})
        verification_prompt = f"""
        You are an expert system auditor and QA debugger for the Kampala Metropolitan Police (KMP) Data Management System.
        Verify the following technical glitch diagnosis submitted by officer {current_user.fnum} {current_user.rank} {current_user.name} against the provided raw telemetry logs.

        SUBMITTED DIAGNOSIS:
        - Category: {payload.glitch_category}
        - Page: {payload.page_name}
        - Element: {payload.element_point}
        - Description: {payload.description}

        RAW TELEMETRY:
        - Console Logs: {json.dumps(payload.console_logs)}
        - Network Errors: {json.dumps(payload.network_errors)}

        Provide a rigorous verification report indicating:
        1. Assessment (VALID, PLAUSIBLE, or FALSE POSITIVE).
        2. Technical reasoning based on the logs.
        3. Recommended corrective actions for system administrators.
        """

        # 🟢 Expanded fallback chain for API compatibility
        candidate_models = [
            'gemini-3.5-flash',
            'gemini-3.1-flash-lite',
            'gemini-2.5-flash'
        ]
        response = None
        last_exception = None

        for m in candidate_models:
            try:
                response = client.models.generate_content(
                    model=m,
                    contents=verification_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction="You are a strict technical auditor for law enforcement IT infrastructure. Be concise, precise, and professional."
                    )
                )
                if response:
                    break
            except Exception as mod_err:
                last_exception = mod_err
                continue

        if not response:
            raise Exception(f"All AI audit models busy: {str(last_exception)}")

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="VERIFY",
            module="TACTICAL_AI",
            target_id="GLITCH_VERIFICATION",
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} audited technical glitch diagnosis on page [{payload.page_name}]."
        )

        return {
            "status": "success",
            "verification_report": response.text if hasattr(response, 'text') else str(response)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Diagnosis Verification Failed: {str(e)}")

@router.post("/public-query")
async def process_public_tactical_query(
    payload: PublicQueryPayload, 
    db: Session = Depends(get_db)
):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="GEMINI_API_KEY is missing from the server environment.")

    try:
        client = genai.Client(api_key=api_key, http_options={'api_version': 'v1'})
        
        system_rules = (
            "You are the public-facing Kampala Metropolitan Police (KMP) System Navigation and Support Assistant. "
            "Your role is strictly limited to helping users navigate the login/signup portal, "
            "explaining system features, guiding them through password reset requests, account approval workflows, and answering questions about platform usage.\n\n"
            "CRITICAL SECURITY RESTRICTION: You have NO access to live operational data, crime records, cell detentions, case files, or personnel nominal rolls. "
            "Never hallucinate or provide live database metrics. Keep answers concise, helpful, and professional."
        )

        retrieved_docs = ""
        try:
            prompt_vector = get_embedding_vector(payload.prompt)
            vector_str = str(prompt_vector)
            search_query = text("SELECT title, content FROM operational_document_embeddings ORDER BY embedding <=> CAST(:vector AS vector) LIMIT 3")
            results = db.execute(search_query, {"vector": vector_str}).fetchall()
            
            if results:
                retrieved_docs = "SYSTEM DOCUMENTATION & USER GUIDES:\n"
                for row in results:
                    clean_content = str(row.content).replace("<", "&lt;").replace(">", "&gt;")
                    retrieved_docs += f"--- [{row.title}] ---\n{clean_content}\n"
        except Exception as embed_err:
            db.rollback() 
            print(f"Public vector search notice: {embed_err}")

        public_context = (
            f"{retrieved_docs}\n\n"
            f"VISITOR QUERY: {payload.prompt}"
        )

        # 🟢 Expanded fallback chain for API compatibility
        candidate_models = [
            'gemini-3.5-flash',
            'gemini-3.1-flash-lite',
            'gemini-2.5-flash'
        ]
        response = None
        used_model = None
        last_exception = None

        for m in candidate_models:
            success = False
            for attempt in range(2):
                try:
                    response = client.models.generate_content(
                        model=m,
                        contents=public_context,
                        config=types.GenerateContentConfig(system_instruction=system_rules)
                    )
                    used_model = m
                    success = True
                    break
                except Exception as mod_err:
                    last_exception = mod_err
                    time.sleep(1.5 * (attempt + 1))
            if success:
                break
            time.sleep(0.5)

        if not response:
            raise Exception(f"All Google AI servers are temporarily busy. Details: {str(last_exception)}")

        return {
            "response": response.text if hasattr(response, 'text') else str(response),
            "metadata": {
                "database_query_status": "Public / Restricted to System Docs Only",
                "ai_model_used": used_model
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Public Assistant Error: {str(e)}")

@router.post("/query")
async def process_tactical_query(
    prompt: str = Form(...),
    target_region: str = Form("ALL REGIONS"),
    target_station: str = Form("ALL STATIONS"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    logs_db: Session = Depends(get_logs_db),
    current_user: models.Users = Depends(get_current_user)
):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="GEMINI_API_KEY is missing from the server environment.")

    try:
        client = genai.Client(api_key=api_key, http_options={'api_version': 'v1'})
        
        user_role_upper = (current_user.role or "").upper()
        is_top_admin = user_role_upper in ["SUPER_ADMIN", "ASSISTANT_SUPER_ADMIN"]
        db_queries_allowed = is_db_query_globally_enabled(current_user, db)
        can_run_db_query = check_ai_db_query_clearance(current_user)
        user_station_val = str(current_user.station).strip().upper() if current_user.station else "HQ"

        user_perms = current_user.permissions or {}
        if isinstance(user_perms, str):
            try: user_perms = json.loads(user_perms)
            except Exception: user_perms = {}
                
        has_ai_hr_access = is_top_admin or user_role_upper in ['ADMIN'] or user_perms.get('ai_hr_access') is True or user_perms.get('can_approve') is True
        user_tier_scope = f"Station Scope: Station {current_user.station}, Region {current_user.region}"

        live_data_context = "LIVE OPERATIONAL DATABASE EXTRACTS:\n"
        records_scanned = 0
        diagnostic_errors = [] # 🟢 Track exact failing SQL queries

        if db_queries_allowed and can_run_db_query:
            
            # 1. Agricultural Crimes
            try:
                AgricModel = getattr(models, 'Agricultural_Crime_Summary', getattr(models, 'AgriculturalCrimeSummary', getattr(models, 'AgricCrimesStatistics', None)))
                if AgricModel:
                    q = db.query(AgricModel)
                    if not is_top_admin and hasattr(AgricModel, 'station'): q = q.filter(func.upper(AgricModel.station) == user_station_val)
                    recs = q.limit(20).all()
                    if recs:
                        live_data_context += "- Agricultural/Produce Crimes:\n"
                        for r in recs:
                            live_data_context += f"  * [{getattr(r, 'region', 'KMP')} / {getattr(r, 'station', 'HQ')}] {getattr(r, 'agric_crime_report', 'N/A')}: Stolen={getattr(r, 'number_count', 0)}, Rec={getattr(r, 'recoveries', 0)}\n"
                        records_scanned += len(recs)
            except Exception as e:
                db.rollback()
                diagnostic_errors.append(f"Agric Table: {str(e)}")

            # 2. Operational Statistics
            try:
                StatsModel = getattr(models, 'Operational_Statistics', getattr(models, 'OperationalStatistics', None))
                if StatsModel:
                    q = db.query(StatsModel)
                    if not is_top_admin and hasattr(StatsModel, 'station'): q = q.filter(func.upper(StatsModel.station) == user_station_val)
                    recs = q.limit(20).all()
                    if recs:
                        live_data_context += "- Disruptive OPS:\n"
                        for r in recs:
                            live_data_context += f"  * [{getattr(r, 'region', 'KMP')} / {getattr(r, 'station', 'HQ')}] Date: {getattr(r, 'date', 'N/A')} | Arr={getattr(r, 'arrested', 0)}, Rem={getattr(r, 'remanded', 0)}, Conv={getattr(r, 'convicted', 0)}\n"
                        records_scanned += len(recs)
            except Exception as e:
                db.rollback()
                diagnostic_errors.append(f"Stats Table: {str(e)}")

            # 3. Exhibits
            try:
                ExhibitsModel = getattr(models, 'Exhibits', getattr(models, 'ImpoundedExhibits', None))
                if ExhibitsModel:
                    q = db.query(ExhibitsModel)
                    if not is_top_admin and hasattr(ExhibitsModel, 'station'): q = q.filter(func.upper(ExhibitsModel.station) == user_station_val)
                    recs = q.limit(20).all()
                    if recs:
                        live_data_context += "- Impounded Exhibits:\n"
                        for r in recs:
                            live_data_context += f"  * [{getattr(r, 'region', 'KMP')} / {getattr(r, 'station', 'HQ')}] Reg: {getattr(r, 'reg_no', 'N/A')} | Desc: {getattr(r, 'type_make', getattr(r, 'category', 'N/A'))} | Status: {getattr(r, 'status', 'UNKNOWN')}\n"
                        records_scanned += len(recs)
            except Exception as e:
                db.rollback()
                diagnostic_errors.append(f"Exhibits Table: {str(e)}")

            # 4. Lockups / Suspect Lockup Matrix
            try:
                LockupModel = getattr(models, 'Lockup_Matrix', getattr(models, 'LockupMatrix', getattr(models, 'SuspectLockup', None)))
                if LockupModel:
                    q = db.query(LockupModel)
                    if not is_top_admin and hasattr(LockupModel, 'station'): q = q.filter(func.upper(LockupModel.station) == user_station_val)
                    recs = q.limit(20).all()
                    if recs:
                        live_data_context += "- Lock-up Matrix:\n"
                        for r in recs:
                            live_data_context += f"  * [{getattr(r, 'region', 'KMP')} / {getattr(r, 'station', 'HQ')}] Total: {getattr(r, 'suspects', 0)} | M: {getattr(r, 'male_count', 0)} F: {getattr(r, 'female_count', 0)} | >3 Days: {getattr(r, 'detention_3days_over', 0)}\n"
                        records_scanned += len(recs)
            except Exception as e:
                db.rollback()
                diagnostic_errors.append(f"Lockup Table: {str(e)}")

            # 5. Accidents
            try:
                AccidentsModel = getattr(models, 'Accidents_Statistics', getattr(models, 'AccidentsStatistics', None))
                if AccidentsModel:
                    q = db.query(AccidentsModel)
                    if not is_top_admin and hasattr(AccidentsModel, 'station'): q = q.filter(func.upper(AccidentsModel.station) == user_station_val)
                    recs = q.limit(20).all()
                    if recs:
                        live_data_context += "- Traffic Accidents:\n"
                        for r in recs:
                            live_data_context += f"  * [{getattr(r, 'region', 'KMP')} / {getattr(r, 'station', 'HQ')}] Minor: {getattr(r, 'minor', 0)}, Serious: {getattr(r, 'serious', 0)}, Fatal: {getattr(r, 'fatal', 0)}, Victims: {getattr(r, 'victims', 0)}\n"
                        records_scanned += len(recs)
            except Exception as e:
                db.rollback()
                diagnostic_errors.append(f"Accidents Table: {str(e)}")

            # 6. Crime Reports (Fire Outbreaks)
            try:
                CrimeReportsModel = getattr(models, 'Crime_Reports', getattr(models, 'CrimeReports', None))
                if CrimeReportsModel:
                    fire_keywords = ["fire", "arson", "burnt", "flames", "inferno", "scorch"]
                    if hasattr(CrimeReportsModel, 'narrative') and hasattr(CrimeReportsModel, 'offence'):
                        fire_conds = [or_(CrimeReportsModel.narrative.ilike(f"%{kw}%"), CrimeReportsModel.offence.ilike(f"%{kw}%")) for kw in fire_keywords]
                        q = db.query(CrimeReportsModel).filter(or_(*fire_conds))
                        if not is_top_admin and hasattr(CrimeReportsModel, 'station'): q = q.filter(func.upper(CrimeReportsModel.station) == user_station_val)
                        recs = q.limit(20).all()
                        if recs:
                            live_data_context += "- Fire/Arson Records:\n"
                            for r in recs:
                                live_data_context += f"  * [{getattr(r, 'region', 'KMP')} / {getattr(r, 'station', 'HQ')}] Offence: {getattr(r, 'offence', 'FIRE')} | {str(getattr(r, 'narrative', ''))[:120]}...\n"
                            records_scanned += len(recs)
            except Exception as e:
                db.rollback()
                diagnostic_errors.append(f"CrimeReports Table: {str(e)}")

            # 7. HR / Nominal Roll
            try:
                if has_ai_hr_access:
                    HrModel = getattr(models, 'Nominal_Roll', getattr(models, 'NominalRoll', getattr(models, 'Users', getattr(models, 'User', None))))
                    if HrModel:
                        hr_sample_query = db.query(HrModel)
                        if not is_top_admin and hasattr(HrModel, 'station'):
                            hr_sample_query = hr_sample_query.filter(func.upper(HrModel.station) == user_station_val)
                        
                        stop_words = {"what", "is", "the", "for", "who", "where", "tell", "me", "about", "find", "search", "officer", "stationed", "details", "give", "show", "can", "you", "of", "in", "on", "at", "and", "a", "an", "how", "many", "does", "have", "age", "unit", "rank", "sex", "name"}
                        raw_words = re.findall(r'\b\w+\b', prompt.lower())
                        search_terms = [w for w in raw_words if w not in stop_words and len(w) > 2]
                        
                        if search_terms:
                            search_conditions = []
                            for term in search_terms:
                                term_cond = []
                                if hasattr(HrModel, 'name'): term_cond.append(HrModel.name.ilike(f"%{term}%"))
                                if hasattr(HrModel, 'f_num'): term_cond.append(HrModel.f_num.ilike(f"%{term}%"))
                                elif hasattr(HrModel, 'fnum'): term_cond.append(HrModel.fnum.ilike(f"%{term}%"))
                                elif hasattr(HrModel, 'fNum'): term_cond.append(HrModel.fNum.ilike(f"%{term}%"))
                                if hasattr(HrModel, 'ipps'): term_cond.append(HrModel.ipps.ilike(f"%{term}%"))
                                if hasattr(HrModel, 'station'): term_cond.append(HrModel.station.ilike(f"%{term}%"))
                                if term_cond: search_conditions.append(or_(*term_cond))
                            if search_conditions:
                                hr_sample_query = hr_sample_query.filter(or_(*search_conditions))

                        recs = hr_sample_query.limit(30).all()
                        if recs:
                            live_data_context += "- Nominal Roll Personnel Directory:\n"
                            for r in recs:
                                live_data_context += f"  * Force No: {getattr(r, 'f_num', getattr(r, 'fnum', getattr(r, 'fNum', 'N/A')))} | Rank: {getattr(r, 'rank', 'N/A')} | Name: {getattr(r, 'name', 'N/A')} | Sex: {getattr(r, 'sex', 'N/A')} | IPPS: {getattr(r, 'ipps', 'N/A')} | Unit: {getattr(r, 'station', getattr(r, 'region', 'N/A'))}\n"
                            records_scanned += len(recs)
            except Exception as e:
                db.rollback()
                diagnostic_errors.append(f"HR/Users Table: {str(e)}")

            # 8. Command Compliance & Defaulters Ledger
            try:
                ComplianceModel = getattr(models, 'Daily_Compliance_Tracker', getattr(models, 'DailyComplianceTracker', None))
                if ComplianceModel:
                    q = db.query(ComplianceModel)
                    if not is_top_admin and hasattr(ComplianceModel, 'station'): 
                        q = q.filter(func.upper(ComplianceModel.station) == user_station_val)
                    
                    recs = q.limit(20).all()
                    if recs:
                        live_data_context += "- Compliance & Defaulters Ledger:\n"
                        for r in recs:
                            live_data_context += f"  * [{getattr(r, 'region', 'KMP')} / {getattr(r, 'station', 'HQ')}] Date: {getattr(r, 'date', 'N/A')} | Status: {getattr(r, 'status', 'UNKNOWN')} | Resolved By: {getattr(r, 'resolved_by', 'NONE')}\n"
                        records_scanned += len(recs)
            except Exception as e:
                db.rollback()
                diagnostic_errors.append(f"Compliance Table: {str(e)}")

        else:
            live_data_context = "🛑 System Note: Direct database querying for the AI is either globally disabled or restricted by your command clearance tier."

        system_rules = (
            "You are the Kampala Metropolitan Police (KMP) Tactical AI Assistant. "
            f"CRITICAL PROTOCOL: Address the user using their full official credential: {current_user.fnum} {current_user.rank} {current_user.name}. "
            "Maintain a highly professional, concise, law-enforcement tone.\n\n"
            "SECURITY PROTOCOL: You are strictly forbidden from processing or hallucinating sensitive PII. "
            "You only have access to the OPSEC-cleared columns: Force Number, Rank, Name, Age, Sex, IPPS, and Unit.\n\n"
            "CAPABILITIES: You can answer direct operational questions using live database extracts, guide users through system navigation, answer platform policy questions, analyze uploaded photos/screenshots, and search uploaded command files."
        )

        retrieved_docs = ""
        try:
            prompt_vector = get_embedding_vector(prompt)
            vector_str = str(prompt_vector)
            
            search_query = text("SELECT title, content, region, station FROM operational_document_embeddings ORDER BY embedding <=> CAST(:vector AS vector) LIMIT 3")
            results = db.execute(search_query, {"vector": vector_str}).fetchall()
            
            if results:
                retrieved_docs = "UPLOADED DOCUMENT INTELLIGENCE:\n"
                for row in results:
                    clean_content = str(row.content).replace("<", "&lt;").replace(">", "&gt;")
                    retrieved_docs += f"--- [{row.title} | {row.region}/{row.station}] ---\n{clean_content}\n"
        except Exception as embed_err:
            db.rollback()
            diagnostic_errors.append(f"Vector Database Search Error: {str(embed_err)}")

        tactical_context = (
            f"Executing Officer: {current_user.fnum} {current_user.rank} {current_user.name}\n"
            f"User Security Tier: {user_tier_scope}\n\n"
            f"{live_data_context}\n\n"
            f"{retrieved_docs}\n\n"
            f"USER QUERY: {prompt}"
        )

        contents = [tactical_context]
        if file:
            image_bytes = await file.read()
            contents.append(
                types.Part.from_bytes(
                    data=image_bytes,
                    mime_type=file.content_type
                )
            )

        # 🟢 Expanded fallback chain for API compatibility
        candidate_models = [
            'gemini-3.5-flash',
            'gemini-3.1-flash-lite',
            'gemini-2.5-flash'
        ]
        response = None
        used_model = None
        last_exception = None

        for m in candidate_models:
            success = False
            for attempt in range(2):
                try:
                    response = client.models.generate_content(
                        model=m,
                        contents=contents,
                        config=types.GenerateContentConfig(system_instruction=system_rules)
                    )
                    used_model = m
                    success = True
                    break
                except Exception as mod_err:
                    last_exception = mod_err
                    time.sleep(1.5 * (attempt + 1))
            if success:
                break
            time.sleep(0.5)

        if not response:
            raise Exception(f"All Google AI servers are temporarily busy. Details: {str(last_exception)}")

        try:
            LogModel = getattr(models, 'AI_Command_Logs', getattr(models, 'AICommandLogs', None))
            if LogModel:
                new_ai_log = LogModel(
                    fnum=str(current_user.fnum or "UNKNOWN"),
                    prompt=str(prompt),
                    response=str(response.text if hasattr(response, 'text') else response),
                    target_region=str(target_region or current_user.region or "ALL REGIONS"),
                    target_station=str(target_station or current_user.station or "ALL STATIONS")
                )
                db.add(new_ai_log)
                db.commit()
        except Exception as db_err:
            db.rollback()

        record_neon_activity(
            logs_db=logs_db,
            fnum=current_user.fnum,
            action_type="REGISTER",
            module="TACTICAL_AI",
            target_id="AI_QUERY",
            changes_summary=f"{current_user.fnum} {current_user.rank} {current_user.name} submitted Tactical AI query prompt: \"{prompt}\"."
        )

        return {
            "response": response.text if hasattr(response, 'text') else str(response),
            "metadata": {
                "database_query_status": "Active" if (db_queries_allowed and can_run_db_query) else "Restricted / Disabled",
                "jurisdiction_tier": user_tier_scope,
                "structured_records_count": records_scanned,
                "ai_model_used": used_model,
                "diagnostic_errors": diagnostic_errors  
            }
        }

    except Exception as e:
        tracecode = traceback.format_exc()
        print(tracecode)
        raise HTTPException(status_code=500, detail=f"Google API Connectivity Issue: {str(e)}")

# ====================================================================
# CRASH TELEMETRY & BACKGROUND PROCESSING
# ====================================================================
class CrashTelemetryPayload(BaseModel):
    glitch_category: str
    page_name: str
    element_point: str
    description: str
    console_logs: list[str] = []
    network_errors: list[str] = []

def process_and_diagnose_crash_bg(payload: CrashTelemetryPayload, fnum_val: str):
    """
    Background worker that opens fresh DB sessions, queries Gemini for a root-cause 
    analysis, logs the AI interaction, and dispatches the enriched diagnostic memo.
    """
    db_gen = get_db()
    logs_db_gen = get_logs_db()
    db = next(db_gen)
    logs_db = next(logs_db_gen)
    
    try:
        # 1. Identify User Details
        UserModel = getattr(models, 'Users', getattr(models, 'User', None))
        user_name = "Unknown Officer"
        if UserModel and fnum_val != "PUBLIC_VISITOR":
            user_record = db.query(UserModel).filter(func.trim(func.upper(UserModel.fnum)) == fnum_val.strip().upper()).first()
            if user_record:
                user_name = f"{user_record.rank or ''} {user_record.name or ''}".strip()

        # 2. AI Diagnosis Generation
        api_key = os.getenv("GEMINI_API_KEY")
        ai_diagnosis = "AI diagnostics unavailable (API Key missing or timeout)."
        prompt = (
            f"Analyze this KMP frontend system crash.\n"
            f"User: {fnum_val} ({user_name})\n"
            f"Page: {payload.page_name} | Element: {payload.element_point}\n"
            f"User Description: {payload.description}\n"
            f"Console Logs: {json.dumps(payload.console_logs)}\n"
            f"Network Errors: {json.dumps(payload.network_errors)}\n\n"
            "Provide a clean, plain-text technical report addressing strictly these 4 points:\n"
            "1. The Glitch: What exactly failed?\n"
            "2. The Location: Where in the UI or codebase is it happening?\n"
            "3. The User: Who experienced this?\n"
            "4. The Remedy: Actionable fix for the development/admin team."
        )
        
        if api_key and (payload.console_logs or payload.network_errors):
            try:
                client = genai.Client(api_key=api_key, http_options={'api_version': 'v1'})
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction="You are the KMP System Diagnostic AI. Return only the requested report concisely."
                    )
                )
                ai_diagnosis = response.text if hasattr(response, 'text') else str(response)
            except Exception as ai_err:
                print(f"AI Auto-Diagnosis failed: {ai_err}")

        # 3. 🟢 NEW: Save to AI Command Logs Table First
        LogModel = getattr(models, 'AI_Command_Logs', getattr(models, 'AICommandLogs', None))
        if LogModel:
            new_ai_log = LogModel(
                fnum=fnum_val,
                prompt=f"CRASH DIAGNOSTIC FOR {payload.page_name}: {payload.description} | CONSOLE: {json.dumps(payload.console_logs)}",
                response=ai_diagnosis,
                target_region="KMP HEADQUARTERS",
                target_station="KMP HEADQUARTERS"
            )
            db.add(new_ai_log)

        # 4. Assemble the Final Command Dispatch
        glitch_summary = (
            f"<div style='background-color: #fef2f2; border-left: 4px solid #b91c1c; padding: 15px; margin-bottom: 20px;'>"
            f"<h3 style='color: #991b1b; margin-top: 0;'>SYSTEM CRASH TELEMETRY</h3>"
            f"<p><strong>Category:</strong> {payload.glitch_category}</p>"
            f"<p><strong>Page Location:</strong> {payload.page_name}</p>"
            f"<p><strong>Trigger Element:</strong> {payload.element_point}</p>"
            f"</div>"
            f"<div style='background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 15px; white-space: pre-wrap;'>"
            f"<h4 style='color: #1e293b; margin-top: 0;'>🤖 AI ROOT-CAUSE ANALYSIS</h4>"
            f"{ai_diagnosis}"
            f"</div>"
            f"<hr/><p style='font-size: 11px; color: #64748b;'><strong>Raw Console Trace:</strong><br/>{json.dumps(payload.console_logs)}</p>"
        )
        
        import pytz
        eat_tz = pytz.timezone("Africa/Nairobi")
        uganda_now = datetime.now(eat_tz).replace(tzinfo=None)

        # 5. Save to Admin Communications Table
        AdminCommsModel = getattr(models, 'AdminCommunications', getattr(models, 'Admin_Communications', getattr(models, 'Admin_Communication', getattr(models, 'AdminCommunication', None))))
        if AdminCommsModel:
            new_dispatch = AdminCommsModel(
                msg_ref=f"CRASH-{datetime.now().strftime('%Y%m%d%H%M%S')}-{fnum_val[:4]}",
                sender_fnum="SYSTEM_AUTO",
                sender_name="KMP AI DIAGNOSTICS",
                target_audience="ADMINS_ONLY",
                target_region="KMP HEADQUARTERS",
                target_fnum="ROLE:SUPER_ADMIN,ROLE:ADMIN,ROLE:SYSTEM_MANAGER",
                subject=f"⚠️ CRASH DETECTED: {payload.page_name} [{fnum_val}]",
                message=glitch_summary,
                message_type="TECHNICAL_GLITCH_ALERT",
                status="ACTIVE",
                created_at=uganda_now
            )
            db.add(new_dispatch)

        db.commit()

        # 6. Log System Activity
        from routers.activity_logger import log_independent_activity
        log_independent_activity(
            logs_db=logs_db,
            fnum=fnum_val,
            action="CRASH_REPORT_GENERATED",
            module="FRONTEND_TELEMETRY",
            details=f"Automated AI crash diagnostic generated for page [{payload.page_name}] and routed to High Command."
        )

    except Exception as e:
        db.rollback()
        logs_db.rollback()
        print(f"🚨 Background Glitch Processor Failed: {str(e)}")
    finally:
        db.close()
        logs_db.close()

@router.post("/report-crash")
async def report_client_crash(
    payload: CrashTelemetryPayload,
    background_tasks: BackgroundTasks,
    request: Request = None
):
    """
    Receives frontend telemetry payloads immediately, freeing the client browser, 
    and passes the data to the AI background worker for deep diagnostics and dispatch.
    """
    try:
        fnum_val = "PUBLIC_VISITOR"
        if request:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
                try:
                    from jose import jwt
                    from app.core import security
                    decoded = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
                    if decoded.get("sub"):
                        fnum_val = decoded.get("sub").strip().upper()
                except Exception:
                    pass

        # Hand off the heavy AI diagnostics and DB writing to the background task
        background_tasks.add_task(process_and_diagnose_crash_bg, payload=payload, fnum_val=fnum_val)

        return {"status": "success", "message": "Crash telemetry received. AI diagnostics in progress."}
    
    except Exception as e:
        print(f"🚨 Telemetry Receiver Failed: {str(e)}")
        return {"status": "error", "message": "Failed to queue crash telemetry."}