import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from dotenv import load_dotenv

# Load variables from your .env file
load_dotenv() 

# 1. Database URLs (Pulls from .env, falls back to hardcoded strings)
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://neondb_owner:npg_G93LQNXBtfqV@ep-mute-term-at027rko-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
)

LOGS_DATABASE_URL = os.getenv(
    "LOGS_DATABASE_URL", 
    "postgresql://neondb_owner:npg_G93LQNXBtfqV@ep-bold-glade-ata782qd-pooler.c-9.us-east-1.aws.neon.tech/activity_logs?sslmode=require&channel_binding=require"
)

# 2. Main Engine & Session
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=30,
    max_overflow=50,
    pool_timeout=60
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 3. Logs Engine & Session
logs_engine = create_engine(
    LOGS_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=30,
    max_overflow=50,
    pool_timeout=60
)
LogsSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=logs_engine)

# 4. Declarative Bases
# IMPORTANT: We need TWO bases so your main tables don't get created in your logs DB and vice versa.
Base = declarative_base()
LogsBase = declarative_base()

# 5. Dependency Injections
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