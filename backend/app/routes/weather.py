from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter

from app.services.weather import get_current_weather

router = APIRouter()

WEATHER_CACHE_TTL_SECONDS = int(os.getenv("WEATHER_CACHE_TTL_SECONDS", "600"))
WEATHER_CACHE: Optional[Dict[str, Any]] = None
WEATHER_CACHE_EXPIRES_AT = 0.0


@router.get("/current")
async def current_weather():
    global WEATHER_CACHE
    global WEATHER_CACHE_EXPIRES_AT

    now = time.monotonic()
    if WEATHER_CACHE and WEATHER_CACHE_EXPIRES_AT > now:
        return {
            **WEATHER_CACHE,
            "cached": True,
            "source": "memory-cache",
        }

    data = await get_current_weather()
    if isinstance(data, dict):
        WEATHER_CACHE = data
        WEATHER_CACHE_EXPIRES_AT = now + WEATHER_CACHE_TTL_SECONDS
        return {
            **data,
            "cached": False,
            "source": "weather-api",
        }

    return data
