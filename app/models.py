from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, ForeignKey, UniqueConstraint, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime
import pytz

def get_eat_time():
    """Returns the current East Africa Time (EAT) without timezone offset for clean database storage."""
    eat = pytz.timezone('Africa/Nairobi')
    return datetime.now(eat).replace(tzinfo=None)

# ==========================================
# 1. LIVE CRIME REGISTRY & SUSPECT LOCKUPS
# ==========================================
class Crime_Reports(Base):
    __tablename__ = "crime_reports"
    __table_args__ = (
        UniqueConstraint('sd_ref', 'station', name='uix_sd_station'),
        {'extend_existing': True}
    )

    id = Column(Integer, primary_key=True, index=True)
    sn = Column(Integer, index=True, unique=True)
    sd_ref = Column(String, index=True) 
    region = Column(String, index=True)
    station = Column(String, index=True)
    date = Column(String)
    time = Column(String)
    offence = Column(String)
    narrative = Column(Text)
    status = Column(String, default="ACTIVE INVESTIGATION")
    suspects = Column(Integer, default=0)
    
    # Daily lock-up population column
    daily_lock_up = Column(Integer, default=0) 
    
    last_updated_by = Column(String)
    created_at = Column(DateTime, default=get_eat_time)

    suspect_details = relationship("Suspect_Lockup", back_populates="crime_report", cascade="all, delete-orphan")


class Suspect_Lockup(Base):
    __tablename__ = "suspect_lockup"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("crime_reports.id", ondelete="CASCADE"), nullable=False)
    
    name = Column(String, nullable=False)
    sex = Column(String, default="MALE")
    age = Column(String, nullable=True)
    tribe = Column(String, nullable=True)
    nationality = Column(String, nullable=True)
    residence = Column(String, nullable=True)
    contact = Column(String, nullable=True)
    mental_health_status = Column(String, default="NORMAL")
    photo_url = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=get_eat_time)

    crime_report = relationship("Crime_Reports", back_populates="suspect_details")

# ==========================================
# 2. DISRUPTIVE & AGRICULTURAL STATISTICS
# ==========================================
class Operational_Statistics(Base):
    __tablename__ = "operational_statistics"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    sn = Column(Integer, index=True, unique=True)
    region = Column(String, index=True)
    station = Column(String, index=True)
    date = Column(String, index=True)
    arrested = Column(Integer, default=0)
    given_bond = Column(Integer, default=0)
    cautioned = Column(Integer, default=0)
    pending_court = Column(Integer, default=0)
    taken_to_court = Column(Integer, default=0)
    released = Column(Integer, default=0)
    remanded = Column(Integer, default=0)
    convicted = Column(Integer, default=0)
    last_updated_by = Column(String)
    created_at = Column(DateTime, default=get_eat_time)


class AgricCrimeStatistics(Base):
    __tablename__ = "agric_crimes_statistics"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    sn = Column(Integer, nullable=True)
    region = Column(String, nullable=False)
    station = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    arrested = Column(Integer, default=0)
    given_bond = Column(Integer, default=0)
    cautioned = Column(Integer, default=0)
    pending_court = Column(Integer, default=0)
    taken_to_court = Column(Integer, default=0)
    released = Column(Integer, default=0)
    remanded = Column(Integer, default=0)
    convicted = Column(Integer, default=0)
    last_updated_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_eat_time)

# ==========================================
# 3. SUCCESS STORIES
# ==========================================
class Success_Stories(Base):
    __tablename__ = "success_stories"
    __table_args__ = {'extend_existing': True}
    
    sn = Column(Integer, primary_key=True, index=True) 
    date = Column(String)
    time = Column(String)
    region = Column(String)
    station = Column(String)
    narrative = Column(Text, nullable=False)
    status = Column(String, default="COMPLETED / SUCCESS")
    photo_url = Column(String, nullable=True)
    last_updated_by = Column(String)
    created_at = Column(DateTime, default=get_eat_time)

# ==========================================
# 4. REGIONAL ESTABLISHMENTS
# ==========================================
class Establishments(Base):
    __tablename__ = "establishments"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    region = Column(String, index=True)
    division = Column(String, index=True)
    station = Column(String, index=True)
    personnel_in_station = Column(Integer, default=0)
    sub_station = Column(String, nullable=True)
    personnel_in_sub_station = Column(Integer, default=0)
    post = Column(String, nullable=True)
    personnel_in_post = Column(Integer, default=0)
    booths = Column(Integer, default=0)
    personnel_in_booth = Column(Integer, default=0)
    installed_by = Column(String, nullable=True)
    location = Column(String, nullable=True)
    status = Column(String, default="OPERATIONAL")
    comment = Column(Text, nullable=True)
    last_updated_by = Column(String)
    created_at = Column(DateTime, default=get_eat_time)

