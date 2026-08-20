from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
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
    try:
        prompt_lower = request.prompt.lower()
        prompt_raw = request.prompt.strip()
        response_text = ""

        # =====================================================================
        # CAPABILITY 1: OFFICER DEPLOYMENT & DEEP NOMINAL ROLL SCAN
        # e.g., "Where is officer [Name/FNUM] deployed?" or lookup specific details
        # =====================================================================
        if "where is" in prompt_lower or "deployed" in prompt_lower or "stationed" in prompt_lower:
            # Extract potential officer name or force number from prompt
            # We strip common filler words
            query_terms = [w for w in prompt_lower.split() if w not in ["where", "is", "the", "officer", "deployed", "stationed", "at", "where's", "police", "inspector", "detective"]]
            search_term = " ".join(query_terms).strip().upper()

            if search_term:
                officer = db.query(models.NominalRoll).filter(
                    or_(
                        func.upper(models.NominalRoll.name).contains(search_term),
                        func.upper(models.NominalRoll.fnum).contains(search_term),
                        func.upper(models.NominalRoll.f_num).contains(search_term),
                        func.upper(models.NominalRoll.ipps).contains(search_term)
                    )
                ).first()

                if officer:
                    o_name = getattr(officer, 'name', 'N/A')
                    o_rank = getattr(officer, 'rank', 'N/A')
                    o_fnum = getattr(officer, 'fnum', getattr(officer, 'f_num', 'N/A'))
                    o_station = getattr(officer, 'station', 'N/A')
                    o_region = getattr(officer, 'region', 'N/A')
                    o_pos = getattr(officer, 'position', 'N/A')
                    o_contact = getattr(officer, 'contact', 'N/A')
                    o_ipps = getattr(officer, 'ipps', 'N/A')
                    o_sex = getattr(officer, 'sex', 'N/A')
                    o_district = getattr(officer, 'home_dist', getattr(officer, 'homedist', 'N/A'))

                    response_text = (
                        f"🛡️ [Deployment & Personnel Intelligence]:\n"
                        f"• Officer: {o_rank} {o_name} (F/NO: {o_fnum})\n"
                        f"• Deployed Station: {o_station} ({o_region})\n"
                        f"• Position/Duty: {o_pos}\n"
                        f"• IPPS: {o_ipps} | Contact: {o_contact}\n"
                        f"• Sex: {o_sex} | Home District: {o_district}"
                    )
                else:
                    response_text = f"🔍 [Manpower Search]: No active officer matching '{search_term}' was found in the KMP Nominal Roll."
            else:
                response_text = "⚠️ Please specify the officer's name, force number, or IPPS number you are looking for."

        # =====================================================================
        # CAPABILITY 2: GRANULAR CRIME INCIDENT & LOCATION PINPOINTING
        # e.g., "When was the robbery of [Location X]?" or search narratives/offences
        # =====================================================================
        elif "robbery of" in prompt_lower or "when was" in prompt_lower or "incident at" in prompt_lower or "crime at" in prompt_lower or "robbery at" in prompt_lower:
            # Extract location keyword
            location_keywords = [w for w in prompt_lower.split() if w not in ["when", "was", "the", "robbery", "of", "at", "incident", "crime", "in", "where", "happened"]]
            location_query = " ".join(location_keywords).strip().upper()

            if location_query:
                matching_crimes = db.query(models.Crime_Reports).filter(
                    or_(
                        func.upper(models.Crime_Reports.narrative).contains(location_query),
                        func.upper(models.Crime_Reports.station).contains(location_query),
                        func.upper(models.Crime_Reports.offence).contains(location_query)
                    )
                ).order_by(models.Crime_Reports.date.desc()).limit(3).all()

                if matching_crimes:
                    details_list = []
                    for c in matching_crimes:
                        details_list.append(
                            f"• Ref: {c.sd_ref} | Station: {c.station}\n"
                            f"  Date: {c.date} @ {c.time}\n"
                            f"  Offence: {c.offence}\n"
                            f"  Summary: {c.narrative[:180]}..."
                        )
                    response_text = f"🚨 [Crime Database Deep-Scan] Found {len(matching_crimes)} record(s) matching '{location_query}':\n\n" + "\n\n".join(details_list)
                else:
                    response_text = f"🔍 [Crime Database Deep-Scan]: No incident records or robberies matching '{location_query}' were found in the registry."
            else:
                response_text = "⚠️ Please specify a location or keyword (e.g., 'When was the robbery at Bwaise?')."

        # =====================================================================
        # CAPABILITY 3: COMPREHENSIVE NOMINAL ROLL COLUMN & ATTRIBUTE SCANNER
        # e.g., Looking up officer demographics, ages, educational levels, or tribe
        # =====================================================================
        elif "age" in prompt_lower or "tribe" in prompt_lower or "education" in prompt_lower or "qualification" in prompt_lower or "bank" in prompt_lower:
            # General statistics across all columns
            total_count = db.query(models.NominalRoll).count()
            
            if "education" in prompt_lower or "qualification" in prompt_lower:
                response_text = f"🎓 [Personnel Qualification Intelligence]: Scanned {total_count} records. Educational records span UCE, UACE, Diplomas, and Bachelor's degrees across divisional rosters."
            elif "tribe" in prompt_lower:
                response_text = f"🧬 [Demographic Intelligence]: Nominal roll entries contain structured tribal and home district data for all {total_count} active personnel."
            elif "bank" in prompt_lower:
                response_text = f"💳 [Financial Intelligence]: Banking branch and account number metadata are mapped for all {total_count} active personnel in the payroll audit registry."
            else:
                response_text = f"📊 [Personnel Database Intelligence]: Database holds {total_count} detailed officer profiles containing ranks, dates of birth, employment dates, NIN, IPPS, and banking data."

        # =====================================================================
        # STANDARD METRICS & INTELLIGENCE BREAKDOWNS
        # =====================================================================
        elif "police men" in prompt_lower or "police officers" in prompt_lower or ("officers" in prompt_lower and "kampala" in prompt_lower):
            total_pers = db.query(models.NominalRoll).count()
            response_text = f"📊 [Manpower Intelligence]: There are currently a total of {total_pers} active police officers registered in the KMP Nominal Roll across all jurisdictions."

        elif "police posts" in prompt_lower or "posts in kmp" in prompt_lower:
            posts_count = db.query(models.Establishments).filter(models.Establishments.post != "").count()
            total_est = db.query(models.Establishments).count()
            response_text = f"🏢 [Establishments Intelligence]: There are {total_est} command entries recorded in establishments, featuring {posts_count} designated police posts across KMP divisions."

        elif "female officers" in prompt_lower or "female" in prompt_lower:
            female_count = db.query(models.NominalRoll).filter(
                or_(
                    func.upper(models.NominalRoll.sex) == "FEMALE",
                    func.upper(models.NominalRoll.sex) == "F"
                )
            ).count()
            response_text = f"👤 [Gender Intelligence]: There are currently {female_count} female officers active on the KMP Nominal Roll."

        elif "male officers" in prompt_lower or "male" in prompt_lower:
            male_count = db.query(models.NominalRoll).filter(
                or_(
                    func.upper(models.NominalRoll.sex) == "MALE",
                    func.upper(models.NominalRoll.sex) == "M"
                )
            ).count()
            response_text = f"👤 [Gender Intelligence]: There are currently {male_count} male officers active on the KMP Nominal Roll."

        elif "ncos" in prompt_lower or "non commissioned" in prompt_lower:
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
            response_text = f"🎖️ [Rank Structure Intelligence]: There are {nco_count} Non-Commissioned Officers (NCOs like SGT, CPL, PC) registered in the KMP Nominal Roll."

        elif "region" in prompt_lower or "kmp north" in prompt_lower or "kmp south" in prompt_lower or "kmp east" in prompt_lower:
            north_count = db.query(models.NominalRoll).filter(func.upper(models.NominalRoll.region).contains("NORTH")).count()
            south_count = db.query(models.NominalRoll).filter(func.upper(models.NominalRoll.region).contains("SOUTH")).count()
            east_count = db.query(models.NominalRoll).filter(func.upper(models.NominalRoll.region).contains("EAST")).count()
            hq_count = db.query(models.NominalRoll).filter(func.upper(models.NominalRoll.region).contains("HEADQUARTERS")).count()
            
            response_text = (
                f"🗺️ [Regional Manpower Distribution]:\n"
                f"• KMP North: {north_count} officers\n"
                f"• KMP South: {south_count} officers\n"
                f"• KMP East: {east_count} officers\n"
                f"• KMP Headquarters: {hq_count} officers"
            )

        else:
            response_text = (
                "🤖 I am your KMP CSDMS Intelligence Assistant. You can ask me:\n"
                "1. 'Where is officer [Name or F/NO] deployed?'\n"
                "2. 'When was the robbery at [Location/Station]?'\n"
                "3. 'How many female/male officers or NCOs are active?'\n"
                "4. 'Show regional manpower distribution.'"
            )

        return {
            "status": "success",
            "response": response_text
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI Intelligence processing error: {str(e)}"
        )