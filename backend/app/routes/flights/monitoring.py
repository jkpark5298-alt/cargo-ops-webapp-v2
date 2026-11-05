"""변경 확인·자동 푸시·호출량·헬스체크 API"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from app.services.incheon_api import probe_incheon_api

from app.routes.flights.models import AutoPushConfigRequest, LatestScheduleRequest
from app.services.flight_alerts import _build_changed_item, _build_compact_schedule_push
from app.services.flight_common import AUTO_PUSH_DEFAULT_INTERVAL_MINUTES, _now_kst, _now_kst_iso
from app.services.flight_rows import _latest_rows_by_flight, _normalize_flights
from app.services.incheon_usage import _get_today_incheon_api_usage
from app.services.api_auth import require_api_token
from app.services.notification_store import (
    _append_notification_history,
    _broadcast_web_push,
    _read_auto_push_status,
    _read_push_subscriptions,
    _update_auto_push_status,
)
from app.services.schedule_monitor import (
    _append_arrival_prealert_keys,
    _auto_interval_mode,
    _auto_push_loop,
    _get_arrival_prealert_changes,
    _get_auto_interval_minutes_for_room,
    _get_current_auto_interval_minutes,
    _row_changed_fields,
    _run_auto_push_tick_if_due,
    _run_schedule_change_check,
)
from app.services.schedule_store import (
    _read_latest_schedule,
    _sanitize_latest_schedule_room,
    _write_latest_schedule,
)
router = APIRouter()


AUTO_PUSH_STARTED = False


@router.on_event("startup")
async def start_auto_push_worker() -> None:
    global AUTO_PUSH_STARTED

    if AUTO_PUSH_STARTED:
        return

    AUTO_PUSH_STARTED = True
    asyncio.create_task(_auto_push_loop())


@router.post("/check-schedule", dependencies=[Depends(require_api_token)])
async def check_schedule() -> Dict[str, Any]:
    return await _run_schedule_change_check(push_on_change=False)


@router.post("/check-schedule-and-push", dependencies=[Depends(require_api_token)])
async def check_schedule_and_push() -> Dict[str, Any]:
    return await _run_schedule_change_check(push_on_change=True)


@router.get("/incheon-api-usage")
async def get_incheon_api_usage() -> Dict[str, Any]:
    usage = _get_today_incheon_api_usage()
    return {
        "success": True,
        **usage,
    }


@router.get("/incheon-api-probe")
async def incheon_api_probe(
    searchday: Optional[str] = None,
    flightNo: str = "KJ925",
) -> Dict[str, Any]:
    """공공 API 응답 코드/키 메타를 확인합니다. 서비스키 전문은 노출하지 않습니다."""
    try:
        return await probe_incheon_api(search_day=searchday, flight_no=flightNo)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/health")
async def health_check(tick: bool = True) -> Dict[str, Any]:
    """서버 깨우기/상태 확인. 기본은 자동 푸시 시각이 되었으면 함께 실행(cron 용).
    상태만 보려면 `?tick=false` 로 호출하면 변경 확인·푸시를 실행하지 않는다."""
    tick_result = await _run_auto_push_tick_if_due("health") if tick else {"skipped": True}
    room = _read_latest_schedule()
    status = _read_auto_push_status()
    interval = _get_current_auto_interval_minutes()

    rows = room.get("rows") if isinstance(room, dict) else []
    if not isinstance(rows, list):
        rows = []

    requested_flights = _normalize_flights([str(room.get("flightsInput") or "")]) if isinstance(room, dict) else []

    return {
        "success": True,
        "service": "cargo-ops-backend",
        "status": "ok",
        "nowKst": _now_kst_iso(),
        "autoPushEnabled": bool(status.get("enabled", True)),
        "intervalMinutes": interval,
        "mode": _auto_interval_mode(interval),
        "lastRunAt": status.get("lastRunAt") or "",
        "lastMessage": status.get("lastMessage") or "",
        "scheduleFlightCount": len(requested_flights),
        "rowCount": len(rows),
        "tick": tick_result,
    }


@router.get("/auto-push/status")
async def get_auto_push_status() -> Dict[str, Any]:
    status = _read_auto_push_status()
    interval = _get_current_auto_interval_minutes()
    return {
        "success": True,
        **status,
        "enabled": bool(status.get("enabled", True)),
        "intervalMinutes": interval,
        "mode": _auto_interval_mode(interval),
        "subscriptionCount": len(_read_push_subscriptions()),
        "nowKst": _now_kst_iso(),
    }


@router.post("/auto-push/config", dependencies=[Depends(require_api_token)])
async def update_auto_push_config(payload: AutoPushConfigRequest) -> Dict[str, Any]:
    interval = max(5, int(payload.intervalMinutes or AUTO_PUSH_DEFAULT_INTERVAL_MINUTES))
    status = _update_auto_push_status(
        enabled=payload.enabled,
        intervalMinutes=interval,
        lastMessage="자동 변경 확인이 자동 적용 상태입니다." if payload.enabled else "자동 변경 확인이 일시 중지되었습니다.",
    )

    return {
        "success": True,
        **status,
    }


@router.post("/latest-schedule/check-push-and-save", dependencies=[Depends(require_api_token)])
async def check_push_and_save_latest_schedule(payload: LatestScheduleRequest) -> Dict[str, Any]:
    current_room = dict(payload.room or {})

    if not current_room.get("fixed"):
        current_room["fixed"] = True

    if not current_room.get("id"):
        current_room["id"] = str(int(_now_kst().timestamp() * 1000))

    if not current_room.get("name"):
        current_room["name"] = "Schedule_Synced"

    previous_room = _read_latest_schedule()
    previous_rows = []
    if previous_room and isinstance(previous_room.get("rows"), list):
        previous_rows = previous_room.get("rows") or []

    current_rows = current_room.get("rows") or []
    if not isinstance(current_rows, list):
        current_rows = []

    previous_latest = _latest_rows_by_flight(previous_rows)
    current_latest = _latest_rows_by_flight(current_rows)
    requested_flights = _normalize_flights([str(current_room.get("flightsInput") or "")])

    changed_items: List[Dict[str, Any]] = []
    prealert_keys_to_save: List[str] = []
    auto_status = _read_auto_push_status()

    for flight in requested_flights:
        current = current_latest.get(flight)
        if not current:
            continue

        previous = previous_latest.get(flight)
        changes = _row_changed_fields(previous, current)

        # 정보 제공형 알림: 신규 REMARK/status, 출발/도착/지연/결항/회항,
        # 시간/게이트/터미널 변경이 있으면 푸시 대상입니다.
        if changes:
            changed_items.append(_build_changed_item(flight, current, changes))

        prealert = _get_arrival_prealert_changes(flight, current, auto_status)
        if prealert:
            prealert_keys_to_save.append(str(prealert["key"]))
            changed_items.append(_build_changed_item(flight, current, prealert["changes"]))

    sent = 0
    failed = 0
    errors: List[str] = []

    if changed_items:
        push_result = _broadcast_web_push(_build_compact_schedule_push(changed_items))
        sent = push_result["sent"]
        failed = push_result["failed"]
        errors = push_result["errors"]

    if changed_items:
        _append_notification_history(changed_items, current_room, "AFOCS SKD 저장 알림")

    saved = _write_latest_schedule(_sanitize_latest_schedule_room(current_room))
    if prealert_keys_to_save:
        _append_arrival_prealert_keys(prealert_keys_to_save)

    _update_auto_push_status(
        enabled=True,
        intervalMinutes=_get_auto_interval_minutes_for_room(current_room),
        lastRunAt=_now_kst_iso(),
        lastMessage=(
            f"AFOCS SKD 결과 저장 및 알림 확인 완료: 변경 {len(changed_items)}건, 푸시 {sent}건"
            if changed_items
            else "AFOCS SKD 결과 저장 완료: 변경 없음"
        ),
        lastResult={
            "changed": len(changed_items),
            "sent": sent,
            "failed": failed,
            "changes": changed_items,
            "errors": errors[:3],
        },
    )

    return {
        "success": True,
        "room": saved["room"],
        "savedAt": saved["savedAt"],
        "changed": len(changed_items),
        "sent": sent,
        "failed": failed,
        "changes": changed_items,
        "errors": errors[:3],
    }
