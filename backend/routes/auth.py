from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import jwt, JWTError
from config import (
    db,
    JWT_SECRET_KEY as SECRET_KEY,
    JWT_ALGORITHM as ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    FRONTEND_URL,
    SMTP_SERVER,
    SMTP_PORT,
    SMTP_USERNAME,
    SMTP_PASSWORD,
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
)
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import uuid
import logging

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger(__name__)

class RegisterModel(BaseModel):
    name: str
    email: EmailStr
    password: str
    usn: str | None = None
    course: str | None = None
    semester: str | None = None

class LoginModel(BaseModel):
    email: EmailStr
    password: str

class ResendVerificationModel(BaseModel):
    email: EmailStr

def create_access_token(data: dict, expires_minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def send_verification_email(to_email: str, token: str):
    verify_link = f"{FRONTEND_URL.rstrip('/')}/verify-email/{token}"
    backend_verify = f"{FRONTEND_URL.rstrip('/')}/api/auth/verify/{token}"
    message = MIMEMultipart("alternative")
    message["Subject"] = "Verify your email - EduResources"
    message["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    message["To"] = to_email

    text = (
        f"Hi,\n\n"
        f"Please verify your email by visiting this link:\n\n{verify_link}\n\n"
        f"If the above doesn't work, open this alternative link:\n{backend_verify}\n\n"
        "This link expires in 15 minutes.\n\nEduResources"
    )
    html = f"""
    <html><body style="font-family: sans-serif; font-size: 16px;">
      <p>Hi,</p>
      <p>Please verify your email by clicking the button below:</p>
      <p>
        <a href="{verify_link}" target="_blank"
           style="background-color:#2563eb;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;">
           Verify Email
        </a>
      </p>
      <p>If that doesn't work, paste this URL into your browser:<br><small>{backend_verify}</small></p>
      <p>This link expires in 15 minutes.</p>
      <p>EduResources</p>
    </body></html>
    """
    message.attach(MIMEText(text, "plain"))
    message.attach(MIMEText(html, "html"))
    try:
        with smtplib.SMTP(SMTP_SERVER, int(SMTP_PORT)) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, to_email, message.as_string())
            logger.info(f"Verification email sent to {to_email}")
    except Exception as e:
        logger.error(f"Email sending failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send verification email: {e}")

@router.post("/register")
async def register_user(data: RegisterModel):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    existing_user = db.users.find_one({"email": data.email})
    if existing_user and existing_user.get("verified", False):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered and verified")
    if existing_user and not existing_user.get("verified", False):
        db.users.delete_one({"email": data.email})
    hashed_pw = pwd_context.hash(data.password)
    token_data = {
        "name": data.name,
        "email": data.email,
        "password_hash": hashed_pw,
        "usn": data.usn,
        "course": data.course,
        "semester": data.semester,
    }
    verification_token = create_access_token(token_data, expires_minutes=15)
    send_verification_email(data.email, verification_token)
    pending = {
        "_id": str(uuid.uuid4()),
        "email": data.email,
        "verified": False,
        "created_at": datetime.utcnow()
    }
    db.users.insert_one(pending)
    logger.info(f"Pending user registration started for {data.email}")
    return {"message": "Verification email sent successfully. Please verify to complete registration."}

@router.get("/verify/{token}", response_class=HTMLResponse)
async def verify_email(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    email = payload.get("email")
    name = payload.get("name")
    password_hash = payload.get("password_hash")
    if not email or not name or not password_hash:
        raise HTTPException(status_code=400, detail="Invalid token payload")
    db.users.delete_many({"email": email})
    user_doc = {
        "_id": str(uuid.uuid4()),
        "name": name,
        "email": email,
        "password": password_hash,
        "usn": payload.get("usn"),
        "course": payload.get("course"),
        "semester": payload.get("semester"),
        "is_admin": False,
        "role": "student",
        "verified": True,
        "verified_at": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    }
    db.users.insert_one(user_doc)
    redirect_url = f"{FRONTEND_URL.rstrip('/')}/login"
    html = f"""
    <html><body style='font-family: sans-serif; text-align:center; padding:40px;'>
      <h2>Email Verified Successfully!</h2>
      <p>Your account has been activated. You will be redirected to login shortly.</p>
      <p><a href="{redirect_url}">Click here if you are not redirected</a></p>
      <meta http-equiv="refresh" content="3;url={redirect_url}" />
    </body></html>
    """
    logger.info(f"User verified and created: {email}")
    return HTMLResponse(content=html, status_code=200)

@router.post("/login")
async def login_user(data: LoginModel):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    user = db.users.find_one({"email": data.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("verified", False):
        raise HTTPException(status_code=403, detail="Please verify your email before logging in")
    if not pwd_context.verify(data.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    is_admin = bool(user.get("is_admin", False) or user.get("role") == "admin")
    payload = {"sub": user["email"], "role": user.get("role", "student"), "is_admin": is_admin}
    token = create_access_token(payload, expires_minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    user_response = {
        "name": user.get("name"),
        "email": user.get("email"),
        "usn": user.get("usn"),
        "course": user.get("course"),
        "semester": user.get("semester"),
        "is_admin": is_admin,
        "role": user.get("role", "student"),
    }
    logger.info(f"User logged in: {data.email}")
    return {"access_token": token, "token_type": "bearer", "user": user_response}

@router.post("/resend-verification")
async def resend_verification(
    data: ResendVerificationModel, background_tasks: BackgroundTasks,
):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    user = db.users.find_one({"email": data.email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("verified", False):
        return {"message": "Email already verified"}
    password_hash = user.get("password")
    name = user.get("name", "EduResources User")
    if not password_hash:
        raise HTTPException(status_code=400, detail="No pending registration data — please register again")
    token_data = {
        "name": name,
        "email": data.email,
        "password_hash": password_hash,
        "usn": user.get("usn"),
        "course": user.get("course"),
        "semester": user.get("semester"),
    }
    verification_token = create_access_token(token_data, expires_minutes=15)
    background_tasks.add_task(send_verification_email, data.email, verification_token)
    logger.info(f"Resent verification email: {data.email}")
    return {"message": "Verification email resent successfully."}
