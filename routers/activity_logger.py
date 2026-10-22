# routers/activity_logger.py
from datetime import datetime
import base64
import json
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
        if any(noise in target_str for noise in ["/heartbeat", "/ping", "/poll", "/notifications", "/unread", "/favicon.ico"]):
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


class SystemActivityMiddleware(BaseHTTPMiddleware):
    """
    Transparently watches system activity and translates raw HTTP requests
    into crystal-clear, human-readable operational audit narratives.
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        path = request.url.path
        
        # Skip static assets, docs, and browser noise
        if any(skip in path for skip in ["/static/", "/favicon.ico", "/docs", "/openapi.json", "/heartbeat", "/ping"]) or request.method == "OPTIONS":
            return response

        if not path.startswith("/api/"):
            return response

        # Filter GET requests unless they are critical read operations
        if request.method == "GET":
            if not any(explicit in path for explicit in ["export", "audit", "dossier", "users", "approve", "general-documents"]):
                return response

        # Precision FNUM resolution
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

        # Lookup Officer Rank & Name from database for crystal-clear audit logging
        officer_rank = "OFFICER"
        officer_name = ""
        main_db = None
        try:
            main_db = next(database.get_db())
            UserModal = getattr(models, 'Users', getattr(models, 'User', None))
            if UserModal:
                user_obj = main_db.query(UserModal).filter(UserModal.fnum == fnum).first() or \
                           main_db.query(UserModal).filter(UserModal.fNum == fnum).first()
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

        # 🟢 INTELLIGENT PATH-TO-NARRATIVE TRANSLATOR
        path_lower = path.lower()
        module_name = "GENERAL_SYSTEM"
        action_type = "EXECUTE"
        narrative = f"Officer [{officer_signature}] executed operation on {path}."

        if "crime-reports" in path_lower:
            module_name = "CRIME_REGISTRY"
            if request.method == "POST":
                action_type = "REGISTER"
                narrative = f"Officer [{officer_signature}] submitted a new crime report."
            elif request.method == "GET":
                action_type = "VIEW"
                narrative = f"Officer [{officer_signature}] accessed and reviewed the crime registry."
            elif request.method in ["PUT", "PATCH"]:
                action_type = "UPDATE"
                narrative = f"Officer [{officer_signature}] updated an existing crime report."

        elif "general-documents" in path_lower or "general-docs" in path_lower:
            module_name = "GENERAL_DOCUMENTS"
            if request.method == "GET":
                action_type = "VIEW"
                narrative = f"Officer [{officer_signature}] opened and read general documents."
            elif request.method == "POST":
                action_type = "REGISTER"
                narrative = f"Officer [{officer_signature}] uploaded a new general document/report."

        elif "statistics" in path_lower or "operational-statistics" in path_lower or "agric" in path_lower:
            module_name = "OPERATIONAL_STATISTICS"
            if request.method == "POST":
                action_type = "REGISTER"
                narrative = f"Officer [{officer_signature}] submitted statistics."
            else:
                action_type = "VIEW"
                narrative = f"Officer [{officer_signature}] reviewed operational statistics."

        elif "lockup" in path_lower:
            module_name = "SUSPECT_LOCKUP"
            action_type = "UPDATE" if request.method in ["POST", "PUT"] else "VIEW"
            narrative = f"Officer [{officer_signature}] updated the suspect lock-up matrix."

        elif "exhibits" in path_lower:
            module_name = "IMPOUNDED_EXHIBITS"
            action_type = "REGISTER" if request.method == "POST" else "VIEW"
            narrative = f"Officer [{officer_signature}] managed impounded fleet and exhibits records."

        elif "nominal-roll" in path_lower:
            module_name = "NOMINAL_ROLL"
            action_type = "UPDATE" if request.method in ["POST", "PUT"] else "VIEW"
            narrative = f"Officer [{officer_signature}] accessed or updated the personnel nominal roll."

        elif "users" in path_lower or "approve" in path_lower:
            module_name = "USER_MANAGEMENT"
            action_type = "UPDATE"
            narrative = f"Officer [{officer_signature}] performed user authorization or management action."

        else:
            path_parts = path.strip("/").split("/")
            module_name = path_parts[2].upper().replace("-", "_") if len(path_parts) > 2 else "GENERAL_SYSTEM"
            method_map = {"GET": "VIEW", "POST": "REGISTER", "PUT": "UPDATE", "PATCH": "UPDATE", "DELETE": "DELETE"}
            action_type = method_map.get(request.method, "EXECUTE")
            narrative = f"Officer [{officer_signature}] performed HTTP {request.method} on {path}."

        # Commit to NeonDB logs branch
        logs_db = None
        try:
            logs_db = next(database.get_logs_db())
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

        return response