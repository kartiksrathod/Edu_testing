import os
from pathlib import Path
from dotenv import load_dotenv

dotenv_path = Path(__file__).resolve().parent / ".env"
print(f"Loading .env from: {dotenv_path}")
load_dotenv(dotenv_path)

import uuid
import logging
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from passlib.context import CryptContext
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
import importlib
import pkgutil

from config import (
    db,
    JWT_SECRET_KEY,
    JWT_ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALLOWED_ORIGINS,
)

LOG_DIR = os.path.join(os.getcwd(), "app_logging", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, "app.log")),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)
logger.info("Logging initialized")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

app = FastAPI(
    title="EduResources API",
    description="Academic Resources Management System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    usn: str | None = None
    course: str | None = None
    semester: str | None = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

@app.post("/api/auth/register", tags=["Authentication"])
async def register(user: UserRegister):
    if db is None:
        logger.error("Database not connected during registration")
        raise HTTPException(status_code=500, detail="Database not connected")
    try:
        users_collection = db.users
        existing_user = users_collection.find_one({"email": user.email})
        if existing_user:
            logger.warning(f"Registration attempt with existing email: {user.email}")
            raise HTTPException(status_code=400, detail="User already exists")
        hashed_password = pwd_context.hash(user.password)
        user_id = str(uuid.uuid4())
        user_doc = {
            "_id": user_id,
            "name": user.name,
            "email": user.email,
            "password": hashed_password,
            "usn": user.usn,
            "course": user.course,
            "semester": user.semester,
            "is_admin": users_collection.count_documents({}) == 0,
            "created_at": datetime.utcnow(),
        }
        users_collection.insert_one(user_doc)
        logger.info(f"New user registered: {user.email}")
        token = create_access_token({"sub": user.email, "is_admin": user_doc["is_admin"]})
        return {"message": "User registered successfully", "token": token, "user_id": user_id}
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/login", tags=["Authentication"])
async def login(user: UserLogin):
    if db is None:
        logger.error("Database not connected during login")
        raise HTTPException(status_code=500, detail="Database not connected")
    try:
        users_collection = db.users
        existing_user = users_collection.find_one({"email": user.email})
        if not existing_user or not pwd_context.verify(user.password, existing_user["password"]):
            logger.warning(f"Failed login attempt: {user.email}")
            raise HTTPException(status_code=401, detail="Invalid credentials")
        is_admin = existing_user.get("is_admin", False)
        token = create_access_token({"sub": user.email, "is_admin": is_admin})

        logger.info(f"User logged in: {user.email} | Admin: {is_admin}")

        # IMPORTANT: Return the response object on which you set_cookie
        response = JSONResponse(
            {
                "message": "Login successful",
                "user": {
                    "name": existing_user["name"],
                    "email": existing_user["email"],
                    "usn": existing_user.get("usn"),
                    "course": existing_user.get("course"),
                    "semester": existing_user.get("semester"),
                    "is_admin": is_admin,
                },
            }
        )
        response.set_cookie(
            key="token",
            value=token,
            httponly=True,
            secure=False,  # False in development; True in production with HTTPS
            samesite="lax",
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            expires=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            path="/",
        )
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/auth/profile", tags=["Authentication"])
async def profile(request: Request):
    try:
        token = request.cookies.get("token")
        if not token:
            raise HTTPException(status_code=401, detail="Token missing or invalid")
        payload = verify_token(token)
        email = payload.get("sub")
        user = db.users.find_one({"email": email}, {"password": 0})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Profile fetch error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def auto_include_routers(app):
    try:
        import routes
        for _, module_name, _ in pkgutil.iter_modules(routes.__path__):
            try:
                module = importlib.import_module(f"routes.{module_name}")
                if hasattr(module, "router"):
                    prefix = f"/api/{module_name}".replace("_routes", "")
                    tag = module_name.replace("_", " ").title()
                    app.include_router(module.router, prefix=prefix, tags=[tag])
                    logger.info(f"Router loaded: {module_name} -> {prefix}")
            except Exception as e:
                logger.error(f"Error loading router {module_name}: {str(e)}")
    except Exception as e:
        logger.error(f"Error auto-loading routers: {str(e)}")

auto_include_routers(app)

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning(f"HTTP Exception: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

@app.get("/health", tags=["System"])
async def health_check():
    db_status = "connected" if db is not None else "disconnected"
    return {"status": "healthy", "database": db_status}

@app.get("/", tags=["System"])
async def root():
    return {"message": "EduResources Backend Running Successfully!"}

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting server...")
    uvicorn.run("server:app", host="localhost", port=8000, reload=True, log_level="info")