# ==========================================
# 5. NOMINAL ROLL (Personnel Registry)
# ==========================================
class NominalRoll(Base):
    __tablename__ = "nominal_roll"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sn = Column(Integer, nullable=True)
    f_num = Column(String, index=True)
    rank = Column(String)
    name = Column(String)
    sex = Column(String)
    position = Column(String)
    dob = Column(String)
    doe = Column(String)
    do_post = Column(String)
    do_pro = Column(String)
    contact = Column(String)
    educ_level = Column(String)
    ipps = Column(String)
    tin = Column(String)
    nin = Column(String)
    home_dist = Column(String)
    tribe = Column(String)
    acc_no = Column(String)
    bank_branch = Column(String)
    station = Column(String)
    district = Column(String)
    region = Column(String)
    section = Column(String)
    dir = Column(String)
    status = Column(String)
    last_updated_by = Column(String)
    created_at = Column(DateTime, server_default=func.now())

# ==========================================
# 6. NOMINAL ROLL ARCHIVE
# ==========================================
class NominalRollArchive(Base):
    __tablename__ = "nominal_roll_archive"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    sn = Column(Integer, nullable=True)
    fnum = Column(String, index=True)
    rank = Column(String)
    name = Column(String)
    sex = Column(String)
    position = Column(String)
    dob = Column(String)
    doe = Column(String)
    dopost = Column(String) 
    dopro = Column(String)  
    contact = Column(String)
    educlevel = Column(String) 
    ipps = Column(String)
    tin = Column(String)
    nin = Column(String)
    homedist = Column(String) 
    tribe = Column(String)
    accno = Column(String)    
    bankbranch = Column(String) 
    station = Column(String)
    district = Column(String)
    region = Column(String)
    section = Column(String)
    dir = Column(String)
    status = Column(String)
    last_updated_by = Column(String)
    created_at = Column(DateTime)
    archive_reason = Column(String, nullable=True)
    archive_date = Column(DateTime, server_default=func.now())

# ==========================================
# 7. USER ACCOUNTS
# ==========================================
class Users(Base):
    __tablename__ = "users"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    fnum = Column("fNum", String, unique=True, index=True)   
    rank = Column(String)
    name = Column(String)
    sex = Column(String)
    ipps = Column(String, unique=True)
    region = Column(String)
    division = Column(String)
    station = Column(String)
    position = Column(String)
    email = Column(String)
    phone = Column(String)
    hashed_password = Column(String)
    role = Column(String, default="USER")
    is_approved = Column(Boolean, default=False)
    profile_photo_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_eat_time)
    permissions = Column(JSON, default={})
    last_active_at = Column(DateTime, nullable=True)

# ==========================================
# 8. SYSTEM AUDIT & ACTIVITY LOGS
# ==========================================
class Modification_Requests(Base):
    __tablename__ = "modification_requests"
    __table_args__ = {'extend_existing': True} 
    
    id = Column(Integer, primary_key=True, index=True)
    fnum = Column(String, ForeignKey("users.fNum", onupdate="CASCADE"), index=True) 
    requested_rank = Column(String, nullable=True)
    requested_name = Column(String, nullable=True)
    requested_region = Column(String, nullable=True)
    requested_station = Column(String, nullable=True)
    status = Column(String, default="PENDING") 
    created_at = Column(DateTime, default=get_eat_time)
    reviewed_by = Column(String, nullable=True) 
    reviewed_at = Column(DateTime(timezone=True), nullable=True)


class Audit_Logs(Base):
    __tablename__ = "audit_logs"
    __table_args__ = {'extend_existing': True} 
    
    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String)
    target_user = Column(String, nullable=True) 
    status = Column(String, default="SUCCESS") 
    details = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_eat_time)
    user_fnum = Column(String, ForeignKey("users.fNum", onupdate="CASCADE"), index=True)


class Activity_Logs(Base):
    __tablename__ = "activity_logs"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    fnum = Column(String, index=True)
    action = Column(String, nullable=True)
    module = Column(String, nullable=True)
    details = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_eat_time)

# ==========================================
# 9. ADMIN COMMUNICATION
# ==========================================
class Admin_Communication(Base):
    __tablename__ = "Admin_Communication"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    msg_ref = Column(String, index=True, nullable=True)
    sender_fnum = Column(String, ForeignKey("users.fNum", onupdate="CASCADE"), index=True)
    sender_name = Column(String)
    target_audience = Column(String, index=True)
    target_region = Column(String, index=True, nullable=True)
    target_fnum = Column(JSON, nullable=True) 
    message_type = Column(String)
    subject = Column(String)
    message = Column(Text)
    status = Column(String, default="ACTIVE")
    created_at = Column(DateTime, default=get_eat_time)


