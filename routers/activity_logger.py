# routers/activity_logger.py
from datetime import datetime
import asyncio
import base64
import json
import re
import pytz
from sqlalchemy.orm import Session
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app import models, database


def record_neon_activity(
    logs_db: Session,
    fnum: str,
    action_type: str,
    module: str,
    target_id: str = None,
    changes_summary: str = None
):
    """
    Directly commits a granular forensic event into the NeonDB ActivityLogs branch.
    Guarantees precise auditing for human administrative actions and mutations.
    """
    if not logs_db:
        return

    try:
        eat_tz = pytz.timezone('Africa/Nairobi')
        timestamp_now = datetime.now(eat_tz).replace(tzinfo=None)

        upper_action = str(action_type or "ACTION").strip().upper()
        upper_module = str(module or "GENERAL").strip().upper().replace("-", "_")
        clean_fnum = str(fnum or "SYSTEM").strip().upper()

        # Filter out noisy background polls
        target_str = str(target_id or "").lower()
        if any(noise in target_str for noise in ["/ping", "/poll", "/notifications", "/unread", "/favicon.ico", "/users/online"]):
            return

        details = changes_summary or f"Officer [{clean_fnum}] performed action '{upper_action}' on module '{upper_module}'."

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
        try:
            logs_db.rollback()
        except Exception:
            pass
        print(f"⚠️ NeonDB Granular Activity Log Error: {str(e)}")


def _resolve_module_label(path_lower: str):
    """Maps API paths to clean (MODULE_CODE, human_label) pairs."""
    if "crime-reports" in path_lower or "crime" in path_lower:
        return "CRIME_REGISTRY", "Crime Registry"
    if "general-documents" in path_lower or "general-docs" in path_lower or "document" in path_lower:
        return "GENERAL_DOCUMENTS", "Documents & Reports"
    if "statistics" in path_lower or "stats" in path_lower or "agric" in path_lower:
        return "OPERATIONAL_STATISTICS", "Operational Statistics"
    if "lockup" in path_lower:
        return "SUSPECT_LOCKUP", "Daily Lock-up Matrix"
    if "exhibit" in path_lower:
        return "IMPOUNDED_EXHIBITS", "Impounded Exhibits"
    if "nominal-roll" in path_lower or "hr" in path_lower:
        return "NOMINAL_ROLL", "Nominal Roll / HR"
    if "establishment" in path_lower:
        return "ESTABLISHMENTS", "Establishments"
    if "stories" in path_lower or "success" in path_lower:
        return "SUCCESS_STORIES", "Success Stories"
    if "communication" in path_lower or "comm" in path_lower:
        return "COMMAND_COMMUNICATIONS", "Command Communications"
    if "audit" in path_lower:
        return "AUDIT_LOGS", "Audit Logs"
    if "export-master" in path_lower or "database/export" in path_lower:
        return "EXCEL_EXPORTS", "Master Database"
    if "users" in path_lower or "approve" in path_lower or "request" in path_lower:
        return "USER_ACCOUNTS", "User Accounts & Access"

    parts = [p for p in path_lower.strip("/").split("/") if p and p not in ("api", "v1")]
    raw = parts[0] if parts else "GENERAL_SYSTEM"
    return raw.upper().replace("-", "_"), raw.replace("-", " ").title()


