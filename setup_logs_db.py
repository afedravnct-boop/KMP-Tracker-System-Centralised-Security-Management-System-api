from app.database import logs_engine
from app import models

print("Connecting to Neon...")
# This reads all models attached to LogsBase and creates them in the logs_engine
models.LogsBase.metadata.create_all(bind=logs_engine)
print("Success! The activity_logs table has been created in your Neon branch.")