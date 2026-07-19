import os
import sys
import asyncio
from sqlalchemy import text
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine

# 1. WINDOWS COMPATIBILITY FIX
# This tells Windows to use the loop that psycopg prefers
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

load_dotenv()

async def async_main() -> None:
    db_url = os.getenv('DATABASE_URL')
    
    # Format the URL for async
    async_url = db_url.replace("postgresql://", "postgresql+psycopg://")
    if "?sslmode=require" not in async_url:
        async_url += "?sslmode=require"

    try:
        engine = create_async_engine(async_url, echo=True)
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 'Hello Database, Connection Successful!'"))
            print("--- RESULT ---")
            print(result.fetchall())
            print("--------------")
        await engine.dispose()
        print("SUCCESS: Database connection is working perfectly.")
    except Exception as e:
        print("--- CONNECTION FAILED ---")
        print(e)

if __name__ == "__main__":
    asyncio.run(async_main())