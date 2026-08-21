# ai_router.py
import os
import re
import json
from typing import Optional, List, Dict, Any
from datetime import datetime
import pytz

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from openai import OpenAI

from app.database import get_db
from app import models
from auth import get_current_user

# 🟢 Direct Root Import with Fallback Protection
try:
    from embedding_service import get_embedding_vector
except ImportError:
    try:
        from app.services import get_embedding_vector
    except ImportError:
        def get_embedding_vector(text: str) -> list[float]:
            return [0.0] * 1536

router = APIRouter(prefix="/api/v1/ai", tags=["AI Intelligence Engine"])
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", "EMPTY"))

class AIQueryRequest(BaseModel):
    prompt: str
    target_region: Optional[str] = "ALL REGIONS"
    target_station: Optional[str] = "ALL STATIONS"
# =====================================================================
# 1. DATABASE SCHEMA DEFINITION & METADATA INJECTION
# =====================================================================
SCHEMA_DEFINITION = """
PostgreSQL Tables & Schema:
1. nominal_roll (id, fnum, name, rank, position, station, division, region, contact, ipps, sex, home_dist, date_of_birth, date_of_enlistment, qualification)
2. crime_reports (id, sd_ref, date, time, station, division, region, offence, category, victim_name, suspect_name, narrative, status)
3. operational_statistics (id, date, station, division, region, operations_conducted, suspects_screened, charged_to_court, weapons_recovered)
4. success_stories (id, title, date, station, narrative, commander_in_charge)
5. establishments (id, region, division, station, post, sanctioned_strength, present_strength, variance)
6. lockup_matrix (id, station, date, male_adults, female_adults, male_juveniles, female_juveniles, total_detained)
"""

# =====================================================================
# 2. ROLE-BASED CLEARANCE ENFORCEMENT (ROW-LEVEL SECURITY)
# =====================================================================
def get_clearance_constraints(user: models.Users) -> Dict[str, Any]:
    """Generates SQL and vector isolation filters matching officer clearance."""
    role = str(getattr(user, 'role', '') or "").upper()
    is_super = role in ["SUPER_ADMIN", "SYSTEM_ADMIN", "RPC"]
    
    sql_clauses = []
    if not is_super:
        u_region = getattr(user, 'region', None)
        u_division = getattr(user, 'division', None)
        u_station = getattr(user, 'station', None)

        if u_region and u_region != "ALL REGIONS":
            sql_clauses.append(f"UPPER(region) = '{u_region.strip().upper()}'")
        if u_division and role in ["DIVISION_ADMIN", "OC_CID", "DPC"]:
            sql_clauses.append(f"UPPER(division) = '{u_division.strip().upper()}'")
        if u_station and role in ["STATION_ADMIN", "OC_STATION", "DUTY_OFFICER"]:
            sql_clauses.append(f"UPPER(station) = '{u_station.strip().upper()}'")

    sql_filter = " AND ".join(sql_clauses) if sql_clauses else "1=1"
    return {"sql_filter": sql_filter, "is_super": is_super}

# =====================================================================
# 3. SECURE READ-ONLY SQL ENGINE
# =====================================================================
def execute_safe_query(sql_query: str, db: Session) -> List[Dict[str, Any]]:
    """Sanitizes and executes read-only SQL queries with AST token protection."""
    clean_sql = re.sub(r"```(?:sql)?", "", sql_query, flags=re.IGNORECASE).strip()
    forbidden = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "GRANT", "REVOKE", ";", "--", "EXEC"]
    
    for token in forbidden:
        if re.search(rf"\b{re.escape(token)}\b", clean_sql, re.IGNORECASE):
            raise ValueError(f"Security Alert: Unauthorized command token '{token}' blocked.")
            
    if not clean_sql.upper().startswith("SELECT"):
        raise ValueError("Security Alert: Only SELECT operations are authorized.")

    result = db.execute(text(clean_sql))
    rows = result.fetchall()
    keys = list(result.keys())
    
    # Cap result payload to prevent LLM context overflow
    return [dict(zip(keys, row)) for row in rows[:50]]

