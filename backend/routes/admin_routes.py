from fastapi import APIRouter, Depends, HTTPException, status, Body, Request
from jose import jwt, JWTError
from config import JWT_SECRET_KEY, JWT_ALGORITHM
from config import db
from datetime import datetime
import uuid
from typing import Optional

router = APIRouter(prefix="/api/admin", tags=["Admin"])

def get_current_user(request: Request):
    token = None

    # Read token from cookie or Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    if not token:
        token = request.cookies.get("token")  # Use "token" cookie

    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token")

    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        user = db.users.find_one({"email": email})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def is_admin_user(user: dict):
    # Standardize to check only is_admin field here
    return bool(user.get("is_admin", False))

# Admin Dashboard
@router.get("/dashboard")
async def admin_dashboard(current_user=Depends(get_current_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")

    total_users = db.users.count_documents({})
    total_admins = db.users.count_documents({"is_admin": True})
    total_students = db.users.count_documents({"role": "student"})
    return {
        "message": f"Welcome Admin {current_user.get('name')}",
        "stats": {
            "total_users": total_users,
            "total_admins": total_admins,
            "total_students": total_students
        }
    }

# Notes endpoints
@router.post("/notes")
async def add_notes(current_user=Depends(get_current_user), data: dict = Body(...)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    if not data.get("title") or not data.get("content"):
        raise HTTPException(status_code=400, detail="Missing title or content")
    note = {
        "_id": str(uuid.uuid4()),
        "title": data["title"],
        "content": data["content"],
        "tags": data.get("tags", []),
        "created_by": current_user["email"],
        "created_at": datetime.utcnow()
    }
    db.notes.insert_one(note)
    return {"message": "Note added successfully", "note": note}

@router.get("/notes")
async def list_notes(skip: int = 0, limit: int = 50, current_user=Depends(get_current_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    cursor = db.notes.find().sort("created_at", -1).skip(skip).limit(limit)
    return {"notes": list(cursor)}

@router.put("/notes/{note_id}")
async def update_note(note_id: str, data: dict = Body(...), current_user=Depends(get_current_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    update = {k: v for k, v in data.items() if k in ("title", "content", "tags")}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = datetime.utcnow()
    result = db.notes.update_one({"_id": note_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note updated successfully"}

@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, current_user=Depends(get_current_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    result = db.notes.delete_one({"_id": note_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note deleted successfully"}

# Syllabus endpoints
@router.post("/syllabus")
async def add_syllabus(current_user=Depends(get_current_user), data: dict = Body(...)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    required = ("course", "semester", "topics")
    if not all(data.get(k) for k in required):
        raise HTTPException(status_code=400, detail="Missing syllabus details")
    syllabus = {
        "_id": str(uuid.uuid4()),
        "course": data["course"],
        "semester": data["semester"],
        "topics": data["topics"],
        "created_by": current_user["email"],
        "created_at": datetime.utcnow()
    }
    db.syllabus.insert_one(syllabus)
    return {"message": "Syllabus added successfully", "syllabus": syllabus}

@router.get("/syllabus")
async def list_syllabus(course: Optional[str] = None, current_user=Depends(get_current_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    query = {}
    if course:
        query["course"] = course
    docs = list(db.syllabus.find(query).sort("created_at", -1))
    return {"syllabus": docs}

@router.put("/syllabus/{sid}")
async def update_syllabus(sid: str, data: dict = Body(...), current_user=Depends(get_current_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    update = {k: v for k, v in data.items() if k in ("course", "semester", "topics")}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = datetime.utcnow()
    res = db.syllabus.update_one({"_id": sid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Syllabus not found")
    return {"message": "Syllabus updated successfully"}

@router.delete("/syllabus/{sid}")
async def delete_syllabus(sid: str, current_user=Depends(get_current_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    res = db.syllabus.delete_one({"_id": sid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Syllabus not found")
    return {"message": "Syllabus deleted successfully"}

# Papers endpoints
@router.post("/papers")
async def add_paper(current_user=Depends(get_current_user), data: dict = Body(...)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    if not data.get("title") or not data.get("file_url"):
        raise HTTPException(status_code=400, detail="Missing title or file_url")
    paper = {
        "_id": str(uuid.uuid4()),
        "title": data["title"],
        "description": data.get("description"),
        "file_url": data["file_url"],
        "created_by": current_user["email"],
        "created_at": datetime.utcnow()
    }
    db.papers.insert_one(paper)
    return {"message": "Paper added successfully", "paper": paper}

@router.get("/papers")
async def list_papers(skip: int = 0, limit: int = 50, current_user=Depends(get_current_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    docs = list(db.papers.find().sort("created_at", -1).skip(skip).limit(limit))
    return {"papers": docs}

@router.put("/papers/{pid}")
async def update_paper(pid: str, data: dict = Body(...), current_user=Depends(get_current_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    update = {k: v for k, v in data.items() if k in ("title", "description", "file_url")}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = datetime.utcnow()
    res = db.papers.update_one({"_id": pid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Paper not found")
    return {"message": "Paper updated successfully"}

@router.delete("/papers/{pid}")
async def delete_paper(pid: str, current_user=Depends(get_current_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admins only")
    res = db.papers.delete_one({"_id": pid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Paper not found")
    return {"message": "Paper deleted successfully"}
