"""알림 기록 API"""

from __future__ import annotations

from fastapi import APIRouter

from typing import Any, Dict

from app.routes.flights.models import NotificationHistoryDeleteItemRequest
from app.services.notification_store import _read_notification_history, _write_notification_history
router = APIRouter()


@router.get("/notification-history")
async def get_notification_history() -> Dict[str, Any]:
    return {
        "success": True,
        "items": _read_notification_history()[:50],
    }


@router.delete("/notification-history")
async def clear_notification_history() -> Dict[str, Any]:
    previous_items = _read_notification_history()
    _write_notification_history([])
    return {
        "success": True,
        "cleared": len(previous_items),
        "items": [],
    }


@router.post("/notification-history/clear")
async def clear_notification_history_post() -> Dict[str, Any]:
    return await clear_notification_history()


@router.post("/notification-history/delete-item")
async def delete_notification_history_item(payload: NotificationHistoryDeleteItemRequest) -> Dict[str, Any]:
    items = _read_notification_history()

    def _norm_checked(value: Any) -> str:
        return str(value or "").replace("T", " ").strip()

    def _same_item(item: Dict[str, Any]) -> bool:
        item_key = str(item.get("key") or "").strip()
        payload_key = str(payload.key or "").strip()
        if payload_key and item_key and item_key == payload_key:
            return True

        same_core = (
            str(item.get("title") or "") == str(payload.title or "")
            and str(item.get("description") or "") == str(payload.description or "")
            and _norm_checked(item.get("checkedAt")) == _norm_checked(payload.checkedAt)
        )
        if not same_core:
            return False

        # roomName은 표시용이라 달라도 같은 항목으로 처리합니다.
        if not payload.roomName:
            return True
        return str(item.get("roomName") or "") == str(payload.roomName or "")

    next_items = [item for item in items if not _same_item(item)]
    deleted = len(items) - len(next_items)
    _write_notification_history(next_items)

    return {
        "success": True,
        "deleted": deleted,
        "items": next_items[:50],
    }