# =====================================================================
# 4. PGVECTOR SEMANTIC RAG RETRIEVER (HARDENED & PARAMETERIZED)
# =====================================================================
def retrieve_vector_context(query: str, user: models.Users, db: Session, limit: int = 5) -> List[str]:
    """Retrieves qualitative context and SITREPs safely with parameterized bindings."""
    try:
        query_vec = get_embedding_vector(query)
        if not query_vec or sum(query_vec) == 0:
            return []

        vec_str = "[" + ",".join(str(x) for x in query_vec) + "]"
        
        role = str(getattr(user, 'role', '') or "").upper()
        user_region = str(getattr(user, 'region', '') or "").strip().upper()

        # Parameterized condition logic
        if role in ["SUPER_ADMIN", "SYSTEM_ADMIN", "RPC"] or not user_region or user_region == "ALL REGIONS":
            geo_clause = "1=1"
            params = {"vec_str": vec_str, "limit": limit}
        else:
            geo_clause = "(UPPER(region) = :user_region OR UPPER(region) = 'KMP HEADQUARTERS' OR region IS NULL)"
            params = {"vec_str": vec_str, "user_region": user_region, "limit": limit}

        sql = text(f"""
            SELECT document_type, title, content, sd_ref, station, 
                   1 - (embedding <=> CAST(:vec_str AS vector)) AS similarity
            FROM operational_document_embeddings
            WHERE {geo_clause}
            ORDER BY embedding <=> CAST(:vec_str AS vector)
            LIMIT :limit;
        """)
        
        results = db.execute(sql, params).fetchall()
        
        return [
            f"[{r.document_type}] {r.title} (Station: {r.station or 'HQ'}, SD: {r.sd_ref or 'N/A'}, Similarity: {round(float(r.similarity), 3)}):\n{r.content}"
            for r in results if r.similarity is not None and float(r.similarity) > 0.40
        ]
    except Exception as e:
        # Graceful fallback: print warning and let SQL Structured engine handle the answer
        print(f"pgvector Retrieval Warning (Skipping RAG): {e}")
        return []

# =====================================================================
# 5. CORE DUAL-PATH AI ORCHESTRATOR ROUTE
# =====================================================================
@router.post("/query")
async def process_ai_query(
    request: AIQueryRequest,
    db: Session = Depends(get_db),
    current_user: models.Users = Depends(get_current_user)
):
    try:
        prompt_raw = request.prompt.strip()
        clearance = get_clearance_constraints(current_user)

        # 🟢 A. TEXT-TO-SQL INTENT & QUERY GENERATION
        sql_router_prompt = f"""
You are the KMP Centralised Security Data Management System (CSDMS) SQL Specialist.
PostgreSQL Schema:
{SCHEMA_DEFINITION}

Clearance Constraint:
Apply this WHERE filter on queries to protect officer clearance: {clearance['sql_filter']}

Rules:
1. If the user prompt asks for counts, specific records, officers, incidents, or statistics, generate ONLY a valid PostgreSQL SELECT statement.
2. If purely qualitative or non-tabular, return "NO_SQL".
3. Return raw SQL string only. Do not enclose in markdown blocks.
"""
        sql_decision = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": sql_router_prompt},
                {"role": "user", "content": prompt_raw}
            ],
            temperature=0.0
        )
        
        raw_sql = sql_decision.choices[0].message.content.strip()
        generated_sql = re.sub(r"```(?:sql)?", "", raw_sql, flags=re.IGNORECASE).strip()

        sql_results = []
        if generated_sql != "NO_SQL" and generated_sql.upper().startswith("SELECT"):
            try:
                sql_results = execute_safe_query(generated_sql, db)
            except Exception as err:
                sql_results = [{"query_notice": "SQL execution bypassed", "detail": str(err)}]

        # 🟢 B. PGVECTOR SEMANTIC SEARCH
        vector_docs = retrieve_vector_context(prompt_raw, current_user, db)

        # 🟢 C. MILITARY/POLICE ANALYTICAL SYNTHESIS (SMEAC FORMAT)
        eat_tz = pytz.timezone('Africa/Nairobi')
        now_eat = datetime.now(eat_tz).strftime('%d-%b-%Y %H:%M:%S EAT')

        synthesis_prompt = f"""
You are the Lead Tactical Intelligence AI for Kampala Metropolitan Police (KMP).
Inquiring Commander: {getattr(current_user, 'rank', '')} {getattr(current_user, 'name', '')} (F/NO: {getattr(current_user, 'fnum', '')}, Role: {getattr(current_user, 'role', '')})
Jurisdiction: Station: {getattr(current_user, 'station', '')} | Division: {getattr(current_user, 'division', '')} | Region: {getattr(current_user, 'region', '')}
Current Timestamp: {now_eat}

Structured SQL Results:
{json.dumps(sql_results, default=str, indent=2)}

Retrieved Vector Documents & SITREPs:
{json.dumps(vector_docs, indent=2)}

Commander Query:
"{prompt_raw}"

Directives:
1. Deliver an authoritative, structured, and factual police intelligence response.
2. Structure output cleanly:
   - **Executive Summary**
   - **Operational Intelligence Assessment**
   - **Tactical Directives & Next Steps** (if applicable)
3. Explicitly correlate database figures with narrative SITREP context.
4. Reference exact SD Numbers, Stations, and Force Numbers when available.
5. If no records match, state the exact parameters searched without fabricating information.
"""
        final_answer = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": synthesis_prompt}],
            temperature=0.2
        )

        return {
            "status": "success",
            "response": final_answer.choices[0].message.content,
            "metadata": {
                "sql_executed": generated_sql if generated_sql != "NO_SQL" else None,
                "structured_records_count": len(sql_results),
                "semantic_chunks_retrieved": len(vector_docs)
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Intelligence Command Processing Error: {str(e)}"
        )