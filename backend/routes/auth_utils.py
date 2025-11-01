import logging
from fastapi import HTTPException, Request
from jose import jwt, JWTError
from config import JWT_SECRET_KEY, JWT_ALGORITHM

logger = logging.getLogger(__name__)

def verify_admin(request: Request):
    token = request.cookies.get("token")
    if not token:
        logger.warning("Admin verification failed: Missing token cookie")
        raise HTTPException(status_code=401, detail="Missing authentication token")
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if not payload.get("is_admin"):
            logger.warning(f"Admin verification failed: Non-admin user {payload.get('sub')}")
            raise HTTPException(status_code=403, detail="Admin access required")
        return payload
    except JWTError as e:
        logger.error(f"Token verification error: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid token")

def verify_token(request: Request):
    token = request.cookies.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        logger.error("Token verification failed")
        raise HTTPException(status_code=401, detail="Invalid token")
