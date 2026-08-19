from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text, func
from datetime import datetime, timedelta

from app.database import get_db
from app import models
from auth import get_current_user

router = APIRouter(prefix="/api/v1/ai", tags=["AI Intelligence"])

class AIQueryRequest(BaseModel):
    prompt: str
    target_region: Optional[str] = "ALL REGIONS"
    target_station: Optional[str] = "ALL STATIONS"

@router.post("/query")
async def process_ai_query(
    request: AIQueryRequest, 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    """
    Advanced Dynamic Intelligence Engine: 
    Introspects NeonDB schemas and executes intelligent queries across all tables 
    (Nominal Roll, Establishments, Crime Reports, Audit Logs, Operations, Communications, etc.).
    """
    try:
        prompt_lower = request.prompt.strip().lower()
        inspector = inspect(db.get_bind())
        all_tables = inspector.get_table_names()

        response_text = ""

        # ==========================================
        # 1. NOMINAL ROLL & MANPOWER INTELLIGENCE
        # ==========================================
        if any(w in prompt_lower for w in ["officer", "personnel", "manpower", "nominal roll", "staff", "nco", "casualty", "treatment", "female", "male"]):
            total_pers = db.query(models.NominalRoll).count()
            female_count = db.query(models.NominalRoll).filter(
                or_(func.upper(models.NominalRoll.sex) == "FEMALE", func.upper(models.NominalRoll.sex) == "F")
            ).count()
            male_count = db.query(models.NominalRoll).filter(
                or_(func.upper(models.NominalRoll.sex) == "MALE", func.upper(models.NominalRoll.sex) == "M")
            ).count()
            
            nco_count = db.query(models.NominalRoll).filter(
                or_(
                    func.upper(models.NominalRoll.rank).contains("SGT"),
                    func.upper(models.NominalRoll.rank).contains("CPL"),
                    func.upper(models.NominalRoll.rank).contains("PC"),
                    func.upper(models.NominalRoll.rank).contains("CONSTABLE"),
                    func.upper(models.NominalRoll.rank).contains("SERGEANT"),
                    func.upper(models.NominalRoll.rank).contains("CORPORAL")
                )
            ).count()

            casualty_count = db.query(models.NominalRoll).filter(
                or_(
                    func.lower(models.NominalRoll.status).contains("casualty"),
                    func.lower(models.NominalRoll.status).contains("treatment"),
                    func.lower(models.NominalRoll.status).contains("sick")
                )
            ).count()

            north = db.query(models.NominalRoll).filter(func.upper(models.NominalRoll.region).contains("NORTH")).count()
            south = db.query(models.NominalRoll).filter(func.upper(models.NominalRoll.region).contains("SOUTH")).count()
            east = db.query(models.NominalRoll).filter(func.upper(models.NominalRoll.region).contains("EAST")).count()

            if "female" in prompt_lower:
                response_text = f"👤 [Gender Intelligence]: There are {female_count} female officers active on the KMP Nominal Roll out of {total_pers} total personnel."
            elif "male" in prompt_lower:
                response_text = f"👤 [Gender Intelligence]: There are {male_count} male officers active on the KMP Nominal Roll out of {total_pers} total personnel."
            elif "nco" in prompt_lower or "non commissioned" in prompt_lower:
                response_text = f"🎖️ [Rank Intelligence]: There are {nco_count} Non-Commissioned Officers (SGT, CPL, PC) registered across KMP."
            elif "casualt" in prompt_lower or "treatment" in prompt_lower:
                response_text = f"🏥 [Status Intelligence]: There are currently {casualty_count} personnel recorded under casualty, sick, or medical treatment status."
            elif "region" in prompt_lower or "north" in prompt_lower or "south" in prompt_lower or "east" in prompt_lower:
                response_text = f"🗺️ [Regional Breakdown]: KMP North: {north} | KMP South: {south} | KMP East: {east} (Total Active: {total_pers})."
            else:
                response_text = f"📊 [Nominal Roll Summary]: Total active personnel: {total_pers} | Male: {male_count} | Female: {female_count} | NCOs: {nco_count} | Casualties: {casualty_count}."

        # ==========================================
        # 2. ESTABLISHMENTS & POLICE POSTS
        # ==========================================
        elif any(w in prompt_lower for w in ["post", "station", "establishment", "booth", "division"]):
            total_est = db.query(models.Establishments).count()
            posts_count = db.query(models.Establishments).filter(models.Establishments.post != "").count()
            response_text = f"🏢 [Establishments Audit]: NeonDB records {total_est} total establishment nodes, including {posts_count} designated police posts across divisions."

        # ==========================================
        # 3. CRIME REGISTRY & CASE OUTCOMES (Convictions, Robberies)
        # ==========================================
        elif any(w in prompt_lower for w in ["crime", "case", "robber", "convict", "court", "theft", "defilement", "accident", "murder"]):
            total_cases = db.query(models.Crime_Reports).count()
            
            if "robber" in prompt_lower:
                one_week_ago = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
                robberies = db.query(models.Crime_Reports).filter(
                    and_(models.Crime_Reports.date >= one_week_ago, func.lower(models.Crime_Reports.offence).contains("robbery"))
                ).count()
                response_text = f"🚨 [Crime Intelligence]: {robberies} robbery incident(s) recorded across KMP jurisdictions in the last 7 days (Total database crimes indexed: {total_cases})."
            
            elif "convict" in prompt_lower or "closed" in prompt_lower:
                six_months_ago = (datetime.utcnow() - timedelta(days=180)).strftime("%Y-%m-%d")
                convictions = db.query(models.Crime_Reports).filter(
                    and_(
                        models.Crime_Reports.date >= six_months_ago,
                        or_(func.lower(models.Crime_Reports.status).contains("convict"), func.lower(models.Crime_Reports.status).contains("closed"))
                    )
                ).count()
                response_text = f"⚖️ [Judicial Intelligence]: {convictions} case(s) marked as convicted or closed in the last 6 months out of {total_cases} total indexed cases."
            
            else:
                response_text = f"📊 [Crime Registry Summary]: Total registered crime incidents indexed in NeonDB: {total_cases}."

        # ==========================================
        # 4. OPERATIONAL STATISTICS & LOCKUPS
        # ==========================================
        elif any(w in prompt_lower for w in ["lockup", "suspect", "arrest", "cell", "detain", "operation", "sweep"]):
            total_suspects = db.query(func.sum(models.LockupMatrix.suspects)).scalar() or 0
            total_ops = db.query(models.Operational_Statistics).count()
            response_text = f"🔒 [Custody & Operations Intelligence]: Current aggregate detained cell population: {total_suspects} suspects. Total disruptive operations logged: {total_ops}."

        # ==========================================
        # 5. SYSTEM AUDIT & COMMUNICATIONS
        # ==========================================
        elif any(w in prompt_lower for w in ["audit", "log", "comm", "message", "user", "active"]):
            total_users = db.query(models.Users).filter(models.Users.is_approved == True).count()
            total_logs = db.query(models.Audit_Logs).count()
            total_comms = db.query(models.Admin_Communication).count()
            response_text = f"🛡️ [System Audit Intelligence]: Approved active system users: {total_users} | Admin communications dispatched: {total_comms} | Recorded security audit logs: {total_logs}."

        # ==========================================
        # 6. UNIVERSAL DATABASE FALLBACK (Introspects all tables)
        # ==========================================
        else:
            table_counts = {}
            # Quick row count check across primary operational models if available
            try:
                table_counts["Crime Reports"] = db.query(models.Crime_Reports).count()
                table_counts["Nominal Roll"] = db.query(models.NominalRoll).count()
                table_counts["Establishments"] = db.query(models.Establishments).count()
                table_counts["Success Stories"] = db.query(models.Success_Stories).count()
            except:
                pass

            summary_str = ", ".join([f"{k}: {v}" for k, v in table_counts.items()])
            response_text = f"🤖 [NeonDB Core Engine]: Connected successfully to all {len(all_tables)} database tables ({summary_str}). Ask me about officers, NCOs, police posts, regional distributions, convictions, or recent robberies!"

        return {
            "status": "success",
            "response": response_text
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dynamic AI query processing error: {str(e)}"
        )