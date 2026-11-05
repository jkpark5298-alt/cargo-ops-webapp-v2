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
    report = {
        "workDate": _normalize_daily_report_text_date(payload.workDate),
        "status": str(payload.status or "normal"),
        "author": str(payload.author or ""),
        "note": str(payload.note or ""),
        "images": payload.images if payload.images is not None else [],
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
