from pydantic import BaseModel, ConfigDict, Field, EmailStr, AliasChoices
from typing import Optional, List, Union, Dict, Any
from datetime import datetime, date

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
    nin: Optional[str] = None
    region: str
    division: str
    station: str
    position: str
    email: EmailStr
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
    nin: Optional[str] = None
    profile_photo_path: Optional[str] = None
    password: Optional[str] = None

class UserAccessUpdate(BaseModel):
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
    daily_lock_up: int = 0

class ReportResponse(ReportBase):
    id: int
    sn: Optional[int] = None
    last_updated_by: Optional[str] = None
    created_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# ==========================================
# 2. DISRUPTIVE & AGRICULTURAL STATISTICS
# ==========================================
class StatisticBase(BaseModel):
    region: str
    station: str
    date: str
    arrested: int
    givenBond: int = Field(0, validation_alias="given_bond")
    cautioned: int = 0
    pendingCourt: int = Field(0, validation_alias="pending_court")
    takenToCourt: int = Field(0, validation_alias="taken_to_court")
    released: int = 0
    remanded: int = 0
    convicted: int = 0

class StatisticResponse(StatisticBase):
    id: int
    sn: Optional[int] = None
    last_updated_by: Optional[str] = None
    created_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class AgricStatsBase(BaseModel):
    region: str
    station: str
    date: date
    arrested: Optional[int] = 0
    given_bond: Optional[int] = 0
    cautioned: Optional[int] = 0
    pending_court: Optional[int] = 0
    taken_to_court: Optional[int] = 0
    released: Optional[int] = 0
    remanded: Optional[int] = 0
    convicted: Optional[int] = 0

class AgricStatsCreate(AgricStatsBase):
    sn: Optional[int] = None
    last_updated_by: Optional[str] = None

class AgricStatsResponse(AgricStatsBase):
    id: int
    sn: Optional[int] = None
    last_updated_by: Optional[str] = None
    created_at: Optional[datetime] = None

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
    id: Optional[int] = None
    sn: int
    last_updated_by: Optional[str] = None
    created_at: Optional[datetime] = None
    
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
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# ==========================================
# 5. NOMINAL ROLL (Personnel Registry - ACTIVE)
# ==========================================
class NominalRollCreate(BaseModel):
    sn: Optional[int] = None
    f_num: str = Field(..., validation_alias=AliasChoices("fnum", "f_num"))
    rank: str
    name: str
    sex: Optional[str] = "MALE"
    position: Optional[str] = ""
    dob: Optional[str] = ""
    doe: Optional[str] = ""
    do_post: Optional[str] = Field(None, validation_alias=AliasChoices("do_post", "dopost", "doPost"))
    do_pro: Optional[str] = Field(None, validation_alias=AliasChoices("do_pro", "dopro", "doPro"))
    contact: Optional[str] = ""
    educ_level: Optional[str] = Field(None, validation_alias=AliasChoices("educ_level", "educlevel", "educLevel"))
    ipps: Optional[str] = ""
    tin: Optional[str] = ""
    nin: Optional[str] = ""
    home_dist: Optional[str] = Field(None, validation_alias=AliasChoices("home_dist", "homedist", "homeDist"))
    tribe: Optional[str] = ""
    acc_no: Optional[str] = Field(None, validation_alias=AliasChoices("acc_no", "accno", "accNo"))
    bank_branch: Optional[str] = Field(None, validation_alias=AliasChoices("bank_branch", "bankbranch", "bankBranch"))
    station: str
    district: Optional[str] = ""
    region: str
    section: Optional[str] = ""
    dir: Optional[str] = ""
    
    # Reintegration specific fields
    reintegration_reason: Optional[str] = None 
    previous_fnum: Optional[str] = None
    
    status: Optional[str] = "ACTIVE"
    last_updated_by: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class NominalRollResponse(NominalRollCreate):
    id: int


