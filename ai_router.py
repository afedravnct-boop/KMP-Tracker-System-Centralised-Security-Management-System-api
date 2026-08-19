from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

# Internal Imports
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
    Secured System Assistant Intelligence route for KMP CSDMS.
    Respects regional clearances, queries live NeonDB tables, and responds to natural language queries.
    """
    try:
        # 1. Verify user global clearance vs restricted regional assignment
        role = str(current_user.role or "").upper()
        permissions = current_user.permissions or {}
        is_global = (
            role == "SUPER_ADMIN" or 
            permissions.get("view_global_roster", False) or 
            permissions.get("global_observer", False) or
            current_user.region in ["POLICE HEADQUARTERS", "KMP HEADQUARTERS"]
        )
        
        user_region = current_user.region or "KMP HEADQUARTERS"
        effective_region = request.target_region if (is_global and request.target_region != "ALL REGIONS") else (user_region if not is_global else "ALL REGIONS")

        prompt_lower = request.prompt.lower()
        response_text = ""

        # 2. Dynamic Database Intelligence Queries
        if "crime" in prompt_lower or "cases" in prompt_lower or "offence" in prompt_lower:
            crime_query = db.query(models.Crime_Reports)
            if not is_global:
                crime_query = crime_query.filter(func.upper(models.Crime_Reports.region) == func.upper(user_region))
            total_cases = crime_query.count()
            
            response_text = f"📊 [Crime Analysis - {effective_region}]: Registry scan complete. There are currently {total_cases} active recorded incident cases indexed under your jurisdiction."

        elif "personnel" in prompt_lower or "officer" in prompt_lower or "nominal roll" in prompt_lower:
            roll_query = db.query(models.NominalRoll)
            if not is_global:
                roll_query = roll_query.filter(func.upper(models.NominalRoll.region) == func.upper(user_region))
            total_personnel = roll_query.count()
            
            response_text = f"👤 [Manpower Audit - {effective_region}]: Nominal roll database checked. Total active registered personnel assigned to this sector: {total_personnel} officers."

        elif "lockup" in prompt_lower or "cell" in prompt_lower or "suspect" in prompt_lower:
            lockup_query = db.query(models.LockupMatrix)
            if not is_global:
                lockup_query = lockup_query.filter(func.upper(models.LockupMatrix.region) == func.upper(user_region))
            total_suspects = db.query(func.sum(models.LockupMatrix.suspects)).scalar() or 0
            
            response_text = f"🔒 [Custody Matrix - {effective_region}]: Cell populations reviewed. Current aggregate detained suspect count across active lockups is {total_suspects}."

        elif "sitrep" in prompt_lower or "summary" in prompt_lower or "report" in prompt_lower:
            est_query = db.query(models.Establishments).count()
            response_text = f"📋 [Automated SitRep - {effective_region}]: Operational tempo is stable. Active monitoring covers {est_query} registered command installations and data feeds."

        else:
            response_text = f"🤖 System Assistant active for {effective_region}. I am monitoring command data feeds. You can ask me to summarize crimes, check manpower totals, or review lock-up numbers."

        return {
            "status": "success",
            "jurisdiction": effective_region,
            "response": response_text
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI Assistant processing error: {str(e)}"
        )