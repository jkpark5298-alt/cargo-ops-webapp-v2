"""인천 API 일일 호출량 집계"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import json
import urllib.error
import urllib.parse
import urllib.request

from app.services.flight_common import (
    INCHEON_API_ARRIVAL_DAILY_LIMIT,
    INCHEON_API_DEPARTURE_DAILY_LIMIT,
    INCHEON_API_USAGE_FILE,
    INCHEON_API_WARNING_RATE,
    _now_kst,
    _now_kst_iso,
    _supabase_request,
    _supabase_usage_enabled,
)
from app.services.flight_rows import _is_arrival_row, _is_departure_row
def _usage_date_key() -> str:
    return _now_kst().date().isoformat()


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
