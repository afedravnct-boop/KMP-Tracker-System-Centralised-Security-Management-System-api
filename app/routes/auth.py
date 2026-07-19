from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
import app.core.security as security
import app.database as database
import app.models as models

router = APIRouter()

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    # 1. Fetch user from DB using the exact column name 'fileorForceNumber'
    user = db.query(models.User).filter(models.User.fileorForceNumber == form_data.username).first()
    
    # 2. Verify password
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect File/Force Number or password", # Updated error message
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 3. Create the Access Token using the correct attribute
    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.fileorForceNumber}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}