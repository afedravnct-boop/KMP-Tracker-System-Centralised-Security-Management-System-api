# activity_logger.py
from datetime import datetime
import pytz
from sqlalchemy.orm import Session
from app import models

def record_neon_activity(
    logs_db: Session, 
    fnum: str, 
    action_type: str,     # 'VIEW', 'REGISTER', 'READ', 'EDIT', 'UPDATE', 'DELETE'
    module: str,          # e.g., 'CRIME_REGISTRY', 'EXHIBITS', 'LOCKUP'
    target_id: str = None,# Specific record ID or case number if applicable
    changes_summary: str = None
):
    """
    Directly commits a granular forensic event into the NeonDB ActivityLogs branch.
    """
    try:
        eat_tz = pytz.timezone('Africa/Nairobi')
        timestamp_now = datetime.now(eat_tz).replace(tzinfo=None)
        
        # Format a precise forensic description based on action type
        upper_action = str(action_type or "ACTION").strip().upper()
        upper_module = str(module or "GENERAL").strip().upper()
        
        if upper_action in ["VIEW", "READ"]:
            details = f"Officer accessed {upper_module} in read-only inspection mode. No data mutations performed."
        elif upper_action == "REGISTER":
            details = f"Officer INSERTED/REGISTERED a new record in {upper_module}. Target ID: {target_id or 'N/A'}"
        elif upper_action in ["EDIT", "UPDATE"]:
            details = f"Officer MODIFIED/UPDATED record in {upper_module} [Target: {target_id or 'GENERAL'}]. Changes: {changes_summary or 'Record parameters adjusted'}"
        elif upper_action == "DELETE":
            details = f"Officer PURGED/REMOVED record in {upper_module} [Target: {target_id or 'GENERAL'}]"
        else:
            details = f"Performed action '{upper_action}' on {upper_module}."

        new_activity = models.Activity_Logs(
            fnum=str(fnum or "SYSTEM").strip().upper(),
            action=upper_action,
            module=upper_module,
            details=details,
            created_at=timestamp_now
        )
        
        logs_db.add(new_activity)
        logs_db.commit()
    except Exception as e:
        logs_db.rollback()
        print(f"⚠️ NeonDB Granular Activity Log Error: {str(e)}")