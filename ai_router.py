from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app import models
from app.database import get_db

router = APIRouter(prefix="/api/v1/ai", tags=["AI Intelligence Assistant"])

@router.post("/query")
def query_kmp_intelligence(payload: dict, db: Session = Depends(get_db)):
    user_prompt = payload.get("prompt", "").strip().lower()
    
    # 1. Fetch live telemetry quietly in the background
    try:
        total_crime = db.query(models.Crime_Reports).count()
        total_personnel = db.query(models.NominalRoll).count()
        total_establishments = db.query(models.Establishments).count()
        total_suspects = db.query(func.sum(models.Crime_Reports.suspects)).scalar() or 0
    except Exception:
        total_crime, total_personnel, total_establishments, total_suspects = 0, 0, 0, 0

    # 2. Flexible Intent Groups (No dictionary required, just lists of terms)
    system_terms = ["kmp tracker", "system", "application", "platform", "this software", "what do you do", "overview"]
    crime_terms = ["crime", "cases", "offence", "incident", "reports", "suspect"]
    hr_terms = ["personnel", "nominal roll", "officers", "staff", "hr", "force number", "ipps"]
    station_terms = ["station", "establishment", "post", "booth", "division", "region"]

    # 3. Evaluate intent dynamically
    if any(term in user_prompt for term in system_terms) and ("what" in user_prompt or "about" in user_prompt or "explain" in user_prompt):
        response_text = (
            "The KMP Tracker System (Centralised Security Data Management System) is an application "
            "that manages all security data for the Kampala Metropolitan Police Department in a central point "
            "with a view to timely and systemic handling of essential data."
        )
    elif any(term in user_prompt for term in crime_terms):
        response_text = (
            f"From our live database records, the system currently tracks **{total_crime}** crime incidents "
            f"and **{total_suspects}** suspects across active station ledgers."
        )
    elif any(term in user_prompt for term in hr_terms):
        response_text = (
            f"The Nominal Roll module currently manages **{total_personnel}** active and archived personnel records, "
            f"handling officer ranks, deployments, and secure HR data updates."
        )
    elif any(term in user_prompt for term in station_terms):
        response_text = (
            f"The Establishments module maps **{total_establishments}** administrative stations, divisions, "
            f"posts, and booths across our command jurisdictions."
        )
    else:
        # Versatile fallback that acknowledges the officer's specific wording
        response_text = (
            f"As your KMP CSDMS Intelligence Assistant, I am tracking your query regarding '{user_prompt}'. "
            f"We currently have {total_crime} crime reports and {total_personnel} personnel logged in the central database. "
            f"How else can I assist your command analysis today?"
        )

    return {
        "status": "success",
        "response": response_text
    }