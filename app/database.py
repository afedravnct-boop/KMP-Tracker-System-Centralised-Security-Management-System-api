import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv() 

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
LOGS_DATABASE_URL = os.getenv("LOGS_DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL or not LOGS_DATABASE_URL:
    raise ValueError("Database URLs are missing! Check your .env file or Render environment variables.")

# 🟢 BULLETPROOF ENGINE CONFIG: Added connect_args keepalives & strict SSL for Neon
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,       # Recycled every 5 minutes to prevent stale socket drops
    pool_size=20,           
    max_overflow=30,        
    pool_timeout=30,
    connect_args={
        "sslmode": "require",
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5
    }
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

logs_engine = create_engine(
    LOGS_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=10,         
    max_overflow=15,     
    pool_timeout=30,
    connect_args={
        "sslmode": "require",
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5
    }
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