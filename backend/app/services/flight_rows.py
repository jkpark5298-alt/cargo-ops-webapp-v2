"""인천 API 편 데이터 행 파싱·시간 범위·상태 판정(순수 함수)"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
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


def _format_route(row: Dict[str, Any]) -> str:
    departure = _display_value(row.get("departureCode"))
    arrival = _display_value(row.get("arrivalCode"))
    return f"{departure}→{arrival}"


def _is_departure_row(row: Dict[str, Any]) -> bool:
    return str(row.get("departureCode") or "").strip().upper() == "ICN"


def _is_arrival_row(row: Dict[str, Any]) -> bool:
    return str(row.get("arrivalCode") or "").strip().upper() == "ICN"