# ==========================================
# 6. NOMINAL ROLL ARCHIVE (Historical Ledger)
# ==========================================
class NominalRollArchiveResponse(BaseModel):
    id: int
    sn: Optional[int] = None
    
    fnum: str = Field(..., validation_alias=AliasChoices("fnum", "f_num"))
    rank: str
    name: str
    sex: Optional[str] = "MALE"
    position: Optional[str] = ""
    dob: Optional[str] = ""
    doe: Optional[str] = ""
    dopost: Optional[str] = Field(None, validation_alias=AliasChoices("do_post", "dopost", "doPost"))
    dopro: Optional[str] = Field(None, validation_alias=AliasChoices("do_pro", "dopro", "doPro"))
    contact: Optional[str] = ""
    educlevel: Optional[str] = Field(None, validation_alias=AliasChoices("educ_level", "educlevel", "educLevel"))
    ipps: Optional[str] = ""
    tin: Optional[str] = ""
    nin: Optional[str] = ""
    homedist: Optional[str] = Field(None, validation_alias=AliasChoices("home_dist", "homedist", "homeDist"))
    tribe: Optional[str] = ""
    accno: Optional[str] = Field(None, validation_alias=AliasChoices("acc_no", "accno", "accNo"))
    bankbranch: Optional[str] = Field(None, validation_alias=AliasChoices("bank_branch", "bankbranch", "bankBranch"))
    station: str
    district: Optional[str] = ""
    region: str
    section: Optional[str] = ""
    dir: Optional[str] = ""
    status: Optional[str] = "ARCHIVED"
    last_updated_by: Optional[str] = None
    created_at: Optional[datetime] = None
    
    archive_reason: Optional[str] = None
    archive_date: Optional[date] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class ArchiveRequest(BaseModel):
    archive_reason: str

# ==========================================
# 7. USER ACCOUNTS
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
    nin: Optional[str] = None
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
    nin: Optional[str] = None
    photoUrl: Optional[str] = None
    password: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    fnum: str
    rank: str
    name: str
    sex: str
    ipps: str
    nin: Optional[str] = None
    region: str
    division: str
    station: str
    position: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str
    is_approved: bool
    photoUrl: Optional[str] = Field(None, validation_alias="profile_photo_path") 
    created_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# ==========================================
# 8. SYSTEM AUDIT LOGS & HR REQUESTS
# ==========================================
class ModificationRequestCreate(BaseModel):
    fnum: str
    requestedRank: Optional[str] = Field(None, validation_alias="requested_rank")
    requestedName: Optional[str] = Field(None, validation_alias="requested_name")
    requestedRegion: Optional[str] = Field(None, validation_alias="requested_region")
    requestedStation: Optional[str] = Field(None, validation_alias="requested_station")

class ModificationRequestReview(BaseModel):
    status: str
    reason: Optional[str] = None

class ModificationRequestResponse(BaseModel):
    id: int
    fnum: str
    requested_rank: Optional[str] = None
    requested_name: Optional[str] = None
    requested_region: Optional[str] = None
    requested_station: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class Admin_CommunicationCreate(BaseModel):
    sender_fnum: str
    sender_name: str
    target_audience: str
    target_region: Optional[str] = None
    target_fnum: Optional[Union[str, List[str]]] = None
    message_type: str
    subject: str
    message: str
    send_email: bool = False
    requires_command_approval: Optional[bool] = False

class LogResponse(BaseModel):
    id: int
    user_fnum: str
    event_type: str
    details: Optional[str] = None
    status: str
    timestamp: Optional[datetime] = Field(None, validation_alias="created_at")
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class SessionLogRequest(BaseModel):
    fnum: str

class ActivityLogReq(BaseModel):
    action: str
    module: str
    details: str

class LockupMatrixBase(BaseModel):
    sd_ref: str
    date: str
    time: Optional[str] = None
    region: str
    station: str
    suspects: int
    
    male_count: int = 0
    male_juvenile_count: int = 0
    female_count: int = 0
    female_juvenile_count: int = 0
    detention_1day: int = 0
    detention_2days: int = 0
    detention_3days_over: int = 0

    last_updated_by: Optional[str] = None

class LockupMatrixCreate(LockupMatrixBase):
    pass

class LockupMatrixResponse(LockupMatrixBase):
    sn: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# ==========================================
# 9. AI ASSISTANT SCHEMA
# ==========================================
class AIQueryRequest(BaseModel):
    prompt: str
    target_region: Optional[str] = "ALL REGIONS"
    target_station: Optional[str] = "ALL STATIONS"

class AIQueryResponse(BaseModel):
    status: str
    jurisdiction: str
    response: str
    metadata: Optional[Dict[str, Any]] = None

class AILogBase(BaseModel):
    fnum: str
    prompt: str
    response: str
    target_region: Optional[str] = "ALL REGIONS"
    target_station: Optional[str] = "ALL STATIONS"

class AILogResponse(AILogBase):
    id: int
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# ==========================================
# 10. AGRICULTURAL CRIME SUMMARY LEDGER
# ==========================================
class AgricSummaryBase(BaseModel):
    region: str
    station: str
    date: str
    agric_crime_report: str
    number_count: int = 0
    recoveries: int = 0
    status: str

class AgricSummaryCreate(AgricSummaryBase):
    pass

class AgricSummaryResponse(AgricSummaryBase):
    id: int
    sn: Optional[int] = None
    last_updated_by: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)