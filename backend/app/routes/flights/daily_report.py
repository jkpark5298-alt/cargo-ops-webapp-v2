"""Daily 업무보고 텍스트 API"""

from __future__ import annotations

from fastapi import APIRouter

from typing import Any, Dict

from app.routes.flights.models import DailyReportTextSaveRequest
from app.services.daily_report_store import (
    _load_daily_report_text_from_supabase,
    _normalize_daily_report_text_date,
    _save_daily_report_text_to_supabase,
)
from app.services.flight_common import _now_kst_iso, _supabase_usage_enabled
router = APIRouter()


@router.get("/daily-report-text")
async def get_daily_report_text(workDate: str) -> Dict[str, Any]:
    work_date = _normalize_daily_report_text_date(workDate)

    try:
        report = _load_daily_report_text_from_supabase(work_date)
    except Exception as exc:
        return {
            "success": False,
            "configured": _supabase_usage_enabled(),
            "message": str(exc),
            "report": None,
        }

    return {
        "success": True,
        "configured": _supabase_usage_enabled(),
        "report": report,
    }


@router.post("/daily-report-text")
async def save_daily_report_text(payload: DailyReportTextSaveRequest) -> Dict[str, Any]:
    work_date = _normalize_daily_report_text_date(payload.workDate)

    # 보내지 않은 항목(None)은 서버의 기존 값을 유지한다.
    existing: Dict[str, Any] = {}
    if any(v is None for v in (payload.status, payload.author, payload.note, payload.images)):
        try:
            existing = _load_daily_report_text_from_supabase(work_date) or {}
        except Exception:
            existing = {}

    def pick(value: Any, key: str, default: Any) -> Any:
        return value if value is not None else existing.get(key, default)

    report = {
        "workDate": work_date,
        "status": str(pick(payload.status, "status", "normal") or "normal"),
        "author": str(pick(payload.author, "author", "") or ""),
        "note": str(pick(payload.note, "note", "") or ""),
        "images": pick(payload.images, "images", []),
        "savedAt": payload.savedAt or _now_kst_iso(),
    }

    try:
        saved_report = _save_daily_report_text_to_supabase(report)
    except Exception as exc:
        return {
            "success": False,
            "configured": _supabase_usage_enabled(),
            "message": str(exc),
            "report": None,
        }

    return {
        "success": True,
        "configured": _supabase_usage_enabled(),
        "report": saved_report,
        "savedAt": saved_report.get("savedAt") or _now_kst_iso(),
    }
