"""Schedule Flight 최신본·슬롯 API"""

from __future__ import annotations

from fastapi import APIRouter

from typing import Any, Dict

from app.routes.flights.models import LatestScheduleRequest, ScheduleSlotSaveRequest
from app.services.flight_common import _now_kst, _now_kst_iso
from app.services.notification_store import _update_auto_push_status
from app.services.schedule_monitor import _get_auto_interval_minutes_for_room
from app.services.schedule_store import (
    _build_schedule_card_name,
    _clear_all_schedule_slots,
    _clear_schedule_slot,
    _get_schedule_slot_entry,
    _link_schedule_slot,
    _read_latest_schedule_from_file,
    _read_latest_schedule_from_supabase,
    _read_linked_slot,
    _read_schedule_slots,
    _read_schedule_slots_from_supabase,
    _read_schedule_slots_without_migration,
    _sanitize_latest_schedule_room,
    _save_schedule_slots_with_rotate,
    _schedule_slot_payload,
    _swap_schedule_slots,
    _update_schedule_slot,
    _write_latest_schedule,
    _write_schedule_slot_entry,
)
router = APIRouter()


@router.get("/latest-schedule")
async def get_latest_schedule() -> Dict[str, Any]:
    supabase_payload = _read_latest_schedule_from_supabase()
    file_payload = None if supabase_payload else _read_latest_schedule_from_file()
    payload = supabase_payload or file_payload
    return {
        "success": True,
        "room": payload.get("room") if payload else None,
        "savedAt": payload.get("savedAt") if payload else "",
        "source": "supabase" if supabase_payload else "file" if file_payload else "",
    }


@router.post("/latest-schedule")
async def save_latest_schedule(payload: LatestScheduleRequest) -> Dict[str, Any]:
    room = dict(payload.room or {})

    if not room.get("fixed"):
        room["fixed"] = True

    if not room.get("id"):
        room["id"] = str(int(_now_kst().timestamp() * 1000))

    if not room.get("name"):
        room["name"] = "Schedule_Synced"

    room = _sanitize_latest_schedule_room(room)

    saved = _write_latest_schedule(room)
    saved_at = saved.get("savedAt") or _now_kst_iso()
    # 항상 active가 아니라 현재 연동 슬롯에 맞춰 저장해 삭제/수정이 되살아나지 않게 한다.
    linked_slot = _read_linked_slot()
    slots = _read_schedule_slots_without_migration()
    existing_entry = _get_schedule_slot_entry(slots, linked_slot)
    linked_entry = _schedule_slot_payload(
        linked_slot,
        str(
            (existing_entry or {}).get("name")
            or _build_schedule_card_name(str(room.get("startDateTime") or ""))
        ),
        saved.get("room") or room,
        saved_at,
    )
    _write_schedule_slot_entry(linked_slot, linked_entry)
    _update_auto_push_status(
        enabled=True,
        intervalMinutes=_get_auto_interval_minutes_for_room(room),
        lastMessage="Schedule Flight 저장 완료. 자동 변경 확인이 자동 적용됩니다.",
    )
    return {
        "success": True,
        "room": saved["room"],
        "savedAt": saved["savedAt"],
    }


@router.get("/schedule-slots")
async def get_schedule_slots() -> Dict[str, Any]:
    supabase_payload = _read_schedule_slots_from_supabase()
    slots = _read_schedule_slots()
    return {
        "success": True,
        "active": slots.get("active"),
        "archive": slots.get("archive"),
        "linkedSlot": _read_linked_slot(),
        "source": "supabase" if supabase_payload is not None else "file",
    }


@router.post("/schedule-slots/save")
async def save_schedule_slot(payload: ScheduleSlotSaveRequest) -> Dict[str, Any]:
    room = dict(payload.room or {})
    target_slot = str(payload.slot or "").strip().lower()

    if payload.rotate and not target_slot:
        result = _save_schedule_slots_with_rotate(room)
        _update_auto_push_status(
            enabled=True,
            intervalMinutes=_get_auto_interval_minutes_for_room(result["active"]["room"]),
            lastMessage="Schedule Flight 저장 완료. 직전 활성 카드는 보관 슬롯으로 이동했습니다.",
        )
        return {
            "success": True,
            "active": result["active"],
            "archive": result["archive"],
            "linkedSlot": _read_linked_slot(),
            "savedAt": result["savedAt"],
            "rotated": True,
        }

    slot = target_slot or "active"
    entry = _update_schedule_slot(slot, room)
    linked = _read_linked_slot()
    if slot == linked:
        _update_auto_push_status(
            enabled=True,
            intervalMinutes=_get_auto_interval_minutes_for_room(entry["room"]),
            lastMessage="Schedule Flight 저장 완료. 자동 변경 확인이 자동 적용됩니다.",
        )
    return {
        "success": True,
        "active": _read_schedule_slots().get("active"),
        "archive": _read_schedule_slots().get("archive"),
        "linkedSlot": linked,
        "savedAt": entry.get("savedAt") or _now_kst_iso(),
        "rotated": False,
    }


@router.post("/schedule-slots/link/{slot}")
async def link_schedule_slot(slot: str) -> Dict[str, Any]:
    link_result = _link_schedule_slot(slot)
    slots = _read_schedule_slots()
    entry = _get_schedule_slot_entry(slots, link_result["linkedSlot"])
    room = entry.get("room") if entry else None
    if isinstance(room, dict):
        _update_auto_push_status(
            enabled=True,
            intervalMinutes=_get_auto_interval_minutes_for_room(room),
            lastMessage="초기화면 연동 Schedule Flight를 변경했습니다.",
        )
    return {
        "success": True,
        "active": slots.get("active"),
        "archive": slots.get("archive"),
        "linkedSlot": link_result["linkedSlot"],
        "savedAt": link_result.get("savedAt") or "",
    }


@router.delete("/schedule-slots")
async def clear_all_schedule_slots() -> Dict[str, Any]:
    cleared = _clear_all_schedule_slots()
    _update_auto_push_status(
        enabled=False,
        intervalMinutes=None,
        lastMessage="Schedule Flight 카드를 모두 삭제했습니다.",
    )
    return {
        "success": True,
        "active": cleared.get("active"),
        "archive": cleared.get("archive"),
        "linkedSlot": cleared.get("linkedSlot") or _read_linked_slot(),
        "clearedAll": True,
    }


@router.delete("/schedule-slots/{slot}")
async def delete_schedule_slot(slot: str) -> Dict[str, Any]:
    remaining = _clear_schedule_slot(slot)
    return {
        "success": True,
        "active": remaining.get("active"),
        "archive": remaining.get("archive"),
        "linkedSlot": _read_linked_slot(),
    }


@router.post("/schedule-slots/swap")
async def swap_schedule_slots() -> Dict[str, Any]:
    slots = _swap_schedule_slots()
    linked = _read_linked_slot()
    entry = _get_schedule_slot_entry(slots, linked)
    room = entry.get("room") if entry else None
    if isinstance(room, dict):
        _update_auto_push_status(
            enabled=True,
            intervalMinutes=_get_auto_interval_minutes_for_room(room),
            lastMessage="Schedule Flight 카드 위치를 교체했습니다. 초기화면 연동은 유지됩니다.",
        )
    return {
        "success": True,
        "active": slots.get("active"),
        "archive": slots.get("archive"),
        "linkedSlot": linked,
    }
