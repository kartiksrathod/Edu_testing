from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List
import uuid
import logging
from datetime import datetime
from config import db, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from routes.auth_utils import verify_admin, verify_token

logger = logging.getLogger(__name__)
router = APIRouter()

class PaperIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    authors: Optional[List[str]] = Field(default_factory=list)
    abstract: Optional[str] = Field(None, max_length=5000)
    file_url: Optional[str] = Field(None, max_length=500)
    tags: Optional[List[str]] = Field(default_factory=list)

class PaperResponse(PaperIn):
    id: str
    created_at: datetime
    updated_at: datetime

@router.get("/", summary="Get all papers with pagination")
async def get_papers(
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        total = db.papers.count_documents({})
        papers = list(db.papers.find({}).skip(skip).limit(limit).sort("created_at", -1))
        logger.info(f"Retrieved {len(papers)} papers (skip={skip}, limit={limit})")
        for paper in papers:
            paper["id"] = paper.pop("_id")
            paper["created_at"] = paper.get("created_at", datetime.utcnow()).isoformat()
            paper["updated_at"] = paper.get("updated_at", datetime.utcnow()).isoformat()
        return {
            "success": True,
            "data": papers,
            "pagination": {
                "total": total,
                "skip": skip,
                "limit": limit,
                "returned": len(papers)
            }
        }
    except Exception as e:
        logger.error(f"Error fetching papers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search", summary="Search papers by title, authors, or tags")
async def search_papers(
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
                {"abstract": {"$regex": q, "$options": "i"}},
                {"authors": {"$in": [q]}},
                {"tags": {"$in": [q]}}
            ]
        }
        total = db.papers.count_documents(search_filter)
        papers = list(db.papers.find(search_filter).skip(skip).limit(limit).sort("created_at", -1))
        logger.info(f"Search '{q}': found {len(papers)} papers")
        for paper in papers:
            paper["id"] = paper.pop("_id")
            paper["created_at"] = paper.get("created_at", datetime.utcnow()).isoformat()
            paper["updated_at"] = paper.get("updated_at", datetime.utcnow()).isoformat()
        return {
            "success": True,
            "query": q,
            "data": papers,
            "pagination": {
                "total": total,
                "skip": skip,
                "limit": limit,
                "returned": len(papers)
            }
        }
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", dependencies=[Depends(verify_admin)], summary="Create paper (admin only)")
async def create_paper(payload: PaperIn):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        paper_id = str(uuid.uuid4())
        now = datetime.utcnow()
        doc = payload.dict()
        doc.update({
            "_id": paper_id,
            "created_at": now,
            "updated_at": now
        })
        db.papers.insert_one(doc)
        logger.info(f"Paper created: {paper_id}")
        return {
            "success": True,
            "message": "Paper created successfully",
            "data": {"id": paper_id, **doc}
        }
    except Exception as e:
        logger.error(f"Paper creation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{paper_id}", summary="Get specific paper")
async def get_paper(paper_id: str):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        paper = db.papers.find_one({"_id": paper_id})
        if not paper:
            raise HTTPException(status_code=404, detail="Paper not found")
        paper["id"] = paper.pop("_id")
        paper["created_at"] = paper.get("created_at", datetime.utcnow()).isoformat()
        paper["updated_at"] = paper.get("updated_at", datetime.utcnow()).isoformat()
        logger.info(f"Paper retrieved: {paper_id}")
        return {"success": True, "data": paper}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching paper {paper_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{paper_id}", dependencies=[Depends(verify_admin)], summary="Update paper (admin only)")
async def update_paper(paper_id: str, payload: PaperIn):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        existing = db.papers.find_one({"_id": paper_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Paper not found")
        update_data = payload.dict(exclude_unset=True)
        update_data["updated_at"] = datetime.utcnow()
        db.papers.update_one({"_id": paper_id}, {"$set": update_data})
        logger.info(f"Paper updated: {paper_id}")
        return {
            "success": True,
            "message": "Paper updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Paper update error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{paper_id}", dependencies=[Depends(verify_admin)], summary="Delete paper (admin only)")
async def delete_paper(paper_id: str):
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        result = db.papers.delete_one({"_id": paper_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Paper not found")
        logger.info(f"Paper deleted: {paper_id}")
        return {"success": True, "message": "Paper deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Paper deletion error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
