"""Monthly Scheduled Flight API"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.services.aircraft_registration import _save_aircraft_registrations
from app.services.api_auth import require_api_token
from app.services.monthly_schedule import (
    _assignee_to_client,
    _delete_monthly_flight,
    _last_api_refresh_iso,
    _list_assignees,
    _list_flights,
    _maybe_refresh_monthly_api,
    _monthly_title,
    _purge_outside_window,
    _retention_window,
    _save_assignees,
    _save_monthly_flights,
    _set_assignee_slot,
    _to_client,
)

router = APIRouter()


class MonthlyFlightRecord(BaseModel):
    flight: str
    skdTime: str
    flightDate: Optional[str] = None
    departureCode: str = ""
    arrivalCode: str = ""
    registrationNo: str = ""


class MonthlySaveRequest(BaseModel):
    records: List[MonthlyFlightRecord] = Field(default_factory=list)
    # True: 올린 일자의 기존 편 중 이번 목록에 없는 편은 지운다(월간 SKD 재업로드). 한 줄 수정은 False.
    replaceDates: bool = True
    source: str = "manual"


class AssigneeSlotRequest(BaseModel):
    recordKey: str
    slot: str = ""


class AssigneeNamesRequest(BaseModel):
    flightDate: str
    shift: str
    nameA: str = ""
    nameB: str = ""
    nameC: str = ""


def _storage_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=503, detail=f"월간 SKD 저장소 오류: {exc}")


@router.get("/monthly-schedule")
async def get_monthly_schedule(start: Optional[str] = None, end: Optional[str] = None, refresh: bool = False) -> Dict[str, Any]:
    window_start, window_end, month_last = _retention_window()
    refresh_result = None
    try:
        _purge_outside_window()
        if refresh:
            # 화면을 열 때 오늘~3일 뒤 편을 인천 API 최신값으로 갱신(10분 안에 다시 열면 생략)
            refresh_result = await _maybe_refresh_monthly_api(10)
        flights = _list_flights(start, end)
        assignees = _list_assignees(start, end)
    except RuntimeError as exc:
        raise _storage_error(exc) from exc
    except Exception as exc:  # Supabase 통신 오류 등
        raise _storage_error(exc) from exc
    return {
        "success": True,
        "title": _monthly_title(),
        "window": {"start": window_start, "end": window_end, "monthLast": month_last},
        "flights": [_to_client(r) for r in flights],
        "assignees": [_assignee_to_client(r) for r in assignees],
        "apiRefreshedAt": _last_api_refresh_iso(),
        "refresh": refresh_result,
    }


@router.post("/monthly-schedule", dependencies=[Depends(require_api_token)])
async def save_monthly_schedule(payload: MonthlySaveRequest) -> Dict[str, Any]:
    try:
        result = _save_monthly_flights([r.dict() for r in payload.records], payload.replaceDates, payload.source)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"월간 SKD 저장 실패: {exc}") from exc

    # 등록기호는 기존 등록기록에도 저장 → ③ 등록번호 / AFOCS, 초기화면 Schedule Flight 에서도 사용
    registrations = result.pop("registrations", [])
    registration_saved = 0
    if registrations:
        try:
            _save_aircraft_registrations(registrations, "merge")
            registration_saved = len(registrations)
            from app.services.schedule_monitor import _refresh_schedule_rooms_with_aircraft_registrations

            _refresh_schedule_rooms_with_aircraft_registrations()
        except Exception as exc:
            result["registrationError"] = str(exc)
    return {"success": True, **result, "registrationSaved": registration_saved}


@router.delete("/monthly-schedule/{record_key:path}", dependencies=[Depends(require_api_token)])
async def delete_monthly_schedule_flight(record_key: str) -> Dict[str, Any]:
    try:
        _delete_monthly_flight(record_key)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"삭제 실패: {exc}") from exc
    return {"success": True}


@router.post("/monthly-schedule/assignee-slot", dependencies=[Depends(require_api_token)])
async def set_monthly_assignee_slot(payload: AssigneeSlotRequest) -> Dict[str, Any]:
    try:
        updated = _set_assignee_slot(payload.recordKey, payload.slot)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=404, detail="해당 편을 찾을 수 없습니다.")
    return {"success": True, "flight": _to_client(updated)}


@router.post("/monthly-schedule/assignees", dependencies=[Depends(require_api_token)])
async def save_monthly_assignees(payload: AssigneeNamesRequest) -> Dict[str, Any]:
    try:
        row = _save_assignees(payload.flightDate, payload.shift, payload.nameA, payload.nameB, payload.nameC)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"success": True, "assignee": _assignee_to_client(row)}


@router.post("/monthly-schedule/refresh-api", dependencies=[Depends(require_api_token)])
async def refresh_monthly_schedule_api() -> Dict[str, Any]:
    result = await _maybe_refresh_monthly_api(0)
    return {"success": True, "result": result, "apiRefreshedAt": _last_api_refresh_iso()}
