"""최신 Schedule Flight(latest)와 슬롯(active/archive) 저장·동기화"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, Optional
import json
import re
import urllib.error
import urllib.parse
import urllib.request

from fastapi import HTTPException

from app.services.aircraft_registration import _apply_aircraft_registrations_to_room
from app.services.flight_common import (
    DEFAULT_LINKED_SLOT,
    LATEST_SCHEDULE_FILE,
    SCHEDULE_SLOTS_FILE,
    SCHEDULE_SLOT_KEYS,
    _now_kst,
    _now_kst_iso,
    _supabase_request,
    _supabase_usage_enabled,
)
from app.services.flight_rows import _get_flight_key, _normalize_flights
def _latest_schedule_from_supabase_row(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    room = row.get("room")
    if not isinstance(room, dict):
        return None

    saved_at = str(row.get("saved_at") or row.get("updated_at") or "")
    return {
        "room": _apply_aircraft_registrations_to_room(room) or room,
        "savedAt": saved_at,
    }


def _read_latest_schedule_from_file() -> Optional[Dict[str, Any]]:
    try:
        if not LATEST_SCHEDULE_FILE.exists():
            return None

        data = json.loads(LATEST_SCHEDULE_FILE.read_text(encoding="utf-8"))
        room = data.get("room")
        if not isinstance(room, dict):
            return None

        return {
            "room": _apply_aircraft_registrations_to_room(room) or room,
            "savedAt": str(data.get("savedAt") or ""),
        }
    except Exception:
        return None


def _write_latest_schedule_to_file(room: Dict[str, Any]) -> Dict[str, Any]:
    room_with_registration = _apply_aircraft_registrations_to_room(room) or room
    payload = {
        "room": room_with_registration,
        "savedAt": _now_kst_iso(),
    }
    LATEST_SCHEDULE_FILE.parent.mkdir(parents=True, exist_ok=True)
    LATEST_SCHEDULE_FILE.write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8",
    )
    return payload


def _read_latest_schedule_from_supabase() -> Optional[Dict[str, Any]]:
    if not _supabase_usage_enabled():
        return None

    query = urllib.parse.urlencode(
        {
            "id": "eq.default",
            "select": "id,room,saved_at,updated_at",
            "limit": "1",
        }
    )

    try:
        rows = _supabase_request("GET", f"/rest/v1/latest_schedule_rooms?{query}")
    except Exception:
        return None

    if not isinstance(rows, list) or not rows:
        return None

    row = rows[0]
    return _latest_schedule_from_supabase_row(row) if isinstance(row, dict) else None


def _write_latest_schedule_to_supabase(room: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not _supabase_usage_enabled():
        return None

    room_with_registration = _apply_aircraft_registrations_to_room(room) or room
    saved_at = _now_kst_iso()
    row = {
        "id": "default",
        "room": room_with_registration,
        "saved_at": saved_at,
        "updated_at": saved_at,
    }

    try:
        result = _supabase_request(
            "POST",
            "/rest/v1/latest_schedule_rooms?on_conflict=id",
            row,
            {
                "Prefer": "resolution=merge-duplicates,return=representation",
            },
        )
    except Exception:
        return None

    if isinstance(result, list) and result and isinstance(result[0], dict):
        saved = _latest_schedule_from_supabase_row(result[0])
        if saved:
            return saved

    return {"room": room_with_registration, "savedAt": saved_at}


def _read_latest_schedule() -> Optional[Dict[str, Any]]:
    supabase_payload = _read_latest_schedule_from_supabase()
    if supabase_payload:
        return supabase_payload.get("room")

    file_payload = _read_latest_schedule_from_file()
    return file_payload.get("room") if file_payload else None


def _write_latest_schedule(room: Dict[str, Any]) -> Dict[str, Any]:
    file_payload = _write_latest_schedule_to_file(room)
    supabase_payload = _write_latest_schedule_to_supabase(file_payload["room"])
    return supabase_payload or file_payload


def _format_schedule_period_date(start_date_time: str) -> str:
    raw = str(start_date_time or "").strip().replace("T", " ")
    match = re.match(r"^(\d{4})[-/.](\d{2})[-/.](\d{2})", raw)
    if match:
        year, month, day = match.groups()
        return f"{year}.{month}.{day}"
    return _now_kst().strftime("%Y.%m.%d")


def _format_schedule_saved_short(saved_at: Optional[datetime] = None) -> str:
    dt = saved_at or _now_kst()
    return dt.strftime("'%y.%m.%d %H:%M")


def _build_schedule_card_name(start_date_time: str, saved_at: Optional[datetime] = None) -> str:
    period_date = _format_schedule_period_date(start_date_time)
    saved_short = _format_schedule_saved_short(saved_at)
    return f"{period_date} Schedule Flight ({saved_short})"


def _is_active_schedule_room(room: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(room, dict):
        return False
    flights_input = str(room.get("flightsInput") or "").strip()
    rows = room.get("rows") if isinstance(room.get("rows"), list) else []
    return bool(flights_input or rows)


def _schedule_slot_payload(
    slot: str,
    name: str,
    room: Dict[str, Any],
    saved_at: Optional[str] = None,
) -> Dict[str, Any]:
    saved = saved_at or _now_kst_iso()
    return {
        "slot": slot,
        "name": name,
        "room": room,
        "savedAt": saved,
    }


def _schedule_slot_from_supabase_row(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    slot = str(row.get("slot") or "")
    room = row.get("room")
    if slot not in SCHEDULE_SLOT_KEYS or not isinstance(room, dict):
        return None

    saved_at = str(row.get("saved_at") or row.get("updated_at") or "")
    name = str(row.get("name") or _build_schedule_card_name(str(room.get("startDateTime") or "")))
    return _schedule_slot_payload(
        slot,
        name,
        _apply_aircraft_registrations_to_room(room) or room,
        saved_at,
    )


def _empty_schedule_slots_payload() -> Dict[str, Optional[Dict[str, Any]]]:
    return {"active": None, "archive": None}


def _normalize_linked_slot(value: Any) -> str:
    linked = str(value or DEFAULT_LINKED_SLOT).strip().lower()
    return linked if linked in SCHEDULE_SLOT_KEYS else DEFAULT_LINKED_SLOT


def _read_schedule_slots_file_raw() -> Dict[str, Any]:
    try:
        if not SCHEDULE_SLOTS_FILE.exists():
            return {}
        data = json.loads(SCHEDULE_SLOTS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _read_linked_slot_from_file() -> str:
    data = _read_schedule_slots_file_raw()
    return _normalize_linked_slot(data.get("linkedSlot"))


def _write_linked_slot_to_file(linked_slot: str) -> None:
    linked = _normalize_linked_slot(linked_slot)
    data = _read_schedule_slots_file_raw()
    data["linkedSlot"] = linked
    SCHEDULE_SLOTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SCHEDULE_SLOTS_FILE.write_text(
        json.dumps(data, ensure_ascii=False),
        encoding="utf-8",
    )


def _read_linked_slot_from_supabase() -> Optional[str]:
    if not _supabase_usage_enabled():
        return None

    query = urllib.parse.urlencode(
        {
            "id": "eq.default",
            "select": "linked_slot,updated_at",
            "limit": "1",
        }
    )
    try:
        rows = _supabase_request("GET", f"/rest/v1/schedule_flight_config?{query}")
    except Exception:
        return None

    if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
        return None

    return _normalize_linked_slot(rows[0].get("linked_slot"))


def _write_linked_slot_to_supabase(linked_slot: str) -> None:
    if not _supabase_usage_enabled():
        return

    linked = _normalize_linked_slot(linked_slot)
    saved_at = _now_kst_iso()
    row = {
        "id": "default",
        "linked_slot": linked,
        "updated_at": saved_at,
    }
    try:
        _supabase_request(
            "POST",
            "/rest/v1/schedule_flight_config?on_conflict=id",
            row,
            {
                "Prefer": "resolution=merge-duplicates,return=representation",
            },
        )
    except Exception:
        return


def _read_linked_slot() -> str:
    supabase_linked = _read_linked_slot_from_supabase()
    if supabase_linked is not None:
        return supabase_linked
    return _read_linked_slot_from_file()


def _write_linked_slot(linked_slot: str) -> str:
    linked = _normalize_linked_slot(linked_slot)
    _write_linked_slot_to_file(linked)
    _write_linked_slot_to_supabase(linked)
    return linked


def _get_schedule_slot_entry(
    slots: Dict[str, Optional[Dict[str, Any]]],
    slot: str,
) -> Optional[Dict[str, Any]]:
    entry = slots.get(slot)
    return entry if isinstance(entry, dict) else None


def _sync_latest_schedule_from_linked_slot() -> Optional[Dict[str, Any]]:
    slots = _read_schedule_slots_without_migration()
    linked_slot = _read_linked_slot()
    entry = _get_schedule_slot_entry(slots, linked_slot)
    room = entry.get("room") if entry else None

    if _is_active_schedule_room(room):
        return _write_latest_schedule(room)

    fallback_order = [linked_slot] + [slot for slot in SCHEDULE_SLOT_KEYS if slot != linked_slot]
    for slot in fallback_order:
        fallback_entry = _get_schedule_slot_entry(slots, slot)
        fallback_room = fallback_entry.get("room") if fallback_entry else None
        if _is_active_schedule_room(fallback_room):
            _write_linked_slot(slot)
            return _write_latest_schedule(fallback_room)

    empty_room = {
        "id": str(int(_now_kst().timestamp() * 1000)),
        "name": "Schedule_Empty",
        "flightsInput": "",
        "startDateTime": _now_kst().replace(microsecond=0).isoformat(),
        "endDateTime": (_now_kst() + timedelta(hours=24)).replace(microsecond=0).isoformat(),
        "fixed": True,
        "lastFetchedAt": _now_kst_iso(),
        "rows": [],
    }
    return _write_latest_schedule(empty_room)


def _maybe_sync_latest_schedule_for_slot(slot: str, room: Dict[str, Any]) -> None:
    if _normalize_linked_slot(slot) == _read_linked_slot():
        _write_latest_schedule(room)


def _read_schedule_slots_from_file() -> Dict[str, Optional[Dict[str, Any]]]:
    try:
        if not SCHEDULE_SLOTS_FILE.exists():
            return _empty_schedule_slots_payload()

        data = json.loads(SCHEDULE_SLOTS_FILE.read_text(encoding="utf-8"))
        result = _empty_schedule_slots_payload()
        for slot in SCHEDULE_SLOT_KEYS:
            entry = data.get(slot)
            if not isinstance(entry, dict):
                continue
            room = entry.get("room")
            if not isinstance(room, dict):
                continue
            saved_at = str(entry.get("savedAt") or "")
            name = str(entry.get("name") or _build_schedule_card_name(str(room.get("startDateTime") or "")))
            result[slot] = _schedule_slot_payload(
                slot,
                name,
                _apply_aircraft_registrations_to_room(room) or room,
                saved_at,
            )
        return result
    except Exception:
        return _empty_schedule_slots_payload()


def _write_schedule_slots_to_file(slots: Dict[str, Optional[Dict[str, Any]]]) -> None:
    data = _read_schedule_slots_file_raw()
    payload: Dict[str, Any] = {
        "linkedSlot": _normalize_linked_slot(data.get("linkedSlot")),
    }
    for slot in SCHEDULE_SLOT_KEYS:
        entry = slots.get(slot)
        if not isinstance(entry, dict):
            continue
        payload[slot] = {
            "name": entry.get("name") or "",
            "room": entry.get("room") or {},
            "savedAt": entry.get("savedAt") or _now_kst_iso(),
        }

    SCHEDULE_SLOTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SCHEDULE_SLOTS_FILE.write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8",
    )


def _read_schedule_slots_from_supabase() -> Optional[Dict[str, Optional[Dict[str, Any]]]]:
    if not _supabase_usage_enabled():
        return None

    query = urllib.parse.urlencode(
        {
            "slot": f"in.({','.join(SCHEDULE_SLOT_KEYS)})",
            "select": "slot,name,room,saved_at,updated_at",
        }
    )

    try:
        rows = _supabase_request("GET", f"/rest/v1/schedule_flight_slots?{query}")
    except Exception:
        return None

    if not isinstance(rows, list):
        return None

    result = _empty_schedule_slots_payload()
    for row in rows:
        if not isinstance(row, dict):
            continue
        slot_payload = _schedule_slot_from_supabase_row(row)
        if slot_payload:
            result[str(slot_payload["slot"])] = slot_payload
    return result


def _write_schedule_slot_to_supabase(
    slot: str,
    name: str,
    room: Dict[str, Any],
    saved_at: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if slot not in SCHEDULE_SLOT_KEYS:
        return None
    if not _supabase_usage_enabled():
        return None

    room_with_registration = _apply_aircraft_registrations_to_room(room) or room
    saved = saved_at or _now_kst_iso()
    row = {
        "slot": slot,
        "name": name,
        "room": room_with_registration,
        "saved_at": saved,
        "updated_at": saved,
    }

    try:
        result = _supabase_request(
            "POST",
            "/rest/v1/schedule_flight_slots?on_conflict=slot",
            row,
            {
                "Prefer": "resolution=merge-duplicates,return=representation",
            },
        )
    except Exception:
        return None

    if isinstance(result, list) and result and isinstance(result[0], dict):
        return _schedule_slot_from_supabase_row(result[0])

    return _schedule_slot_payload(slot, name, room_with_registration, saved)


def _delete_schedule_slot_from_supabase(slot: str) -> None:
    if slot not in SCHEDULE_SLOT_KEYS or not _supabase_usage_enabled():
        return

    query = urllib.parse.urlencode({"slot": f"eq.{slot}"})
    try:
        _supabase_request("DELETE", f"/rest/v1/schedule_flight_slots?{query}")
    except Exception:
        return


def _read_schedule_slots_without_migration() -> Dict[str, Optional[Dict[str, Any]]]:
    supabase_payload = _read_schedule_slots_from_supabase()
    if supabase_payload is not None:
        return supabase_payload

    return _read_schedule_slots_from_file()


def _read_schedule_slots() -> Dict[str, Optional[Dict[str, Any]]]:
    supabase_payload = _read_schedule_slots_from_supabase()
    if supabase_payload is not None:
        if supabase_payload.get("active") or supabase_payload.get("archive"):
            return supabase_payload

        latest_payload = _read_latest_schedule_from_supabase() or _read_latest_schedule_from_file()
        latest_room = latest_payload.get("room") if latest_payload else None
        if _is_active_schedule_room(latest_room):
            saved_at = str((latest_payload or {}).get("savedAt") or _now_kst_iso())
            name = _build_schedule_card_name(str(latest_room.get("startDateTime") or ""))
            active_slot = _schedule_slot_payload("active", name, latest_room, saved_at)
            _write_schedule_slot_entry("active", active_slot)
            return {"active": active_slot, "archive": None}

        return supabase_payload

    file_payload = _read_schedule_slots_from_file()
    if file_payload.get("active") or file_payload.get("archive"):
        return file_payload

    latest_payload = _read_latest_schedule_from_file()
    latest_room = latest_payload.get("room") if latest_payload else None
    if _is_active_schedule_room(latest_room):
        saved_at = str((latest_payload or {}).get("savedAt") or _now_kst_iso())
        name = _build_schedule_card_name(str(latest_room.get("startDateTime") or ""))
        active_slot = _schedule_slot_payload("active", name, latest_room, saved_at)
        _write_schedule_slot_entry("active", active_slot)
        return {"active": active_slot, "archive": None}

    return _empty_schedule_slots_payload()


def _write_schedule_slot_entry(slot: str, entry: Optional[Dict[str, Any]]) -> None:
    slots = _read_schedule_slots_without_migration()
    slots[slot] = entry
    _write_schedule_slots_to_file(slots)
    if entry and isinstance(entry.get("room"), dict):
        _write_schedule_slot_to_supabase(
            slot,
            str(entry.get("name") or ""),
            entry["room"],
            str(entry.get("savedAt") or _now_kst_iso()),
        )
    else:
        _delete_schedule_slot_from_supabase(slot)


def _prepare_schedule_room_for_save(room: Dict[str, Any]) -> Dict[str, Any]:
    prepared = dict(room or {})
    if not prepared.get("fixed"):
        prepared["fixed"] = True
    if not prepared.get("id"):
        prepared["id"] = str(int(_now_kst().timestamp() * 1000))
    return _sanitize_latest_schedule_room(prepared)


def _save_schedule_slots_with_rotate(room: Dict[str, Any]) -> Dict[str, Any]:
    prepared = _prepare_schedule_room_for_save(room)
    saved_at = _now_kst_iso()
    saved_dt = _now_kst()
    name = _build_schedule_card_name(str(prepared.get("startDateTime") or ""), saved_dt)

    current = _read_schedule_slots()
    archive_entry = current.get("active") if _is_active_schedule_room((current.get("active") or {}).get("room")) else None

    active_entry = _schedule_slot_payload("active", name, prepared, saved_at)
    _write_schedule_slot_entry("active", active_entry)
    if archive_entry:
        _write_schedule_slot_entry("archive", archive_entry)
    else:
        _write_schedule_slot_entry("archive", None)

    if _read_linked_slot() == "active":
        latest_saved = _write_latest_schedule(prepared)
    else:
        latest_saved = _sync_latest_schedule_from_linked_slot() or {"savedAt": saved_at}
    return {
        "active": active_entry,
        "archive": archive_entry,
        "savedAt": latest_saved.get("savedAt") or saved_at,
    }


def _update_schedule_slot(slot: str, room: Dict[str, Any]) -> Dict[str, Any]:
    if slot not in SCHEDULE_SLOT_KEYS:
        raise HTTPException(status_code=400, detail="slot은 active 또는 archive만 가능합니다.")

    prepared = _prepare_schedule_room_for_save(room)
    saved_at = _now_kst_iso()
    current = _read_schedule_slots()
    existing = current.get(slot) or {}
    name = str(existing.get("name") or _build_schedule_card_name(str(prepared.get("startDateTime") or "")))
    entry = _schedule_slot_payload(slot, name, prepared, saved_at)
    _write_schedule_slot_entry(slot, entry)
    _maybe_sync_latest_schedule_for_slot(slot, prepared)

    return entry


def _clear_schedule_slot(slot: str) -> Dict[str, Optional[Dict[str, Any]]]:
    if slot not in SCHEDULE_SLOT_KEYS:
        raise HTTPException(status_code=400, detail="slot은 active 또는 archive만 가능합니다.")

    linked_before = _read_linked_slot()
    _write_schedule_slot_entry(slot, None)
    remaining = _read_schedule_slots_without_migration()

    if slot == "active":
        archive_entry = remaining.get("archive")
        if _is_active_schedule_room((archive_entry or {}).get("room")):
            promoted = dict(archive_entry)
            promoted["slot"] = "active"
            _write_schedule_slot_entry("active", promoted)
            _write_schedule_slot_entry("archive", None)
            remaining = _read_schedule_slots_without_migration()
        elif linked_before == "active":
            _write_latest_schedule(_empty_schedule_room())

    if slot == linked_before:
        fallback = "archive" if slot == "active" else "active"
        fallback_entry = remaining.get(fallback)
        if _is_active_schedule_room((fallback_entry or {}).get("room")):
            _write_linked_slot(fallback)
        else:
            _sync_latest_schedule_from_linked_slot()
    else:
        _sync_latest_schedule_from_linked_slot()

    return _read_schedule_slots_without_migration()


def _empty_schedule_room() -> Dict[str, Any]:
    return {
        "id": str(int(_now_kst().timestamp() * 1000)),
        "name": "Schedule_Empty",
        "flightsInput": "",
        "startDateTime": _now_kst().replace(microsecond=0).isoformat(),
        "endDateTime": (_now_kst() + timedelta(hours=24)).replace(microsecond=0).isoformat(),
        "fixed": True,
        "lastFetchedAt": _now_kst_iso(),
        "rows": [],
    }


def _clear_all_schedule_slots() -> Dict[str, Any]:
    empty_slots = _empty_schedule_slots_payload()
    _write_schedule_slots_to_file(empty_slots)

    for slot in SCHEDULE_SLOT_KEYS:
        _delete_schedule_slot_from_supabase(slot)

    _write_latest_schedule(_empty_schedule_room())

    return {
        "active": None,
        "archive": None,
        "linkedSlot": _read_linked_slot(),
    }


def _swap_schedule_slots() -> Dict[str, Optional[Dict[str, Any]]]:
    current = _read_schedule_slots()
    active_entry = current.get("active")
    archive_entry = current.get("archive")

    if not _is_active_schedule_room((archive_entry or {}).get("room")):
        raise HTTPException(status_code=400, detail="교체할 직전 보관 카드가 없습니다.")

    new_active = dict(archive_entry)
    new_active["slot"] = "active"
    new_active["savedAt"] = _now_kst_iso()

    new_archive = None
    if _is_active_schedule_room((active_entry or {}).get("room")):
        new_archive = dict(active_entry)
        new_archive["slot"] = "archive"
        new_archive["savedAt"] = _now_kst_iso()

    _write_schedule_slot_entry("active", new_active)
    _write_schedule_slot_entry("archive", new_archive)
    _sync_latest_schedule_from_linked_slot()
    return _read_schedule_slots()


def _link_schedule_slot(slot: str) -> Dict[str, Any]:
    if slot not in SCHEDULE_SLOT_KEYS:
        raise HTTPException(status_code=400, detail="slot은 active 또는 archive만 가능합니다.")

    slots = _read_schedule_slots_without_migration()
    entry = _get_schedule_slot_entry(slots, slot)
    if not _is_active_schedule_room((entry or {}).get("room")):
        raise HTTPException(status_code=400, detail="초기화면에 연동할 Schedule Flight 카드가 없습니다.")

    linked = _write_linked_slot(slot)
    saved = _sync_latest_schedule_from_linked_slot()
    return {
        "linkedSlot": linked,
        "savedAt": saved.get("savedAt") if saved else _now_kst_iso(),
    }


def _sanitize_latest_schedule_room(room: Dict[str, Any]) -> Dict[str, Any]:
    sanitized = dict(room or {})
    rows = sanitized.get("rows") if isinstance(sanitized.get("rows"), list) else []

    rows_by_flight: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue

        flight = _get_flight_key(row)
        if not flight:
            continue

        rows_by_flight[flight] = row

    requested_flights = _normalize_flights([str(sanitized.get("flightsInput") or "")])
    # flightsInput이 비어 있으면 rows로 편을 되살리지 않습니다 (편 삭제 유지).
    final_flights = (
        [flight for flight in requested_flights if flight in rows_by_flight]
        if requested_flights
        else []
    )
    final_rows = [rows_by_flight[flight] for flight in final_flights]

    sanitized["flightsInput"] = ", ".join(final_flights)
    sanitized["rows"] = final_rows
    sanitized["fixed"] = True

    return sanitized


def _filter_schedule_rows_to_flights_input(room: Dict[str, Any]) -> Dict[str, Any]:
    """flightsInput 밖의 orphan rows만 제거하고, 조회 결과가 없는 편명 자체는 유지한다."""
    next_room = dict(room or {})
    requested_flights = _normalize_flights([str(next_room.get("flightsInput") or "")])
    rows = next_room.get("rows") if isinstance(next_room.get("rows"), list) else []

    if not requested_flights:
        next_room["flightsInput"] = ""
        next_room["rows"] = []
        return next_room

    allowed = set(requested_flights)
    next_room["flightsInput"] = ", ".join(requested_flights)
    next_room["rows"] = [
        row
        for row in rows
        if isinstance(row, dict) and _get_flight_key(row) in allowed
    ]
    return next_room


def _reconcile_checked_room_with_latest_deletions(checked_room: Dict[str, Any]) -> Dict[str, Any]:
    """삭제 직후 진행 중이던 API 확인이 삭제된 편을 다시 쓰지 않도록 맞춘다."""
    room = dict(checked_room or {})
    latest = _read_latest_schedule()
    if not isinstance(latest, dict):
        return _filter_schedule_rows_to_flights_input(room)

    latest_flights = _normalize_flights([str(latest.get("flightsInput") or "")])
    checked_flights = _normalize_flights([str(room.get("flightsInput") or "")])
    latest_set = set(latest_flights)
    checked_set = set(checked_flights)

    # latest가 더 줄어든 경우(편 삭제) → 현재 저장된 flightsInput을 기준으로 자른다.
    if latest_set != checked_set and latest_set.issubset(checked_set):
        room["flightsInput"] = ", ".join(latest_flights)

    return _filter_schedule_rows_to_flights_input(room)
