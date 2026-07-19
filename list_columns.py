from app.database import engine
from sqlalchemy import text
import sys

def fetch_columns(table_name):
    print(f"🔍 Querying columns for table: {table_name}...")
    query = text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = :table_name
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query, {"table_name": table_name})
        columns = [row[0] for row in result]
        print(f"\n✅ Columns in '{table_name}':")
        for col in columns:
            print(f"- {col}")

if __name__ == "__main__":
    # Change 'communications' to whatever table is throwing the error
    table = sys.argv[1] if len(sys.argv) > 1 else 'communications'
    fetch_columns(table)