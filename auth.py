from fastapi import APIRouter, Depends, HTTPException, status, Form
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import timedelta
from jose import jwt, JWTError

# Import logic
from app.core import security
from app import database
from app import schemas
from app import models

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    
    # 🚨 Stop giant passwords at the door!
    if len(form_data.password) > 72:
         raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Password exceeds maximum allowed length."
        )

    # 🟢 FIX: Handle q/1 -> Q/1 conversion cleanly during login
    clean_username = form_data.username.strip().upper()
    user = db.query(models.Users).filter(func.trim(func.upper(models.Users.fnum)) == clean_username).first()
    
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Incorrect Force Number or password"
        )
    
    # 🟢 FIX: Synchronized token expiration with global security settings
    access_token = security.create_access_token(
        data={"sub": user.fnum}, 
        expires_delta=timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "fnum": user.fnum,
        "rank": user.rank,
        "role": user.role,
        "name": user.name,
        "sex": user.sex,
        "ipps": user.ipps,
        "region": user.region,
        "division": user.division,  
        "station": user.station,
        "position": user.position,  
        "email": user.email,
        "phone": user.phone,
        "profile_photo_path": getattr(user, 'profile_photo_path', '')
    }

# MOVED OUT OF THE SIGNUP FUNCTION SO API_BACKEND CAN IMPORT IT
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    try: 
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        fnum: str = payload.get("sub")
        if fnum is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
 
    # 🟢 FIX: Ensure decoded token payload is matched accurately against database
    clean_fnum = fnum.strip().upper()
    user = db.query(models.Users).filter(func.trim(func.upper(models.Users.fnum)) == clean_fnum).first()
    
    if user is None:
        raise credentials_exception
    return user

@router.put("/me")
def update_profile(
    update_data: schemas.UserUpdate, 
    current_user: models.Users = Depends(get_current_user), 
    db: Session = Depends(database.get_db)
):
    # 1. Update standard text fields if they were provided
    if update_data.name:
        current_user.name = update_data.name
    if update_data.rank:
        current_user.rank = update_data.rank
    if update_data.region:
        current_user.region = update_data.region
    if update_data.station:
        current_user.station = update_data.station
    if update_data.email:
        current_user.email = update_data.email
    if update_data.phone:
        current_user.phone = update_data.phone
    if update_data.profile_photo_path:
        current_user.profile_photo_path = update_data.profile_photo_path

    # 2. Only update the password if a new one was actually typed in
    if update_data.password and len(update_data.password.strip()) > 0:
        current_user.hashed_password = security.get_password_hash(update_data.password)

    # 3. Save changes to the Neon database
    db.commit()
    db.refresh(current_user)
    
    return {"message": "Profile successfully updated"}

def require_export_privilege(current_user: models.Users = Depends(get_current_user)):
    user_role = str(current_user.role).strip().upper() if current_user.role else ""
    perms = current_user.permissions or {}
    if user_role not in ["ADMIN", "SUPER_ADMIN", "RPC"] and not perms.get("export_data", False):
        raise HTTPException(status_code=403, detail="Clearance Denied: Data Export Privileges Required.")
    return current_user

# 🟢 RESTORED /SIGNUP ROUTE AT THE BOTTOM
@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(
    fnum: str = Form(...),
    ipps: str = Form(...),
    name: str = Form(...),
    rank: str = Form(...),
    sex: str = Form("MALE"),
    region: str = Form(...),
    station: str = Form(...),
    position: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    password: str = Form(...),
    role: str = Form("USER"),
    db: Session = Depends(database.get_db)
):
    if len(password) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Password exceeds maximum allowed length."
        )

    clean_fnum = fnum.strip().upper()

    existing_user = db.query(models.Users).filter(
        func.trim(func.upper(models.Users.fnum)) == clean_fnum
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration Error: Force Number already registered."
        )

    hashed_password = security.get_password_hash(password)
    
    new_user = models.Users(
        fnum=clean_fnum,
        ipps=ipps.strip(),
        name=name.strip().upper(),
        rank=rank.strip().upper(),
        sex=sex.strip().upper(),
        region=region.strip().upper(),
        station=station.strip().upper(),
        position=position.strip().upper(),
        email=email.strip(),
        phone=phone.strip(),
        role=role.strip().upper(),
        hashed_password=hashed_password
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return {
            "status": "success",
            "message": "Account successfully registered."
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration database error: {str(e)}"
        )