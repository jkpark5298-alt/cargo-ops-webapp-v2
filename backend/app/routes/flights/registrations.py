"""항공기 등록기호 API"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from typing import Any, Dict

from app.routes.flights.models import AircraftRegistrationSaveRequest
from app.services.aircraft_registration import (
    _read_aircraft_registrations,
    _save_aircraft_registrations,
)
from app.services.schedule_monitor import _refresh_schedule_rooms_with_aircraft_registrations
router = APIRouter()


@router.get("/aircraft-registrations")
async def get_aircraft_registrations() -> Dict[str, Any]:
    try:
        # strict: 저장소 조회가 실패하면 빈 목록 대신 오류로 알린다.
        # (빈 목록으로 응답하면 화면이 "서버에 기록이 없다"고 판단해 브라우저에 남은 기록을 지울 수 있다)
        records = _read_aircraft_registrations(strict=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "success": True,
        "records": records,
        "count": len(records),
    }


@router.post("/aircraft-registrations")
async def save_aircraft_registrations(payload: AircraftRegistrationSaveRequest) -> Dict[str, Any]:
    incoming_records = [record.dict() for record in payload.records]
    mode = str(payload.mode or "merge").lower().strip()

    try:
        # mode 가 "replace" 여도 기록을 지우지 않고 병합한다. 같은 운항은 나중에 저장한 값이 이긴다.
        saved = _save_aircraft_registrations(incoming_records, mode)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # 등록기호 DB뿐 아니라 Schedule Flight 카드/초기화면도 바로 맞춥니다.
    _refresh_schedule_rooms_with_aircraft_registrations()

    records = saved["records"]
    return {
        "success": True,
        "records": records,
        "count": len(records),
        "savedAt": saved["savedAt"],
        "changed": saved["changed"],
    }
