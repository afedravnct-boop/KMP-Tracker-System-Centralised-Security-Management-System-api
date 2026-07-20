import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from dotenv import load_dotenv

# Load variables from your .env file
load_dotenv() 

# 1. Database URLs (Strictly pulls from .env, no hardcoded fallbacks!)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
LOGS_DATABASE_URL = os.getenv("LOGS_DATABASE_URL")

# If the variables are missing, stop the app immediately rather than failing silently
if not SQLALCHEMY_DATABASE_URL or not LOGS_DATABASE_URL:
    raise ValueError("Database URLs are missing! Check your .env file or Render environment variables.")

# 2. Main Engine & Session
engine = create_engine(
# ... keep the rest of your file exactly the same ...
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