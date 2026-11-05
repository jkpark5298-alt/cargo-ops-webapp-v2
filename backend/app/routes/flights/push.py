"""푸시 구독·테스트 API"""

from __future__ import annotations

from typing import Any, Dict, List
import os

from fastapi import APIRouter, Depends, HTTPException

from app.routes.flights.models import PushSubscriptionRequest, TestPushRequest
from app.services.flight_common import _now_kst_iso
from app.services.api_auth import require_api_token
from app.services.notification_store import (
    _broadcast_web_push,
    _read_push_subscriptions,
    _write_push_subscriptions,
)
router = APIRouter()


@router.get("/push-public-key")
async def get_push_public_key() -> Dict[str, Any]:
    public_key = os.getenv("WEB_PUSH_PUBLIC_KEY", "").strip()
    return {
        "success": True,
        "configured": bool(public_key),
        "publicKey": public_key,
    }


@router.post("/push-subscriptions", dependencies=[Depends(require_api_token)])
async def save_push_subscription(payload: PushSubscriptionRequest) -> Dict[str, Any]:
    subscription = dict(payload.subscription or {})
    endpoint = str(subscription.get("endpoint") or "")

    if not endpoint:
        raise HTTPException(status_code=400, detail="Push subscription endpoint가 없습니다.")

    items = _read_push_subscriptions()
    next_item = {
        "subscription": subscription,
        "userAgent": payload.userAgent or "",
        "deviceName": payload.deviceName or "",
        "savedAt": _now_kst_iso(),
    }

    filtered = [
        item
        for item in items
        if str((item.get("subscription") or {}).get("endpoint") or "") != endpoint
    ]

    filtered.insert(0, next_item)
    _write_push_subscriptions(filtered[:20])

    return {
        "success": True,
        "count": len(filtered[:20]),
    }


@router.get("/push-subscriptions/count")
async def get_push_subscription_count() -> Dict[str, Any]:
    return {
        "success": True,
        "count": len(_read_push_subscriptions()),
    }


@router.post("/push-test", dependencies=[Depends(require_api_token)])
async def send_test_push(payload: TestPushRequest) -> Dict[str, Any]:
    items = _read_push_subscriptions()

    if not items:
        raise HTTPException(status_code=400, detail="저장된 Push 구독 정보가 없습니다.")

    message = {
        "title": payload.title,
        "body": payload.body,
        "url": payload.url,
    }

    result = _broadcast_web_push(message)

    return {
        "success": result["sent"] > 0,
        "sent": result["sent"],
        "failed": result["failed"],
        "removed": result["removed"],
        "errors": result["errors"],
    }
