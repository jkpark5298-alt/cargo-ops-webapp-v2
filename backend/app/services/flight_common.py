"""항공편 기능 공통: 환경설정·파일 경로·KST 시간·검색 캐시·Supabase 요청"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
LATEST_SCHEDULE_FILE = Path(
    os.getenv("LATEST_SCHEDULE_FILE", "/tmp/cargo_ops_latest_schedule.json")
)


SCHEDULE_SLOTS_FILE = Path(
    os.getenv("SCHEDULE_SLOTS_FILE", "/tmp/cargo_ops_schedule_slots.json")
)


SCHEDULE_SLOT_KEYS = ("active", "archive")


DEFAULT_LINKED_SLOT = "active"


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
