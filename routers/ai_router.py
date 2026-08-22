import os
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
import google.generativeai as genai

from auth import get_current_user
from app.database import get_db

# Import your pure-Gemini embedding function
try:
    from embedding_service import get_embedding_vector
except ImportError:
    from app.embedding_service import get_embedding_vector

router = APIRouter(prefix="/api/v1/ai", tags=["Tactical AI Console"])

class QueryPayload(BaseModel):
    prompt: str
    target_region: str = "ALL REGIONS"
    target_station: str = "ALL STATIONS"

@router.post("/query")
async def process_tactical_query(
    payload: QueryPayload, 
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Check for the Gemini API Key
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="GEMINI_API_KEY is missing from the server environment.")

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')

        # 2. Convert the user's prompt into a 768-dim Gemini vector
        prompt_vector = get_embedding_vector(payload.prompt)
        
        # 3. Search pgvector database for the most relevant document chunks
        # Using cosine distance (<=>) to find the top 5 closest matches
        search_query = text("""
            SELECT title, content, region, station 
            FROM operational_document_embeddings
            ORDER BY embedding <=> :vector::vector
            LIMIT 5
        """)
        
        results = db.execute(search_query, {"vector": str(prompt_vector)}).fetchall()
        
        # 4. Format the retrieved context
        retrieved_context = ""
        if results:
            retrieved_context = "CRITICAL SITREP INTELLIGENCE RETRIEVED FROM DATABASE:\n"
            for row in results:
                retrieved_context += f"- [Source: {row.title} | Location: {row.region}/{row.station}]: {row.content}\n"
        else:
            retrieved_context = "No specific tactical documents found in the database for this query."

# 5. Build the master prompt for Gemini
        tactical_context = (
            f"You are the Kampala Metropolitan Police (KMP) Tactical AI Assistant. "
            f"CRITICAL PROTOCOL: You must strictly address and refer to the user using their full official credential: {current_user.fnum} {current_user.rank} {current_user.name}. "
            f"Do not use casual greetings. Their clearance level is: {current_user.role}. "
            f"They are querying data for Region: {payload.target_region}, Station: {payload.target_station}.\n\n"
            f"{retrieved_context}\n\n"
            f"Based on the intelligence provided above, provide a highly professional, concise, law-enforcement-style response to the following query:\n"
            f"USER QUERY: {payload.prompt}"
        )

        # 6. Generate response
        response = model.generate_content(tactical_context)

        # 7. Return payload back to React
        return {
            "response": response.text,
            "metadata": {
                "semantic_chunks_retrieved": len(results),
                "sql_executed": True
            }
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Gemini API Error Detail: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Tactical Processing Error: {str(e)}")