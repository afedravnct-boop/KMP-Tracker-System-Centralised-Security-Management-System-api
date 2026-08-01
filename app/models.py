from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, UniqueConstraint, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime
import pytz
from sqlalchemy.orm import declarative_base

def get_eat_time():
    # Explicitly set to Africa/Nairobi (which is EAT)
    eat = pytz.timezone('Africa/Nairobi')
    return datetime.now(eat).replace(tzinfo=None)

# ==========================================
# 1. LIVE CRIME REGISTRY
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
    last_updated_by = Column(String)
    created_at = Column(DateTime, default=get_eat_time)

    # String reference solves circular dependency
    suspect_details = relationship("Suspect_Lockup", back_populates="crime_report", cascade="all, delete-orphan")

class Suspect_Lockup(Base):
    __tablename__ = "suspect_lockup"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    sd_ref = Column(Integer, ForeignKey("crime_reports.sn")) 
    name = Column(String, index=True)
    sex = Column(String)
    age = Column(String, nullable=True)
    tribe = Column(String, nullable=True)
    residence = Column(String, nullable=True)
    contact = Column(String, nullable=True)
    mental_health_status = Column(String, nullable=True)
    photo_url = Column(String, nullable=True) 

    crime_report = relationship("Crime_Reports", back_populates="suspect_details")

# ==========================================
# 2. DISRUPTIVE OPS STATISTICS
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

# ==========================================
# 3. SUCCESS STORIES
# ==========================================
class Success_Stories(Base):
    __tablename__ = "success_stories"
    __table_args__ = {'extend_existing': True}
    
    sn = Column(Integer, primary_key=True) 
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
class Nominal_Roll_Archive(Base):
    __tablename__ = "nominal_roll_archive"
    
    id = Column(Integer, primary_key=True, index=True)
    sn = Column(Integer, nullable=True)
    fnum = Column(String, index=True) # Note: Archive uses fnum without underscore
    rank = Column(String)
    name = Column(String)
    sex = Column(String)
    position = Column(String)
    dob = Column(String)
    doe = Column(String)
    dopost = Column(String) # Archive version
    dopro = Column(String)  # Archive version
    contact = Column(String)
    educlevel = Column(String) # Archive version
    ipps = Column(String)
    tin = Column(String)
    nin = Column(String)
    homedist = Column(String) # Archive version
    tribe = Column(String)
    accno = Column(String)    # Archive version
    bankbranch = Column(String) # Archive version
    station = Column(String)
    district = Column(String)
    region = Column(String)
    section = Column(String)
    dir = Column(String)
    status = Column(String)
    last_updated_by = Column(String)
    created_at = Column(DateTime)
    archive_reason = Column(String)
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
    target_user = Column(String) 
    status = Column(String) 
    details = Column(String)
    created_at = Column(DateTime, default=get_eat_time)
    user_fnum = Column(String, ForeignKey("users.fNum", onupdate="CASCADE"), index=True)

# 🟢 ACTIVITY LOGS (Perfectly matched to NeonDB columns: id, fnum, action, module, details, created_at)
class Activity_Logs(Base):
    __tablename__ = "activity_logs"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    fnum = Column(String, index=True)
    action = Column(String, nullable=True)
    module = Column(String, nullable=True)
    details = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_eat_time)  # Changed to get_eat_time for consistency

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
    target_fnum = Column(String, index=True, nullable=True)
    message_type = Column(String)
    subject = Column(String)
    message = Column(Text)
    status = Column(String, default="ACTIVE")
    created_at = Column(DateTime, default=get_eat_time)

# ==========================================
# 10. COMMUNICATION READ RECEIPTS & PASSWORD RESETS
# ==========================================
class Communication_Reads(Base):
    __tablename__ = "communication_reads"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    comm_id = Column(Integer, index=True)
    fnum = Column(String, ForeignKey("users.fNum", onupdate="CASCADE"), index=True)
    read_at = Column(DateTime(timezone=True), server_default=func.now())

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