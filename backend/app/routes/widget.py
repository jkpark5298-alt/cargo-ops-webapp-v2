from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.services.incheon_api import (
    IncheonApiQuotaExceededError,
    get_flight_data,
)

router = APIRouter()


def _normalize_flight_code(value: str) -> str:
    code = (value or "").strip().upper()
    if not code:
        return ""

    if code.isdigit() and len(code) in {3, 4}:
        return f"KJ{code}"

    return code


def _normalize_flights_param(value: str) -> List[str]:
    normalized: List[str] = []
    seen = set()

    for part in str(value or "").replace("\n", ",").replace(" ", ",").split(","):
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


def _parse_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None

    raw = str(value).strip()
    if not raw or raw == "-":
        return None

    raw = raw.replace(".", "-").replace("/", "-").replace("T", " ")

    candidates = [
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
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


def _get_row_time(row: Dict[str, Any]) -> Optional[datetime]:
    candidates = [
        row.get("formattedEstimatedTime"),
        row.get("formattedScheduleTime"),
        row.get("estimatedDateTime"),
        row.get("scheduleDateTime"),
    ]

    for value in candidates:
        parsed = _parse_datetime(value)
        if parsed is not None:
            return parsed

    return None


def _get_remark_status(row: Dict[str, Any]) -> str:
    return f"{row.get('status', '')} {row.get('remark', '')}".strip().upper()


def _compute_status(row: Dict[str, Any]) -> str:
    remark_status = _get_remark_status(row)

    if row.get("canceled") or "CANCEL" in remark_status:
        return "결항"

    if row.get("gateChanged"):
        return "게이트 변경"

    if row.get("delay") or "DELAY" in remark_status or "지연" in remark_status:
        if row.get("status") == "도착" or "ARRIV" in remark_status or "도착" in remark_status:
            return "도착(지연)"
        if row.get("status") == "출발" or "DEPAR" in remark_status or "출발" in remark_status:
            return "출발(지연)"
        return "지연"

    if row.get("status") == "출발" or "DEPAR" in remark_status or "출발" in remark_status:
        return "출발"

    if row.get("status") == "도착" or "ARRIV" in remark_status or "도착" in remark_status:
        return "도착"

    return "-"


def _build_item_from_row(flight: str, row: Dict[str, Any]) -> Dict[str, Any]:
    display_time = (
        row.get("formattedEstimatedTime")
        or row.get("formattedScheduleTime")
        or row.get("estimatedDateTime")
        or row.get("scheduleDateTime")
        or "-"
    )

    return {
        "flight": flight,
        "status": _compute_status(row),
        "departureCode": row.get("departureCode") or "-",
        "arrivalCode": row.get("arrivalCode") or "-",
        "displayTime": display_time,
        "gate": row.get("gatenumber") or "-",
    }


@router.get("/fixed/{room_id}")
async def get_fixed_widget_summary(
    room_id: str,
    flights: str = Query(default=""),
    start: str = Query(default=""),
    end: str = Query(default=""),
    roomName: str = Query(default=""),
    refreshIntervalMinutes: int = Query(default=10),
    limit: int = Query(default=7),
) -> Dict[str, Any]:
    normalized_flights = _normalize_flights_param(flights)

    if not normalized_flights:
        return {
            "success": True,
            "roomId": room_id,
            "roomName": roomName or room_id,
            "updatedAt": datetime.utcnow().isoformat(),
            "refreshIntervalMinutes": refreshIntervalMinutes,
            "items": [],
        }

    start_date = _extract_date(start)
    end_date = _extract_date(end)

    if not start_date or not end_date:
        raise HTTPException(status_code=400, detail="시작일 또는 종료일이 필요합니다.")

    latest_rows_by_flight: Dict[str, Dict[str, Any]] = {}

    try:
        for flight_no in normalized_flights:
            rows = await get_flight_data(
                flight_no=flight_no,
                start_date=start_date,
                end_date=end_date,
            )

            if not rows:
                continue

            rows.sort(
                key=lambda row: _get_row_time(row) or datetime.min,
                reverse=True,
            )
            latest_rows_by_flight[flight_no] = rows[0]

    except IncheonApiQuotaExceededError:
        raise HTTPException(status_code=429, detail="한도 초과로 조회 불가")

    items: List[Dict[str, Any]] = []

    for flight_no in normalized_flights:
        row = latest_rows_by_flight.get(flight_no)
        if row:
            items.append(_build_item_from_row(flight_no, row))

    if limit > 0:
        items = items[:limit]

    return {
        "success": True,
        "roomId": room_id,
        "roomName": roomName or room_id,
        "updatedAt": datetime.utcnow().isoformat(),
        "refreshIntervalMinutes": refreshIntervalMinutes,
        "items": items,
    }
