# embedding_service.py
import os
from typing import List, Optional
from datetime import datetime
import pytz
import google.generativeai as genai
from sqlalchemy.orm import Session

# Import models & db helpers
from app import models

# Configure Gemini using your existing API Key
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

def get_embedding_vector(text: str) -> List[float]:
    """Generates a 768-dim embedding vector via Gemini text-embedding-004."""
    clean_text = text.replace("\n", " ").strip()
    if not clean_text:
        return [0.0] * 768
        
    try:
        response = genai.embed_content(
            model="models/text-embedding-004",
            content=clean_text,
            task_type="retrieval_document"
        )
        return response['embedding']
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
    sd_ref: Optional[str] = None
):
    """Chunks, embeds, and commits an operational document to pgvector."""
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