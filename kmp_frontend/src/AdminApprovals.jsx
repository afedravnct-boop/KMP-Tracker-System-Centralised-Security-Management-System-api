from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text, func, or_, and_
from datetime import datetime, timedelta

from app.database import get_db
from app import models
from auth import get_current_user

router = APIRouter(prefix="/api/v1/ai", tags=["AI Intelligence"])

class AIQueryRequest(BaseModel):
    prompt: str
    target_region: Optional[str] = "ALL REGIONS"
    target_station: Optional[str] = "ALL STATIONS"

# 🟢 SECURE SYSTEM UI & FEATURE MANUAL DICTIONARY (No code or internal secrets exposed)
SYSTEM_FEATURE_DICTIONARY = {
    "home dashboard": "The Home Dashboard serves as the primary operational overview, summarizing key metrics, active alerts, and quick navigation links.",
    "command communications": "The Command Comms module enables authorized personnel to dispatch, view, and manage administrative broadcasts and official inter-station messaging.",
    "crime registry": "The Crime/Incident Registry indexes formal offenses, case files, dates, and judicial outcomes. It supports tracking metrics like weekly robbery trends and 6-month convictions.",
    "disruptive ops": "Disruptive Ops Statistics records targeted police operations, sweeps, and aggregate detained cell population metrics.",
    "success stories": "A repository highlighting notable operational milestones, arrests, and community policing achievements across KMP jurisdictions.",
    "establishments": "The Establishments module details all police stations, divisions, and designated police posts across KMP regions.",
    "nominal roll": "The Nominal Roll tracks active police personnel records, ranks, gender splits, regional postings, and medical/casualty statuses.",
    "tripartite reports": "An advanced analytical and multi-format document reporting suite designed for automated administrative synthesis.",
    "access approvals": "The Super Control Panel module where High Command and authorized admins manage new account signups, password recovery requests, HR modification reviews, security audit logs, and granular clearance checkboxes.",
    "clearance matrix": "A permission grid inside Access Approvals enabling authorized commanders to toggle individual module permissions for system users, backed by mandatory operational justification for revocations.",
    "security curtain & idle guard": "An automated security measure that engages an idle screen with a 3D tactical map interface and enforced session timeouts after a period of user inactivity."
}

