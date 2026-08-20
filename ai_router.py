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
        response_text = ""

        # 1. Total Police Officers in KMP (Nominal Roll)
        if "police men" in prompt_lower or "police officers" in prompt_lower or ("officers" in prompt_lower and "kampala" in prompt_lower):
            total_pers = db.query(models.NominalRoll).count()
            response_text = f"📊 [Manpower Intelligence]: There are currently a total of {total_pers} active police officers registered in the KMP Nominal Roll across all jurisdictions."

        # 2. Total Police Posts in KMP (Establishments)
        elif "police posts" in prompt_lower or "posts in kmp" in prompt_lower:
            posts_count = db.query(models.Establishments).filter(models.Establishments.post != "").count()
            total_est = db.query(models.Establishments).count()
            response_text = f"🏢 [Establishments Intelligence]: There are {total_est} command entries recorded in establishments, featuring {posts_count} designated police posts across KMP divisions."

        # 3. Female Officers Count (Nominal Roll)
        elif "female officers" in prompt_lower or "female" in prompt_lower:
            female_count = db.query(models.NominalRoll).filter(
                or_(
                    func.upper(models.NominalRoll.sex) == "FEMALE",
                    func.upper(models.NominalRoll.sex) == "F"
                )
            ).count()
            response_text = f"👤 [Gender Intelligence]: There are currently {female_count} female officers active on the KMP Nominal Roll."

        # 4. Total Male Officers Count (Nominal Roll)
        elif "male officers" in prompt_lower or "male" in prompt_lower:
            male_count = db.query(models.NominalRoll).filter(
                or_(
                    func.upper(models.NominalRoll.sex) == "MALE",
                    func.upper(models.NominalRoll.sex) == "M"
                )
            ).count()
            response_text = f"👤 [Gender Intelligence]: There are currently {male_count} male officers active on the KMP Nominal Roll."

        # 5. NCOs Count (Ranks below AIP)
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

        # 6. Casualties / Treatment Status
        elif "casualt" in prompt_lower or "treatment" in prompt_lower or "sick" in prompt_lower:
            casualty_count = db.query(models.NominalRoll).filter(
                or_(
                    func.lower(models.NominalRoll.status).contains("casualty"),
                    func.lower(models.NominalRoll.status).contains("treatment"),
                    func.lower(models.NominalRoll.status).contains("sick")
                )
            ).count()
            response_text = f"🏥 [Personnel Status Intelligence]: There are currently {casualty_count} personnel recorded under casualty or medical treatment status in the nominal roll."

        # 7. Regional Breakdown (KMP North, South, East)
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

        # 8. Convicted / Closed Cases in the Last 6 Months
        elif "convict" in prompt_lower or ("closed" in prompt_lower and "month" in prompt_lower):
            six_months_ago = (datetime.utcnow() - timedelta(days=180)).strftime("%Y-%m-%d")
            convicted_count = db.query(models.Crime_Reports).filter(
                and_(
                    models.Crime_Reports.date >= six_months_ago,
                    or_(
                        func.lower(models.Crime_Reports.status).contains("convict"),
                        func.lower(models.Crime_Reports.status).contains("closed"),
                        func.lower(models.Crime_Reports.status).contains("court")
                    )
                )
            ).count()
            response_text = f"⚖️ [Judicial Intelligence]: There are {convicted_count} case(s) marked as convicted, closed, or concluded via court in the last 6 months."

        # 9. Robberies Committed in the Last One Week
        elif "robber" in prompt_lower or ("week" in prompt_lower and "robbery" in prompt_lower):
            one_week_ago = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
            robbery_count = db.query(models.Crime_Reports).filter(
                and_(
                    models.Crime_Reports.date >= one_week_ago,
                    func.lower(models.Crime_Reports.offence).contains("robbery")
                )
            ).count()
            response_text = f"🚨 [Crime Trend Intelligence]: There have been {robbery_count} robbery incident(s) recorded across KMP jurisdictions in the last one week."

        else:
            response_text = "🤖 I am your KMP CSDMS Intelligence Assistant. Try asking me about regional manpower, female/male officers, NCO counts, police posts, casualties, convictions over the past 6 months, or recent robberies!"

        return {
            "status": "success",
            "response": response_text
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI Intelligence processing error: {str(e)}"
        )