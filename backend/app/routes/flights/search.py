"""편명·KJ 전체 조회 API"""

from __future__ import annotations

from typing import Any, Dict, List
import asyncio

from fastapi import APIRouter, HTTPException
from app.services.incheon_api import (
    IncheonApiAuthError,
    IncheonApiQuotaExceededError,
    IncheonApiResponseError,
    get_all_kj_flight_data,
    get_flight_data,
)

from app.routes.flights.models import FlightQueryRequest, FlightRangeRequest
from app.services.flight_common import _flight_search_cache_get, _flight_search_cache_set
from app.services.flight_rows import (
    _get_row_sort_key,
    _normalize_flights,
    _row_matches_schedule_or_estimate_range,
    _row_matches_time_range,
    _validate_range,
)
from app.services.incheon_usage import _record_incheon_api_usage_for_rows
router = APIRouter()


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
    except IncheonApiAuthError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc) or "인천 화물기 API 인증 실패. Render의 INCHEON_API_SERVICE_KEY에 Decoding 키를 넣었는지 확인하세요.",
        ) from exc
    except IncheonApiResponseError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"인천 화물기 API 오류({exc.code}): {exc.message}",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

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
    if not filtered_rows:
        result["message"] = "조회 결과가 없습니다. 기간을 넓히거나 인천 화물기 API 상태를 확인하세요."
    _flight_search_cache_set(cache_key, result)
    return result


@router.post("/")
async def search_flights(payload: FlightQueryRequest) -> Dict[str, Any]:
    normalized_flights = _normalize_flights(payload.flights)

    if not normalized_flights:
        raise HTTPException(status_code=400, detail="조회할 편명이 없습니다.")

    start_dt, end_dt, start_date, end_date = _validate_range(payload.start, payload.end)
    cache_key = f"manual|{','.join(normalized_flights)}|{payload.start}|{payload.end}|{start_date}|{end_date}|{int(payload.includeScheduled)}"
    row_in_range = _row_matches_schedule_or_estimate_range if payload.includeScheduled else _row_matches_time_range
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
                if row_in_range(row, start_dt, end_dt)
            ]

            _record_incheon_api_usage_for_rows(filtered_rows)
            all_rows.extend(filtered_rows)

    except IncheonApiQuotaExceededError:
        raise HTTPException(status_code=429, detail="한도 초과로 조회 불가")
    except IncheonApiAuthError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc) or "인천 화물기 API 인증 실패. Render의 INCHEON_API_SERVICE_KEY에 Decoding 키를 넣었는지 확인하세요.",
        ) from exc
    except IncheonApiResponseError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"인천 화물기 API 오류({exc.code}): {exc.message}",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

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
    if not all_rows:
        result["message"] = "조회 결과가 없습니다. 기간을 넓히거나 인천 화물기 API 상태를 확인하세요."
    _flight_search_cache_set(cache_key, result)
    return result
