"""항공기 등록기호 기록 정규화·저장·행 적용"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import json
import re
import time
import urllib.parse

from app.services.flight_common import (
    AIRCRAFT_REGISTRATION_FILE,
    KST,
    _now_kst_iso,
    _supabase_request,
    _supabase_usage_enabled,
)
def _normalize_aircraft_registration_date(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""

    match = re.match(r"^(\d{4})[-/.\s]+(\d{1,2})[-/.\s]+(\d{1,2})", raw)
    if match:
        year, month, day = match.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"

    digits = re.sub(r"\D", "", raw)
    if len(digits) >= 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"

    return raw


def _normalize_aircraft_registration_no(value: Any) -> str:
    raw = str(value or "").strip().upper().replace(" ", "")
    if not raw:
        return ""
    
    raw = re.sub(r"[^A-Z0-9]", "", raw)

    if re.fullmatch(r"\d{3,5}", raw):
        return f"HL{raw}"

    return raw


def _normalize_aircraft_flight(value: Any) -> str:
    raw = str(value or "").strip().upper().replace(" ", "")
    if not raw:
        return ""

    raw = re.sub(r"[^A-Z0-9]", "", raw)

    match = re.match(r"^([A-Z]{2,3})?0*([1-9]\d*)$", raw)
    if match:
        prefix = match.group(1) or "KJ"
        num = match.group(2)
        return f"{prefix}{num}"

    all_zeros = re.match(r"^([A-Z]{2,3})?0+$", raw)
    if all_zeros:
        prefix = all_zeros.group(1) or "KJ"
        return f"{prefix}0"

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
    
    departure_code = str(
        raw.get("departureCode")
        or raw.get("출발지코드")
        or raw.get("출발코드")
        or raw.get("출발지")
        or raw.get("출발")
        or ""
    ).strip().upper()
    
    arrival_code = str(
        raw.get("arrivalCode")
        or raw.get("도착지코드")
        or raw.get("도착코드")
        or raw.get("도착지")
        or raw.get("도착")
        or ""
    ).strip().upper()
    
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
        "updatedAt": _normalize_updated_at(raw.get("updatedAt")),
    }


def _normalize_updated_at(value: Any) -> str:
    """저장 시각을 UTC ISO(밀리초, Z)로 통일한다. 형식이 섞이면 문자열 비교가 틀어지므로(+09:00 vs Z) 항상 같은 형식으로 저장·응답한다."""
    parsed = _parse_updated_at(value)
    if parsed is None:
        parsed = datetime.now(timezone.utc)
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{parsed.microsecond // 1000:03d}Z"


def _parse_updated_at(value: Any) -> Optional[datetime]:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=KST)
    return parsed


def _registration_key(record: Dict[str, Any]) -> str:
    return _aircraft_registration_key(
        record.get("date"),
        record.get("flight"),
        record.get("departureCode"),
        record.get("arrivalCode"),
    )


def _registration_sort_key(item: Dict[str, Any]) -> tuple:
    return (
        str(item.get("date") or ""),
        str(item.get("flight") or ""),
        str(item.get("departureCode") or ""),
        str(item.get("arrivalCode") or ""),
    )


def _is_newer_or_equal(incoming: Dict[str, Any], existing: Optional[Dict[str, Any]]) -> bool:
    """incoming 이 existing 보다 같거나 최근이면 True (오래된 값이 최근 값을 덮어쓰지 못하게 한다)."""
    if existing is None:
        return True
    incoming_at = _parse_updated_at(incoming.get("updatedAt"))
    existing_at = _parse_updated_at(existing.get("updatedAt"))
    if incoming_at is None or existing_at is None:
        return True
    return incoming_at >= existing_at


def _record_to_supabase_row(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "record_key": _registration_key(record),
        "flight_date": record["date"],
        "flight": record["flight"],
        "departure_code": record.get("departureCode") or "",
        "arrival_code": record.get("arrivalCode") or "",
        "registration_no": record["registrationNo"],
        "updated_at": record["updatedAt"],
        "saved_at": _now_kst_iso(),
    }


def _record_from_supabase_row(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    return _normalize_aircraft_registration_record(
        {
            "date": row.get("flight_date"),
            "flight": row.get("flight"),
            "departureCode": row.get("departure_code"),
            "arrivalCode": row.get("arrival_code"),
            "registrationNo": row.get("registration_no"),
            "updatedAt": row.get("updated_at"),
        }
    )


_REGISTRATION_TABLE_PATH = "/rest/v1/aircraft_registration_records"
_REGISTRATION_PAGE_SIZE = 1000
_REGISTRATION_CACHE_SECONDS = 15.0
_registration_cache: Dict[str, Any] = {"records": None, "expires": 0.0}


def _read_registrations_from_supabase() -> List[Dict[str, Any]]:
    """Supabase 의 등록기록 전체(페이지 단위). 실패하면 예외 — 빈 목록으로 오해하지 않게 호출한 쪽이 처리한다."""
    records: List[Dict[str, Any]] = []
    offset = 0
    while True:
        query = urllib.parse.urlencode(
            {
                "select": "flight_date,flight,departure_code,arrival_code,registration_no,updated_at",
                "order": "record_key.asc",
                "limit": str(_REGISTRATION_PAGE_SIZE),
                "offset": str(offset),
            }
        )
        rows = _supabase_request("GET", f"{_REGISTRATION_TABLE_PATH}?{query}")
        if not isinstance(rows, list):
            raise RuntimeError("등록기호 저장소 응답 형식이 올바르지 않습니다.")
        for row in rows:
            if isinstance(row, dict):
                parsed = _record_from_supabase_row(row)
                if parsed:
                    records.append(parsed)
        if len(rows) < _REGISTRATION_PAGE_SIZE:
            return records
        offset += _REGISTRATION_PAGE_SIZE


def _upsert_registrations_to_supabase(records: List[Dict[str, Any]]) -> None:
    for start in range(0, len(records), 200):
        chunk = [_record_to_supabase_row(record) for record in records[start : start + 200]]
        _supabase_request(
            "POST",
            f"{_REGISTRATION_TABLE_PATH}?on_conflict=record_key",
            chunk,  # type: ignore[arg-type]
            {"Prefer": "resolution=merge-duplicates,return=minimal"},
        )


def _read_registrations_from_file() -> List[Dict[str, Any]]:
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


def _write_registrations_to_file(records: List[Dict[str, Any]]) -> None:
    """파일(/tmp)은 Supabase 를 쓸 수 없을 때를 위한 대체 저장소이자 읽기 캐시다."""
    payload = {"records": sorted(records, key=_registration_sort_key), "savedAt": _now_kst_iso()}
    try:
        AIRCRAFT_REGISTRATION_FILE.parent.mkdir(parents=True, exist_ok=True)
        AIRCRAFT_REGISTRATION_FILE.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def _dedupe_registrations(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """같은 운항(일자·편명·노선)은 가장 최근 저장분 하나만 남긴다."""
    latest: Dict[str, Dict[str, Any]] = {}
    for record in records:
        parsed = _normalize_aircraft_registration_record(record)
        if not parsed:
            continue
        key = _registration_key(parsed)
        if _is_newer_or_equal(parsed, latest.get(key)):
            latest[key] = parsed
    return sorted(latest.values(), key=_registration_sort_key)


def _read_aircraft_registrations(strict: bool = False) -> List[Dict[str, Any]]:
    """등록기록 전체.

    Supabase 가 설정되어 있으면 그것이 기준이다(재시작해도 유지). 처음 연결할 때 /tmp 파일에 남아 있는 기록은 옮겨 담는다.
    strict=True 이면 Supabase 조회 실패를 예외로 알린다(빈 목록으로 응답해 브라우저 기록을 지우게 하지 않기 위해).
    strict=False(내부 계산용)이면 실패 시 파일 기록으로 대체한다."""
    now = time.monotonic()
    cached = _registration_cache["records"]
    if cached is not None and _registration_cache["expires"] > now:
        return [dict(record) for record in cached]

    if not _supabase_usage_enabled():
        return _read_registrations_from_file()

    try:
        records = _dedupe_registrations(_read_registrations_from_supabase())
        if not records:
            legacy = _dedupe_registrations(_read_registrations_from_file())
            if legacy:
                _upsert_registrations_to_supabase(legacy)  # 처음 연결: 임시 파일 기록을 Supabase 로 이전
                records = legacy
    except Exception as exc:
        if strict:
            raise RuntimeError(f"등록기호 저장소(Supabase) 조회 실패: {exc}") from exc
        return _read_registrations_from_file()

    _registration_cache["records"] = records
    _registration_cache["expires"] = now + _REGISTRATION_CACHE_SECONDS
    _write_registrations_to_file(records)
    return [dict(record) for record in records]


def _save_aircraft_registrations(incoming_records: List[Dict[str, Any]], mode: str = "merge") -> Dict[str, Any]:
    """등록기록 저장. 같은 운항은 더 최근에 저장한 값이 이기고, 오래된 값은 최근 값을 덮어쓰지 못한다.

    mode="replace" 도 기록을 지우지 않고 병합한다(빈 목록·오래된 목록으로 전체가 사라지는 사고 방지)."""
    existing = _read_aircraft_registrations(strict=_supabase_usage_enabled())
    existing_by_key = {_registration_key(record): record for record in existing}

    accepted: List[Dict[str, Any]] = []
    for raw in incoming_records:
        parsed = _normalize_aircraft_registration_record(raw)
        if not parsed:
            continue
        if _is_newer_or_equal(parsed, existing_by_key.get(_registration_key(parsed))):
            accepted.append(parsed)

    accepted = _dedupe_registrations(accepted)

    if accepted and _supabase_usage_enabled():
        try:
            _upsert_registrations_to_supabase(accepted)
        except Exception as exc:
            raise RuntimeError(f"등록기호 저장소(Supabase) 저장 실패: {exc}") from exc

    merged = _dedupe_registrations(list(existing_by_key.values()) + accepted)
    _write_registrations_to_file(merged)
    _registration_cache["records"] = merged
    _registration_cache["expires"] = time.monotonic() + _REGISTRATION_CACHE_SECONDS

    return {"records": [dict(record) for record in merged], "savedAt": _now_kst_iso(), "changed": len(accepted)}


# 하위 호환: 예전 이름 (현재 라우트는 _save_aircraft_registrations 를 사용)
def _merge_aircraft_registrations(
    base_records: List[Dict[str, Any]],
    incoming_records: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    return _dedupe_registrations(list(base_records) + list(incoming_records))








def _build_aircraft_registration_lookup(records: Optional[List[Dict[str, Any]]] = None) -> Dict[str, str]:
    lookup: Dict[str, str] = {}
    stamps: Dict[str, str] = {}

    def set_if_newer(key: str, value: str, stamp: str) -> None:
        # 엑셀 업로드 후 매뉴얼로 수정한 값처럼 가장 최근에 저장한 값이 우선한다.
        if not key:
            return
        if key not in lookup or stamp >= stamps.get(key, ""):
            lookup[key] = value
            stamps[key] = stamp

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
        registration_no = str(parsed.get("registrationNo") or "")
        stamp = str(parsed.get("updatedAt") or "")

        set_if_newer(exact_key, registration_no, stamp)
        set_if_newer(fallback_key, registration_no, stamp)
        set_if_newer(str(parsed.get("flight") or ""), registration_no, stamp)

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
        existing = _row_aircraft_registration(row)
        # 프론트(aircraft-registration.ts)와 같은 순서:
        # 1) 일자(+노선)가 맞는 가장 최근 등록 기록  2) 행에 이미 있는 값  3) 편명 단독 기록
        registration_no = (
            lookup.get(exact_key) or lookup.get(fallback_key) or existing or lookup.get(flight)
        )

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
