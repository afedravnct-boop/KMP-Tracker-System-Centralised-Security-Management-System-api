import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv() 

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
LOGS_DATABASE_URL = os.getenv("LOGS_DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL or not LOGS_DATABASE_URL:
    raise ValueError("Database URLs are missing! Check your .env file or Render environment variables.")

# 🟢 PRODUCTION SAFE LIMITS: 10 Base + 15 Overflow = 25 concurrent per engine
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=10,        
    max_overflow=15,    
    pool_timeout=30
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

logs_engine = create_engine(
    LOGS_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=10,        
    max_overflow=15,    
    pool_timeout=30
)
LogsSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=logs_engine)

Base = declarative_base()
LogsBase = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_logs_db():
    db = LogsSessionLocal()
    try:
        yield db
    finally:
        db.close()