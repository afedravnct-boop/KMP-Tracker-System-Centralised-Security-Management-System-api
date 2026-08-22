import os
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from google import genai
from google.genai import types

from auth import get_current_user
from app.database import get_db

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
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="GEMINI_API_KEY is missing from the server environment.")

    try:
        # 1. Initialize the NEW Gemini Client
        client = genai.Client(api_key=api_key)

        # 2. STRICT SYSTEM INSTRUCTION: Enforce exact credential formatting & System Map
        system_rules = (
            "You are the Kampala Metropolitan Police (KMP) Tactical AI Assistant. "
            f"CRITICAL PROTOCOL: You must strictly address and refer to the user using their full official credential: {current_user.fnum} {current_user.rank} {current_user.name}. "
            "Do not use casual greetings. Always maintain a highly professional, concise, law-enforcement tone.\n\n"
            "SYSTEM NAVIGATION GUIDE: If the user asks how to find a feature, navigate the system, or perform an action, use the following map to guide them:\n"
            "- To view the main dashboard or return to the start: Go to 'Home Dashboard'.\n"
            "- To log or track crimes/incidents: Go to 'Crime/Incident Registry'.\n"
            "- To view weekly numerical aggregates: Go to 'Disruptive OPS Statistics'.\n"
            "- To document tactical milestones: Go to 'Success Stories'.\n"
            "- To manage HR, deployments, or personnel records: Go to 'Nominal Roll'.\n"
            "- To upload Word/Excel/PDF reports or templates: Go to 'Tripartite Reports' (Universal File Intake Hub).\n"
            "- To send secure messages, directives, or check the inbox: Go to 'Command Communications'.\n"
            "- To view graphs and charts: Go to 'Analytics & Reports'.\n"
            "- To approve new users or view system audit logs: Go to 'Access Approvals' (Admin Only).\n"
            "- To change passwords, update profile photos, or contact info: Click the User Profile icon at the bottom of the sidebar."
        )

        # 3. Convert the user's prompt into a 768-dim Gemini vector (ensure it's a list/string format pgvector accepts)
        prompt_vector = get_embedding_vector(payload.prompt)
        # Convert python list to a Postgres vector string format '[0.1, 0.2, ...]'
        vector_str = str(prompt_vector)
        
        # 4. Search pgvector database using a clean parameter cast
        search_query = text("""
            SELECT title, content, region, station 
            FROM operational_document_embeddings
            ORDER BY embedding <=> CAST(:vector AS vector)
            LIMIT 5
        """)
        
        results = db.execute(search_query, {"vector": vector_str}).fetchall()
        
        # 5. Format the retrieved context
        retrieved_context = ""
        if results:
            retrieved_context = "CRITICAL SITREP INTELLIGENCE RETRIEVED FROM DATABASE:\n"
            for row in results:
                retrieved_context += f"- [Source: {row.title} | Location: {row.region}/{row.station}]: {row.content}\n"
        else:
            retrieved_context = "No specific tactical documents found in the database for this query."

        # 6. Build the user prompt context
        tactical_context = (
            f"Executing Officer: {current_user.fnum} {current_user.rank} {current_user.name}\n"
            f"Clearance Level: {current_user.role} | Query Scope: Region {payload.target_region}, Station {payload.target_station}.\n\n"
            f"{retrieved_context}\n\n"
            f"USER QUERY: {payload.prompt}"
        )

        # 7. Generate response using the NEW SDK format
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=tactical_context,
            config=types.GenerateContentConfig(
                system_instruction=system_rules
            )
        )

        # 8. Return payload back to React
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