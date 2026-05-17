from typing import Any

from fastapi import APIRouter

from app.services.notion import get_notion_links, create_daily_record, create_issue_record, delete_daily_record, delete_issue_record, update_daily_record, update_issue_record

router = APIRouter()


@router.get("/links")
async def read_notion_links():
    return get_notion_links()


@router.post("/daily-records")
async def save_daily_record(payload: dict[str, Any]):
    return await create_daily_record(payload)


@router.patch("/daily-records/{page_id}")
async def edit_daily_record(page_id: str, payload: dict[str, Any]):
    return await update_daily_record(page_id, payload)


@router.delete("/daily-records/{page_id}")
async def remove_daily_record(page_id: str):
    return await delete_daily_record(page_id)


@router.post("/issue-records")
async def save_issue_record(payload: dict[str, Any]):
    return await create_issue_record(payload)


@router.patch("/issue-records/{page_id}")
async def edit_issue_record(page_id: str, payload: dict[str, Any]):
    return await update_issue_record(page_id, payload)


@router.delete("/issue-records/{page_id}")
async def remove_issue_record(page_id: str):
    return await delete_issue_record(page_id)