class Communication_Reads(Base):
    __tablename__ = "communication_reads"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    comm_id = Column(Integer, index=True)
    fnum = Column(String, ForeignKey("users.fNum", onupdate="CASCADE"), index=True)
    read_at = Column(DateTime(timezone=True), server_default=func.now())

# ==========================================
# 10. RECOVERY, CONFIG, ARCHIVE & TEMPLATES
# ==========================================
class Password_Reset_Requests(Base):
    __tablename__ = "password_reset_requests"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    fnum = Column(String, ForeignKey("users.fNum", onupdate="CASCADE"), nullable=False)
    name = Column(String)
    rank = Column(String)
    station = Column(String)
    region = Column(String)
    status = Column(String, default="PENDING") 
    request_date = Column(DateTime, default=get_eat_time)


class PasswordResets(Base):
    __tablename__ = "password_resets"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    fnum = Column(String, index=True, nullable=False)
    token = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_eat_time)


class SystemConfig(Base):
    __tablename__ = "system_config"
    __table_args__ = {'extend_existing': True}
    
    config_key = Column(String, primary_key=True, index=True)
    config_value = Column(String, nullable=True)


class DocumentArchive(Base):
    __tablename__ = "document_archive"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, nullable=False)
    doc_type = Column(String, nullable=False)
    file_size = Column(String, nullable=True)
    file_path = Column(String, nullable=False)
    region = Column(String, nullable=True)
    station = Column(String, nullable=True)
    uploaded_by = Column(String, nullable=True)
    upload_date = Column(DateTime, default=get_eat_time)


class CommandTemplate(Base):
    __tablename__ = "command_templates"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, nullable=False)
    doc_type = Column(String, nullable=False, default="Command Template")
    file_size = Column(String, nullable=True)
    file_path = Column(String, nullable=False)
    region = Column(String, nullable=True, default="KMP HEADQUARTERS")
    station = Column(String, nullable=True, default="HQ")
    uploaded_by = Column(String, nullable=True)
    upload_date = Column(DateTime, default=get_eat_time)


class LockupMatrix(Base):
    __tablename__ = "lockup_matrix"
    __table_args__ = {'extend_existing': True}

    sn = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sd_ref = Column(String, unique=True, index=True, nullable=False) 
    date = Column(String, index=True, nullable=False)               
    time = Column(String, nullable=True)                               
    region = Column(String, index=True, nullable=False)              
    station = Column(String, index=True, nullable=False)             
    suspects = Column(Integer, default=0, nullable=False)             
    
    male_count = Column(Integer, default=0, nullable=False)          
    male_juvenile_count = Column(Integer, default=0, nullable=False)
    female_count = Column(Integer, default=0, nullable=False)         
    female_juvenile_count = Column(Integer, default=0, nullable=False)
    detention_1day = Column(Integer, default=0, nullable=False)      
    detention_2days = Column(Integer, default=0, nullable=False)     
    detention_3days_over = Column(Integer, default=0, nullable=False)

    last_updated_by = Column(String, nullable=True)                  
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class GeneralDocuments(Base):
    __tablename__ = "general_documents"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, nullable=False)
    doc_type = Column(String, nullable=False, default="General Document")
    file_size = Column(String, nullable=True)
    file_path = Column(String, nullable=False)
    region = Column(String, nullable=True, default="KMP HEADQUARTERS")
    station = Column(String, nullable=True, default="HQ")
    uploaded_by = Column(String, nullable=True)
    upload_date = Column(DateTime, default=get_eat_time)

# Add compatibility alias at the bottom
General_Documents = GeneralDocuments

class OperationalDocumentEmbedding(Base):
    __tablename__ = "operational_document_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(String(100), nullable=False, index=True)
    document_type = Column(String(50), nullable=False)
    title = Column(String(255))
    chunk_index = Column(Integer, default=0)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536))
    region = Column(String(100), index=True)
    division = Column(String(100), index=True)
    station = Column(String(100), index=True)
    sd_ref = Column(String(100), index=True)
    created_at = Column(DateTime)

# =====================================================================
# 11. CROSS-ROUTER COMPATIBILITY ALIASES
# (Prevents naming crashes across different modular routers)
# =====================================================================
CrimeReports = Crime_Reports
OperationalStatistics = Operational_Statistics
SuccessStories = Success_Stories
AuditLogs = Audit_Logs
ActivityLogs = Activity_Logs
ModificationRequests = Modification_Requests
PasswordResetRequests = Password_Reset_Requests
CommunicationReads = Communication_Reads
AdminCommunication = Admin_Communication