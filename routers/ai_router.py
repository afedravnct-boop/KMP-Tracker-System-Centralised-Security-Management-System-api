import os
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect, func
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

# Helper to check if Super Admin disabled DB querying
def is_db_query_globally_enabled(db: Session) -> bool:
    ConfigModel = getattr(models, 'SystemConfig', None)
    if not ConfigModel:
        return True 
    config = db.query(ConfigModel).filter(ConfigModel.config_key == "ai_database_query_enabled").first()
    if config and str(config.config_value).lower() == "false":
        return False
    return True

@router.post("/admin/toggle-db-query")
async def toggle_ai_database_queries(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ['SUPER_ADMIN', 'ADMIN']:
        raise HTTPException(status_code=403, detail="Clearance Denied: Super Admin authorization required.")
    
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
        new_conf = ConfigModel(config_key="ai_database_query_enabled", config_value=new_state_str)
        db.add(new_conf)
        
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

        is_global_viewer = current_user.role in ['SUPER_ADMIN', 'ADMIN', 'RPC'] or \
                           str(current_user.region).upper() in ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS']

        # 🟢 Safely parse permissions dict
        user_perms = current_user.permissions or {}
        if isinstance(user_perms, str):
            try:
                user_perms = json.loads(user_perms)
            except:
                user_perms = {}
                
        has_ai_hr_access = current_user.role in ['SUPER_ADMIN', 'ADMIN'] or user_perms.get('ai_hr_access') == True

        user_tier_scope = f"Global Scope (All Regions/Stations)" if is_global_viewer else f"Restricted Tier Scope: Station {current_user.station}, Region {current_user.region}"

        live_data_context = ""
        agric_records = []
        stats_records = []
        hr_aggregates = []
        hr_sample = []

        if db_queries_allowed:
            try:
                AgricModel = getattr(models, 'Agricultural_Crime_Summary', None)
                StatsModel = getattr(models, 'Operational_Statistics', None)
                
                # 🟢 Robustly resolve Nominal Roll model across conventions
                HrModel = None
                for m_name in ['Nominal_Roll', 'NominalRoll', 'nominal_roll', 'NominalRolls']:
                    if hasattr(models, m_name):
                        HrModel = getattr(models, m_name)
                        break
                if not HrModel:
                    HrModel = getattr(models, 'User', None)
                
                # 1. Crime & OPS Extracts
                agric_query = db.query(AgricModel) if AgricModel else None
                stats_query = db.query(StatsModel) if StatsModel else None

                if not is_global_viewer:
                    if AgricModel and hasattr(AgricModel, 'station'): 
                        agric_query = agric_query.filter(AgricModel.station == current_user.station)
                    if StatsModel and hasattr(StatsModel, 'station'): 
                        stats_query = stats_query.filter(StatsModel.station == current_user.station)

                agric_records = agric_query.limit(20).all() if agric_query else []
                stats_records = stats_query.limit(20).all() if stats_query else []

                live_data_context = "LIVE OPERATIONAL DATABASE EXTRACTS (Tier-Restricted):\n"
                if agric_records:
                    live_data_context += "- Agricultural/Produce Crimes Summary:\n"
                    for r in agric_records:
                        live_data_context += f"  * [{r.region} / {r.station}] {r.agric_crime_report}: Stolen={r.number_count}, Recovered={r.recoveries}\n"
                if stats_records:
                    live_data_context += "- Disruptive OPS Weekly Metrics:\n"
                    for s in stats_records:
                        live_data_context += f"  * [{s.region} / {s.station}] Date: {s.date} | Arrested={s.arrested}, Remanded={s.remanded}, Convicted={s.convicted}\n"
                
                # 2. 🟢 COMPREHENSIVE NOMINAL ROLL EXTRACTION (All Columns Included)
                if has_ai_hr_access and HrModel:
                    # A. Quick Aggregation for Counting (Rank, Sex, Status)
                    agg_query = db.query(
                        getattr(HrModel, 'rank', 'rank'),
                        getattr(HrModel, 'sex', 'sex'),
                        getattr(HrModel, 'status', 'status'),
                        func.count(getattr(HrModel, 'id', getattr(HrModel, 'sn', HrModel.fnum)))
                    )
                    if not is_global_viewer and hasattr(HrModel, 'station'):
                        agg_query = agg_query.filter(HrModel.station == current_user.station)
                        
                    hr_aggregates = agg_query.group_by(
                        getattr(HrModel, 'rank', 'rank'), 
                        getattr(HrModel, 'sex', 'sex'), 
                        getattr(HrModel, 'status', 'status')
                    ).all()
                    
                    if hr_aggregates:
                        live_data_context += "- Nominal Roll Demographics (Aggregated):\n"
                        for r_rank, r_sex, r_status, r_count in hr_aggregates:
                            live_data_context += f"  * Rank: {r_rank} | Sex: {r_sex} | Status: {r_status} => Total: {r_count}\n"
                    
                    # B. Detailed Personnel Directory with All Columns (NIN, TIN, Contact, Education, Bank, etc.)
                    hr_sample_query = db.query(HrModel)
                    if not is_global_viewer and hasattr(HrModel, 'station'):
                        hr_sample_query = hr_sample_query.filter(HrModel.station == current_user.station)
                    
                    hr_sample = hr_sample_query.limit(100).all()
                    if hr_sample:
                        live_data_context += "- Nominal Roll Personnel Directory (Detailed Records):\n"
                        for u in hr_sample:
                            u_fnum = getattr(u, 'f_num', getattr(u, 'fnum', 'N/A'))
                            u_rank = getattr(u, 'rank', 'N/A')
                            u_name = getattr(u, 'name', 'N/A')
                            u_sex = getattr(u, 'sex', 'N/A')
                            u_ipps = getattr(u, 'ipps', 'N/A')
                            u_nin = getattr(u, 'nin', 'N/A')
                            u_tin = getattr(u, 'tin', 'N/A')
                            u_station = getattr(u, 'station', 'N/A')
                            u_region = getattr(u, 'region', 'N/A')
                            u_position = getattr(u, 'position', 'N/A')
                            u_contact = getattr(u, 'contact', 'N/A')
                            u_educ = getattr(u, 'educ_level', getattr(u, 'educlevel', 'N/A'))
                            u_bank = getattr(u, 'bank_branch', getattr(u, 'bankbranch', 'N/A'))
                            u_dir = getattr(u, 'dir', 'N/A')
                            u_status = getattr(u, 'status', 'N/A')
                            
                            live_data_context += (
                                f"  * FNUM: {u_fnum} | IPPS: {u_ipps} | Rank: {u_rank} | Name: {u_name} | "
                                f"Sex: {u_sex} | Position: {u_position} | Station: {u_station} ({u_region}) | "
                                f"Contact: {u_contact} | NIN: {u_nin} | TIN: {u_tin} | Bank: {u_bank} | "
                                f"Education: {u_educ} | Status: {u_status}\n"
                            )

            except Exception as db_fetch_err:
                print(f"Error fetching live data for AI: {db_fetch_err}")
                live_data_context += f"\n[Database extraction skipped due to formatting error]"
        else:
            live_data_context = "🛑 System Note: Super Admin has disabled direct database querying for the AI. Responses are restricted to navigation guidance and uploaded document searches."

        system_rules = (
            "You are the Kampala Metropolitan Police (KMP) Tactical AI Assistant. "
            f"CRITICAL PROTOCOL: Address the user using their full official credential: {current_user.fnum} {current_user.rank} {current_user.name}. "
            "Maintain a highly professional, concise, law-enforcement tone.\n\n"
            "CAPABILITIES: You can answer direct operational questions using the live database extracts provided below, guide users through system navigation, and search uploaded command files.\n"
            "SECURITY BOUNDARY: You must respect the user's tier scope. Do not reveal data outside their jurisdiction unless they have global clearance."
        )

        prompt_vector = get_embedding_vector(payload.prompt)
        vector_str = str(prompt_vector)
        
        if is_global_viewer:
            search_query = text("SELECT title, content, region, station FROM operational_document_embeddings ORDER BY embedding <=> CAST(:vector AS vector) LIMIT 3")
            results = db.execute(search_query, {"vector": vector_str}).fetchall()
        else:
            search_query = text("SELECT title, content, region, station FROM operational_document_embeddings WHERE region = :user_region OR station = :user_station ORDER BY embedding <=> CAST(:vector AS vector) LIMIT 3")
            results = db.execute(search_query, {"vector": vector_str, "user_region": current_user.region, "user_station": current_user.station}).fetchall()
        
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

        used_model = 'gemini-3.6-flash'
        try:
            response = client.models.generate_content(
                model=used_model,
                contents=tactical_context,
                config=types.GenerateContentConfig(system_instruction=system_rules)
            )
        except Exception as primary_err:
            if "503" in str(primary_err) or "UNAVAILABLE" in str(primary_err):
                print("Gemini 3.6 is experiencing high demand. Triggering automatic fallback to 1.5-flash...")
                used_model = 'gemini-1.5-flash'
                try:
                    response = client.models.generate_content(
                        model=used_model,
                        contents=tactical_context,
                        config=types.GenerateContentConfig(system_instruction=system_rules)
                    )
                except Exception as fallback_err:
                    raise Exception(f"All Google AI servers are currently overloaded. Please wait a moment and try again. Details: {str(fallback_err)}")
            else:
                raise primary_err

        return {
            "response": response.text,
            "metadata": {
                "database_query_status": "Active (Tier Restricted)" if db_queries_allowed else "Disabled by Super Admin",
                "jurisdiction_tier": user_tier_scope,
                "structured_records_count": len(agric_records) + len(stats_records) + len(hr_aggregates) + len(hr_sample) if db_queries_allowed else 0,
                "semantic_chunks_retrieved": len(results),
                "ai_model_used": used_model
            }
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Google API Connectivity Issue: {str(e)}")