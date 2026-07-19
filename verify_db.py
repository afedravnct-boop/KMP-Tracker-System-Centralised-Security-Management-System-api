import os
from dotenv import load_dotenv

# Import the engine and Base from your new database.py
from database import engine, Base

# Import models so SQLAlchemy knows about your 7 new tables
import models 

load_dotenv()

def test_and_build_neon():
    print("\n=== STARTING NEON DATABASE VERIFICATION ===")
    db_url = os.getenv("DATABASE_URL")
    
    if not db_url:
        print("❌ ERROR: DATABASE_URL not found in .env file.")
        return

    print("🔌 Attempting to connect to Neon cluster...")
    try:
        # Test basic connectivity
        with engine.connect() as conn:
            print(f"✅ SUCCESS: Connected to Neon.")

        # Test schema creation
        print("🛠️  Building schema tables from models.py...")
        
        # This command looks at models.py and builds every table that doesn't exist yet
        Base.metadata.create_all(bind=engine)
        
        print("✅ SUCCESS: All 7 operational tables are ready to receive data!")
        print("=== VERIFICATION COMPLETE ===")

    except Exception as e:
        print(f"❌ ERROR: Database connection or setup failed.\nDetails: {e}")

if __name__ == "__main__":
    test_and_build_neon()