from fastapi import APIRouter, HTTPException, Request, Depends, Query, Body
from pydantic import BaseModel, Field
from typing import Optional, List
import uuid
import logging
from datetime import datetime
from config import db, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from routes.auth_utils import verify_admin, verify_token

logger = logging.getLogger(__name__)
router = APIRouter()

class NoteIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    content: Optional[str] = Field(None, max_length=50000)
    tags: Optional[List[str]] = Field(default_factory=list)

class NoteResponse(NoteIn):
    id: str
    created_at: datetime
    updated_at: datetime

@router.get("/", summary="Get all notes with pagination")
async def get_notes(
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        total = db.notes.count_documents({})
        notes = list(db.notes.find({}).skip(skip).limit(limit).sort("created_at", -1))
        logger.info(f"Retrieved {len(notes)} notes (skip={skip}, limit={limit})")
        for note in notes:
            note["id"] = note.pop("_id")
            note["created_at"] = note.get("created_at", datetime.utcnow()).isoformat()
            note["updated_at"] = note.get("updated_at", datetime.utcnow()).isoformat()
        return {
            "success": True,
            "data": notes,
            "pagination": {
                "total": total,
                "skip": skip,
                "limit": limit,
                "returned": len(notes)
            }
        }
    except Exception as e:
        logger.error(f"Error fetching notes: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search", summary="Search notes by title or tags")
async def search_notes(
    q: str = Query(..., min_length=1),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        search_filter = {
            "$or": [
                {"title": {"$regex": q, "$options": "i"}},
                {"description": {"$regex": q, "$options": "i"}},
                {"tags": {"$in": [q]}}
            ]
        }
        total = db.notes.count_documents(search_filter)
        notes = list(db.notes.find(search_filter).skip(skip).limit(limit).sort("created_at", -1))
        logger.info(f"Search '{q}': found {len(notes)} notes")
        for note in notes:
            note["id"] = note.pop("_id")
            note["created_at"] = note.get("created_at", datetime.utcnow()).isoformat()
            note["updated_at"] = note.get("updated_at", datetime.utcnow()).isoformat()
        return {
            "success": True,
            "query": q,
            "data": notes,
            "pagination": {
                "total": total,
                "skip": skip,
                "limit": limit,
                "returned": len(notes)
            }
        }
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", dependencies=[Depends(verify_admin)], summary="Create note (admin only)")
async def create_note(payload: NoteIn):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        note_id = str(uuid.uuid4())
        now = datetime.utcnow()
        doc = payload.dict()
        doc.update({
            "_id": note_id,
            "created_at": now,
            "updated_at": now
        })
        db.notes.insert_one(doc)
        logger.info(f"Note created: {note_id}")
        return {
            "success": True,
            "message": "Note created successfully",
            "data": {"id": note_id, **doc}
        }
    except Exception as e:
        logger.error(f"Note creation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{note_id}", summary="Get specific note")
async def get_note(note_id: str):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        note = db.notes.find_one({"_id": note_id})
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        note["id"] = note.pop("_id")
        note["created_at"] = note.get("created_at", datetime.utcnow()).isoformat()
        note["updated_at"] = note.get("updated_at", datetime.utcnow()).isoformat()
        logger.info(f"Note retrieved: {note_id}")
        return {"success": True, "data": note}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching note {note_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{note_id}", dependencies=[Depends(verify_admin)], summary="Update note (admin only)")
async def update_note(note_id: str, payload: NoteIn):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        existing = db.notes.find_one({"_id": note_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Note not found")
        update_data = payload.dict(exclude_unset=True)
        update_data["updated_at"] = datetime.utcnow()
        db.notes.update_one({"_id": note_id}, {"$set": update_data})
        logger.info(f"Note updated: {note_id}")
        return {
            "success": True,
            "message": "Note updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Note update error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{note_id}", dependencies=[Depends(verify_admin)], summary="Delete note (admin only)")
async def delete_note(note_id: str):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        result = db.notes.delete_one({"_id": note_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Note not found")
        logger.info(f"Note deleted: {note_id}")
        return {"success": True, "message": "Note deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Note deletion error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
