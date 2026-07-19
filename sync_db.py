from app.database import engine, Base
from app import models

def create_missing_tables():
    print("⏳ Connecting to Central Command Neon Database...")
    
    # This command checks models.py against Neon and creates anything missing
    Base.metadata.create_all(bind=engine)
    
    print("✅ SUCCESS: All missing tables (including communications) have been created in Neon!")

if __name__ == "__main__":
    create_missing_tables()