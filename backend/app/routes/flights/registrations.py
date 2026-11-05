"""항공기 등록기호 API"""

from __future__ import annotations

from fastapi import APIRouter

from typing import Any, Dict

from app.routes.flights.models import AircraftRegistrationSaveRequest
from app.services.aircraft_registration import (
    _merge_aircraft_registrations,
    _read_aircraft_registrations,
    _write_aircraft_registrations,
)
from app.services.schedule_monitor import _refresh_schedule_rooms_with_aircraft_registrations
router = APIRouter()


@router.get("/aircraft-registrations")
async def get_aircraft_registrations() -> Dict[str, Any]:
    records = _read_aircraft_registrations()
    return {
        "success": True,
        "records": records,
        "count": len(records),
    }


@router.post("/aircraft-registrations")
async def save_aircraft_registrations(payload: AircraftRegistrationSaveRequest) -> Dict[str, Any]:
    incoming_records = [record.dict() for record in payload.records]
    mode = str(payload.mode or "merge").lower().strip()

    if mode == "replace":
        next_records = incoming_records
    else:
        next_records = _merge_aircraft_registrations(
            _read_aircraft_registrations(),
            incoming_records,
        )

    saved = _write_aircraft_registrations(next_records)
    # 등록기호 DB뿐 아니라 Schedule Flight 카드/초기화면도 바로 맞춥니다.
    _refresh_schedule_rooms_with_aircraft_registrations()

    records = saved["records"]
    return {
        "success": True,
        "records": records,
        "count": len(records),
        "savedAt": saved["savedAt"],
    }
