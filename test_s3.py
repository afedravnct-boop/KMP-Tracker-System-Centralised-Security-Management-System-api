import os
import boto3
from dotenv import load_dotenv

# 1. Force Python to read the .env file
load_dotenv()

def test_aws_connection():
    # 2. Get variables explicitly
    access_key = os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    region = os.getenv("AWS_REGION")
    bucket_name = os.getenv("AWS_BUCKET_NAME")

    print(f"Loaded Bucket Name: {bucket_name}")
    print(f"Loaded Access Key: {access_key}")
    
    if not access_key:
        print("❌ ERROR: Python cannot find your .env file or variables!")
        return

    try:
        # 3. Try to connect to S3
        print("⏳ Connecting to AWS...")
        s3_client = boto3.client(
            's3',
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region
        )
        
        # 4. Try to upload a tiny test file
        s3_client.put_object(
            Bucket=bucket_name, 
            Key="test_connection.txt", 
            Body="Hello from Python!"
        )
        print("✅ SUCCESS! Your backend can officially talk to AWS S3.")
        
    except Exception as e:
        print(f"❌ AWS ERROR: {e}")

if __name__ == "__main__":
    test_aws_connection()