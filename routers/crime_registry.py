from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from datetime import datetime, timedelta

from app import models
from app.database import get_db
from auth import get_current_user  # Adjust if your auth import path differs

router = APIRouter(prefix="/api/v1", tags=["Crime Registry"])

def get_officer_signature(user):
    if not user:
        return "UNKNOWN COMMANDER"
    fnum = (user.fnum or "").strip()
    rank = (user.rank or "").strip()
    name = (user.name or "").strip()
    return f"{fnum} {rank} {name}".strip().upper()

@router.get("/reports")
def get_reports(db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    query = db.query(models.Crime_Reports)
    if current_user.role == "SUPER_ADMIN" or (current_user.permissions or {}).get("view_all_reports", False):
        pass 
    elif current_user.role in ["ADMIN", "RPC"]:
        query = query.filter(models.Crime_Reports.region == current_user.region)
    else:
        query = query.filter(models.Crime_Reports.station == current_user.station)
        
    reports = query.order_by(models.Crime_Reports.sn.desc()).all()
    
    return [{
        "sn": r.sn, 
        "sdRef": r.sd_ref, 
        "sd_ref": r.sd_ref, 
        "region": r.region, 
        "station": r.station,
        "date": r.date, 
        "time": r.time, 
        "offence": r.offence, 
        "narrative": r.narrative, 
        "status": r.status, 
        "suspects": r.suspects, 
        "lastUpdatedBy": r.last_updated_by,
        "daily_lock_up": getattr(r, 'daily_lock_up', 0), 
        "suspectDetails": [{
            "name": getattr(s, 'name', ''), 
            "sex": getattr(s, 'sex', ''), 
            "age": getattr(s, 'age', ''),
            "tribe": getattr(s, 'tribe', ''),
            "residence": getattr(s, 'residence', ''),
            "contact": getattr(s, 'contact', ''),
            "mental_health_status": getattr(s, 'mental_health_status', ''), 
            "photo_url": getattr(s, 'photo_url', '')
        } for s in getattr(r, 'suspect_details', [])]
    } for r in reports] 

@router.post("/reports")
def create_report(data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        data.pop('sn', None) 
        
        user_station = (current_user.station or "").strip().upper()
        user_region = (current_user.region or "").strip().upper()
        is_hq_admin = current_user.role in ["SUPER_ADMIN", "ADMIN"] or "HEADQUARTERS" in user_station or "HEADQUARTERS" in user_region or "999" in (current_user.position or "").upper()

        is_hq_general_total = data.pop('is_hq_general_total', False)

        if is_hq_general_total:
            if not is_hq_admin:
                raise HTTPException(status_code=403, detail="Clearance Denied.")
            data["region"] = "KMP HEADQUARTERS"
            data["station"] = "HEADQUARTERS GENERAL TOTAL"
            data["offence"] = data.get("offence", "HQ GENERAL SUSPECT LOCK-UP TOTAL")
        else:
            if current_user.role not in ["SUPER_ADMIN", "RPC"]:
                data["region"] = current_user.region
                data["station"] = current_user.station

        # 🟢 ADVANCED DUPLICATE DETECTION & REJECTION
        incoming_sd_ref = (data.get("sd_ref") or "").strip().lower()
        incoming_station = (data.get("station") or "").strip().lower()
        incoming_narrative = (data.get("narrative") or "").strip().lower()
        incoming_offence = (data.get("offence") or "").strip().lower()

        if incoming_sd_ref or incoming_narrative:
            existing_reports = db.query(models.Crime_Reports).filter(
                func.lower(models.Crime_Reports.station) == incoming_station
            ).all()

            for r in existing_reports:
                existing_ref = (r.sd_ref or "").strip().lower()
                existing_narrative = (r.narrative or "").strip().lower()
                existing_offence = (r.offence or "").strip().lower()

                if incoming_sd_ref and existing_ref and incoming_sd_ref == existing_ref:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Duplicate Rejection: Reference '{data.get('sd_ref')}' already exists for {data.get('station')} station."
                    )

                if incoming_narrative and len(incoming_narrative) > 10 and existing_narrative and incoming_narrative == existing_narrative:
                    raise HTTPException(
                        status_code=400, 
                        detail="Duplicate Rejection: An identical incident narrative has already been logged for this station."
                    )

                if incoming_offence and existing_offence and incoming_offence == existing_offence:
                    if incoming_narrative and existing_narrative:
                        words_incoming = set(incoming_narrative.split())
                        words_existing = set(existing_narrative.split())
                        if len(words_incoming) > 5:
                            common_words = words_incoming.intersection(words_existing)
                            similarity_ratio = len(common_words) / max(len(words_incoming), len(words_existing))
                            if similarity_ratio > 0.85:
                                raise HTTPException(
                                    status_code=400,
                                    detail=f"Duplicate Rejection: A very similar '{incoming_offence}' incident with near-identical narrative details already exists."
                                )

        suspects_data = data.pop('suspectDetails', []) 
        new_record = models.Crime_Reports(**data)
        new_record.last_updated_by = get_officer_signature(current_user)
        
        db.add(new_record)
        db.flush() 
        new_record.sn = new_record.id 
        
        for s in suspects_data:
            new_suspect = models.Suspect_Lockup(
                report_id=new_record.id, 
                name=s.get('name'), 
                sex=s.get('sex'), 
                age=str(s.get('age')) if s.get('age') else None,
                tribe=s.get('tribe'),
                nationality=s.get('nationality'),
                residence=s.get('residence'), 
                contact=s.get('contact'),
                mental_health_status=s.get('mental_health_status'),
                photo_url=s.get('photo_url') 
            )
            db.add(new_suspect)
            
        db.commit()
        db.refresh(new_record)
        return {"status": "success", "id": new_record.id, "sn": new_record.sn}
    except HTTPException as he:
        db.rollback()
        raise he
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/reports/{sn}")
def update_report(sn: int, data: dict, db: Session = Depends(get_db), current_user: models.Users = Depends(get_current_user)):
    try:
        existing_report = db.query(models.Crime_Reports).filter(models.Crime_Reports.sn == sn).first()
        if not existing_report:
            raise HTTPException(status_code=404, detail="Crime Report not found")

        suspects_data = data.pop('suspectDetails', [])
        data.pop('sn', None)
        
        if current_user.role not in ["SUPER_ADMIN", "RPC"]:
            data.pop("region", None)
            data.pop("station", None)
        
        for key, value in data.items():
            if hasattr(existing_report, key):
                setattr(existing_report, key, value)
                
        existing_report.last_updated_by = get_officer_signature(current_user)
        
        existing_lockups = db.query(models.Suspect_Lockup).filter(models.Suspect_Lockup.report_id == sn).all()
        existing_names = [lockup.name for lockup in existing_lockups]
        
        for s in suspects_data:
            if s.get('name') not in existing_names:
                new_suspect = models.Suspect_Lockup(
                    report_id=sn, 
                    name=s.get('name'), sex=s.get('sex'), age=str(s.get('age')) if s.get('age') else None,
                    tribe=s.get('tribe'), residence=s.get('residence'), contact=s.get('contact'),
                    mental_health_status=s.get('mental_health_status'),
                    photo_url=s.get('photo_url') 
                )
                db.add(new_suspect)

        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/reports/consolidated-ledger")
def get_consolidated_ledger(
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None, 
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    try:
        crimes = db.query(models.Crime_Reports).all() if hasattr(models, 'Crime_Reports') else []
        stats = db.query(models.Operational_Statistics).all() if hasattr(models, 'Operational_Statistics') else []
        stories = db.query(models.Success_Stories).all() if hasattr(models, 'Success_Stories') else []
        
        return {
            "crimes": [c.__dict__ for c in crimes if hasattr(c, '__dict__')],
            "statistics": [s.__dict__ for s in stats if hasattr(s, '__dict__')],
            "stories": [st.__dict__ for st in stories if hasattr(st, '__dict__')]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Consolidated ledger compilation error: {str(e)}")