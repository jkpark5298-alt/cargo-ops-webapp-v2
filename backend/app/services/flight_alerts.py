"""알림/푸시 문구 만들기"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
import re

from app.services.flight_common import KST
from app.services.flight_rows import _display_value, _format_route, _parse_row_datetime
def _format_alert_time(value: Any) -> str:
    parsed = _parse_row_datetime(value)
    if parsed is not None:
        return f"'{str(parsed.year)[2:]}/{parsed.month:02d}/{parsed.day:02d} {parsed.hour:02d}:{parsed.minute:02d}"

    raw = _display_value(value)
    raw = raw.replace("T", " ").replace("Z", "").strip()

    match = re.match(r"^(\d{4})[-/.](\d{2})[-/.](\d{2})\s+(\d{2}):(\d{2})", raw)
    if match:
        year, month, day, hour, minute = match.groups()
        return f"'{year[2:]}/{month}/{day} {hour}:{minute}"

    return raw


def _format_history_checked_time(value: Any) -> str:
    parsed = _parse_kst_iso(value)
    if parsed is not None:
        return f"{parsed.month:02d}/{parsed.day:02d} {parsed.hour:02d}:{parsed.minute:02d}"

    raw = str(value or "").replace("T", " ").replace("Z", "").strip()
    match = re.search(r"(\d{2})[-/.](\d{2})\s+(\d{2}):(\d{2})", raw)
    if match:
        month, day, hour, minute = match.groups()
        return f"{month}/{day} {hour}:{minute}"

    return raw


def _format_schedule_short(value: Any) -> str:
    parsed = _parse_row_datetime(value)
    if parsed is not None:
        return f"{parsed.month:02d}/{parsed.day:02d} {parsed.hour:02d}:{parsed.minute:02d}"

    raw = _format_alert_time(value)
    match = re.search(r"'?(?:\d{2,4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}:\d{2})", raw)
    if match:
        month, day, time = match.groups()
        return f"{month.zfill(2)}/{day.zfill(2)} {time}"

    return raw


def _first_change_line(changes: List[str], label: str) -> str:
    for change in changes:
        if str(change).strip().startswith(label):
            return str(change).strip()
    return ""


def _format_status_time_line(item: Dict[str, Any]) -> str:
    estimated = str(item.get("estimatedTimeText") or "").strip()
    schedule = str(item.get("scheduleTimeText") or "").strip()

    if estimated and schedule:
        return f"시간 {estimated} · 예정 {schedule}"
    if estimated:
        return f"시간 {estimated}"
    if schedule:
        return f"예정 {schedule}"
    return ""


def _build_changed_item(flight: str, current: Dict[str, Any], changes: List[str]) -> Dict[str, Any]:
    schedule_value = _get_schedule_time_value(current)
    estimated_value = _get_estimated_time_value(current)

    return {
        "flight": flight,
        "route": _format_route(current),
        "changes": changes,
        "scheduleTime": schedule_value,
        "estimatedTime": estimated_value,
        "scheduleTimeText": _format_alert_time(schedule_value) if schedule_value else "",
        "scheduleTimeShort": _format_schedule_short(schedule_value) if schedule_value else "",
        "estimatedTimeText": _format_alert_time(estimated_value) if estimated_value else "",
        "estimatedTimeShort": _format_schedule_short(estimated_value) if estimated_value else "",
        "remark": current.get("remark") or current.get("status") or "",
        "gate": current.get("gatenumber") or "",
        "terminal": current.get("terminalid") or "",
    }


def _extract_clock_text(value: Any) -> str:
    text = str(value or "").replace("T", " ").replace("Z", "").strip()
    match = re.search(r"(\d{2}):(\d{2})", text)
    if match:
        hour, minute = match.groups()
        return f"{hour}:{minute}"
    return text


def _format_route_compact(route: Any) -> str:
    return str(route or "").replace(" ", "").replace("-", "→").replace(">", "→").upper().strip()


def _format_route_spaced(route: Any) -> str:
    compact = _format_route_compact(route)
    return compact.replace("→", " → ") if compact else ""


def _extract_time_change(change: Any) -> Optional[tuple[str, str]]:
    text = str(change or "").strip()
    if "운항시각" not in text and "시간" not in text and "예정" not in text:
        return None

    match = re.search(r"(?:운항시각|시간|예정)\s+(.+?)\s*(?:→|->|=>|←|<-|>)\s*(.+)$", text)
    if not match:
        return None

    before, after = match.groups()
    before = before.strip(" '")
    after = after.strip(" '")

    return before, after


def _format_push_body_from_change(change: Any) -> str:
    time_change = _extract_time_change(change)
    if time_change:
        before, after = time_change
        after_text = _format_alert_time(after)
        before_text = _extract_clock_text(before)
        return f"{after_text} ← {before_text}"

    text = str(change or "운항 정보 변경").strip()
    text = text.replace("->", "→").replace("=>", "→")
    return text


def _format_history_change_line(change: Any) -> str:
    time_change = _extract_time_change(change)
    if time_change:
        before, after = time_change
        return f"운항시각 {_extract_clock_text(before)} → {_extract_clock_text(after)}"

    text = str(change or "운항 정보 변경").strip()
    text = text.replace("신규 정보", "상태")
    text = re.sub(r"\s+", " ", text)
    return text


def _build_compact_schedule_push(changed_items: List[Dict[str, Any]]) -> Dict[str, str]:
    first = changed_items[0] if changed_items else {}
    flight = str(first.get("flight") or "Schedule").strip()
    route = _format_route_compact(first.get("route") or "")
    changes = first.get("changes") if isinstance(first.get("changes"), list) else []
    first_change = changes[0] if changes else "운항 정보 변경"
    extra_count = max(0, len(changed_items) - 1)

    if extra_count > 0:
        title = f"{flight} 변경 {route}".strip()
        body = f"{_format_push_body_from_change(first_change)} 외 {extra_count}건"
    else:
        title = f"{flight} 변경 {route}".strip()
        body = _format_push_body_from_change(first_change)

    return {
        "title": title[:48],
        "body": body[:92],
        "url": "/",
    }


def _get_schedule_time_value(row: Dict[str, Any]) -> Any:
    return row.get("formattedScheduleTime") or row.get("scheduleDateTime")


def _get_estimated_time_value(row: Dict[str, Any]) -> Any:
    return row.get("formattedEstimatedTime") or row.get("estimatedDateTime")


def _get_alert_time_value(row: Dict[str, Any]) -> Any:
    return _get_estimated_time_value(row) or _get_schedule_time_value(row)


def _parse_kst_iso(value: Any) -> Optional[datetime]:
    """Parse timestamps stored by this app.

    `_now_kst_iso()` writes naive KST ISO strings (no offset). On UTC hosts
    (e.g. Render), treating those as local/UTC and converting to KST shifts
    them +9h and breaks health-tick due checks (`elapsedSeconds` goes negative).
    """
    if not value:
        return None

    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed
        return parsed.astimezone(KST).replace(tzinfo=None)
    except Exception:
        return None
