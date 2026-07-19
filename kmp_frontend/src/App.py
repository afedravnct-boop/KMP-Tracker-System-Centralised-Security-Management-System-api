import uvicorn
from api_backend import app

if __name__ == "__main__":
    print("🚨 Booting UPF Central Command API Server...")
    # Runs the 'app' instance imported from api_backend.py
    uvicorn.run("api_backend:app", host="127.0.0.1", port=8000, reload=True)