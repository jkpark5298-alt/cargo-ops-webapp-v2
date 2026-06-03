from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import asyncio
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from pywebpush import WebPushException, webpush

from app.services.incheon_api import (
    IncheonApiQuotaExceededError,
    get_all_kj_flight_data,
    get_flight_data,
)

router = APIRouter()

LATEST_SCHEDULE_FILE = Path(
    os.getenv("LATEST_SCHEDULE_FILE", "/tmp/cargo_ops_latest_schedule.json")
)
PUSH_SUBSCRIPTIONS_FILE = Path(
    os.getenv("PUSH_SUBSCRIPTIONS_FILE", "/tmp/cargo_ops_push_subscriptions.json")
)
AUTO_PUSH_STATUS_FILE = Path(
    os.getenv("AUTO_PUSH_STATUS_FILE", "/tmp/cargo_ops_auto_push_status.json")
)
NOTIFICATION_HISTORY_FILE = Path(
    os.getenv("NOTIFICATION_HISTORY_FILE", "/tmp/cargo_ops_notification_history.json")
)
INCHEON_API_USAGE_FILE = Path(
    os.getenv("INCHEON_API_USAGE_FILE", "/tmp/cargo_ops_incheon_api_usage.json")
)
AIRCRAFT_REGISTRATION_FILE = Path(
    os.getenv("AIRCRAFT_REGISTRATION_FILE", "/tmp/cargo_ops_aircraft_registrations.json")
)
INCHEON_API_DEPARTURE_DAILY_LIMIT = int(os.getenv("INCHEON_API_DEPARTURE_DAILY_LIMIT", "100000"))
INCHEON_API_ARRIVAL_DAILY_LIMIT = int(os.getenv("INCHEON_API_ARRIVAL_DAILY_LIMIT", "100000"))
INCHEON_API_WARNING_RATE = float(os.getenv("INCHEON_API_WARNING_RATE", "90"))
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_SERVICE_KEY")
    or ""
)

AUTO_PUSH_DEFAULT_INTERVAL_MINUTES = int(os.getenv("AUTO_PUSH_INTERVAL_MINUTES", "30"))
FLIGHT_SEARCH_CACHE_TTL_SECONDS = int(os.getenv("FLIGHT_SEARCH_CACHE_TTL_SECONDS", "180"))
FLIGHT_SEARCH_CACHE_MAX_ITEMS = int(os.getenv("FLIGHT_SEARCH_CACHE_MAX_ITEMS", "60"))
AUTO_PUSH_STARTED = False

KST = timezone(timedelta(hours=9))
FLIGHT_SEARCH_CACHE: Dict[str, Dict[str, Any]] = {}


