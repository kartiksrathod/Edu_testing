from pathlib import Path
from dotenv import load_dotenv
import os
from pymongo import MongoClient

dotenv_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path)

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGO_URL") or os.getenv("DATABASE_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "academic_resources_db")

try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    client.admin.command('ping')  # Test connection
    db = client[DATABASE_NAME]
    print(f"MongoDB connected successfully to database: {DATABASE_NAME}")
except Exception as e:
    print(f"MongoDB connection failed: {e}")
    db = None

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or os.getenv("SECRET_KEY") or "change_this_secret"
SECRET_KEY = JWT_SECRET_KEY

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", os.getenv("ALGORITHM", "HS256"))
ALGORITHM = JWT_ALGORITHM

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

ALLOWED_ORIGINS_STR = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS_STR.split(",")]
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USERNAME)
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "EduResources")
TEST_RECEIVER_EMAIL = os.getenv("TEST_RECEIVER_EMAIL")

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", "10485760"))  # 10MB default

DEFAULT_PAGE_SIZE = int(os.getenv("DEFAULT_PAGE_SIZE", "20"))
MAX_PAGE_SIZE = int(os.getenv("MAX_PAGE_SIZE", "100"))

print(f"Configuration loaded:")
print(f"  - Database: {DATABASE_NAME}")
print(f"  - JWT Algorithm: {JWT_ALGORITHM}")
print(f"  - Token Expiry: {ACCESS_TOKEN_EXPIRE_MINUTES} minutes")
print(f"  - Allowed Origins: {ALLOWED_ORIGINS}")
