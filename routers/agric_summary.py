from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app import models
from app.database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/v1/agric-summary", tags=["Agricultural Summary Ledger"])

@router.get("/")
def get_agric_summaries(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    Model = getattr(models, 'Agricultural_Crime_Summary', None)
    if not Model: return []
    
    is_global = current_user.role in ['SUPER_ADMIN', 'ADMIN', 'RPC'] or str(current_user.region).upper() in ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS']
    query = db.query(Model)
    
    if not is_global:
        query = query.filter(Model.station == current_user.station)
        
    records = query.order_by(Model.id.desc()).all()
    
    return [{
        "id": r.id, 
        "sn": r.sn or idx + 1, 
        "region": r.region, 
        "station": r.station, 
        "date": str(r.date),  # 🟢 Safe string cast
        "agric_crime_report": r.agric_crime_report, 
        "number_count": r.number_count,
        "recoveries": r.recoveries, 
        "status": r.status, 
        "last_updated_by": r.last_updated_by
    } for idx, r in enumerate(records)]

@router.post("/")
def create_agric_summary(data: dict, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    Model = getattr(models, 'Agricultural_Crime_Summary', None)
    if not Model: raise HTTPException(status_code=500, detail="Model not initialized.")
    
    try:
        new_record = Model(
            region=data.get("region") or current_user.region,
            station=data.get("station") or current_user.station,
            date=data.get("date") or datetime.now().strftime("%Y-%m-%d"),
            agric_crime_report=str(data.get("agric_crime_report", "")).upper(),
            number_count=int(data.get("number_count", 0)),
            recoveries=int(data.get("recoveries", 0)),
            # 🟢 Removed .upper() to protect the JSON payload from the frontend
            status=str(data.get("status", "UNDER INVESTIGATION")),
            last_updated_by=f"{current_user.fnum} {current_user.rank} {current_user.name}"
        )
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        
        return {"status": "success", "id": new_record.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))