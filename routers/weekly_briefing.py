# routers/weekly_briefing.py
import os
import asyncio
from datetime import datetime, timedelta
import pytz
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema
from sqlalchemy.orm import sessionmaker
from sqlalchemy import func, or_
from app.database import engine
from app import models

def get_model_safe(*names):
    """Safely fetch a model regardless of slight naming variations."""
    for name in names:
        if hasattr(models, name):
            return getattr(models, name)
    return None

def run_weekly_tactical_briefing_job(conf: ConnectionConfig, manual_dispatcher: dict = None, brief_type: str = "ALL"):
    eat_tz = pytz.timezone('Africa/Nairobi')
    now_eat = datetime.now(eat_tz).replace(tzinfo=None)
    one_week_ago = now_eat - timedelta(days=7)
    one_week_ago_str = one_week_ago.strftime("%Y-%m-%d")
    
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    email_payloads = []
    
    try:
        active_users = db.query(models.Users).filter(
            models.Users.is_approved == True,
            models.Users.email != None,
            models.Users.email != ""
        ).all()

        CrimeModel = get_model_safe('Crime_Reports', 'CrimeReports', 'crime_reports')
        AgricSummaryModel = get_model_safe('Agricultural_Crime_Summary', 'AgriculturalCrimeSummary')
        StoryModel = get_model_safe('Success_Stories', 'SuccessStories')
        StatsModel = get_model_safe('Operational_Statistics', 'OperationalStatistics')
        NomModel = get_model_safe('Nominal_Roll', 'NominalRoll')

        for user in active_users:
            station = str(user.station or "").strip().upper()
            region = str(user.region or "").strip().upper()
            is_global = user.role in ['SUPER_ADMIN', 'ADMIN', 'RPC'] or region in ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS']
            
            total_criminal_cases = 0
            total_agric_cases = 0
            total_success_stories = 0
            agric_success_stories = 0
            total_arrests = 0

            # 🟢 Filter Logic Based on requested brief_type
            if CrimeModel:
                cq = db.query(CrimeModel).filter(CrimeModel.date >= one_week_ago_str)
                if not is_global:
                    cq = cq.filter(func.upper(CrimeModel.station) == station)
                
                if brief_type == "ROBBERIES":
                    cq = cq.filter(CrimeModel.offence.ilike('%ROBBERY%'))
                elif brief_type == "AGRIC_CRIMES":
                    cq = cq.filter(func.upper(CrimeModel.category) == 'AGRIC_CRIME')
                elif brief_type == "SUDDEN_DEATHS":
                    cq = cq.filter(or_(CrimeModel.offence.ilike('%DEATH%'), CrimeModel.offence.ilike('%HOMICIDE%'), CrimeModel.offence.ilike('%MURDER%')))
                
                if brief_type != "ARRESTS":
                    total_criminal_cases = cq.count()
                    if hasattr(CrimeModel, 'category') and brief_type in ["ALL", "AGRIC_CRIMES"]:
                        total_agric_cases += cq.filter(func.upper(CrimeModel.category) == 'AGRIC_CRIME').count()

            if AgricSummaryModel and brief_type in ["ALL", "AGRIC_CRIMES"]:
                aq = db.query(AgricSummaryModel).filter(AgricSummaryModel.date >= one_week_ago_str)
                if not is_global:
                    aq = aq.filter(func.upper(AgricSummaryModel.station) == station)
                total_agric_cases += aq.count()

            if StoryModel and brief_type != "ARRESTS":
                sq = db.query(StoryModel).filter(StoryModel.date >= one_week_ago_str)
                if not is_global:
                    sq = sq.filter(func.upper(StoryModel.station) == station)
                total_success_stories = sq.count()
                if hasattr(StoryModel, 'category'):
                    agric_success_stories = sq.filter(func.upper(StoryModel.category) == 'AGRIC_CRIME').count()

            combined_agric_total = total_agric_cases + agric_success_stories

            if StatsModel:
                stat_q = db.query(func.sum(StatsModel.arrested)).filter(StatsModel.date >= one_week_ago_str)
                if not is_global:
                    stat_q = stat_q.filter(func.upper(StatsModel.station) == station)
                total_arrests = stat_q.scalar() or 0

            # Dynamic Email Titles and Audit Footer
            dispatch_type_label = "AUTOMATED MONDAY DISPATCH"
            email_subject = f"Weekly Command Briefing & Situation Report: {station}"
            
            if manual_dispatcher:
                dispatch_type_label = f"MANUALLY DISPATCHED BY COMMANDER: {manual_dispatcher.get('rank', '')} {manual_dispatcher.get('name', '')} ({manual_dispatcher.get('fnum', '')})"
                
            if brief_type == "ROBBERIES":
                email_subject = f"TACTICAL ALERT: Robberies & Aggravated Offences Report - {station}"
            elif brief_type == "AGRIC_CRIMES":
                email_subject = f"TACTICAL ALERT: Agricultural Crimes Report - {station}"
            elif brief_type == "SUDDEN_DEATHS":
                email_subject = f"TACTICAL ALERT: Homicides & Sudden Deaths Report - {station}"
            elif brief_type == "ARRESTS":
                email_subject = f"TACTICAL ALERT: Lock-up & Arrests Summary - {station}"

            html_body = f"""
            <div style='font-family: Arial, sans-serif; color: #1e293b; max-width: 650px; line-height: 1.5; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;'>
                <div style='background-color: #0f172a; color: white; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px;'>
                    <h2 style='margin: 0; font-size: 18px;'>📊 KMP TACTICAL SITUATION REPORT (SITREP)</h2>
                    <p style='margin: 5px 0 0 0; font-size: 12px; color: #94a3b8;'>FOCUS: {brief_type.replace('_', ' ')}</p>
                </div>
                
                <p><strong>Jurisdiction:</strong> {station} ({region})</p>
                <p><strong>Receiving Officer:</strong> {user.rank} {user.name} ({user.fnum})</p>
                
                <div style='background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 10px 15px; margin: 15px 0;'>
                    <strong style='color: #1d4ed8; font-size: 11px; text-transform: uppercase;'>DISPATCH AUDIT TRAIL:</strong><br/>
                    <span style='font-family: monospace; font-size: 12px; font-weight: bold;'>{dispatch_type_label}</span>
                </div>
                
                <h3 style='color: #1e3a8a; margin-bottom: 8px;'>1. Operational Metrics (Last 7 Days)</h3>
                <ul style='margin-top: 0; padding-left: 20px;'>
                    {'<li><strong>Filtered Incidents Logged:</strong> ' + str(total_criminal_cases) + '</li>' if brief_type not in ["ARRESTS", "AGRIC_CRIMES"] else ''}
                    {'<li><strong>Agricultural Crimes & Security Cases:</strong> ' + str(combined_agric_total) + '</li>' if brief_type in ["ALL", "AGRIC_CRIMES"] else ''}
                    <li><strong>Total Suspects Arrested (Ops Stats):</strong> {int(total_arrests):,}</li>
                    {'<li><strong>Operational Breakthroughs (Success Stories):</strong> ' + str(total_success_stories) + '</li>' if brief_type != "ARRESTS" else ''}
                </ul>

                <h3 style='color: #1e3a8a; margin-top: 20px; margin-bottom: 8px;'>2. Commander Directives & Notice</h3>
                <p style='font-size: 13px;'>Commanders across all levels are instructed to strictly implement and emphasize the following measures:</p>
                <ul style='margin-top: 0; padding-left: 20px; font-size: 13px;'>
                    <li>Intensify intelligence-led disruptive operations targeting habitual offenders and criminal networks.</li>
                    <li>Drive purpose-driven community mobilization and active public sensitisation.</li>
                    <li>Maintain visible, active foot patrols in vulnerable residential and commercial sectors.</li>
                    <li>Ensure rigorous, prosecution-led investigations for watertight court cases.</li>
                </ul>

                <p style='font-size: 10px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; text-align: center;'>
                    Generated & dispatched by the KMP Centralised Security Data Management System.<br/>
                    Timestamp: {now_eat.strftime("%Y-%m-%d %H:%M:%S")} EAT
                </p>
            </div>
            """
            
            email_payloads.append({
                "email": user.email,
                "subject": email_subject,
                "body": html_body
            })

    except Exception as e:
        print(f"❌ Failed to build weekly briefing data: {e}")
    finally:
        db.close()

    # ASYNC EMAIL DISPATCHER
    async def send_all_emails():
        fm = FastMail(conf)
        for payload in email_payloads:
            message = MessageSchema(
                subject=payload["subject"],
                recipients=[payload["email"]],
                body=payload["body"],
                subtype="html"
            )
            try:
                await fm.send_message(message)
                print(f"✅ Dispatched sitrep to {payload['email']}")
            except Exception as mail_err:
                print(f"❌ Failed to dispatch brief to {payload['email']}: {mail_err}")

    try:
        loop = asyncio.get_running_loop()
        asyncio.run_coroutine_threadsafe(send_all_emails(), loop)
    except RuntimeError:
        asyncio.run(send_all_emails())