"""초기화면 카드의 해외 출발편 출발 일시 API (표시 전용)"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.services.api_auth import require_api_token
from app.services.departure_times import _list_departure_times, _set_departure_time

router = APIRouter()


class DepartureTimeRequest(BaseModel):
    date: str
    flight: str
    # 빈 문자열이면 삭제, 'YYYY-MM-DD HH:MM' 이면 저장
    departure: str = ""


@router.get("/departure-times")
async def get_departure_times() -> Dict[str, Any]:
    return {"success": True, "items": _list_departure_times()}


@router.post("/departure-times", dependencies=[Depends(require_api_token)])
async def save_departure_time(payload: DepartureTimeRequest) -> Dict[str, Any]:
    try:
        items = _set_departure_time(payload.date, payload.flight, payload.departure)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"success": True, "items": items}
