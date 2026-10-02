import os
import json
import re
import time
import traceback
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect, func, or_
from google import genai
from google.genai import types

from auth import get_current_user
from app.database import get_db, engine
from app import models

try:
    from embedding_service import get_embedding_vector
except ImportError:
    from app.embedding_service import get_embedding_vector

router = APIRouter(prefix="/api/v1/ai", tags=["Tactical AI Console"])

class QueryPayload(BaseModel):
    prompt: str
    target_region: str = "ALL REGIONS"
    target_station: str = "ALL STATIONS"

def is_db_query_globally_enabled(db: Session) -> bool:
    ConfigModel = getattr(models, 'SystemConfig', None)
    if not ConfigModel:
        return True 
    config = db.query(ConfigModel).filter(ConfigModel.config_key == "ai_database_query_enabled").first()
    if config and str(config.config_value).lower() == "false":
        return False
    return True

def check_ai_db_query_clearance(user) -> bool:
    role = (user.role or "").upper()
    perms = user.permissions or {}
    if isinstance(perms, str):
        try:
            perms = json.loads(perms)
        except Exception:
            perms = {}

    is_super_tier = role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN"]
    has_delegated_power = perms.get("can_approve") is True or perms.get("system_admin") is True or perms.get("ai_hr_access") is True
    
    return is_super_tier or has_delegated_power

