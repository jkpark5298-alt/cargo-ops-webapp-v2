from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter

from app.services.weather import get_current_weather

router = APIRouter()

# 성공 응답은 길게, 실패 응답은 짧게 캐시한다. (실패를 오래 붙들고 있으면 복구돼도 계속 실패로 보인다)
WEATHER_CACHE_TTL_SECONDS = int(os.getenv("WEATHER_CACHE_TTL_SECONDS", "600"))
WEATHER_FAILURE_CACHE_TTL_SECONDS = int(os.getenv("WEATHER_FAILURE_CACHE_TTL_SECONDS", "30"))
WEATHER_CACHE: Optional[Dict[str, Any]] = None
WEATHER_CACHE_EXPIRES_AT = 0.0


@router.get("/current")
async def current_weather(refresh: bool = False):
    """현재 날씨. `?refresh=true` 이면 캐시를 건너뛰고 다시 조회한다(화면의 갱신 버튼)."""
    global WEATHER_CACHE
    global WEATHER_CACHE_EXPIRES_AT

    now = time.monotonic()
    if not refresh and WEATHER_CACHE and WEATHER_CACHE_EXPIRES_AT > now:
        return {
            **WEATHER_CACHE,
            "cached": True,
        }

    data = await get_current_weather()
    if isinstance(data, dict):
        ttl = WEATHER_CACHE_TTL_SECONDS if data.get("success") else WEATHER_FAILURE_CACHE_TTL_SECONDS
        WEATHER_CACHE = data
        WEATHER_CACHE_EXPIRES_AT = now + ttl
        return {
            **data,
            "cached": False,
        }

    return data
