# routers/activity_logger.py
from datetime import datetime
import pytz
from sqlalchemy.orm import Session
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app import models, database

def record_neon_activity(
    logs_db: Session, 
    fnum: str, 
    action_type: str,     # 'VIEW', 'REGISTER', 'READ', 'EDIT', 'UPDATE', 'DELETE', 'ANALYTICS_SYNC', 'BACKGROUND_FETCH'
    module: str,           # e.g., 'CRIME_REGISTRY', 'EXHIBITS', 'LOCKUP', 'ANALYTICS_DASHBOARD'
    target_id: str = None, # Specific record ID, case number, or SD reference
    changes_summary: str = None # Fine details like category, record parameters, etc.
):
    """
    Directly commits a granular forensic event into the NeonDB ActivityLogs branch.
    Separates human manual operations from automated background module processes.
    """
    try:
        eat_tz = pytz.timezone('Africa/Nairobi')
        timestamp_now = datetime.now(eat_tz).replace(tzinfo=None)
        
        upper_action = str(action_type or "ACTION").strip().upper()
        upper_module = str(module or "GENERAL").strip().upper()
        clean_fnum = str(fnum or "SYSTEM").strip().upper()
        
        # 🟢 Filter out silent background polling, heartbeats, and browser noise
        target_str = str(target_id or "").lower()
        if any(noise in target_str for noise in ["/heartbeat", "/ping", "/poll", "/notifications", "/unread", "/favicon.ico"]):
            return

        if upper_action in ["ANALYTICS_SYNC", "BACKGROUND_FETCH"]:
            details = (
                f"[AUTOMATED SYSTEM MODULE] Automated background process executed by module '{upper_module}' "
                f"to retrieve and compile data. Target Scope: {target_id or 'GLOBAL_AGGREGATES'}. "
                f"Details: {changes_summary or 'Scheduled telemetry sync'}"
            )
            clean_fnum = f"MODULE_{clean_fnum}" if clean_fnum != "SYSTEM" else "SYSTEM_AUTOMATION"

        elif upper_action in ["VIEW", "READ"]:
            # Only log direct human navigation views on core resources, ignore silent background fetches
            if clean_fnum in ["SYSTEM", "USER", "ANONYMOUS"] and not target_str.startswith("/api/v1/"):
                return
            details = (
                f"Officer [{clean_fnum}] accessed module '{upper_module}' in read-only inspection mode. "
                f"Target Reference: {target_id or 'GENERAL_VIEW'}. No data mutations performed."
            )

        elif upper_action == "REGISTER":
            details = (
                f"Officer [{clean_fnum}] INSERTED/REGISTERED a new record in '{upper_module}'. "
                f"Record ID / Ref: {target_id or 'N/A'}. "
                f"Fine Details & Classification: {changes_summary or 'Standard record entry'}"
            )

        elif upper_action in ["EDIT", "UPDATE"]:
            details = (
                f"Officer [{clean_fnum}] MODIFIED/UPDATED a record in '{upper_module}' "
                f"[Target Reference: {target_id or 'GENERAL'}]. "
                f"Specific Modifications: {changes_summary or 'Record parameters adjusted'}"
            )

        elif upper_action == "DELETE":
            details = (
                f"Officer [{clean_fnum}] PURGED/REMOVED a record in '{upper_module}' "
                f"[Target Reference: {target_id or 'GENERAL'}]. "
                f"Deletion Context: {changes_summary or 'Authorized removal'}"
            )

        else:
            details = f"Actor [{clean_fnum}] performed action '{upper_action}' on module '{upper_module}'. Context: {changes_summary or 'N/A'}"

        new_activity = models.Activity_Logs(
            fnum=clean_fnum,
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


class SystemActivityMiddleware(BaseHTTPMiddleware):
    """
    Transparently watches active system mutations and direct user navigation,
    ignoring background pre-fetches and component auto-mounting noise.
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        path = request.url.path
        
        # Filter out static files, documentation, preflights, heartbeats, and favicons
        if any(skip in path for skip in ["/static/", "/favicon.ico", "/docs", "/openapi.json", "/heartbeat", "/ping"]) or request.method == "OPTIONS":
            return response

        # Only watch active system API endpoints
        if not path.startswith("/api/"):
            return response

        # 🟢 CRITICAL: Do NOT automatically log every background GET request as a human "VIEW" 
        # unless it is an explicit state-changing request (POST, PUT, PATCH, DELETE) 
        # or an explicitly designated manual report/export endpoint.
        if request.method == "GET":
            if not any(explicit in path for explicit in ["export", "audit", "dossier"]):
                return response

        path_parts = path.strip("/").split("/")
        module_name = path_parts[2].upper() if len(path_parts) > 2 else "GENERAL_SYSTEM"

        method_map = {
            "GET": "VIEW",
            "POST": "REGISTER",
            "PUT": "UPDATE",
            "PATCH": "UPDATE",
            "DELETE": "DELETE"
        }
        action_type = method_map.get(request.method, "EXECUTE")

        is_system_call = request.headers.get("X-System-Module") is not None
        if is_system_call:
            action_type = "ANALYTICS_SYNC"
            module_name = request.headers.get("X-System-Module").upper()

        fnum = getattr(request.state, "user_fnum", None) or request.headers.get("X-User-Fnum", None)
        
        if not fnum and request.method == "GET":
            return response

        fnum = fnum or "SYSTEM"

        try:
            logs_db = next(database.get_logs_db())
            record_neon_activity(
                logs_db=logs_db,
                fnum=fnum,
                action_type=action_type,
                module=module_name,
                target_id=path,
                changes_summary=f"System operation: HTTP {request.method} -> {path} [Status: {response.status_code}]"
            )
            logs_db.close()
        except Exception:
            pass

        return response