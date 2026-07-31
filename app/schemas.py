from pydantic import BaseModel, ConfigDict, Field, EmailStr
from typing import Optional
from datetime import datetime

# ==========================================
# 0. PASSWORD MANAGEMENT SCHEMAS
# ==========================================
class PasswordChangeReq(BaseModel):
    old_password: str
    new_password: str

class ForcePasswordReq(BaseModel):
    new_password: str

class UserCreate(BaseModel):
    fnum: str
    rank: str
    name: str
    sex: str
    ipps: str
    region: str
    division: str
    station: str
    position: str
    email: EmailStr  # Validates that it's a real email format
    phone: str
    password: str
    role: str
    photoUrl: Optional[str] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    rank: Optional[str] = None
    region: Optional[str] = None
    station: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    profile_photo_path: Optional[str] = None
    password: Optional[str] = None

class UserAccessUpdate(BaseModel): # 🟢 ADDED: Missing Schema for Access Matrix Update
    role: str
    permissions: dict

# ==========================================
# 1. LIVE CRIME REGISTRY
# ==========================================
class ReportBase(BaseModel):
    sdRef: str = Field(validation_alias="sd_ref")
    region: str
    station: str
    date: str
    time: str
    narrative: str
    status: str
    suspects: int

class ReportResponse(ReportBase):
    id: int
    sn: int
    last_updated_by: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# ==========================================
# 2. DISRUPTIVE OPS STATISTICS
# ==========================================
class StatisticBase(BaseModel):
    region: str
    station: str
    date: str
    arrested: int
    givenBond: int = Field(validation_alias="given_bond")
    cautioned: int
    pendingCourt: int = Field(validation_alias="pending_court")
    takenToCourt: int = Field(validation_alias="taken_to_court")
    released: int
    remanded: int
    convicted: int

class StatisticResponse(StatisticBase):
    id: int
    sn: int
    last_updated_by: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# ==========================================
# 3. SUCCESS STORIES
# ==========================================
class StoryBase(BaseModel):
    region: str
    station: str
    date: str
    time: str
    narrative: str
    photoUrl: Optional[str] = Field(None, validation_alias="photo_url")
    status: str

class StoryResponse(StoryBase):
    id: int
    sn: int
    last_updated_by: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# ==========================================
# 4. REGIONAL ESTABLISHMENTS
# ==========================================
class EstablishmentBase(BaseModel):
    region: str
    division: str
    station: str
    personnel_in_station: int = 0
    sub_station: Optional[str] = None
    personnel_in_sub_station: int = 0
    post: Optional[str] = None
    personnel_in_post: int = 0
    booths: int = 0
    personnel_in_booth: int = 0
    installed_by: Optional[str] = None
    location: Optional[str] = None
    status: str = "OPERATIONAL"
    comment: Optional[str] = None

class EstablishmentResponse(EstablishmentBase):
    id: int
    last_updated_by: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# 5. NOMINAL ROLL (Personnel Registry)
# ==========================================
class NominalRollCreate(BaseModel):
    sn: Optional[int] = None
    fnum: str
    rank: str
    name: str
    sex: Optional[str] = "MALE"
    position: Optional[str] = ""
    dob: Optional[str] = ""
    doe: Optional[str] = ""
    doPost: Optional[str] = Field(None, validation_alias="do_post")
    doPro: Optional[str] = Field(None, validation_alias="do_pro")
    contact: Optional[str] = ""
    educLevel: Optional[str] = Field(None, validation_alias="educ_level")
    ipps: Optional[str] = ""
    tin: Optional[str] = ""
    nin: Optional[str] = ""
    homeDist: Optional[str] = Field(None, validation_alias="home_dist")
    tribe: Optional[str] = ""
    accNo: Optional[str] = Field(None, validation_alias="acc_no")
    bankBranch: Optional[str] = Field(None, validation_alias="bank_branch")
    station: str
    district: Optional[str] = ""
    region: str
    section: Optional[str] = ""
    dir: Optional[str] = ""
    status: Optional[str] = "ACTIVE"
    archiveReason: Optional[str] = Field(None, validation_alias="archive_reason")
    archiveDate: Optional[str] = Field(None, validation_alias="archive_date")
    last_updated_by: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)    

class NominalRollResponse(NominalRollCreate):
    id: int
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class ArchiveRequest(BaseModel): # 🟢 ADDED: Missing Schema for Archiving Personnel
    archive_reason: str

# ==========================================
# 6. USER ACCOUNTS
# ==========================================
class LoginRequest(BaseModel):
    fnum: str
    password: str

class SignupRequest(BaseModel):
    fnum: str
    rank: str
    name: str
    sex: str
    ipps: str
    region: str
    division: str
    station: str
    position: str
    email: str
    phone: str
    password: str
    role: str
    photoUrl: Optional[str] = None

class ProfileUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    photoUrl: Optional[str] = None
    password: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    fnum: str
    rank: str
    name: str
    sex: str
    ipps: str
    region: str
    division: str
    station: str
    position: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str
    is_approved: bool
    photoUrl: Optional[str] = Field(None, validation_alias="profile_photo_path") 
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# ==========================================
# 7. SYSTEM AUDIT LOGS & HR REQUESTS
# ==========================================

class ModificationRequestCreate(BaseModel):
    fnum: str
    requestedRank: Optional[str] = Field(None, validation_alias="requested_rank")
    requestedName: Optional[str] = Field(None, validation_alias="requested_name")
    requestedRegion: Optional[str] = Field(None, validation_alias="requested_region")
    requestedStation: Optional[str] = Field(None, validation_alias="requested_station")

class ModificationRequestReview(BaseModel):
    status: str # "APPROVED" or "REJECTED"
    reason: Optional[str] = None # 🟢 Captures rejection reason from the frontend prompt

class ModificationRequestResponse(BaseModel):
    id: int
    fnum: str
    requested_rank: Optional[str] = None
    requested_name: Optional[str] = None
    requested_region: Optional[str] = None
    requested_station: Optional[str] = None
    status: str
    created_at: datetime
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class Admin_CommunicationCreate(BaseModel):
    sender_fnum: str
    sender_name: str
    target_audience: str
    target_region: Optional[str] = None
    target_fnum: Optional[str] = None 
    message_type: str
    subject: str
    message: str
    send_email: bool = False

class LogResponse(BaseModel):
    id: int
    user_fnum: str
    event_type: str
    details: str
    status: str
    timestamp: datetime
    
    model_config = ConfigDict(from_attributes=True)

class SessionLogRequest(BaseModel): # 🟢 Dashboard Access Audit Log
    fnum: str

# 🟢 FIXED: This now perfectly matches the 4 fields your React frontend is sending!
class ActivityLogReq(BaseModel):
    fnum: str
    action: str
    module: str
    details: str