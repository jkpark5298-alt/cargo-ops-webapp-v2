"""Daily 업무보고 텍스트 Supabase 저장·조회"""

from __future__ import annotations

from typing import Any, Dict, Optional
import re
import urllib.error
import urllib.parse
import urllib.request

from app.services.flight_common import (
    _now_kst,
    _now_kst_iso,
    _supabase_request,
    _supabase_usage_enabled,
)
def _normalize_daily_report_text_date(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return _now_kst().date().isoformat()

    match = re.match(r"^(\d{4})[-/.](\d{2})[-/.](\d{2})", raw)
    if match:
        year, month, day = match.groups()
        return f"{year}-{month}-{day}"

    digits = re.sub(r"\D", "", raw)
    if len(digits) >= 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"

    return raw


def _daily_report_text_to_supabase_row(report: Dict[str, Any]) -> Dict[str, Any]:
    row = {
        "work_date": _normalize_daily_report_text_date(report.get("workDate")),
        "status": str(report.get("status") or "normal"),
        "author": str(report.get("author") or ""),
        "note": str(report.get("note") or ""),
        "updated_at": _now_kst_iso(),
    }
    if "images" in report:
        row["images"] = report["images"]
    return row


def _daily_report_text_from_supabase_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "workDate": str(row.get("work_date") or ""),
        "status": str(row.get("status") or "normal"),
        "author": str(row.get("author") or ""),
        "note": str(row.get("note") or ""),
        "images": row.get("images") if row.get("images") is not None else [],
        "savedAt": str(row.get("updated_at") or row.get("created_at") or ""),
    }


def _save_daily_report_text_to_supabase(report: Dict[str, Any]) -> Dict[str, Any]:
    if not _supabase_usage_enabled():
        raise RuntimeError("Supabase storage is not configured.")

    row = _daily_report_text_to_supabase_row(report)
    result = _supabase_request(
        "POST",
        "/rest/v1/daily_report_texts?on_conflict=work_date",
        row,
        {
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
    )

    if isinstance(result, list) and result and isinstance(result[0], dict):
        return _daily_report_text_from_supabase_row(result[0])

    return _daily_report_text_from_supabase_row(row)


def _load_daily_report_text_from_supabase(work_date: str) -> Optional[Dict[str, Any]]:
    if not _supabase_usage_enabled():
        raise RuntimeError("Supabase storage is not configured.")

    query = urllib.parse.urlencode(
        {
            "work_date": f"eq.{_normalize_daily_report_text_date(work_date)}",
            "select": "work_date,status,author,note,images,created_at,updated_at",
            "limit": "1",
        }
    )

    rows = _supabase_request("GET", f"/rest/v1/daily_report_texts?{query}")

    if not isinstance(rows, list) or not rows:
        return None

    row = rows[0]
    return _daily_report_text_from_supabase_row(row) if isinstance(row, dict) else None
