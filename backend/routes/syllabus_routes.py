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

class SyllabusIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    course_code: Optional[str] = Field(None, max_length=20)
    branch: Optional[str] = Field(None, max_length=100)
    year: Optional[str] = Field(None, max_length=20)
    description: Optional[str] = Field(None, max_length=5000)
    modules: Optional[List[str]] = Field(default_factory=list)
    tags: Optional[List[str]] = Field(default_factory=list)

class SyllabusResponse(SyllabusIn):
    id: str
    created_at: datetime
    updated_at: datetime

@router.get("/", summary="Get all syllabi with pagination")
async def get_syllabus(
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        total = db.syllabus.count_documents({})
        syllabi = list(db.syllabus.find({}).skip(skip).limit(limit).sort("created_at", -1))
        logger.info(f"Retrieved {len(syllabi)} syllabi (skip={skip}, limit={limit})")
        for syllabus in syllabi:
            syllabus["id"] = syllabus.pop("_id")
            syllabus["created_at"] = syllabus.get("created_at", datetime.utcnow()).isoformat()
            syllabus["updated_at"] = syllabus.get("updated_at", datetime.utcnow()).isoformat()
        return {
            "success": True,
            "data": syllabi,
            "pagination": {
                "total": total,
                "skip": skip,
                "limit": limit,
                "returned": len(syllabi)
            }
        }
    except Exception as e:
        logger.error(f"Error fetching syllabi: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search", summary="Search syllabi by title, course code, or tags")
async def search_syllabus(
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
                {"course_code": {"$regex": q, "$options": "i"}},
                {"branch": {"$regex": q, "$options": "i"}},
                {"description": {"$regex": q, "$options": "i"}},
                {"tags": {"$in": [q]}}
            ]
        }
        total = db.syllabus.count_documents(search_filter)
        syllabi = list(db.syllabus.find(search_filter).skip(skip).limit(limit).sort("created_at", -1))
        logger.info(f"Search '{q}': found {len(syllabi)} syllabi")
        for syllabus in syllabi:
            syllabus["id"] = syllabus.pop("_id")
            syllabus["created_at"] = syllabus.get("created_at", datetime.utcnow()).isoformat()
            syllabus["updated_at"] = syllabus.get("updated_at", datetime.utcnow()).isoformat()
        return {
            "success": True,
            "query": q,
            "data": syllabi,
            "pagination": {
                "total": total,
                "skip": skip,
                "limit": limit,
                "returned": len(syllabi)
            }
        }
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", dependencies=[Depends(verify_admin)], summary="Create syllabus (admin only)")
async def create_syllabus(payload: SyllabusIn):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        syllabus_id = str(uuid.uuid4())
        now = datetime.utcnow()
        doc = payload.dict()
        doc.update({
            "_id": syllabus_id,
            "created_at": now,
            "updated_at": now
        })
        db.syllabus.insert_one(doc)
        logger.info(f"Syllabus created: {syllabus_id}")
        return {
            "success": True,
            "message": "Syllabus created successfully",
            "data": {"id": syllabus_id, **doc}
        }
    except Exception as e:
        logger.error(f"Syllabus creation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{syllabus_id}", summary="Get specific syllabus")
async def get_one_syllabus(syllabus_id: str):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        syllabus = db.syllabus.find_one({"_id": syllabus_id})
        if not syllabus:
            raise HTTPException(status_code=404, detail="Syllabus not found")
        syllabus["id"] = syllabus.pop("_id")
        syllabus["created_at"] = syllabus.get("created_at", datetime.utcnow()).isoformat()
        syllabus["updated_at"] = syllabus.get("updated_at", datetime.utcnow()).isoformat()
        logger.info(f"Syllabus retrieved: {syllabus_id}")
        return {"success": True, "data": syllabus}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching syllabus {syllabus_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{syllabus_id}", dependencies=[Depends(verify_admin)], summary="Update syllabus (admin only)")
async def update_syllabus(syllabus_id: str, payload: SyllabusIn):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        existing = db.syllabus.find_one({"_id": syllabus_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Syllabus not found")
        update_data = payload.dict(exclude_unset=True)
        update_data["updated_at"] = datetime.utcnow()
        db.syllabus.update_one({"_id": syllabus_id}, {"$set": update_data})
        logger.info(f"Syllabus updated: {syllabus_id}")
        return {
            "success": True,
            "message": "Syllabus updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Syllabus update error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{syllabus_id}", dependencies=[Depends(verify_admin)], summary="Delete syllabus (admin only)")
async def delete_syllabus(syllabus_id: str):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        result = db.syllabus.delete_one({"_id": syllabus_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Syllabus not found")
        logger.info(f"Syllabus deleted: {syllabus_id}")
        return {"success": True, "message": "Syllabus deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Syllabus deletion error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
