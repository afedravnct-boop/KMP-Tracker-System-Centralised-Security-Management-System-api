from app.database import engine
from sqlalchemy import text

def fetch_all_tables():
    print("🔍 Querying Neon for all table names...")
    query = text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
    
    with engine.connect() as conn:
        result = conn.execute(query)
        tables = [row[0] for row in result]
        print("\n✅ Found these tables in Neon:")
        for table in tables:
            print(f"- {table}")

if __name__ == "__main__":
    fetch_all_tables()