def _write_middleware_audit_sync(fnum: str, method: str, path: str, file_detail: str = None):
    """Runs synchronous DB lookup and audit insert in a worker thread so the async event loop never blocks."""
    path_lower = path.lower()

    # Lookup Officer Rank & Name from database for forensic accuracy
    officer_rank = "OFFICER"
    officer_name = ""
    main_db = None
    try:
        main_db = database.SessionLocal()
        UserModal = getattr(models, 'Users', getattr(models, 'User', None))
        if UserModal:
            user_obj = main_db.query(UserModal).filter(UserModal.fnum == fnum).first()
            if not user_obj and hasattr(UserModal, 'fNum'):
                user_obj = main_db.query(UserModal).filter(UserModal.fNum == fnum).first()
            if user_obj:
                officer_rank = getattr(user_obj, 'rank', 'OFFICER') or 'OFFICER'
                officer_name = getattr(user_obj, 'name', '') or ''
    except Exception:
        pass
    finally:
        if main_db:
            try:
                main_db.close()
            except Exception:
                pass

    officer_signature = f"{fnum} {officer_rank} {officer_name}".strip()
    module_name, module_label = _resolve_module_label(path_lower)

    # 1. Authentication & Session Events (matches api_backend.py Audit Logs filter)
    if "log-logout" in path_lower or "logout" in path_lower:
        module_name = "USER_AUTHENTICATION"
        action_type = "LOGOUT"
        narrative = f"Officer [{officer_signature}] signed out of the system."
    elif "log-timeout" in path_lower:
        module_name = "USER_AUTHENTICATION"
        action_type = "SESSION_TIMEOUT"
        narrative = f"Officer [{officer_signature}] was automatically logged out due to inactivity timeout."
    elif "login" in path_lower or "log-session" in path_lower:
        module_name = "USER_AUTHENTICATION"
        action_type = "LOGIN"
        narrative = f"Officer [{officer_signature}] signed in to the system."

    # 2. Exports & Downloads
    elif "export" in path_lower or "download" in path_lower:
        action_type = "EXPORT"
        file_part = f" file '{file_detail}'" if file_detail else " data"
        narrative = f"Officer [{officer_signature}] exported/downloaded{file_part} from {module_label} ({path})."

    # 3. Deletions & Revocations
    elif method == "DELETE" or "revoke" in path_lower or "delete" in path_lower:
        action_type = "DELETE"
        if "revoke" in path_lower:
            narrative = f"Officer [{officer_signature}] revoked user access ({path})."
        else:
            narrative = f"Officer [{officer_signature}] deleted a record in {module_label} ({path})."

    # 4. Approvals, Password Changes, & Updates
    elif method in ["PUT", "PATCH"]:
        if "password" in path_lower:
            module_name = "PASSWORD_RESETS"
            action_type = "PASSWORD_CHANGE"
            narrative = f"Officer [{officer_signature}] changed or reset a security password ({path})."
        elif "approve" in path_lower:
            action_type = "APPROVE"
            narrative = f"Officer [{officer_signature}] approved a pending request in {module_label} ({path})."
        else:
            action_type = "UPDATE"
            narrative = f"Officer [{officer_signature}] updated a record in {module_label} ({path})."

    # 5. Creations, Uploads, & Dispatches
    elif method == "POST":
        if "upload" in path_lower:
            action_type = "UPLOAD"
            file_part = f" '{file_detail}'" if file_detail else ""
            narrative = f"Officer [{officer_signature}] uploaded file{file_part} to {module_label} ({path})."
        elif "approve" in path_lower:
            action_type = "APPROVE"
            narrative = f"Officer [{officer_signature}] approved a request in {module_label} ({path})."
        elif "communication" in path_lower:
            action_type = "DISPATCH"
            narrative = f"Officer [{officer_signature}] dispatched a command communication ({path})."
        else:
            action_type = "CREATE"
            narrative = f"Officer [{officer_signature}] created/submitted a new entry in {module_label} ({path})."

    else:
        return

    # Commit to NeonDB logs branch cleanly
    logs_db = None
    try:
        logs_db = database.LogsSessionLocal()
        record_neon_activity(
            logs_db=logs_db,
            fnum=fnum,
            action_type=action_type,
            module=module_name,
            target_id=path,
            changes_summary=narrative
        )
    except Exception:
        pass
    finally:
        if logs_db:
            try:
                logs_db.close()
            except Exception:
                pass


class SystemActivityMiddleware(BaseHTTPMiddleware):
    """
    Records only concrete operational actions (Login, Logout, Create, Upload, Update, Delete, Export/Download).
    Ignores passive browsing, polling, and failed requests.
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Ignore failed requests (4xx/5xx) so blocked or failed attempts aren't logged as completed actions
        if response.status_code >= 400:
            return response

        path = request.url.path
        path_lower = path.lower()

        # Skip static assets, docs, CORS preflight, and background polling noise
        if (
            request.method == "OPTIONS"
            or not path.startswith("/api/")
            or any(skip in path_lower for skip in [
                "/static/", "/favicon.ico", "/docs", "/openapi.json",
                "/heartbeat", "/ping", "/users/online", "/activity-logs"
            ])
        ):
            return response

        # Ignore ALL passive GET requests unless it is an explicit export or download
        if request.method == "GET":
            if not any(action in path_lower for action in ["export", "download"]):
                return response

        # Precision FNUM resolution from session state or Authorization Bearer token
        fnum = getattr(request.state, "user_fnum", None) or request.headers.get("X-User-Fnum", None)

        if not fnum:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                try:
                    token = auth_header.split(" ")[1]
                    parts = token.split(".")
                    if len(parts) >= 2:
                        payload_segment = parts[1]
                        padding = '=' * (-len(payload_segment) % 4)
                        decoded_bytes = base64.urlsafe_b64decode(payload_segment + padding)
                        payload = json.loads(decoded_bytes.decode('utf-8'))
                        fnum = payload.get("sub") or payload.get("fnum") or payload.get("username")
                except Exception:
                    pass

        fnum = fnum or "SYSTEM_OFFICER"

        # Extract downloaded filename from Content-Disposition header, or uploaded filename from request.state
        file_detail = getattr(request.state, "audit_detail", None)
        if not file_detail:
            disposition = response.headers.get("content-disposition", "")
            match = re.search(r'filename="?([^";]+)"?', disposition, re.IGNORECASE)
            if match:
                file_detail = match.group(1).strip()

        await asyncio.to_thread(_write_middleware_audit_sync, fnum, request.method, path, file_detail)

        return response


# Compatibility alias
def log_independent_activity(logs_db: Session, fnum: str, action: str, module: str, details: str):
    """Legacy wrapper mapping to record_neon_activity for backward compatibility."""
    record_neon_activity(
        logs_db=logs_db,
        fnum=fnum,
        action_type=action,
        module=module,
        target_id="LEGACY_ACTION",
        changes_summary=details
    )