def _clone_jsonable(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


def _flight_search_cache_get(key: str) -> Optional[Dict[str, Any]]:
    if FLIGHT_SEARCH_CACHE_TTL_SECONDS <= 0:
        return None

    item = FLIGHT_SEARCH_CACHE.get(key)
    if not item:
        return None

    expires_at = float(item.get("expiresAt") or 0)
    if expires_at <= time.monotonic():
        FLIGHT_SEARCH_CACHE.pop(key, None)
        return None

    value = item.get("value")
    return _clone_jsonable(value) if isinstance(value, dict) else None


def _flight_search_cache_set(key: str, value: Dict[str, Any]) -> None:
    if FLIGHT_SEARCH_CACHE_TTL_SECONDS <= 0:
        return

    while len(FLIGHT_SEARCH_CACHE) >= FLIGHT_SEARCH_CACHE_MAX_ITEMS:
        oldest_key = next(iter(FLIGHT_SEARCH_CACHE), None)
        if oldest_key is None:
            break
        FLIGHT_SEARCH_CACHE.pop(oldest_key, None)

    FLIGHT_SEARCH_CACHE[key] = {
        "expiresAt": time.monotonic() + FLIGHT_SEARCH_CACHE_TTL_SECONDS,
        "value": _clone_jsonable(value),
    }



def _now_kst() -> datetime:
    return datetime.now(KST).replace(tzinfo=None)


def _now_kst_iso() -> str:
    return _now_kst().isoformat(timespec="seconds")


def _format_alert_time(value: Any) -> str:
    parsed = _parse_row_datetime(value)
    if parsed is not None:
        return f"'{str(parsed.year)[2:]}/{parsed.month:02d}/{parsed.day:02d} {parsed.hour:02d}:{parsed.minute:02d}"

    raw = _display_value(value)
    raw = raw.replace("T", " ").replace("Z", "").strip()

    match = re.match(r"^(\d{4})[-/.](\d{2})[-/.](\d{2})\s+(\d{2}):(\d{2})", raw)
    if match:
        year, month, day, hour, minute = match.groups()
        return f"'{year[2:]}/{month}/{day} {hour}:{minute}"

    return raw



def _format_history_checked_time(value: Any) -> str:
    parsed = _parse_kst_iso(value)
    if parsed is not None:
        return f"{parsed.month:02d}/{parsed.day:02d} {parsed.hour:02d}:{parsed.minute:02d}"

    raw = str(value or "").replace("T", " ").replace("Z", "").strip()
    match = re.search(r"(\d{2})[-/.](\d{2})\s+(\d{2}):(\d{2})", raw)
    if match:
        month, day, hour, minute = match.groups()
        return f"{month}/{day} {hour}:{minute}"

    return raw




def _format_schedule_short(value: Any) -> str:
    parsed = _parse_row_datetime(value)
    if parsed is not None:
        return f"{parsed.month:02d}/{parsed.day:02d} {parsed.hour:02d}:{parsed.minute:02d}"

    raw = _format_alert_time(value)
    match = re.search(r"'?(?:\d{2,4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}:\d{2})", raw)
    if match:
        month, day, time = match.groups()
        return f"{month.zfill(2)}/{day.zfill(2)} {time}"

    return raw


def _first_change_line(changes: List[str], label: str) -> str:
    for change in changes:
        if str(change).strip().startswith(label):
            return str(change).strip()
    return ""


def _format_status_time_line(item: Dict[str, Any]) -> str:
    estimated = str(item.get("estimatedTimeText") or "").strip()
    schedule = str(item.get("scheduleTimeText") or "").strip()

    if estimated and schedule:
        return f"시간 {estimated} · 예정 {schedule}"
    if estimated:
        return f"시간 {estimated}"
    if schedule:
        return f"예정 {schedule}"
    return ""


def _build_changed_item(flight: str, current: Dict[str, Any], changes: List[str]) -> Dict[str, Any]:
    schedule_value = _get_schedule_time_value(current)
    estimated_value = _get_estimated_time_value(current)

    return {
        "flight": flight,
        "route": _format_route(current),
        "changes": changes,
        "scheduleTime": schedule_value,
        "estimatedTime": estimated_value,
        "scheduleTimeText": _format_alert_time(schedule_value) if schedule_value else "",
        "scheduleTimeShort": _format_schedule_short(schedule_value) if schedule_value else "",
        "estimatedTimeText": _format_alert_time(estimated_value) if estimated_value else "",
        "estimatedTimeShort": _format_schedule_short(estimated_value) if estimated_value else "",
        "remark": current.get("remark") or current.get("status") or "",
        "gate": current.get("gatenumber") or "",
        "terminal": current.get("terminalid") or "",
    }


def _extract_clock_text(value: Any) -> str:
    text = str(value or "").replace("T", " ").replace("Z", "").strip()
    match = re.search(r"(\d{2}):(\d{2})", text)
    if match:
        hour, minute = match.groups()
        return f"{hour}:{minute}"
    return text


def _format_route_compact(route: Any) -> str:
    return str(route or "").replace(" ", "").replace("-", "→").replace(">", "→").upper().strip()


def _format_route_spaced(route: Any) -> str:
    compact = _format_route_compact(route)
    return compact.replace("→", " → ") if compact else ""


def _extract_time_change(change: Any) -> Optional[tuple[str, str]]:
    text = str(change or "").strip()
    if "운항시각" not in text and "시간" not in text and "예정" not in text:
        return None

    match = re.search(r"(?:운항시각|시간|예정)\s+(.+?)\s*(?:→|->|=>|←|<-|>)\s*(.+)$", text)
    if not match:
        return None

    before, after = match.groups()
    before = before.strip(" '")
    after = after.strip(" '")

    return before, after


def _format_push_body_from_change(change: Any) -> str:
    time_change = _extract_time_change(change)
    if time_change:
        before, after = time_change
        after_text = _format_alert_time(after)
        before_text = _extract_clock_text(before)
        return f"{after_text} ← {before_text}"

    text = str(change or "운항 정보 변경").strip()
    text = text.replace("->", "→").replace("=>", "→")
    return text


def _format_history_change_line(change: Any) -> str:
    time_change = _extract_time_change(change)
    if time_change:
        before, after = time_change
        return f"운항시각 {_extract_clock_text(before)} → {_extract_clock_text(after)}"

    text = str(change or "운항 정보 변경").strip()
    text = text.replace("신규 정보", "상태")
    text = re.sub(r"\s+", " ", text)
    return text


def _compact_change_label(change: Any) -> str:
    text = str(change or "").strip()
    if not text:
        return "운항 정보 변경"

    field = text.split(":", 1)[0].strip()
    normalized = field.replace(" ", "")

    if "운항시각" in normalized or "스케줄" in normalized or "시간" in normalized:
        return "운항시각 변경"
    if "도착" in normalized and "예정" in normalized:
        return "도착예정 변경"
    if "출발" in normalized and "예정" in normalized:
        return "출발예정 변경"
    if "게이트" in normalized:
        return "게이트 변경"
    if "터미널" in normalized:
        return "터미널 변경"
    if "remark" in normalized.lower() or "상태" in normalized or "운항상태" in normalized:
        return "상태 변경"
    if "도착" in normalized:
        return "도착 변경"
    if "출발" in normalized:
        return "출발 변경"

    return field or "운항 정보 변경"


def _build_compact_schedule_push(changed_items: List[Dict[str, Any]]) -> Dict[str, str]:
    first = changed_items[0] if changed_items else {}
    flight = str(first.get("flight") or "Schedule").strip()
    route = _format_route_compact(first.get("route") or "")
    changes = first.get("changes") if isinstance(first.get("changes"), list) else []
    first_change = changes[0] if changes else "운항 정보 변경"
    extra_count = max(0, len(changed_items) - 1)

    if extra_count > 0:
        title = f"{flight} 변경 {route}".strip()
        body = f"{_format_push_body_from_change(first_change)} 외 {extra_count}건"
    else:
        title = f"{flight} 변경 {route}".strip()
        body = _format_push_body_from_change(first_change)

    return {
        "title": title[:48],
        "body": body[:92],
        "url": "/",
    }


def _get_schedule_time_value(row: Dict[str, Any]) -> Any:
    return row.get("formattedScheduleTime") or row.get("scheduleDateTime")


def _get_estimated_time_value(row: Dict[str, Any]) -> Any:
    return row.get("formattedEstimatedTime") or row.get("estimatedDateTime")


def _get_alert_time_value(row: Dict[str, Any]) -> Any:
    return _get_estimated_time_value(row) or _get_schedule_time_value(row)


def _parse_kst_iso(value: Any) -> Optional[datetime]:
    if not value:
        return None

    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(KST).replace(tzinfo=None)
    except Exception:
        try:
            return datetime.fromisoformat(str(value)).replace(tzinfo=None)
        except Exception:
            return None


class PushSubscriptionRequest(BaseModel):
    subscription: Dict[str, Any]
    userAgent: Optional[str] = None
    deviceName: Optional[str] = None


class TestPushRequest(BaseModel):
    title: str = "KJ Cargo Ops 테스트 알림"
    body: str = "PWA 푸시 알림 수신 준비가 완료되었습니다."
    url: str = "/"


class AutoPushConfigRequest(BaseModel):
    enabled: bool
    intervalMinutes: int = AUTO_PUSH_DEFAULT_INTERVAL_MINUTES


class LatestScheduleRequest(BaseModel):
    room: Dict[str, Any]


class AircraftRegistrationRecord(BaseModel):
    date: str
    flight: str
    departureCode: str = ""
    arrivalCode: str = ""
    registrationNo: str
    updatedAt: Optional[str] = None


class AircraftRegistrationSaveRequest(BaseModel):
    records: List[AircraftRegistrationRecord] = Field(default_factory=list)
    mode: str = "merge"


class NotificationHistoryDeleteItemRequest(BaseModel):
    key: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    checkedAt: Optional[str] = None
    roomName: Optional[str] = None


class FlightQueryRequest(BaseModel):
    flights: List[str] = Field(default_factory=list)
    start: str
    end: str


class FlightRangeRequest(BaseModel):
    start: str
    end: str


class DailyReportTextSaveRequest(BaseModel):
    workDate: str
    status: str = "normal"
    author: str = ""
    note: str = ""
    savedAt: Optional[str] = None



def _normalize_daily_report_text_date(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return _now_kst().date().isoformat()

    match = re.match(r"^(\d{4})[-/.](\d{2})[-/.](\d{2})", raw)
    if match:
        year, month, day = match.groups()
        return f"{year}-{month}-{day}"

    digits = re.sub(r"\D", "", raw)
    if len(digits) >= 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"

    return raw


def _daily_report_text_to_supabase_row(report: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "work_date": _normalize_daily_report_text_date(report.get("workDate")),
        "status": str(report.get("status") or "normal"),
        "author": str(report.get("author") or ""),
        "note": str(report.get("note") or ""),
        "updated_at": _now_kst_iso(),
    }


def _daily_report_text_from_supabase_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "workDate": str(row.get("work_date") or ""),
        "status": str(row.get("status") or "normal"),
        "author": str(row.get("author") or ""),
        "note": str(row.get("note") or ""),
        "savedAt": str(row.get("updated_at") or row.get("created_at") or ""),
    }


def _save_daily_report_text_to_supabase(report: Dict[str, Any]) -> Dict[str, Any]:
    if not _supabase_usage_enabled():
        raise RuntimeError("Supabase storage is not configured.")

    row = _daily_report_text_to_supabase_row(report)
    result = _supabase_request(
        "POST",
        "/rest/v1/daily_report_texts?on_conflict=work_date",
        row,
        {
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
    )

    if isinstance(result, list) and result and isinstance(result[0], dict):
        return _daily_report_text_from_supabase_row(result[0])

    return _daily_report_text_from_supabase_row(row)


def _load_daily_report_text_from_supabase(work_date: str) -> Optional[Dict[str, Any]]:
    if not _supabase_usage_enabled():
        raise RuntimeError("Supabase storage is not configured.")

    query = urllib.parse.urlencode(
        {
            "work_date": f"eq.{_normalize_daily_report_text_date(work_date)}",
            "select": "work_date,status,author,note,created_at,updated_at",
            "limit": "1",
        }
    )

    rows = _supabase_request("GET", f"/rest/v1/daily_report_texts?{query}")

    if not isinstance(rows, list) or not rows:
        return None

    row = rows[0]
    return _daily_report_text_from_supabase_row(row) if isinstance(row, dict) else None



def _normalize_aircraft_registration_date(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""

    match = re.match(r"^(\d{4})[-/.](\d{2})[-/.](\d{2})", raw)
    if match:
        year, month, day = match.groups()
        return f"{year}-{month}-{day}"

    digits = re.sub(r"\D", "", raw)
    if len(digits) >= 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"

    return raw


def _normalize_aircraft_registration_no(value: Any) -> str:
    raw = str(value or "").strip().upper().replace(" ", "")
    if not raw:
        return ""

    if re.fullmatch(r"\d{3,5}", raw):
        return f"HL{raw}"

    if re.fullmatch(r"HL\d{3,5}", raw):
        return raw

    return raw


def _normalize_aircraft_flight(value: Any) -> str:
    raw = str(value or "").strip().upper().replace(" ", "")
    if re.fullmatch(r"\d{3,4}", raw):
        return f"KJ{raw}"
    return raw


def _aircraft_registration_key(
    date: Any,
    flight: Any,
    departure_code: Any = "",
    arrival_code: Any = "",
) -> str:
    return "|".join(
        [
            _normalize_aircraft_registration_date(date),
            _normalize_aircraft_flight(flight),
            str(departure_code or "").strip().upper(),
            str(arrival_code or "").strip().upper(),
        ]
    )


def _aircraft_registration_flight_date_key(date: Any, flight: Any) -> str:
    return "|".join(
        [
            _normalize_aircraft_registration_date(date),
            _normalize_aircraft_flight(flight),
        ]
    )


def _row_aircraft_date(row: Dict[str, Any]) -> str:
    return _normalize_aircraft_registration_date(
        row.get("scheduleDateTime")
        or row.get("formattedScheduleTime")
        or row.get("estimatedDateTime")
        or row.get("formattedEstimatedTime")
        or ""
    )


def _row_aircraft_flight(row: Dict[str, Any]) -> str:
    return _normalize_aircraft_flight(row.get("flightId") or row.get("flightNo") or "")


def _row_aircraft_registration(row: Dict[str, Any]) -> str:
    for key in ("hlnbr", "registrationNo", "aircraftRegNo", "fid"):
        value = _normalize_aircraft_registration_no(row.get(key))
        if re.fullmatch(r"HL\d{3,5}", value):
            return value
    return ""


def _normalize_aircraft_registration_record(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    date = _normalize_aircraft_registration_date(raw.get("date") or raw.get("운항일자") or raw.get("일자"))
    flight = _normalize_aircraft_flight(raw.get("flight") or raw.get("편명"))
    departure_code = str(raw.get("departureCode") or raw.get("출발코드") or raw.get("출발") or "").strip().upper()
    arrival_code = str(raw.get("arrivalCode") or raw.get("도착코드") or raw.get("도착") or "").strip().upper()
    registration_no = _normalize_aircraft_registration_no(
        raw.get("registrationNo") or raw.get("등록기호") or raw.get("HL") or raw.get("hlnbr")
    )

    if not date or not flight or not registration_no:
        return None

    return {
        "date": date,
        "flight": flight,
        "departureCode": departure_code,
        "arrivalCode": arrival_code,
        "registrationNo": registration_no,
        "updatedAt": str(raw.get("updatedAt") or _now_kst_iso()),
    }


def _read_aircraft_registrations() -> List[Dict[str, Any]]:
    try:
        if not AIRCRAFT_REGISTRATION_FILE.exists():
            return []

        data = json.loads(AIRCRAFT_REGISTRATION_FILE.read_text(encoding="utf-8"))
        records = data.get("records") if isinstance(data, dict) else data
        if not isinstance(records, list):
            return []

        normalized: List[Dict[str, Any]] = []
        for record in records:
            if isinstance(record, dict):
                parsed = _normalize_aircraft_registration_record(record)
                if parsed:
                    normalized.append(parsed)
        return normalized
    except Exception:
        return []


def _write_aircraft_registrations(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    normalized: List[Dict[str, Any]] = []
    seen: Dict[str, Dict[str, Any]] = {}

    for record in records:
        parsed = _normalize_aircraft_registration_record(record)
        if not parsed:
            continue
        seen[_aircraft_registration_key(
            parsed.get("date"),
            parsed.get("flight"),
            parsed.get("departureCode"),
            parsed.get("arrivalCode"),
        )] = parsed

    normalized = sorted(
        seen.values(),
        key=lambda item: (
            str(item.get("date") or ""),
            str(item.get("flight") or ""),
            str(item.get("departureCode") or ""),
            str(item.get("arrivalCode") or ""),
        ),
    )

    payload = {
        "records": normalized,
        "savedAt": _now_kst_iso(),
    }
    AIRCRAFT_REGISTRATION_FILE.parent.mkdir(parents=True, exist_ok=True)
    AIRCRAFT_REGISTRATION_FILE.write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8",
    )
    return payload


def _merge_aircraft_registrations(
    base_records: List[Dict[str, Any]],
    incoming_records: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    merged: Dict[str, Dict[str, Any]] = {}

    for record in base_records:
        parsed = _normalize_aircraft_registration_record(record)
        if parsed:
            merged[_aircraft_registration_key(
                parsed.get("date"),
                parsed.get("flight"),
                parsed.get("departureCode"),
                parsed.get("arrivalCode"),
            )] = parsed

    for record in incoming_records:
        parsed = _normalize_aircraft_registration_record(record)
        if parsed:
            merged[_aircraft_registration_key(
                parsed.get("date"),
                parsed.get("flight"),
                parsed.get("departureCode"),
                parsed.get("arrivalCode"),
            )] = parsed

    return list(merged.values())


def _build_aircraft_registration_lookup(records: Optional[List[Dict[str, Any]]] = None) -> Dict[str, str]:
    lookup: Dict[str, str] = {}
    for record in records if records is not None else _read_aircraft_registrations():
        parsed = _normalize_aircraft_registration_record(record)
        if not parsed:
            continue

        exact_key = _aircraft_registration_key(
            parsed.get("date"),
            parsed.get("flight"),
            parsed.get("departureCode"),
            parsed.get("arrivalCode"),
        )
        fallback_key = _aircraft_registration_flight_date_key(parsed.get("date"), parsed.get("flight"))

        lookup[exact_key] = str(parsed.get("registrationNo") or "")
        if fallback_key not in lookup:
            lookup[fallback_key] = str(parsed.get("registrationNo") or "")

    return lookup


def _apply_aircraft_registrations_to_rows(rows: List[Any]) -> List[Any]:
    lookup = _build_aircraft_registration_lookup()
    if not lookup:
        return rows

    next_rows: List[Any] = []
    for row in rows:
        if not isinstance(row, dict):
            next_rows.append(row)
            continue

        date = _row_aircraft_date(row)
        flight = _row_aircraft_flight(row)
        exact_key = _aircraft_registration_key(
            date,
            flight,
            row.get("departureCode") or "",
            row.get("arrivalCode") or "",
        )
        fallback_key = _aircraft_registration_flight_date_key(date, flight)
        registration_no = lookup.get(exact_key) or lookup.get(fallback_key) or _row_aircraft_registration(row)

        if registration_no:
            next_row = dict(row)
            next_row["hlnbr"] = registration_no
            next_row["registrationNo"] = registration_no
            next_row["aircraftRegNo"] = registration_no
            next_rows.append(next_row)
        else:
            next_rows.append(row)

    return next_rows


def _apply_aircraft_registrations_to_room(room: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(room, dict):
        return room

    next_room = dict(room)
    rows = next_room.get("rows")
    if isinstance(rows, list):
        next_room["rows"] = _apply_aircraft_registrations_to_rows(rows)
    return next_room


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
    final_flights = (
        [flight for flight in requested_flights if flight in rows_by_flight]
        if requested_flights
        else list(rows_by_flight.keys())
    )
    final_rows = [rows_by_flight[flight] for flight in final_flights]

    sanitized["flightsInput"] = ", ".join(final_flights)
    sanitized["rows"] = final_rows
    sanitized["fixed"] = True

    return sanitized


def _read_notification_history() -> List[Dict[str, Any]]:
    try:
        if not NOTIFICATION_HISTORY_FILE.exists():
            return []

        data = json.loads(NOTIFICATION_HISTORY_FILE.read_text(encoding="utf-8"))
        items = data.get("items")
        return items if isinstance(items, list) else []
    except Exception:
        return []


def _write_notification_history(items: List[Dict[str, Any]]) -> None:
    NOTIFICATION_HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    NOTIFICATION_HISTORY_FILE.write_text(
        json.dumps({"items": items[:100]}, ensure_ascii=False),
        encoding="utf-8",
    )


def _append_notification_history(
    changed_items: List[Dict[str, Any]],
    room: Optional[Dict[str, Any]] = None,
    source: str = "자동 알림",
) -> List[Dict[str, Any]]:
    if not changed_items:
        return _read_notification_history()

    checked_at = _now_kst_iso()
    new_items: List[Dict[str, Any]] = []

    for index, item in enumerate(changed_items[:20]):
        flight = str(item.get("flight") or "Schedule Flight")
        route = _format_route_spaced(item.get("route") or "")
        changes = item.get("changes") if isinstance(item.get("changes"), list) else []
        change_lines = [_format_history_change_line(change) for change in changes[:3]]
        change_lines = [line for line in change_lines if line]

        description_lines = []
        if route:
            description_lines.append(route)

        time_change_line = _first_change_line(change_lines, "운항시각")
        status_change_line = _first_change_line(change_lines, "상태")
        gate_change_line = _first_change_line(change_lines, "게이트")
        terminal_change_line = _first_change_line(change_lines, "터미널")

        if status_change_line:
            description_lines.append(status_change_line)
            status_time_line = _format_status_time_line(item)
            if status_time_line:
                description_lines.append(status_time_line)
        elif time_change_line:
            description_lines.append(time_change_line)
            schedule_short = str(item.get("scheduleTimeShort") or "").strip()
            if schedule_short:
                description_lines.append(f"스케줄 {schedule_short}")
        else:
            description_lines.extend(
                [line for line in [gate_change_line, terminal_change_line] if line]
                or change_lines
                or ["운항 정보 변경"]
            )

        description_lines.append(f"발생 {_format_history_checked_time(checked_at)} KST")

        new_items.append(
            {
                "key": f"server-{checked_at}-{index}-{flight}",
                "flight": flight,
                "route": route,
                "changes": changes,
                "title": f"{flight} 운항 정보 변경",
                "description": "\n".join(description_lines),
                "checkedAt": checked_at.replace("T", " "),
                "roomName": "서버 알림",
            }
        )

    existing = _read_notification_history()
    merged = new_items + existing
    seen: set[str] = set()
    deduped: List[Dict[str, Any]] = []

    for item in merged:
        dedupe_key = f"{item.get('title')}|{item.get('description')}|{item.get('checkedAt')}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        deduped.append(item)

    _write_notification_history(deduped)
    return deduped


def _read_push_subscriptions() -> List[Dict[str, Any]]:
    try:
        if not PUSH_SUBSCRIPTIONS_FILE.exists():
            return []

        data = json.loads(PUSH_SUBSCRIPTIONS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_push_subscriptions(items: List[Dict[str, Any]]) -> None:
    PUSH_SUBSCRIPTIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PUSH_SUBSCRIPTIONS_FILE.write_text(
        json.dumps(items, ensure_ascii=False),
        encoding="utf-8",
    )


def _read_auto_push_status() -> Dict[str, Any]:
    default_enabled = os.getenv("AUTO_PUSH_ENABLED", "true").lower() != "false"
    default_status: Dict[str, Any] = {
        "enabled": default_enabled,
        "intervalMinutes": AUTO_PUSH_DEFAULT_INTERVAL_MINUTES,
        "lastRunAt": "",
        "lastMessage": "Schedule Flight 기준 자동 변경 확인 대기 중",
        "lastResult": None,
    }

    try:
        if not AUTO_PUSH_STATUS_FILE.exists():
            return default_status

        data = json.loads(AUTO_PUSH_STATUS_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return default_status

        return {**default_status, **data}
    except Exception:
        return default_status


def _write_auto_push_status(status: Dict[str, Any]) -> Dict[str, Any]:
    AUTO_PUSH_STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    AUTO_PUSH_STATUS_FILE.write_text(
        json.dumps(status, ensure_ascii=False),
        encoding="utf-8",
    )
    return status


def _update_auto_push_status(**updates: Any) -> Dict[str, Any]:
    status = _read_auto_push_status()
    status.update(updates)
    return _write_auto_push_status(status)


def _usage_date_key() -> str:
    return _now_kst().date().isoformat()


def _supabase_usage_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def _supabase_headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _supabase_request(
    method: str,
    path: str,
    payload: Optional[Dict[str, Any]] = None,
    extra_headers: Optional[Dict[str, str]] = None,
) -> Any:
    if not _supabase_usage_enabled():
        raise RuntimeError("Supabase usage storage is not configured.")

    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    headers = _supabase_headers()
    if extra_headers:
        headers.update(extra_headers)

    request = urllib.request.Request(
        f"{SUPABASE_URL}{path}",
        data=body,
        headers=headers,
        method=method,
    )

    with urllib.request.urlopen(request, timeout=8) as response:
        raw = response.read().decode("utf-8")
        if not raw:
            return None
        return json.loads(raw)


def _read_incheon_api_usage_from_supabase(day_key: str) -> Optional[Dict[str, Any]]:
    if not _supabase_usage_enabled():
        return None

    query = urllib.parse.urlencode(
        {
            "usage_date": f"eq.{day_key}",
            "select": "usage_date,departure_count,arrival_count,last_called_at",
            "limit": "1",
        }
    )

    try:
        rows = _supabase_request(
            "GET",
            f"/rest/v1/incheon_api_usage_daily?{query}",
        )
    except Exception:
        return None

    if not isinstance(rows, list) or not rows:
        return _empty_incheon_api_usage(day_key)

    row = rows[0] if isinstance(rows[0], dict) else {}

    return {
        "date": str(row.get("usage_date") or day_key),
        "departure": int(row.get("departure_count") or 0),
        "arrival": int(row.get("arrival_count") or 0),
        "departureLimit": INCHEON_API_DEPARTURE_DAILY_LIMIT,
        "arrivalLimit": INCHEON_API_ARRIVAL_DAILY_LIMIT,
        "lastCalledAt": str(row.get("last_called_at") or ""),
    }


def _increment_incheon_api_usage_in_supabase(
    day_key: str,
    departure_delta: int,
    arrival_delta: int,
) -> Optional[Dict[str, Any]]:
    if not _supabase_usage_enabled():
        return None

    try:
        result = _supabase_request(
            "POST",
            "/rest/v1/rpc/increment_incheon_api_usage",
            {
                "p_usage_date": day_key,
                "p_departure_delta": departure_delta,
                "p_arrival_delta": arrival_delta,
            },
        )
    except Exception:
        return None

    if not isinstance(result, dict):
        return _read_incheon_api_usage_from_supabase(day_key)

    return {
        "date": str(result.get("date") or day_key),
        "departure": int(result.get("departure") or 0),
        "arrival": int(result.get("arrival") or 0),
        "departureLimit": INCHEON_API_DEPARTURE_DAILY_LIMIT,
        "arrivalLimit": INCHEON_API_ARRIVAL_DAILY_LIMIT,
        "lastCalledAt": str(result.get("lastCalledAt") or result.get("last_called_at") or ""),
    }


def _read_incheon_api_usage_all() -> Dict[str, Any]:
    try:
        if not INCHEON_API_USAGE_FILE.exists():
            return {}

        data = json.loads(INCHEON_API_USAGE_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_incheon_api_usage_all(data: Dict[str, Any]) -> None:
    INCHEON_API_USAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
    INCHEON_API_USAGE_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _empty_incheon_api_usage(day_key: Optional[str] = None) -> Dict[str, Any]:
    return {
        "date": day_key or _usage_date_key(),
        "departure": 0,
        "arrival": 0,
        "departureLimit": INCHEON_API_DEPARTURE_DAILY_LIMIT,
        "arrivalLimit": INCHEON_API_ARRIVAL_DAILY_LIMIT,
        "total": 0,
        "totalLimit": max(INCHEON_API_DEPARTURE_DAILY_LIMIT, INCHEON_API_ARRIVAL_DAILY_LIMIT),
        "departureRate": 0,
        "arrivalRate": 0,
        "totalRate": 0,
        "warning": False,
        "lastCalledAt": "",
    }


def _build_incheon_api_usage_response(usage: Dict[str, Any]) -> Dict[str, Any]:
    departure = int(usage.get("departure") or 0)
    arrival = int(usage.get("arrival") or 0)
    departure_limit = int(usage.get("departureLimit") or INCHEON_API_DEPARTURE_DAILY_LIMIT)
    arrival_limit = int(usage.get("arrivalLimit") or INCHEON_API_ARRIVAL_DAILY_LIMIT)
    total = departure + arrival
    total_limit = max(departure_limit, arrival_limit)
    departure_rate = round((departure / departure_limit) * 100, 2) if departure_limit > 0 else 0
    arrival_rate = round((arrival / arrival_limit) * 100, 2) if arrival_limit > 0 else 0
    total_rate = round((total / total_limit) * 100, 2) if total_limit > 0 else 0

    return {
        "date": str(usage.get("date") or _usage_date_key()),
        "departure": departure,
        "arrival": arrival,
        "total": total,
        "departureLimit": departure_limit,
        "arrivalLimit": arrival_limit,
        "totalLimit": total_limit,
        "departureRate": departure_rate,
        "arrivalRate": arrival_rate,
        "totalRate": total_rate,
        "warning": total_rate >= INCHEON_API_WARNING_RATE or departure_rate >= INCHEON_API_WARNING_RATE or arrival_rate >= INCHEON_API_WARNING_RATE,
        "warningRate": INCHEON_API_WARNING_RATE,
        "lastCalledAt": str(usage.get("lastCalledAt") or ""),
    }


def _get_today_incheon_api_usage() -> Dict[str, Any]:
    day_key = _usage_date_key()

    supabase_usage = _read_incheon_api_usage_from_supabase(day_key)
    if supabase_usage is not None:
        return _build_incheon_api_usage_response(supabase_usage)

    data = _read_incheon_api_usage_all()
    raw_usage = data.get(day_key)
    usage = raw_usage if isinstance(raw_usage, dict) else _empty_incheon_api_usage(day_key)
    usage["date"] = day_key
    usage["departureLimit"] = INCHEON_API_DEPARTURE_DAILY_LIMIT
    usage["arrivalLimit"] = INCHEON_API_ARRIVAL_DAILY_LIMIT
    return _build_incheon_api_usage_response(usage)


def _record_incheon_api_usage_for_rows(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    departure_count = 0
    arrival_count = 0

    for row in rows:
        if not isinstance(row, dict):
            continue

        if _is_departure_row(row):
            departure_count += 1
        elif _is_arrival_row(row):
            arrival_count += 1

    if departure_count == 0 and arrival_count == 0:
        return _get_today_incheon_api_usage()

    day_key = _usage_date_key()
    supabase_usage = _increment_incheon_api_usage_in_supabase(
        day_key,
        departure_count,
        arrival_count,
    )
    if supabase_usage is not None:
        return _build_incheon_api_usage_response(supabase_usage)

    data = _read_incheon_api_usage_all()
    raw_usage = data.get(day_key)
    usage = raw_usage if isinstance(raw_usage, dict) else _empty_incheon_api_usage(day_key)

    usage["date"] = day_key
    usage["departure"] = int(usage.get("departure") or 0) + departure_count
    usage["arrival"] = int(usage.get("arrival") or 0) + arrival_count
    usage["departureLimit"] = INCHEON_API_DEPARTURE_DAILY_LIMIT
    usage["arrivalLimit"] = INCHEON_API_ARRIVAL_DAILY_LIMIT
    usage["lastCalledAt"] = _now_kst_iso()

    data[day_key] = usage
    _write_incheon_api_usage_all(data)

    return _build_incheon_api_usage_response(usage)


def _normalize_flight_code(value: str) -> str:
    code = (value or "").strip().upper()
    if not code:
        return ""

    if code.isdigit() and len(code) in {3, 4}:
        return f"KJ{code}"

    return code


def _normalize_flights(values: List[str]) -> List[str]:
    normalized: List[str] = []
    seen = set()

    for value in values:
        for part in str(value).replace("\n", ",").replace(" ", ",").split(","):
            code = _normalize_flight_code(part)
            if not code:
                continue
            if code in seen:
                continue
            seen.add(code)
            normalized.append(code)

    return normalized


def _extract_date(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""

    if "T" in raw:
        return raw.split("T")[0]

    if " " in raw:
        return raw.split(" ")[0]

    return raw


def _parse_request_datetime(value: str) -> Optional[datetime]:
    raw = (value or "").strip()
    if not raw:
        return None

    candidates = [
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
    ]

    for fmt in candidates:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue

    return None


def _parse_row_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None

    raw = str(value).strip()
    if not raw or raw == "-":
        return None

    raw = raw.replace(".", "-").replace("/", "-").replace("T", " ")

    candidates = [
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
    ]

    for fmt in candidates:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue

    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) == 12:
        try:
            return datetime.strptime(digits, "%Y%m%d%H%M")
        except ValueError:
            return None

    return None


def _get_row_datetime(row: Dict[str, Any]) -> Optional[datetime]:
    candidates = [
        row.get("formattedEstimatedTime"),
        row.get("formattedScheduleTime"),
        row.get("estimatedDateTime"),
        row.get("scheduleDateTime"),
    ]

    for candidate in candidates:
        parsed = _parse_row_datetime(candidate)
        if parsed is not None:
            return parsed

    return None


def _row_matches_time_range(
    row: Dict[str, Any],
    start_dt: Optional[datetime],
    end_dt: Optional[datetime],
) -> bool:
    if start_dt is None and end_dt is None:
        return True

    row_dt = _get_row_datetime(row)

    if row_dt is None:
        return True

    if start_dt is not None and row_dt < start_dt:
        return False

    if end_dt is not None and row_dt > end_dt:
        return False

    return True


def _get_row_sort_key(row: Dict[str, Any]):
    dt = _get_row_datetime(row)
    flight = str(row.get("flightId") or row.get("flightNo") or "")
    if dt is None:
        return (1, datetime.max, flight)
    return (0, dt, flight)


def _validate_range(start: str, end: str):
    start_dt = _parse_request_datetime(start)
    end_dt = _parse_request_datetime(end)

    if start_dt is None or end_dt is None:
        raise HTTPException(status_code=400, detail="시작일시 또는 종료일시 형식이 올바르지 않습니다.")

    if start_dt > end_dt:
        raise HTTPException(status_code=400, detail="시작일시는 종료일시보다 늦을 수 없습니다.")

    start_date = _extract_date(start)
    end_date = _extract_date(end)

    if not start_date or not end_date:
        raise HTTPException(status_code=400, detail="시작일 또는 종료일이 필요합니다.")

    return start_dt, end_dt, start_date, end_date


def _get_flight_key(row: Dict[str, Any]) -> str:
    return str(row.get("flightId") or row.get("flightNo") or "").strip().upper()


def _get_status_text(row: Dict[str, Any]) -> str:
    values = [
        row.get("remark"),
        row.get("status"),
    ]
    return " ".join(str(value or "").strip().upper() for value in values)


def _get_refresh_exclude_reason(row: Dict[str, Any]) -> str:
    remark_text = str(row.get("remark") or "").strip().upper()

    if row.get("canceled") or "결항" in remark_text or "CANCEL" in remark_text:
        return "결항 확정"

    if "도착" in remark_text or "ARRIVED" in remark_text:
        return "도착 확정"

    return ""


def _is_refresh_excluded(row: Dict[str, Any]) -> bool:
    return bool(_get_refresh_exclude_reason(row))


def _latest_rows_by_flight(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    latest: Dict[str, Dict[str, Any]] = {}

    for row in rows:
        flight = _get_flight_key(row)
        if not flight:
            continue

        current = latest.get(flight)
        if current is None:
            latest[flight] = row
            continue

        current_dt = _get_row_datetime(current)
        next_dt = _get_row_datetime(row)

        if current_dt is None and next_dt is not None:
            latest[flight] = row
        elif current_dt is not None and next_dt is not None and next_dt >= current_dt:
            latest[flight] = row

    return latest


def _display_value(value: Any) -> str:
    raw = str(value or "").strip()
    return raw if raw else "-"


def _normalize_alert_value(value: Any) -> str:
    return _display_value(value).strip()


def _row_operational_status(row: Optional[Dict[str, Any]]) -> str:
    if not row:
        return "-"

    pieces = [
        row.get("status"),
        row.get("remark"),
        row.get("flightStatus"),
        row.get("remarkStatus"),
    ]

    text = " ".join(str(piece or "") for piece in pieces).strip().upper()

    if row.get("canceled") or "CANCEL" in text or "결항" in text:
        return "결항"
    if "RETURN" in text or "회항" in text:
        return "회항"
    if "ARRIV" in text or "도착" in text:
        if "DELAY" in text or "지연" in text or row.get("delay"):
            return "도착(지연)"
        return "도착"
    if "DEPART" in text or "출발" in text:
        if "DELAY" in text or "지연" in text or row.get("delay"):
            return "출발(지연)"
        return "출발"
    if "LAND" in text or "착륙" in text:
        return "착륙"
    if "DELAY" in text or "지연" in text or row.get("delay"):
        return "지연"

    return _display_value(row.get("remark") or row.get("status"))


def _row_alert_time(row: Optional[Dict[str, Any]]) -> str:
    if not row:
        return "-"

    return _display_value(
        row.get("formattedEstimatedTime")
        or row.get("estimatedDateTime")
        or row.get("formattedScheduleTime")
        or row.get("scheduleDateTime")
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

    now = datetime.now()
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


def _format_route(row: Dict[str, Any]) -> str:
    departure = _display_value(row.get("departureCode"))
    arrival = _display_value(row.get("arrivalCode"))
    return f"{departure}→{arrival}"


def _merge_latest_rows(
    existing_rows: List[Dict[str, Any]],
    updated_rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    merged_by_flight = _latest_rows_by_flight(existing_rows)

    for row in updated_rows:
        flight = _get_flight_key(row)
        if flight:
            merged_by_flight[flight] = row

    merged = list(merged_by_flight.values())
    merged.sort(key=_get_row_sort_key)
    return merged


def _get_vapid_settings() -> tuple[str, str, str]:
    public_key = os.getenv("WEB_PUSH_PUBLIC_KEY", "").strip()
    private_key = os.getenv("WEB_PUSH_PRIVATE_KEY", "").strip()
    subject = os.getenv("WEB_PUSH_SUBJECT", "mailto:admin@example.com").strip()

    if not public_key or not private_key:
        raise HTTPException(
            status_code=400,
            detail="WEB_PUSH_PUBLIC_KEY 또는 WEB_PUSH_PRIVATE_KEY 환경변수가 없습니다.",
        )

    return public_key, private_key, subject


def _send_web_push(subscription: Dict[str, Any], payload: Dict[str, Any]) -> None:
    _, private_key, subject = _get_vapid_settings()

    webpush(
        subscription_info=subscription,
        data=json.dumps(payload, ensure_ascii=False),
        vapid_private_key=private_key,
        vapid_claims={"sub": subject},
    )


@router.get("/push-public-key")
async def get_push_public_key() -> Dict[str, Any]:
    public_key = os.getenv("WEB_PUSH_PUBLIC_KEY", "").strip()
    return {
        "success": True,
        "configured": bool(public_key),
        "publicKey": public_key,
    }


@router.post("/push-subscriptions")
async def save_push_subscription(payload: PushSubscriptionRequest) -> Dict[str, Any]:
    subscription = dict(payload.subscription or {})
    endpoint = str(subscription.get("endpoint") or "")

    if not endpoint:
        raise HTTPException(status_code=400, detail="Push subscription endpoint가 없습니다.")

    items = _read_push_subscriptions()
    next_item = {
        "subscription": subscription,
        "userAgent": payload.userAgent or "",
        "deviceName": payload.deviceName or "",
        "savedAt": _now_kst_iso(),
    }

    filtered = [
        item
        for item in items
        if str((item.get("subscription") or {}).get("endpoint") or "") != endpoint
    ]

    filtered.insert(0, next_item)
    _write_push_subscriptions(filtered[:20])

    return {
        "success": True,
        "count": len(filtered[:20]),
    }


@router.get("/push-subscriptions/count")
async def get_push_subscription_count() -> Dict[str, Any]:
    return {
        "success": True,
        "count": len(_read_push_subscriptions()),
    }


@router.post("/push-test")
async def send_test_push(payload: TestPushRequest) -> Dict[str, Any]:
    items = _read_push_subscriptions()

    if not items:
        raise HTTPException(status_code=400, detail="저장된 Push 구독 정보가 없습니다.")

    message = {
        "title": payload.title,
        "body": payload.body,
        "url": payload.url,
    }

    sent = 0
    failed = 0
    errors: List[str] = []

    for item in items:
        subscription = item.get("subscription") or {}

        try:
            _send_web_push(subscription, message)
            sent += 1
        except WebPushException as exc:
            failed += 1
            errors.append(str(exc))
        except Exception as exc:
            failed += 1
            errors.append(str(exc))

    return {
        "success": sent > 0,
        "sent": sent,
        "failed": failed,
        "errors": errors[:3],
    }


async def _run_schedule_change_check(push_on_change: bool = True) -> Dict[str, Any]:
    room = _read_latest_schedule()

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
                if _row_matches_time_range(row, start_dt, end_dt)
            ]

            _record_incheon_api_usage_for_rows(filtered_rows)
            fresh_rows.extend(filtered_rows)

    except IncheonApiQuotaExceededError:
        raise HTTPException(status_code=429, detail="한도 초과로 조회 불가")

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
    room["rows"] = merged_rows
    room["lastFetchedAt"] = _now_kst_iso()
    _write_latest_schedule(room)

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


def _is_departure_row(row: Dict[str, Any]) -> bool:
    return str(row.get("departureCode") or "").strip().upper() == "ICN"


def _is_arrival_row(row: Dict[str, Any]) -> bool:
    return str(row.get("arrivalCode") or "").strip().upper() == "ICN"


def _is_row_in_focus_window(row: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    target_dt = _get_row_datetime(row)
    if target_dt is None:
        return False

    now = now or datetime.now()

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
    now = datetime.now()

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


@router.on_event("startup")
async def start_auto_push_worker() -> None:
    global AUTO_PUSH_STARTED

    if AUTO_PUSH_STARTED:
        return

    AUTO_PUSH_STARTED = True
    asyncio.create_task(_auto_push_loop())


@router.post("/check-schedule")
async def check_schedule() -> Dict[str, Any]:
    return await _run_schedule_change_check(push_on_change=False)


@router.post("/check-schedule-and-push")
async def check_schedule_and_push() -> Dict[str, Any]:
    return await _run_schedule_change_check(push_on_change=True)


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
    due = enabled and (
        elapsed_seconds is None
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



@router.get("/incheon-api-usage")
async def get_incheon_api_usage() -> Dict[str, Any]:
    usage = _get_today_incheon_api_usage()
    return {
        "success": True,
        **usage,
    }


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    tick = await _run_auto_push_tick_if_due("health")
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
        "mode": "focus" if interval == 5 else "normal",
        "lastRunAt": status.get("lastRunAt") or "",
        "lastMessage": status.get("lastMessage") or "",
        "scheduleFlightCount": len(requested_flights),
        "rowCount": len(rows),
        "tick": tick,
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
        "mode": "focus" if interval == 5 else "normal",
    }


@router.post("/auto-push/config")
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



@router.post("/latest-schedule/check-push-and-save")
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
        message = _build_compact_schedule_push(changed_items)

        for item in _read_push_subscriptions():
            subscription = item.get("subscription") or {}

            try:
                _send_web_push(subscription, message)
                sent += 1
            except WebPushException as exc:
                failed += 1
                errors.append(str(exc))
            except Exception as exc:
                failed += 1
                errors.append(str(exc))

    if changed_items:
        _append_notification_history(changed_items, current_room, "Schedule Lite 저장 알림")

    saved = _write_latest_schedule(_sanitize_latest_schedule_room(current_room))
    if prealert_keys_to_save:
        _append_arrival_prealert_keys(prealert_keys_to_save)

    _update_auto_push_status(
        enabled=True,
        intervalMinutes=_get_auto_interval_minutes_for_room(current_room),
        lastRunAt=_now_kst_iso(),
        lastMessage=(
            f"Schedule Lite 결과 저장 및 알림 확인 완료: 변경 {len(changed_items)}건, 푸시 {sent}건"
            if changed_items
            else "Schedule Lite 결과 저장 완료: 변경 없음"
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


@router.get("/notification-history")
async def get_notification_history() -> Dict[str, Any]:
    return {
        "success": True,
        "items": _read_notification_history()[:50],
    }



@router.delete("/notification-history")
async def clear_notification_history() -> Dict[str, Any]:
    previous_items = _read_notification_history()
    _write_notification_history([])
    return {
        "success": True,
        "cleared": len(previous_items),
        "items": [],
    }


@router.post("/notification-history/clear")
async def clear_notification_history_post() -> Dict[str, Any]:
    return await clear_notification_history()



@router.post("/notification-history/delete-item")
async def delete_notification_history_item(payload: NotificationHistoryDeleteItemRequest) -> Dict[str, Any]:
    items = _read_notification_history()

    def _same_item(item: Dict[str, Any]) -> bool:
        if payload.key and str(item.get("key") or "") == payload.key:
            return True

        return (
            str(item.get("title") or "") == str(payload.title or "")
            and str(item.get("description") or "") == str(payload.description or "")
            and str(item.get("checkedAt") or "") == str(payload.checkedAt or "")
            and str(item.get("roomName") or "") == str(payload.roomName or "")
        )

    next_items = [item for item in items if not _same_item(item)]
    deleted = len(items) - len(next_items)
    _write_notification_history(next_items)

    return {
        "success": True,
        "deleted": deleted,
        "items": next_items[:50],
    }



@router.get("/daily-report-text")
async def get_daily_report_text(workDate: str) -> Dict[str, Any]:
    work_date = _normalize_daily_report_text_date(workDate)

    try:
        report = _load_daily_report_text_from_supabase(work_date)
    except Exception as exc:
        return {
            "success": False,
            "configured": _supabase_usage_enabled(),
            "message": str(exc),
            "report": None,
        }

    return {
        "success": True,
        "configured": _supabase_usage_enabled(),
        "report": report,
    }


@router.post("/daily-report-text")
async def save_daily_report_text(payload: DailyReportTextSaveRequest) -> Dict[str, Any]:
    report = {
        "workDate": _normalize_daily_report_text_date(payload.workDate),
        "status": str(payload.status or "normal"),
        "author": str(payload.author or ""),
        "note": str(payload.note or ""),
        "savedAt": payload.savedAt or _now_kst_iso(),
    }

    try:
        saved_report = _save_daily_report_text_to_supabase(report)
    except Exception as exc:
        return {
            "success": False,
            "configured": _supabase_usage_enabled(),
            "message": str(exc),
            "report": None,
        }

    return {
        "success": True,
        "configured": _supabase_usage_enabled(),
        "report": saved_report,
        "savedAt": saved_report.get("savedAt") or _now_kst_iso(),
    }



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
    latest_room = _read_latest_schedule()
    if latest_room:
        _write_latest_schedule(latest_room)

    records = saved["records"]
    return {
        "success": True,
        "records": records,
        "count": len(records),
        "savedAt": saved["savedAt"],
    }


@router.get("/latest-schedule")
async def get_latest_schedule() -> Dict[str, Any]:
    supabase_payload = _read_latest_schedule_from_supabase()
    file_payload = None if supabase_payload else _read_latest_schedule_from_file()
    payload = supabase_payload or file_payload
    return {
        "success": True,
        "room": payload.get("room") if payload else None,
        "savedAt": payload.get("savedAt") if payload else "",
        "source": "supabase" if supabase_payload else "file" if file_payload else "",
    }


@router.post("/latest-schedule")
async def save_latest_schedule(payload: LatestScheduleRequest) -> Dict[str, Any]:
    room = dict(payload.room or {})

    if not room.get("fixed"):
        room["fixed"] = True

    if not room.get("id"):
        room["id"] = str(int(_now_kst().timestamp() * 1000))

    if not room.get("name"):
        room["name"] = "Schedule_Synced"

    room = _sanitize_latest_schedule_room(room)

    saved = _write_latest_schedule(room)
    _update_auto_push_status(
        enabled=True,
        intervalMinutes=_get_auto_interval_minutes_for_room(room),
        lastMessage="Schedule Flight 저장 완료. 자동 변경 확인이 자동 적용됩니다.",
    )
    return {
        "success": True,
        "room": saved["room"],
        "savedAt": saved["savedAt"],
    }


@router.post("/kj-all")
async def search_all_kj_flights(payload: FlightRangeRequest) -> Dict[str, Any]:
    start_dt, end_dt, start_date, end_date = _validate_range(payload.start, payload.end)
    cache_key = f"kj-all|{payload.start}|{payload.end}|{start_date}|{end_date}"
    cached = _flight_search_cache_get(cache_key)
    if cached:
        cached["cached"] = True
        cached["source"] = "memory-cache"
        return cached

    try:
        rows = await get_all_kj_flight_data(
            start_date=start_date,
            end_date=end_date,
        )

        filtered_rows = [
            row
            for row in rows
            if _row_matches_time_range(row, start_dt, end_dt)
        ]

        _record_incheon_api_usage_for_rows(filtered_rows)

    except IncheonApiQuotaExceededError:
        raise HTTPException(status_code=429, detail="한도 초과로 조회 불가")

    filtered_rows.sort(key=_get_row_sort_key)

    queried_flights = sorted(
        {
            str(row.get("flightId") or row.get("flightNo") or "").upper()
            for row in filtered_rows
            if str(row.get("flightId") or row.get("flightNo") or "").upper().startswith("KJ")
        }
    )

    result = {
        "success": True,
        "data": filtered_rows,
        "count": len(filtered_rows),
        "queriedFlights": queried_flights,
        "start": payload.start,
        "end": payload.end,
        "cached": False,
        "source": "incheon-api",
    }
    _flight_search_cache_set(cache_key, result)
    return result


@router.post("/")
async def search_flights(payload: FlightQueryRequest) -> Dict[str, Any]:
    normalized_flights = _normalize_flights(payload.flights)

    if not normalized_flights:
        raise HTTPException(status_code=400, detail="조회할 편명이 없습니다.")

    start_dt, end_dt, start_date, end_date = _validate_range(payload.start, payload.end)
    cache_key = f"manual|{','.join(normalized_flights)}|{payload.start}|{payload.end}|{start_date}|{end_date}"
    cached = _flight_search_cache_get(cache_key)
    if cached:
        cached["cached"] = True
        cached["source"] = "memory-cache"
        return cached

    all_rows: List[Dict[str, Any]] = []

    try:
        rows_by_flight = await asyncio.gather(
            *[
                get_flight_data(
                    flight_no=flight_no,
                    start_date=start_date,
                    end_date=end_date,
                )
                for flight_no in normalized_flights
            ]
        )

        for rows in rows_by_flight:
            filtered_rows = [
                row
                for row in rows
                if _row_matches_time_range(row, start_dt, end_dt)
            ]

            _record_incheon_api_usage_for_rows(filtered_rows)
            all_rows.extend(filtered_rows)

    except IncheonApiQuotaExceededError:
        raise HTTPException(status_code=429, detail="한도 초과로 조회 불가")

    all_rows.sort(key=_get_row_sort_key)

    result = {
        "success": True,
        "data": all_rows,
        "count": len(all_rows),
        "queriedFlights": normalized_flights,
        "start": payload.start,
        "end": payload.end,
        "cached": False,
        "source": "incheon-api",
    }
    _flight_search_cache_set(cache_key, result)
    return result
