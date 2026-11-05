"""푸시 구독·테스트 API"""

from __future__ import annotations

from typing import Any, Dict, List
import os

from fastapi import APIRouter, HTTPException
from pywebpush import WebPushException

from app.routes.flights.models import PushSubscriptionRequest, TestPushRequest
from app.services.flight_common import _now_kst_iso
from app.services.notification_store import (
    _read_push_subscriptions,
    _send_web_push,
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


@router.post("/push-subscriptions")
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


@router.post("/push-test")
async def send_test_push(payload: TestPushRequest) -> Dict[str, Any]:
    items = _read_push_subscriptions()

    if not items:
        raise HTTPException(status_code=400, detail="저장된 Push 구독 정보가 없습니다.")

    message = {
        "title": payload.title,
        "body": payload.body,
        "url": payload.url,
    }

    sent = 0
    failed = 0
    errors: List[str] = []

    for item in items:
        subscription = item.get("subscription") or {}

        try:
            _send_web_push(subscription, message)
            sent += 1
        except WebPushException as exc:
            failed += 1
            errors.append(str(exc))
        except Exception as exc:
            failed += 1
            errors.append(str(exc))

    return {
        "success": sent > 0,
        "sent": sent,
        "failed": failed,
        "errors": errors[:3],
    }
