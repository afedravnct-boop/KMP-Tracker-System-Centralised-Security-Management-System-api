from app.database import engine, Base
from app import models # Ensures all models are registered with Base
from sqlalchemy import MetaData

def reset_database():
    metadata = Base.metadata
    
    # Tables to exclude from dropping
    protected_tables = ['users']
    
    print("Dropping tables (excluding protected ones)...")
    
    # We drop tables in reverse order of creation (to respect foreign keys)
    for table in reversed(metadata.sorted_tables):
        if table.name not in protected_tables:
            print(f"Dropping table: {table.name}")
            table.drop(engine)
            
    print("Re-creating tables...")
    metadata.create_all(bind=engine)
    print("Database reset complete.")

if __name__ == "__main__":
    reset_database()