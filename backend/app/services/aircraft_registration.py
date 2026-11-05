"""항공기 등록기호 기록 정규화·저장·행 적용"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import json
import re

from app.services.flight_common import AIRCRAFT_REGISTRATION_FILE, _now_kst_iso
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
