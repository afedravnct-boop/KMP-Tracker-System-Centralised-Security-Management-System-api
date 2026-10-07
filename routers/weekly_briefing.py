# routers/weekly_briefing.py
import os
import asyncio
from datetime import datetime, timedelta
import pytz
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.database import engine
from app import models

def run_weekly_tactical_briefing_job(conf: ConnectionConfig):
    eat_tz = pytz.timezone('Africa/Nairobi')
    now_eat = datetime.now(eat_tz).replace(tzinfo=None)
    one_week_ago = now_eat - timedelta(days=7)
    
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        active_users = db.query(models.Users).filter(
            models.Users.is_approved == True,
            models.Users.email != None,
            models.Users.email != ""
        ).all()
        
        fm = FastMail(conf)
        
        async def process_and_send_emails():
            for user in active_users:
                station = user.station
                region = user.region
                is_global = user.role in ['SUPER_ADMIN', 'ADMIN', 'RPC'] or str(region).upper() in ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS']
                
                crime_filter = "" if is_global else f" AND station = '{station}'"
                stats_filter = "" if is_global else f" AND station = '{station}'"
                story_filter = "" if is_global else f" AND station = '{station}'"
                
                # 1. Total Criminal Cases Entered in the Week
                try:
                    total_criminal_cases = db.execute(text(f"SELECT COUNT(*) FROM reports WHERE created_at >= :start {crime_filter}"), {"start": one_week_ago}).scalar() or 0
                except Exception:
                    total_criminal_cases = 0

                # 2. Total Agricultural Crimes Entered in the Week
                try:
                    total_agric_cases = db.execute(text(f"SELECT COUNT(*) FROM reports WHERE created_at >= :start AND (UPPER(offence) LIKE '%PRODUCE%' OR UPPER(offence) LIKE '%CATTLE%' OR UPPER(offence) LIKE '%COW%' OR UPPER(offence) LIKE '%LIVESTOCK%' OR UPPER(offence) LIKE '%CROP%' OR UPPER(offence) LIKE '%COFFEE%' OR UPPER(offence) LIKE '%VANILLA%' OR UPPER(offence) LIKE '%MAIZE%') {crime_filter}"), {"start": one_week_ago}).scalar() or 0
                except Exception:
                    total_agric_cases = 0

                # 3. Total Suspects Arrested in That Week
                try:
                    total_arrests = db.execute(text(f"SELECT SUM(arrested) FROM stats WHERE date >= :start {stats_filter}"), {"start": one_week_ago.date()}).scalar() or 0
                except Exception:
                    total_arrests = 0

                # 4. Total Success Stories / Operational Breakthroughs
                try:
                    total_success_stories = db.execute(text(f"SELECT COUNT(*) FROM success_stories WHERE created_at >= :start {story_filter}"), {"start": one_week_ago}).scalar() or 0
                except Exception:
                    total_success_stories = 0

                # 5. Total Personnel Strength as per Nominal Roll
                try:
                    total_personnel = db.execute(text("SELECT COUNT(*) FROM nominal_roll")).scalar() or 0
                except Exception:
                    total_personnel = 0

                html_body = f"""
                <div style='font-family: Arial, sans-serif; color: #1e293b; max-width: 650px; line-height: 1.5;'>
                    <h2 style='color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px;'>📊 KMP WEEKLY COMMAND BRIEFING & SITUATION REPORT</h2>
                    <p><strong>Jurisdiction:</strong> {station} ({region})</p>
                    <p><strong>Officer:</strong> {user.rank} {user.name} ({user.fnum})</p>
                    <hr style='border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;'/>
                    
                    <h3 style='color: #1e3a8a; margin-bottom: 8px;'>1. Weekly Operational Metrics</h3>
                    <ul style='margin-top: 0; padding-left: 20px;'>
                        <li><strong>Total Criminal Cases Entered:</strong> {total_criminal_cases:,}</li>
                        <li><strong>Total Agricultural Cases Entered:</strong> {total_agric_cases:,}</li>
                        <li><strong>Total Suspects Arrested:</strong> {total_arrests:,}</li>
                        <li><strong>Total Success Stories / Breakthroughs:</strong> {total_success_stories:,}</li>
                        <li><strong>Total Personnel Strength (Nominal Roll):</strong> {total_personnel:,}</li>
                    </ul>

                    <h3 style='color: #1e3a8a; margin-top: 15px; margin-bottom: 8px;'>2. Commander Strategies & Operational Directives</h3>
                    <p>Commanders across all levels are instructed to strictly implement and emphasize the following measures to combat crime:</p>
                    <ul style='margin-top: 0; padding-left: 20px;'>
                        <li>Intensify intelligence-led disruptive operations targeting habitual offenders and criminal networks.</li>
                        <li>Drive purpose-driven community mobilization and active public sensitisation.</li>
                        <li>Maintain visible, active foot patrols in vulnerable residential and commercial sectors.</li>
                        <li>Ensure rigorous, prosecution-led investigations for watertight court cases.</li>
                        <li>Bolster interagency cooperation and cross-unit teamwork.</li>
                        <li>Uphold absolute transparency, professional conduct, and positive public-police relations.</li>
                    </ul>

                    <p style='font-size: 11px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; paddingTop: 10px;'>
                        Auto-generated and dispatched by the KMP Centralised Security Data Management System.
                    </p>
                </div>
                """
                message = MessageSchema(
                    subject=f"Weekly Command Briefing & Situation Report: {station}",
                    recipients=[user.email],
                    body=html_body,
                    subtype="html"
                )
                
                try:
                    await fm.send_message(message)
                except Exception as mail_err:
                    print(f"Failed to dispatch brief to {user.email}: {mail_err}")

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(process_and_send_emails(), loop)
            else:
                asyncio.run(process_and_send_emails())
        except Exception as loop_err:
            print(f"Scheduler event loop error: {loop_err}")
            try:
                asyncio.run(process_and_send_emails())
            except Exception as inner_err:
                print(f"Secondary scheduler dispatch failed: {inner_err}")

    except Exception as e:
        print(f"Dynamic scheduler error: {e}")
    finally:
        db.close()