@router.post("/admin/toggle-db-query")
async def toggle_ai_database_queries(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    role = (current_user.role or "").upper()
    perms = current_user.permissions or {}
    if isinstance(perms, str):
        try:
            perms = json.loads(perms)
        except Exception:
            perms = {}

    is_super_tier = role in ["SUPER_ADMIN", "ADMIN", "ASSISTANT_SUPER_ADMIN"]
    has_delegated_power = perms.get("can_approve") is True or perms.get("system_admin") is True or perms.get("ai_hr_access") is True

    if not (is_super_tier or has_delegated_power):
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
    
    return {
        "status": "success", 
        "ai_database_query_enabled": new_bool_state,
        "message": f"AI Database Querying has been {'ENABLED' if new_bool_state else 'DISABLED (Navigation & Docs Only)'}."
    }

@router.post("/query")
async def process_tactical_query(
    payload: QueryPayload, 
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="GEMINI_API_KEY is missing from the server environment.")

    try:
        client = genai.Client(api_key=api_key)
        db_queries_allowed = is_db_query_globally_enabled(db)

        can_run_db_query = check_ai_db_query_clearance(current_user)

        user_perms = current_user.permissions or {}
        if isinstance(user_perms, str):
            try:
                user_perms = json.loads(user_perms)
            except Exception:
                user_perms = {}
                
        has_ai_hr_access = current_user.role in ['SUPER_ADMIN', 'ADMIN', 'ASSISTANT_SUPER_ADMIN'] or user_perms.get('ai_hr_access') is True or user_perms.get('can_approve') is True
        user_tier_scope = f"Station Scope: Station {current_user.station}, Region {current_user.region}"

        live_data_context = ""
        agric_records = []
        stats_records = []
        exhibits_records = []
        lockup_records = []
        hr_aggregates = []
        hr_sample = []

        if db_queries_allowed and can_run_db_query:
            try:
                AgricModel = getattr(models, 'Agricultural_Crime_Summary', getattr(models, 'AgriculturalCrimeSummary', None))
                StatsModel = getattr(models, 'Operational_Statistics', getattr(models, 'OperationalStatistics', None))
                ExhibitsModel = getattr(models, 'Exhibits', getattr(models, 'exhibits', getattr(models, 'ImpoundedExhibits', None)))
                LockupMatrixModel = getattr(models, 'Lockup_Matrix', getattr(models, 'LockupMatrix', getattr(models, 'lockup_matrix', None)))
                
                HrModel = None
                for m_name in ['Nominal_Roll', 'NominalRoll', 'nominal_roll', 'NominalRolls']:
                    if hasattr(models, m_name):
                        HrModel = getattr(models, m_name)
                        break
                if not HrModel:
                    HrModel = getattr(models, 'User', getattr(models, 'Users', None))
                
                agric_query = db.query(AgricModel) if AgricModel else None
                stats_query = db.query(StatsModel) if StatsModel else None
                exhibits_query = db.query(ExhibitsModel) if ExhibitsModel else None
                lockup_query = db.query(LockupMatrixModel) if LockupMatrixModel else None

                if not can_run_db_query:
                    user_station_val = str(current_user.station).strip().upper()
                    if agric_query and hasattr(AgricModel, 'station'): 
                        agric_query = agric_query.filter(func.upper(AgricModel.station) == user_station_val)
                    if stats_query and hasattr(StatsModel, 'station'): 
                        stats_query = stats_query.filter(func.upper(StatsModel.station) == user_station_val)
                    if exhibits_query and hasattr(ExhibitsModel, 'station'): 
                        exhibits_query = exhibits_query.filter(func.upper(ExhibitsModel.station) == user_station_val)
                    if lockup_query and hasattr(LockupMatrixModel, 'station'):
                        lockup_query = lockup_query.filter(func.upper(LockupMatrixModel.station) == user_station_val)

                agric_records = agric_query.limit(20).all() if agric_query else []
                stats_records = stats_query.limit(20).all() if stats_query else []
                exhibits_records = exhibits_query.limit(20).all() if exhibits_query else []
                lockup_records = lockup_query.limit(20).all() if lockup_query else []

                live_data_context = "LIVE OPERATIONAL DATABASE EXTRACTS:\n"
                if agric_records:
                    live_data_context += "- Agricultural/Produce Crimes Summary:\n"
                    for r in agric_records:
                        live_data_context += f"  * [{r.region} / {r.station}] {r.agric_crime_report}: Stolen={r.number_count}, Recovered={r.recoveries}\n"
                if stats_records:
                    live_data_context += "- Disruptive OPS Weekly Metrics:\n"
                    for s in stats_records:
                        live_data_context += f"  * [{s.region} / {s.station}] Date: {s.date} | Arrested={s.arrested}, Remanded={s.remanded}, Convicted={s.convicted}\n"
                if exhibits_records:
                    live_data_context += "- Impounded Fleet & Exhibits Register:\n"
                    for e in exhibits_records:
                        e_reg = getattr(e, 'reg_no', 'NIL')
                        e_desc = getattr(e, 'type_make', getattr(e, 'category', 'EXHIBIT'))
                        e_status = getattr(e, 'status', 'UNKNOWN')
                        e_case = getattr(e, 'case_no', 'N/A')
                        live_data_context += f"  * [{getattr(e, 'region', 'KMP')} / {getattr(e, 'station', 'HQ')}] Reg/Serial: {e_reg} | Desc: {e_desc} | Case: {e_case} | Status: {e_status}\n"
                if lockup_records:
                    live_data_context += "- Daily Suspects Lock-up Matrix (Cell Populations & Detention Thresholds):\n"
                    for l in lockup_records:
                        live_data_context += f"  * [{getattr(l, 'region', 'KMP')} / {getattr(l, 'station', 'HQ')}] Date: {getattr(l, 'date', 'N/A')} | Total Suspects: {getattr(l, 'suspects', 0)} (Male: {getattr(l, 'male_count', 0)}, Female: {getattr(l, 'female_count', 0)}) | >3 Days: {getattr(l, 'detention_3days_over', 0)}\n"
                
                if has_ai_hr_access and HrModel:
                    fnum_attr = getattr(HrModel, 'f_num', getattr(HrModel, 'fnum', getattr(HrModel, 'fNum', None)))
                    id_col = getattr(HrModel, 'id', getattr(HrModel, 'sn', fnum_attr))
                    
                    agg_query = db.query(
                        getattr(HrModel, 'rank', 'rank'),
                        getattr(HrModel, 'sex', 'sex'),
                        getattr(HrModel, 'status', 'status'),
                        func.count(id_col)
                    )
                    if not can_run_db_query and hasattr(HrModel, 'station'):
                        agg_query = agg_query.filter(func.upper(HrModel.station) == str(current_user.station).strip().upper())
                        
                    hr_aggregates = agg_query.group_by(
                        getattr(HrModel, 'rank', 'rank'), 
                        getattr(HrModel, 'sex', 'sex'), 
                        getattr(HrModel, 'status', 'status')
                    ).all()
                    
                    if hr_aggregates:
                        live_data_context += "- Nominal Roll Demographics (Aggregated):\n"
                        for r_rank, r_sex, r_status, r_count in hr_aggregates:
                            live_data_context += f"  * Rank: {r_rank} | Sex: {r_sex} | Status: {r_status} => Total: {r_count}\n"
                    
                    hr_sample_query = db.query(HrModel)
                    if not can_run_db_query and hasattr(HrModel, 'station'):
                        hr_sample_query = hr_sample_query.filter(func.upper(HrModel.station) == str(current_user.station).strip().upper())
                    
                    stop_words = {"what", "is", "the", "for", "who", "where", "tell", "me", "about", "find", "search", "officer", "stationed", "details", "give", "show", "can", "you", "of", "in", "on", "at", "and", "a", "an", "how", "many", "does", "have", "age", "unit", "rank", "sex", "name"}
                    raw_words = re.findall(r'\b\w+\b', payload.prompt.lower())
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
                            
                            if term_cond:
                                search_conditions.append(or_(*term_cond))
                    
                        if search_conditions:
                            hr_sample_query = hr_sample_query.filter(or_(*search_conditions))

                    hr_sample = hr_sample_query.limit(50).all()

                    if hr_sample:
                        live_data_context += "- Nominal Roll Personnel Directory (SAFE OPSEC COLUMNS):\n"
                        for u in hr_sample:
                            u_fnum = getattr(u, 'f_num', getattr(u, 'fnum', getattr(u, 'fNum', 'N/A')))
                            u_rank = getattr(u, 'rank', 'N/A')
                            u_name = getattr(u, 'name', 'N/A')
                            u_age = getattr(u, 'age', getattr(u, 'dob', getattr(u, 'date_of_birth', 'N/A')))
                            u_sex = getattr(u, 'sex', 'N/A')
                            u_ipps = getattr(u, 'ipps', 'N/A')
                            u_unit = getattr(u, 'station', getattr(u, 'region', 'N/A'))
                            
                            live_data_context += (
                                f"  * Force Number: {u_fnum} | Rank: {u_rank} | Name: {u_name} | "
                                f"Age: {u_age} | Sex: {u_sex} | IPPS: {u_ipps} | Unit: {u_unit}\n"
                            )

            except Exception as db_fetch_err:
                print(f"Error fetching live data for AI: {db_fetch_err}")
                live_data_context += "\n[Database extraction skipped due to formatting error]"
        else:
            live_data_context = "🛑 System Note: Direct database querying for the AI is either globally disabled or restricted by your command clearance tier."

        system_rules = (
            "You are the Kampala Metropolitan Police (KMP) Tactical AI Assistant. "
            f"CRITICAL PROTOCOL: Address the user using their full official credential: {current_user.fnum} {current_user.rank} {current_user.name}. "
            "Maintain a highly professional, concise, law-enforcement tone.\n\n"
            "SECURITY PROTOCOL: You are strictly forbidden from processing or hallucinating sensitive PII. "
            "You only have access to the OPSEC-cleared columns: Force Number, Rank, Name, Age, Sex, IPPS, and Unit.\n\n"
            "CAPABILITIES: You can answer direct operational questions using live database extracts, guide users through system navigation, answer platform policy questions, and search uploaded command files."
        )

        prompt_vector = get_embedding_vector(payload.prompt)
        vector_str = str(prompt_vector)
        
        search_query = text("SELECT title, content, region, station FROM operational_document_embeddings ORDER BY embedding <=> CAST(:vector AS vector) LIMIT 3")
        results = db.execute(search_query, {"vector": vector_str}).fetchall()
        
        retrieved_docs = ""
        if results:
            retrieved_docs = "UPLOADED DOCUMENT INTELLIGENCE:\n"
            for row in results:
                clean_content = str(row.content).replace("<", "&lt;").replace(">", "&gt;")
                retrieved_docs += f"--- [{row.title} | {row.region}/{row.station}] ---\n{clean_content}\n"

        tactical_context = (
            f"Executing Officer: {current_user.fnum} {current_user.rank} {current_user.name}\n"
            f"User Security Tier: {user_tier_scope}\n\n"
            f"{live_data_context}\n\n"
            f"{retrieved_docs}\n\n"
            f"USER QUERY: {payload.prompt}"
        )

        candidate_models = ['gemini-2.0-flash', 'gemini-3.5-flash']
        response = None
        used_model = None
        last_exception = None

        for m in candidate_models:
            success = False
            for attempt in range(2):
                try:
                    response = client.models.generate_content(
                        model=m,
                        contents=tactical_context,
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
                    prompt=str(payload.prompt),
                    response=str(response.text if hasattr(response, 'text') else response),
                    target_region=str(payload.target_region or current_user.region or "ALL REGIONS"),
                    target_station=str(payload.target_station or current_user.station or "ALL STATIONS")
                )
                db.add(new_ai_log)
                db.commit()
        except Exception as db_err:
            db.rollback()

        return {
            "response": response.text if hasattr(response, 'text') else str(response),
            "metadata": {
                "database_query_status": "Active" if (db_queries_allowed and can_run_db_query) else "Restricted / Disabled",
                "jurisdiction_tier": user_tier_scope,
                "structured_records_count": len(agric_records) + len(stats_records) + len(exhibits_records) + len(lockup_records) + len(hr_aggregates) + len(hr_sample) if (db_queries_allowed and can_run_db_query) else 0,
                "semantic_chunks_retrieved": len(results),
                "ai_model_used": used_model
            }
        }

    except Exception as e:
        tracecode = traceback.format_exc()
        print(tracecode)
        raise HTTPException(status_code=500, detail=f"Google API Connectivity Issue: {str(e)}")