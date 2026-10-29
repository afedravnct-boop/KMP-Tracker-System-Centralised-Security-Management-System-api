import os
import uvicorn
from api_backend import app

if __name__ == "__main__":
    print("🚨 Booting UPF KMP Centralised Security Data Management System API Server...")
    
    # Automatically bind to 0.0.0.0 and use Render's $PORT if available, else fallback to local defaults
    port = int(os.environ.get("PORT", 8000))
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    
    uvicorn.run("api_backend:app", host=host, port=port, reload=True if host == "127.0.0.1" else False)