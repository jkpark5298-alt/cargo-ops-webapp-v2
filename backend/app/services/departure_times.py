"""해외 출발편(인천 도착편)의 출발 일시 — 초기화면 카드에서 사람이 입력하는 표시용 값

- 키: '예정 도착일|편명' (같은 편명이 날짜마다 다르므로 일자 포함), 값: 출발 일시(YYYY-MM-DD HH:MM, 한국 시각)
- 저장: app_state_documents 문서(doc_key=flight_departure_times) + /tmp 파일 대체. 별도 테이블·SQL 은 필요 없다.
- 알림·변경 감지에는 쓰지 않는다(표시 전용).
"""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path
from typing import Any, Dict
import json
import os
import re

from app.services.flight_common import _now_kst, _now_kst_iso
from app.services.notification_store import _read_state_document, _write_state_document

DEPARTURE_TIMES_FILE = Path(os.getenv("DEPARTURE_TIMES_FILE", "/tmp/cargo_ops_departure_times.json"))
_DOC_DEPARTURE_TIMES = "flight_departure_times"
_KEEP_DAYS = 45
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DEPARTURE_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$")


def _norm_flight(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def _read_items() -> Dict[str, Dict[str, str]]:
    remote = _read_state_document(_DOC_DEPARTURE_TIMES)
    if isinstance(remote, dict) and isinstance(remote.get("items"), dict):
        return dict(remote["items"])
    try:
        data = json.loads(DEPARTURE_TIMES_FILE.read_text(encoding="utf-8"))
        items = data.get("items") if isinstance(data, dict) else None
        return dict(items) if isinstance(items, dict) else {}
    except Exception:
        return {}


def _write_items(items: Dict[str, Dict[str, str]]) -> None:
    try:
        DEPARTURE_TIMES_FILE.parent.mkdir(parents=True, exist_ok=True)
        DEPARTURE_TIMES_FILE.write_text(json.dumps({"items": items}, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass
    _write_state_document(_DOC_DEPARTURE_TIMES, {"items": items})


def _list_departure_times() -> Dict[str, Dict[str, str]]:
    return _read_items()


def _set_departure_time(date: str, flight: str, departure: str) -> Dict[str, Dict[str, str]]:
    """출발 일시를 저장한다. departure 가 빈 문자열이면 그 편의 값을 지운다."""
    date = str(date or "").strip()[:10]
    flight = _norm_flight(flight)
    departure = str(departure or "").strip()
    if not _DATE_RE.match(date) or not flight:
        raise ValueError("일자(YYYY-MM-DD)와 편명이 필요합니다.")
    if departure and not _DEPARTURE_RE.match(departure):
        raise ValueError("출발 일시는 YYYY-MM-DD HH:MM 형식이어야 합니다.")

    items = _read_items()
    key = f"{date}|{flight}"
    if departure:
        items[key] = {"departure": departure, "updatedAt": _now_kst_iso()}
    else:
        items.pop(key, None)

    cutoff = (_now_kst().date() - timedelta(days=_KEEP_DAYS)).isoformat()
    items = {k: v for k, v in items.items() if k.split("|")[0] >= cutoff}
    _write_items(items)
    return items
