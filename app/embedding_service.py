import os
from typing import List, Optional
from datetime import datetime
import pytz
from google import genai
from google.genai.types import EmbedContentConfig
from sqlalchemy.orm import Session

# Import models & db helpers
from app import models
from app.database import get_logs_db
from routers.activity_logger import record_neon_activity

# Configure the Gemini Client
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key) if api_key else None

def get_embedding_vector(text: str) -> List[float]:
    """Generates a 768-dim embedding vector via Gemini gemini-embedding-001."""
    clean_text = text.replace("\n", " ").strip()
    if not clean_text or not client:
        return [0.0] * 768
        
    try:
        response = client.models.embed_content(
            model="gemini-embedding-001", # 🟢 Updated to active model
            contents=clean_text,
            # 🟢 Compress the default output down to 768-dim requirement
            config=EmbedContentConfig(output_dimensionality=768) 
        )
        return response.embeddings[0].values
    except Exception as e:
        print(f"Gemini Embedding Error: {e}")
        return [0.0] * 768

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Splits long text documents into overlapping semantic chunks."""
    words = text.split()
    if len(words) <= chunk_size:
        return [text]
    
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return chunks

def ingest_document_vector(
    db: Session,
    document_id: str,
    document_type: str,
    title: str,
    raw_text: str,
    region: str = "KMP HEADQUARTERS",
    division: str = "HQ",
    station: str = "HQ",
    sd_ref: Optional[str] = None,
    logs_db: Optional[Session] = None,
    fnum: str = "SYSTEM"
):
    """Chunks, embeds, and commits an operational document to pgvector with forensic logging."""
    TargetModel = getattr(models, 'OperationalDocumentEmbedding', None)
    if not TargetModel:
        print("Embedding Notice: OperationalDocumentEmbedding model is not defined in app.models.")
        return

    eat_tz = pytz.timezone('Africa/Nairobi')
    now = datetime.now(eat_tz).replace(tzinfo=None)
    
    chunks = chunk_text(raw_text)
    for idx, chunk in enumerate(chunks):
        vec = get_embedding_vector(chunk)
        db_record = TargetModel(
            document_id=str(document_id),
            document_type=document_type,
            title=title,
            chunk_index=idx,
            content=chunk,
            embedding=vec,
            region=region,
            division=division,
            station=station,
            sd_ref=sd_ref,
            created_at=now
        )
        db.add(db_record)
    
    db.commit()

    # 🟢 Record precise forensic REGISTER activity into NeonDB Activity Logs branch
    if logs_db:
        try:
            record_neon_activity(
                logs_db=logs_db,
                fnum=fnum,
                action_type="REGISTER",
                module="VECTOR_EMBEDDINGS",
                target_id=str(document_id),
                changes_summary=f"Operational document vectorized and committed to pgvector. Title: \"{title}\" ({len(chunks)} semantic chunks)."
            )
        except Exception as log_err:
            print(f"⚠️ Vector embedding activity logging error: {log_err}")