# embedding_service.py
import os
from typing import List, Optional
from datetime import datetime
import pytz
from openai import OpenAI
from sqlalchemy.orm import Session

# Import models & db helpers
from app import models

openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", "EMPTY"))

def get_embedding_vector(text: str) -> List[float]:
    """Generates 1536-dim embedding vector via OpenAI text-embedding-3-small."""
    clean_text = text.replace("\n", " ").strip()
    if not clean_text:
        return [0.0] * 1536
        
    response = openai_client.embeddings.create(
        input=[clean_text],
        model="text-embedding-3-small"
    )
    return response.data[0].embedding

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