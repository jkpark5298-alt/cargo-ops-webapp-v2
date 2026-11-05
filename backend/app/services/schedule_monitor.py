"""스케줄 변경 감지·자동 푸시 루프"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import asyncio

from fastapi import HTTPException
from pywebpush import WebPushException
from app.services.incheon_api import (
    IncheonApiAuthError,
    IncheonApiQuotaExceededError,
    IncheonApiResponseError,
    get_flight_data,
)

from app.services.aircraft_registration import (
    _apply_aircraft_registrations_to_room,
    _row_aircraft_registration,
)
from app.services.flight_alerts import (
    _build_changed_item,
    _build_compact_schedule_push,
    _format_alert_time,
    _get_alert_time_value,
    _parse_kst_iso,
)
from app.services.flight_common import SCHEDULE_SLOT_KEYS, _now_kst, _now_kst_iso
from app.services.flight_rows import (
    _get_flight_key,
    _get_row_datetime,
    _get_row_sort_key,
    _is_arrival_row,
    _is_departure_row,
    _is_refresh_excluded,
    _latest_rows_by_flight,
    _normalize_alert_value,
    _normalize_flights,
    _row_alert_time,
    _row_matches_schedule_or_estimate_range,
    _row_operational_status,
    _validate_range,
)
from app.services.incheon_usage import _record_incheon_api_usage_for_rows
from app.services.notification_store import (
    _append_notification_history,
    _read_auto_push_status,
    _read_push_subscriptions,
    _send_web_push,
    _update_auto_push_status,
    _write_auto_push_status,
)
from app.services.schedule_store import (
    _build_schedule_card_name,
    _filter_schedule_rows_to_flights_input,
    _get_schedule_slot_entry,
    _is_active_schedule_room,
    _read_latest_schedule,
    _read_linked_slot,
    _read_schedule_slots_without_migration,
    _reconcile_checked_room_with_latest_deletions,
    _schedule_slot_payload,
    _write_latest_schedule,
    _write_schedule_slot_entry,
)
def _row_changed_fields(previous: Optional[Dict[str, Any]], current: Dict[str, Any]) -> List[str]:
    if previous is None:
        current_status = _row_operational_status(current)
        current_time = _format_alert_time(_get_alert_time_value(current))
        return [f"신규 정보 {current_status} · {current_time}"]

    checks = [
        ("운항시각", _get_alert_time_value(previous), _get_alert_time_value(current)),
        ("상태", previous.get("remark") or previous.get("status"), current.get("remark") or current.get("status")),
        ("게이트", previous.get("gatenumber"), current.get("gatenumber")),
        ("터미널", previous.get("terminalid"), current.get("terminalid")),
    ]

    changes: List[str] = []
    seen: set[str] = set()

    for label, before_raw, after_raw in checks:
        if label == "운항시각":
            before = _format_alert_time(before_raw)
            after = _format_alert_time(after_raw)
        else:
            before = _normalize_alert_value(before_raw)
            after = _normalize_alert_value(after_raw)

        if before == after:
            continue

        text = f"{label} {before} → {after}"
        if text not in seen:
            seen.add(text)
            changes.append(text)

    return changes


def _arrival_prealert_key(flight: str, row: Dict[str, Any]) -> str:
    return f"{flight}:{_row_alert_time(row)}"


def _get_arrival_prealert_changes(
    flight: str,
    row: Dict[str, Any],
    status: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    if not _is_arrival_row(row):
        return None

    target_dt = _get_row_datetime(row)
    if target_dt is None:
        return None

    now = _now_kst()  # 서버 시간대(UTC 등)와 무관하게 한국 시각으로 비교
    alert_start = target_dt - timedelta(minutes=10)
    alert_end = target_dt + timedelta(minutes=30)

    if now < alert_start or now > alert_end:
        return None

    key = _arrival_prealert_key(flight, row)
    sent_keys = set(status.get("arrivalPreAlertKeys") or [])

    if key in sent_keys:
        return None

    return {
        "key": key,
        "changes": [
            f"도착 예정 {_format_alert_time(_get_alert_time_value(row))}",
            f"상태 {_row_operational_status(row)}",
        ],
    }


def _append_arrival_prealert_keys(keys: List[str]) -> Dict[str, Any]:
    if not keys:
        return _read_auto_push_status()

    status = _read_auto_push_status()
    existing = [str(key) for key in (status.get("arrivalPreAlertKeys") or [])]
    merged = list(dict.fromkeys([*existing, *keys]))[-200:]
    status["arrivalPreAlertKeys"] = merged
    return _write_auto_push_status(status)


def _merge_latest_rows(
    existing_rows: List[Dict[str, Any]],
    updated_rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    merged_by_flight = _latest_rows_by_flight(existing_rows)
    # API 갱신 시에도 수동 입력 등록번호/AFOCS는 유지합니다.
    manual_preserve_fields = (
        "afocsSkd",
        "hlnbr",
        "registrationNo",
        "aircraftRegNo",
        "registrationNoEdited",
    )

    for row in updated_rows:
        flight = _get_flight_key(row)
        if not flight:
            continue

        existing = merged_by_flight.get(flight)
        if existing:
            merged_row = dict(row)
            for field in manual_preserve_fields:
                existing_value = existing.get(field)
                if field == "registrationNoEdited":
                    if existing_value:
                        merged_row[field] = existing_value
                    continue
                if str(existing_value or "").strip():
                    merged_row[field] = existing.get(field)
            merged_by_flight[flight] = merged_row
        else:
            merged_by_flight[flight] = row

    merged = list(merged_by_flight.values())
    merged.sort(key=_get_row_sort_key)
    return [_apply_elapsed_status_to_row(row) for row in merged]


def _apply_elapsed_status_to_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """API remark/status가 비어 있어도 예정시각이 지났으면 출발/도착을 반영한다."""
    next_row = dict(row)
    current_status = str(next_row.get("status") or "").strip()
    remark = str(next_row.get("remark") or "").strip()
    if current_status or any(token in remark for token in ("출발", "도착", "결항", "DEPART", "ARRIV", "CANCEL")):
        return next_row

    row_dt = _get_row_datetime(next_row)
    if row_dt is None or row_dt > _now_kst():
        return next_row

    source = str(next_row.get("sourceType") or "").strip().lower()
    dep = str(next_row.get("departureCode") or "").strip().upper()
    arr = str(next_row.get("arrivalCode") or "").strip().upper()
    is_departure = source == "departure" or dep == "ICN"
    is_arrival = source == "arrival" or arr == "ICN"

    if is_departure:
        next_row["status"] = "출발"
    elif is_arrival:
        next_row["status"] = "도착"

    return next_row


def _preserve_manual_afocs_skd(
    target_rows: List[Dict[str, Any]],
    source_rows: List[Any],
) -> List[Dict[str, Any]]:
    """source에 수동 입력된 afocsSkd/등록번호가 있으면 target row에 덮어쓴다."""
    source_by_flight: Dict[str, Dict[str, Any]] = {}
    for row in source_rows or []:
        if not isinstance(row, dict):
            continue
        flight = _get_flight_key(row)
        if not flight:
            continue
        afocs = str(row.get("afocsSkd") or "").strip()
        registration_no = _row_aircraft_registration(row)
        if afocs or registration_no:
            source_by_flight[flight] = row

    if not source_by_flight:
        return target_rows

    preserved: List[Dict[str, Any]] = []
    for row in target_rows:
        if not isinstance(row, dict):
            continue
        flight = _get_flight_key(row)
        source = source_by_flight.get(flight)
        if source:
            next_row = dict(row)
            afocs = str(source.get("afocsSkd") or "").strip()
            if afocs:
                next_row["afocsSkd"] = source.get("afocsSkd")
            registration_no = _row_aircraft_registration(source)
            if registration_no:
                next_row["hlnbr"] = registration_no
                next_row["registrationNo"] = registration_no
                next_row["aircraftRegNo"] = registration_no
                if source.get("registrationNoEdited"):
                    next_row["registrationNoEdited"] = source.get("registrationNoEdited")
            preserved.append(next_row)
        else:
            preserved.append(row)
    return preserved


def _refresh_schedule_rooms_with_aircraft_registrations() -> None:
    """등록기호 DB 변경 후 슬롯/latest-schedule 행에 다시 적용합니다."""
    slots = _read_schedule_slots_without_migration()
    for slot in SCHEDULE_SLOT_KEYS:
        entry = _get_schedule_slot_entry(slots, slot)
        room = entry.get("room") if entry else None
        if not isinstance(room, dict) or not _is_active_schedule_room(room):
            continue
        name = str(entry.get("name") or _build_schedule_card_name(str(room.get("startDateTime") or "")))
        saved_at = str(entry.get("savedAt") or _now_kst_iso())
        refreshed = _apply_aircraft_registrations_to_room(room) or room
        _write_schedule_slot_entry(
            slot,
            _schedule_slot_payload(slot, name, refreshed, saved_at),
        )

    latest_room = _read_latest_schedule()
    if latest_room:
        _write_latest_schedule(latest_room)


def _get_linked_slot_room() -> Optional[Dict[str, Any]]:
    slots = _read_schedule_slots_without_migration()
    linked_slot = _read_linked_slot()
    entry = _get_schedule_slot_entry(slots, linked_slot)
    room = entry.get("room") if entry else None
    return room if isinstance(room, dict) else None


def _get_schedule_room_for_api_check() -> Optional[Dict[str, Any]]:
    """
    API 즉시 확인용 room.
    latest_schedule을 기준으로 하되, 연동 슬롯의 수동 afocsSkd를 우선 복원한다.
    """
    latest = _read_latest_schedule()
    linked_room = _get_linked_slot_room()

    if not latest and not _is_active_schedule_room(linked_room):
        return None

    if not latest and linked_room:
        return dict(linked_room)

    room = dict(latest or {})
    linked_rows = linked_room.get("rows") if isinstance(linked_room, dict) else []
    existing_rows = room.get("rows") if isinstance(room.get("rows"), list) else []
    room["rows"] = _preserve_manual_afocs_skd(existing_rows, linked_rows if isinstance(linked_rows, list) else [])

    if linked_room:
        # flightsInput은 latest를 우선한다. 연동 슬롯 값으로 덮어쓰면 삭제된 편이 되살아난다.
        for key in ("flightsInput", "startDateTime", "endDateTime", "id", "name"):
            if linked_room.get(key) and not room.get(key):
                room[key] = linked_room.get(key)

    return _filter_schedule_rows_to_flights_input(room)


def _write_checked_schedule_room(room: Dict[str, Any]) -> Dict[str, Any]:
    """API 확인 결과를 latest_schedule과 연동 슬롯에 함께 저장한다."""
    room = _reconcile_checked_room_with_latest_deletions(room)
    saved = _write_latest_schedule(room)
    saved_room = saved.get("room") if isinstance(saved, dict) else room
    if not isinstance(saved_room, dict):
        saved_room = room
    saved_room = _filter_schedule_rows_to_flights_input(saved_room)

    linked_slot = _read_linked_slot()
    slots = _read_schedule_slots_without_migration()
    existing_entry = _get_schedule_slot_entry(slots, linked_slot)
    if existing_entry or _is_active_schedule_room(saved_room):
        name = str(
            (existing_entry or {}).get("name")
            or _build_schedule_card_name(str(saved_room.get("startDateTime") or ""))
        )
        entry = _schedule_slot_payload(
            linked_slot,
            name,
            saved_room,
            saved.get("savedAt") if isinstance(saved, dict) else _now_kst_iso(),
        )
        _write_schedule_slot_entry(linked_slot, entry)

    return saved


async def _run_schedule_change_check(push_on_change: bool = True) -> Dict[str, Any]:
    room = _get_schedule_room_for_api_check()

    if not room:
        raise HTTPException(status_code=400, detail="서버에 저장된 Schedule Flight가 없습니다.")

    existing_rows = room.get("rows") or []
    if not isinstance(existing_rows, list):
        existing_rows = []

    start = str(room.get("startDateTime") or "")
    end = str(room.get("endDateTime") or "")
    start_dt, end_dt, start_date, end_date = _validate_range(start, end)

    previous_latest = _latest_rows_by_flight(existing_rows)
    requested_flights = _normalize_flights([str(room.get("flightsInput") or "")])

    active_flights: List[str] = []
    excluded_flights: List[str] = []

    for flight in requested_flights:
        previous = previous_latest.get(flight)
        if previous and _is_refresh_excluded(previous):
            excluded_flights.append(flight)
        else:
            active_flights.append(flight)

    if not active_flights:
        return {
            "success": True,
            "checked": 0,
            "changed": 0,
            "sent": 0,
            "failed": 0,
            "message": "모든 Schedule Flight가 remark 기준 도착 또는 결항 확정되어 재조회 대상이 없습니다.",
            "excludedFlights": excluded_flights,
        }

    fresh_rows: List[Dict[str, Any]] = []

    try:
        for flight in active_flights:
            rows = await get_flight_data(
                flight_no=flight,
                start_date=start_date,
                end_date=end_date,
            )

            filtered_rows = [
                row
                for row in rows
                if _row_matches_schedule_or_estimate_range(row, start_dt, end_dt)
            ]

            _record_incheon_api_usage_for_rows(filtered_rows)
            fresh_rows.extend(filtered_rows)

    except IncheonApiQuotaExceededError:
        raise HTTPException(status_code=429, detail="한도 초과로 조회 불가")
    except IncheonApiAuthError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc) or "인천 화물기 API 인증 실패. INCHEON_API_SERVICE_KEY(Decoding)를 확인하세요.",
        ) from exc
    except IncheonApiResponseError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"인천 화물기 API 오류({exc.code}): {exc.message}",
        ) from exc

    fresh_latest = _latest_rows_by_flight(fresh_rows)
    changed_items: List[Dict[str, Any]] = []
    prealert_keys_to_save: List[str] = []
    auto_status = _read_auto_push_status()

    for flight in active_flights:
        current = fresh_latest.get(flight)
        if not current:
            continue

        previous = previous_latest.get(flight)
        changes = _row_changed_fields(previous, current)

        if changes:
            changed_items.append(_build_changed_item(flight, current, changes))

        prealert = _get_arrival_prealert_changes(flight, current, auto_status)
        if prealert:
            prealert_keys_to_save.append(str(prealert["key"]))
            changed_items.append(_build_changed_item(flight, current, prealert["changes"]))

    merged_rows = _merge_latest_rows(existing_rows, list(fresh_latest.values()))
    # 연동 슬롯에 남아 있는 수동 AFOCS SKD를 최종 결과에 다시 반영
    linked_room = _get_linked_slot_room()
    linked_rows = linked_room.get("rows") if isinstance(linked_room, dict) else []
    merged_rows = _preserve_manual_afocs_skd(
        merged_rows,
        linked_rows if isinstance(linked_rows, list) else [],
    )
    # flightsInput에서 빠진 편(삭제)은 merge 잔여 rows로 되살리지 않는다.
    allowed_flights = set(requested_flights)
    merged_rows = [
        row
        for row in merged_rows
        if isinstance(row, dict) and _get_flight_key(row) in allowed_flights
    ]
    room["rows"] = merged_rows
    room["flightsInput"] = ", ".join(requested_flights)
    room["lastFetchedAt"] = _now_kst_iso()
    _write_checked_schedule_room(room)

    sent = 0
    failed = 0
    errors: List[str] = []

    if changed_items:
        _append_notification_history(
            changed_items,
            room,
            "푸시 자동 확인" if push_on_change else "앱 자동 확인",
        )

    if changed_items and push_on_change:
        payload = _build_compact_schedule_push(changed_items)

        for item in _read_push_subscriptions():
            subscription = item.get("subscription") or {}

            try:
                _send_web_push(subscription, payload)
                sent += 1
            except WebPushException as exc:
                failed += 1
                errors.append(str(exc))
            except Exception as exc:
                failed += 1
                errors.append(str(exc))

    if prealert_keys_to_save:
        _append_arrival_prealert_keys(prealert_keys_to_save)

    return {
        "success": True,
        "checked": len(active_flights),
        "changed": len(changed_items),
        "sent": sent,
        "failed": failed,
        "changes": changed_items,
        "excludedFlights": excluded_flights,
        "errors": errors[:3],
        "message": "변경 확인이 완료되었습니다.",
    }


def _is_row_in_focus_window(row: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    target_dt = _get_row_datetime(row)
    if target_dt is None:
        return False

    now = now or _now_kst()  # 서버 시간대와 무관하게 한국 시각

    if _is_departure_row(row):
        return target_dt - timedelta(minutes=30) <= now <= target_dt + timedelta(hours=1)

    if _is_arrival_row(row):
        return target_dt - timedelta(hours=1) <= now <= target_dt + timedelta(minutes=30)

    return False


def _get_auto_interval_minutes_for_room(room: Optional[Dict[str, Any]]) -> int:
    if not room:
        return 30

    rows = room.get("rows") or []
    if not isinstance(rows, list):
        rows = []

    latest = _latest_rows_by_flight(rows)
    requested_flights = _normalize_flights([str(room.get("flightsInput") or "")])
    now = _now_kst()

    for flight in requested_flights:
        row = latest.get(flight)
        if not row:
            continue
        if _is_refresh_excluded(row):
            continue
        if _is_row_in_focus_window(row, now):
            return 5

    return 30


def _get_current_auto_interval_minutes() -> int:
    return _get_auto_interval_minutes_for_room(_read_latest_schedule())


async def _auto_push_loop() -> None:
    while True:
        status = _read_auto_push_status()
        interval_minutes = _get_current_auto_interval_minutes()
        enabled = bool(status.get("enabled", True))

        if enabled:
            try:
                result = await _run_schedule_change_check(push_on_change=True)
                changed = result.get("changed", 0)
                sent = result.get("sent", 0)
                mode = "집중 5분" if interval_minutes == 5 else "일반 30분"
                message = (
                    f"자동 확인 완료({mode}): 변경 {changed}건, 푸시 {sent}건"
                    if changed
                    else f"자동 확인 완료({mode}): 변경 없음, 재조회 {result.get('checked', 0)}건"
                )
                _update_auto_push_status(
                    enabled=True,
                    intervalMinutes=interval_minutes,
                    lastRunAt=_now_kst_iso(),
                    lastMessage=message,
                    lastResult=result,
                )
            except Exception as exc:
                _update_auto_push_status(
                    enabled=True,
                    intervalMinutes=interval_minutes,
                    lastRunAt=_now_kst_iso(),
                    lastMessage=f"자동 확인 오류: {exc}",
                )

        await asyncio.sleep(min(interval_minutes, 5) * 60)


async def _run_auto_push_tick_if_due(source: str = "health") -> Dict[str, Any]:
    status = _read_auto_push_status()
    interval_minutes = _get_current_auto_interval_minutes()
    enabled = bool(status.get("enabled", True))
    now = _now_kst()
    last_run_at = _parse_kst_iso(status.get("lastRunAt"))
    elapsed_seconds = (
        (now - last_run_at).total_seconds()
        if last_run_at is not None
        else None
    )
    # Negative elapsed means clock/parse skew — treat as overdue so cron health recovers.
    due = enabled and (
        elapsed_seconds is None
        or elapsed_seconds < 0
        or elapsed_seconds >= interval_minutes * 60
    )

    tick_result: Dict[str, Any] = {
        "enabled": enabled,
        "intervalMinutes": interval_minutes,
        "mode": "focus" if interval_minutes == 5 else "normal",
        "due": due,
        "source": source,
        "lastRunAt": status.get("lastRunAt") or "",
        "elapsedSeconds": elapsed_seconds,
        "ran": False,
        "message": status.get("lastMessage") or "",
    }

    if not due:
        return tick_result

    try:
        result = await _run_schedule_change_check(push_on_change=True)
        changed = result.get("changed", 0)
        sent = result.get("sent", 0)
        mode_text = "집중 5분" if interval_minutes == 5 else "일반 30분"
        message = (
            f"자동 확인 완료({mode_text}, {source}): 변경 {changed}건, 푸시 {sent}건"
            if changed
            else f"자동 확인 완료({mode_text}, {source}): 변경 없음, 재조회 {result.get('checked', 0)}건"
        )
        _update_auto_push_status(
            enabled=True,
            intervalMinutes=interval_minutes,
            lastRunAt=_now_kst_iso(),
            lastMessage=message,
            lastResult=result,
        )
        tick_result.update(
            {
                "ran": True,
                "lastRunAt": _now_kst_iso(),
                "message": message,
                "result": result,
            }
        )
    except Exception as exc:
        message = f"자동 확인 오류({source}): {exc}"
        _update_auto_push_status(
            enabled=True,
            intervalMinutes=interval_minutes,
            lastRunAt=_now_kst_iso(),
            lastMessage=message,
        )
        tick_result.update(
            {
                "ran": True,
                "lastRunAt": _now_kst_iso(),
                "message": message,
                "error": str(exc),
            }
        )

    return tick_result
