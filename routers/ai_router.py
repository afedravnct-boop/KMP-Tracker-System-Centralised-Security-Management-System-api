import os
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import google.generativeai as genai
from auth import get_current_user

router = APIRouter(prefix="/api/v1/ai", tags=["Tactical AI Console"])

class QueryPayload(BaseModel):
    prompt: str
    target_region: str = "ALL REGIONS"
    target_station: str = "ALL STATIONS"

@router.post("/query")
async def process_tactical_query(payload: QueryPayload, current_user = Depends(get_current_user)):
    # 1. Check for the Gemini API Key
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="GEMINI_API_KEY is missing from the server environment.")

    try:
        # 2. Configure Gemini
        genai.configure(api_key=api_key)
        
        # We use the 1.5 Flash model for incredibly fast, highly capable responses
        model = genai.GenerativeModel('gemini-1.5-flash')

        # 3. Inject tactical command context into the prompt
        tactical_context = (
            f"You are the Kampala Metropolitan Police (KMP) Tactical AI Assistant. "
            f"You are speaking to {current_user.rank} {current_user.name}. "
            f"Their clearance level is: {current_user.role}. "
            f"They are querying data for Region: {payload.target_region}, Station: {payload.target_station}. "
            f"Provide a highly professional, concise, law-enforcement-style response to the following query:\n\n"
            f"{payload.prompt}"
        )

        # 4. Generate the response
        response = model.generate_content(tactical_context)

        # 5. Return to the React frontend
        return {"response": response.text}

    except Exception as e:
        import traceback
        traceback.print_exc() # <--- Prints full error to Render logs
        print(f"Gemini API Error Detail: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Tactical Processing Error: {str(e)}")