@router.post("/query")
async def process_ai_query(
    request: AIQueryRequest, 
    db: Session = Depends(get_db), 
    current_user: models.Users = Depends(get_current_user)
):
    """
    Secure Operational Feature Dictionary & NeonDB Data Analyst: 
    Provides safe UI feature guidance, workflow definitions, and authorized database aggregations.
    """
    try:
        prompt_lower = request.prompt.strip().lower()
        inspector = inspect(db.get_bind())
        all_tables = inspector.get_table_names()

        response_text = ""

        # ==========================================
        # 1. SECURITY & CODEBASE GUARDRAIL CHECK
        # ==========================================
        if any(sec_term in prompt_lower for sec_term in ["source code", "codebase", "password hash", "secret key", "database url", "render env", "jwt secret"]):
            return {
                "status": "success",
                "response": "🛡️ [Security Protocol Enforced]: Internal codebase logic, source code, and system secrets are strictly restricted for operational security reasons. I can only assist you with system features, UI navigation, permissions, or database analytics."
            }

        # ==========================================
        # 2. SYSTEM UI & FEATURE DICTIONARY LOOKUP
        # ==========================================
        matched_features = []
        for feature_key, description in SYSTEM_FEATURE_DICTIONARY.items():
            if any(term in prompt_lower for term in feature_key.split()):
                matched_features.append(f"📌 **{feature_key.upper()}**: {description}")

        if matched_features and not any(db_term in prompt_lower for db_term in ["how many", "count", "total", "nominal roll", "officer", "crime"]):
            response_text = "📖 [System Feature Manual & Dictionary]:\n\n" + "\n\n".join(matched_features)

        # ==========================================
        # 3. NOMINAL ROLL & MANPOWER INTELLIGENCE
        # ==========================================
        elif any(w in prompt_lower for w in ["officer", "personnel", "manpower", "nominal roll", "staff", "nco", "casualty", "treatment", "female", "male", "kampala"]):
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
                    func.upper(models.NominalRoll.rank).contains("CORPORAL"),
                    func.upper(models.NominalRoll.rank).contains("DC")
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
                response_text = f"🎖️ [Rank Intelligence]: There are {nco_count} Non-Commissioned Officers registered across KMP."
            elif "casualt" in prompt_lower or "treatment" in prompt_lower:
                response_text = f"🏥 [Status Intelligence]: There are currently {casualty_count} personnel recorded under casualty, sick, or medical treatment status."
            elif "region" in prompt_lower or "north" in prompt_lower or "south" in prompt_lower or "east" in prompt_lower:
                response_text = f"🗺️ [Regional Breakdown]: KMP North: {north} | KMP South: {south} | KMP East: {east} (Total Active: {total_pers})."
            else:
                response_text = f"📊 [Nominal Roll Summary]: Total active personnel: {total_pers} | Male: {male_count} | Female: {female_count} | NCOs: {nco_count} | Casualties: {casualty_count}."

        # ==========================================
        # 4. ESTABLISHMENTS & POLICE POSTS
        # ==========================================
        elif any(w in prompt_lower for w in ["post", "posts", "station", "establishment", "booth", "division"]):
            total_est = db.query(models.Establishments).count()
            posts_count = db.query(models.Establishments).filter(
                and_(models.Establishments.post.isnot(None), models.Establishments.post != "")
            ).count()
            response_text = f"🏢 [Establishments Audit]: NeonDB records {total_est} total establishment rows, including {posts_count} designated police post entries across divisions."

        # ==========================================
        # 5. CRIME REGISTRY & CASE OUTCOMES
        # ==========================================
        elif any(w in prompt_lower for w in ["crime", "case", "robber", "convict", "court", "theft", "defilement", "accident", "murder"]):
            total_cases = db.query(models.Crime_Reports).count()
            
            if "robber" in prompt_lower:
                one_week_ago = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
                robberies = db.query(models.Crime_Reports).filter(
                    and_(models.Crime_Reports.date >= one_week_ago, func.lower(models.Crime_Reports.offence).contains("robbery"))
                ).count()
                response_text = f"🚨 [Crime Trend Intelligence]: {robberies} robbery incident(s) recorded across KMP jurisdictions in the last 7 days."
            
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
        # 6. OPERATIONAL STATISTICS & LOCKUPS
        # ==========================================
        elif any(w in prompt_lower for w in ["lockup", "suspect", "arrest", "cell", "detain", "operation", "sweep"]):
            total_suspects = db.query(func.sum(models.LockupMatrix.suspects)).scalar() or 0
            total_ops = db.query(models.Operational_Statistics).count()
            response_text = f"🔒 [Custody & Operations Intelligence]: Current aggregate detained cell population: {total_suspects} suspects. Total disruptive operations logged: {total_ops}."

        # ==========================================
        # 7. SYSTEM AUDIT & COMMUNICATIONS
        # ==========================================
        elif any(w in prompt_lower for w in ["audit", "log", "comm", "message", "user", "active"]):
            total_users = db.query(models.Users).filter(models.Users.is_approved == True).count()
            total_logs = db.query(models.Audit_Logs).count()
            total_comms = db.query(models.Admin_Communication).count()
            response_text = f"🛡️ [System Audit Intelligence]: Approved active system users: {total_users} | Admin communications dispatched: {total_comms} | Recorded security audit logs: {total_logs}."

        # ==========================================
        # 8. UNIVERSAL FALLBACK
        # ==========================================
        else:
            response_text = (
                f"🤖 [KMP CSDMS Feature Guide & Analyst]: I can explain any system module, button, or navigation feature "
                f"(e.g., ask 'What does Access Approvals do?' or 'How do I check Establishments?'), or query live statistics "
                f"like nominal roll counts, NCOs, police posts, regional distributions, and convictions!"
            )

        return {
            "status": "success",
            "response": response_text
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dynamic AI query processing error: {str(e)}"
        )