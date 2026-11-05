"""알림 기록·푸시 구독·자동 푸시 상태 저장과 웹푸시 발송"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import json
import os

from fastapi import HTTPException
from pywebpush import webpush

from app.services.flight_alerts import (
    _first_change_line,
    _format_history_change_line,
    _format_history_checked_time,
    _format_route_spaced,
    _format_status_time_line,
)
from app.services.flight_common import (
    AUTO_PUSH_DEFAULT_INTERVAL_MINUTES,
    AUTO_PUSH_STATUS_FILE,
    NOTIFICATION_HISTORY_FILE,
    PUSH_SUBSCRIPTIONS_FILE,
    _now_kst_iso,
    _supabase_request,
    _supabase_usage_enabled,
)

# Supabase 영구 저장(app_state_documents 테이블). 테이블이 없거나 장애면 /tmp 파일만 사용한다.
_DOC_HISTORY = "notification_history"
_DOC_SUBSCRIPTIONS = "push_subscriptions"
_DOC_AUTO_STATUS = "auto_push_status"


def _read_state_document(doc_key: str) -> Optional[Any]:
    """Supabase 에 저장된 문서(payload)를 읽는다. 없거나 실패하면 None → 호출부가 파일로 대체."""
    if not _supabase_usage_enabled():
        return None
    try:
        rows = _supabase_request(
            "GET",
            f"/rest/v1/app_state_documents?doc_key=eq.{doc_key}&select=payload&limit=1",
        )
    except Exception:
        return None
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        return rows[0].get("payload")
    return None


def _write_state_document(doc_key: str, payload: Any) -> None:
    """Supabase 에 문서를 저장한다(실패해도 파일 저장은 이미 끝난 상태라 서비스는 계속)."""
    if not _supabase_usage_enabled():
        return
    try:
        _supabase_request(
            "POST",
            "/rest/v1/app_state_documents?on_conflict=doc_key",
            {"doc_key": doc_key, "payload": payload, "updated_at": _now_kst_iso()},
            {"Prefer": "resolution=merge-duplicates,return=minimal"},
        )
    except Exception:
        pass
def _read_notification_history() -> List[Dict[str, Any]]:
    remote = _read_state_document(_DOC_HISTORY)
    if isinstance(remote, dict) and isinstance(remote.get("items"), list):
        return remote["items"]
    try:
        if not NOTIFICATION_HISTORY_FILE.exists():
            return []

        data = json.loads(NOTIFICATION_HISTORY_FILE.read_text(encoding="utf-8"))
        items = data.get("items")
        return items if isinstance(items, list) else []
    except Exception:
        return []


def _write_notification_history(items: List[Dict[str, Any]]) -> None:
    NOTIFICATION_HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    NOTIFICATION_HISTORY_FILE.write_text(
        json.dumps({"items": items[:100]}, ensure_ascii=False),
        encoding="utf-8",
    )
    _write_state_document(_DOC_HISTORY, {"items": items[:100]})


def _append_notification_history(
    changed_items: List[Dict[str, Any]],
    room: Optional[Dict[str, Any]] = None,
    source: str = "자동 알림",
) -> List[Dict[str, Any]]:
    if not changed_items:
        return _read_notification_history()

    checked_at = _now_kst_iso()
    new_items: List[Dict[str, Any]] = []

    for index, item in enumerate(changed_items[:20]):
        flight = str(item.get("flight") or "Schedule Flight")
        route = _format_route_spaced(item.get("route") or "")
        changes = item.get("changes") if isinstance(item.get("changes"), list) else []
        change_lines = [_format_history_change_line(change) for change in changes[:3]]
        change_lines = [line for line in change_lines if line]

        description_lines = []
        if route:
            description_lines.append(route)

        time_change_line = _first_change_line(change_lines, "운항시각")
        status_change_line = _first_change_line(change_lines, "상태")
        gate_change_line = _first_change_line(change_lines, "게이트")
        terminal_change_line = _first_change_line(change_lines, "터미널")

        if status_change_line:
            description_lines.append(status_change_line)
            status_time_line = _format_status_time_line(item)
            if status_time_line:
                description_lines.append(status_time_line)
        elif time_change_line:
            description_lines.append(time_change_line)
            schedule_short = str(item.get("scheduleTimeShort") or "").strip()
            if schedule_short:
                description_lines.append(f"스케줄 {schedule_short}")
        else:
            description_lines.extend(
                [line for line in [gate_change_line, terminal_change_line] if line]
                or change_lines
                or ["운항 정보 변경"]
            )

        description_lines.append(f"발생 {_format_history_checked_time(checked_at)} KST")

        new_items.append(
            {
                "key": f"server-{checked_at}-{index}-{flight}",
                "flight": flight,
                "route": route,
                "changes": changes,
                "title": f"{flight} 운항 정보 변경",
                "description": "\n".join(description_lines),
                "checkedAt": checked_at.replace("T", " "),
                "roomName": "서버 알림",
            }
        )

    existing = _read_notification_history()
    merged = new_items + existing
    seen: set[str] = set()
    deduped: List[Dict[str, Any]] = []

    for item in merged:
        dedupe_key = f"{item.get('title')}|{item.get('description')}|{item.get('checkedAt')}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        deduped.append(item)

    _write_notification_history(deduped)
    return deduped


def _read_push_subscriptions() -> List[Dict[str, Any]]:
    remote = _read_state_document(_DOC_SUBSCRIPTIONS)
    if isinstance(remote, dict) and isinstance(remote.get("items"), list):
        return remote["items"]
    try:
        if not PUSH_SUBSCRIPTIONS_FILE.exists():
            return []

        data = json.loads(PUSH_SUBSCRIPTIONS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_push_subscriptions(items: List[Dict[str, Any]]) -> None:
    PUSH_SUBSCRIPTIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PUSH_SUBSCRIPTIONS_FILE.write_text(
        json.dumps(items, ensure_ascii=False),
        encoding="utf-8",
    )
    _write_state_document(_DOC_SUBSCRIPTIONS, {"items": items})


def _read_auto_push_status() -> Dict[str, Any]:
    default_enabled = os.getenv("AUTO_PUSH_ENABLED", "true").lower() != "false"
    default_status: Dict[str, Any] = {
        "enabled": default_enabled,
        "intervalMinutes": AUTO_PUSH_DEFAULT_INTERVAL_MINUTES,
        "lastRunAt": "",
        "lastMessage": "Schedule Flight 기준 자동 변경 확인 대기 중",
        "lastResult": None,
    }

    remote = _read_state_document(_DOC_AUTO_STATUS)
    if isinstance(remote, dict) and remote:
        return {**default_status, **remote}

    try:
        if not AUTO_PUSH_STATUS_FILE.exists():
            return default_status

        data = json.loads(AUTO_PUSH_STATUS_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return default_status

        return {**default_status, **data}
    except Exception:
        return default_status


def _write_auto_push_status(status: Dict[str, Any]) -> Dict[str, Any]:
    AUTO_PUSH_STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    AUTO_PUSH_STATUS_FILE.write_text(
        json.dumps(status, ensure_ascii=False),
        encoding="utf-8",
    )
    _write_state_document(_DOC_AUTO_STATUS, status)
    return status


def _update_auto_push_status(**updates: Any) -> Dict[str, Any]:
    status = _read_auto_push_status()
    status.update(updates)
    return _write_auto_push_status(status)


def _get_vapid_settings() -> tuple[str, str, str]:
    public_key = os.getenv("WEB_PUSH_PUBLIC_KEY", "").strip()
    private_key = os.getenv("WEB_PUSH_PRIVATE_KEY", "").strip()
    subject = os.getenv("WEB_PUSH_SUBJECT", "mailto:admin@example.com").strip()

    if not public_key or not private_key:
        raise HTTPException(
            status_code=400,
            detail="WEB_PUSH_PUBLIC_KEY 또는 WEB_PUSH_PRIVATE_KEY 환경변수가 없습니다.",
        )

    return public_key, private_key, subject


def _send_web_push(subscription: Dict[str, Any], payload: Dict[str, Any]) -> None:
    _, private_key, subject = _get_vapid_settings()

    webpush(
        subscription_info=subscription,
        data=json.dumps(payload, ensure_ascii=False),
        vapid_private_key=private_key,
        vapid_claims={"sub": subject},
    )
