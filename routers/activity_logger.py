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
    action_type: str,      # 'VIEW', 'REGISTER', 'READ', 'EDIT', 'UPDATE', 'DELETE', 'ANALYTICS_SYNC', 'BACKGROUND_FETCH'
    module: str,           # e.g., 'CRIME_REGISTRY', 'EXHIBITS', 'LOCKUP', 'ANALYTICS_DASHBOARD'
    target_id: str = None, # Specific record ID, case number, or SD reference
    changes_summary: str = None # Fine details like category ('AGRIC_CRIME', 'GENERAL CRIMES'), record parameters, etc.
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
        
        if upper_action in ["ANALYTICS_SYNC", "BACKGROUND_FETCH"]:
            details = (
                f"[AUTOMATED SYSTEM MODULE] Automated background process executed by module '{upper_module}' "
                f"to retrieve and compile data. Target Scope: {target_id or 'GLOBAL_AGGREGATES'}. "
                f"Details: {changes_summary or 'Scheduled telemetry sync'}"
            )
            clean_fnum = f"MODULE_{clean_fnum}" if clean_fnum != "SYSTEM" else "SYSTEM_AUTOMATION"

        elif upper_action in ["VIEW", "READ"]:
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
    Transparently watches the entire system across all modules automatically,
    ignoring negligible frontend noise while accurately recording real operational intent.
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        path = request.url.path
        
        # Filter out static files, documentation, preflights, and favicons
        if any(skip in path for skip in ["/static/", "/favicon.ico", "/docs", "/openapi.json"]) or request.method == "OPTIONS":
            return response

        # Only watch active system API endpoints
        if not path.startswith("/api/"):
            return response

        # Derive module name automatically from URL path (e.g., /api/v1/crime-registry/... -> CRIME_REGISTRY)
        path_parts = path.strip("/").split("/")
        module_name = path_parts[2].upper() if len(path_parts) > 2 else "GENERAL_SYSTEM"

        # Map HTTP methods to actions
        method_map = {
            "GET": "VIEW",
            "POST": "REGISTER",
            "PUT": "UPDATE",
            "PATCH": "UPDATE",
            "DELETE": "DELETE"
        }
        action_type = method_map.get(request.method, "EXECUTE")

        # Check for automated background system call headers
        is_system_call = request.headers.get("X-System-Module") is not None
        if is_system_call:
            action_type = "ANALYTICS_SYNC"
            module_name = request.headers.get("X-System-Module").upper()

        # Extract Force Number if passed in headers or state
        fnum = getattr(request.state, "user_fnum", None) or request.headers.get("X-User-Fnum", "USER")

        # Commit directly to the branch NeonDB activity database
        try:
            logs_db = next(database.get_logs_db())
            record_neon_activity(
                logs_db=logs_db,
                fnum=fnum,
                action_type=action_type,
                module=module_name,
                target_id=path,
                changes_summary=f"Automated system watch: HTTP {request.method} -> {path} [Status: {response.status_code}]"
            )
            logs_db.close()
        except Exception:
            pass

        return response