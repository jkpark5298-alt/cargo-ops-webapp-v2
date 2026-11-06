"""Monthly Scheduled Flight — 월간 SKD(편명·등록기호·출도착·ETD/ETA) 저장과 인천 API 최신값 반영

- 저장소: Supabase `monthly_schedule_flights`, `monthly_schedule_assignees` (설정이 없으면 /tmp 파일)
- 보관 기간: 현재 달 1일 ~ 다음 달 2일(한국 시각). 그 밖의 기록은 저장·조회 때 지운다.
- 인천 API 는 오늘 기준 약 ±3일만 제공하므로, 오늘~3일 뒤(S조가 다음 날 새벽까지 걸쳐서) 편만 최신값을 반영한다.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import json
import os
import re
import urllib.parse

from app.services.flight_common import _now_kst, _now_kst_iso, _supabase_request, _supabase_usage_enabled

MONTHLY_FILE = Path(os.getenv("MONTHLY_SCHEDULE_FILE", "/tmp/cargo_ops_monthly_schedule.json"))
_FLIGHTS_PATH = "/rest/v1/monthly_schedule_flights"
_ASSIGNEES_PATH = "/rest/v1/monthly_schedule_assignees"
_PAGE_SIZE = 1000
SHIFTS = ("A", "C", "S")
SLOTS = ("A", "B", "C")
API_REFRESH_DAYS_AHEAD = 3

_last_api_refresh: Dict[str, Any] = {"at": None, "result": None}


def _ts() -> str:
    """timestamptz 칸에 넣을 한국 시각(+09:00 포함 — 없으면 UTC 로 해석된다)."""
    return _now_kst_iso() + "+09:00"


# ── 기간 ────────────────────────────────────────────────────────────────
def _retention_window(today: Optional[date] = None) -> Tuple[str, str, str]:
    """(보관 시작일, 보관 종료일, 이번 달 말일). 현재 달 1일 ~ 다음 달 2일."""
    today = today or _now_kst().date()
    start = today.replace(day=1)
    next_first = (start + timedelta(days=32)).replace(day=1)
    end = next_first + timedelta(days=1)
    month_last = next_first - timedelta(days=1)
    return start.isoformat(), end.isoformat(), month_last.isoformat()


def _monthly_title(today: Optional[date] = None) -> str:
    start, _end, month_last = _retention_window(today)
    s = datetime.strptime(start, "%Y-%m-%d")
    e = datetime.strptime(month_last, "%Y-%m-%d")
    return f"Monthly Scheduled Flight('{s:%y}.{s.month}.{s.day}~{e.month}.{e.day})"


# ── 정규화 ──────────────────────────────────────────────────────────────
def _norm_flight(value: Any) -> str:
    text = re.sub(r"[\s\-]+", "", str(value or "")).upper()
    match = re.match(r"^([A-Z]{2})0*(\d{1,4})$", text)
    return f"{match.group(1)}{match.group(2)}" if match else text


def _norm_code(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def _norm_hl(value: Any) -> str:
    text = re.sub(r"[^A-Z0-9]", "", str(value or "").upper())
    if re.fullmatch(r"\d{4,5}", text):
        text = f"HL{text}"
    return text if re.fullmatch(r"HL\d{4,5}", text) else ""


def _norm_datetime(value: Any) -> str:
    """'2026-11-06 23:15', '2026/11/06 23:15', '20261106 2315', '202611062315' → '2026-11-06 23:15'."""
    text = str(value or "").strip().replace("T", " ").replace(".", "-").replace("/", "-")
    match = re.match(r"^(\d{4})-?(\d{1,2})-?(\d{1,2})\s*(\d{1,2}):?(\d{2})", text)
    if not match:
        return ""
    y, mo, d, h, mi = (int(part) for part in match.groups())
    try:
        return datetime(y, mo, d, h, mi).strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return ""


def _record_key(flight_date: str, flight: str, dep: str, arr: str) -> str:
    return f"{flight_date}|{flight}|{dep}|{arr}"


def _normalize_record(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    flight = _norm_flight(raw.get("flight"))
    skd_time = _norm_datetime(raw.get("skdTime") or raw.get("skd_time"))
    if not re.fullmatch(r"KJ\d{2,4}", flight) or not skd_time:
        return None
    flight_date = str(raw.get("flightDate") or raw.get("flight_date") or skd_time[:10]).strip()[:10]
    dep = _norm_code(raw.get("departureCode") or raw.get("departure_code"))
    arr = _norm_code(raw.get("arrivalCode") or raw.get("arrival_code"))
    # KJ 편은 인천(ICN) 출발 또는 도착이므로 한쪽만 있으면 다른 쪽을 채운다
    if dep and dep != "ICN" and not arr:
        arr = "ICN"
    elif arr and arr != "ICN" and not dep:
        dep = "ICN"
    return {
        "record_key": _record_key(flight_date, flight, dep, arr),
        "flight_date": flight_date,
        "flight": flight,
        "departure_code": dep,
        "arrival_code": arr,
        "skd_time": skd_time,
        "registration_no": _norm_hl(raw.get("registrationNo") or raw.get("registration_no")),
        "assignee_slot": str(raw.get("assigneeSlot") or raw.get("assignee_slot") or "").strip().upper()[:1],
        "api_time": str(raw.get("api_time") or ""),
        "api_remark": str(raw.get("api_remark") or ""),
        "api_gate": str(raw.get("api_gate") or ""),
        "api_updated_at": raw.get("api_updated_at"),
        "source": str(raw.get("source") or "manual")[:20],
        "updated_at": _ts(),
    }


def _to_client(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "recordKey": row.get("record_key", ""),
        "flightDate": row.get("flight_date", ""),
        "flight": row.get("flight", ""),
        "departureCode": row.get("departure_code", ""),
        "arrivalCode": row.get("arrival_code", ""),
        "skdTime": row.get("skd_time", ""),
        "registrationNo": row.get("registration_no", ""),
        "assigneeSlot": row.get("assignee_slot", ""),
        "apiTime": row.get("api_time", ""),
        "apiRemark": row.get("api_remark", ""),
        "apiGate": row.get("api_gate", ""),
        "apiUpdatedAt": row.get("api_updated_at") or "",
        "source": row.get("source", ""),
    }


# ── 파일 저장소(Supabase 미설정 시) ─────────────────────────────────────
def _read_file() -> Dict[str, Any]:
    try:
        data = json.loads(MONTHLY_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data.setdefault("flights", {})
            data.setdefault("assignees", {})
            return data
    except Exception:
        pass
    return {"flights": {}, "assignees": {}}


def _write_file(data: Dict[str, Any]) -> None:
    MONTHLY_FILE.parent.mkdir(parents=True, exist_ok=True)
    MONTHLY_FILE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


# ── 조회·저장 ───────────────────────────────────────────────────────────
def _purge_outside_window() -> None:
    start, end, _ = _retention_window()
    if _supabase_usage_enabled():
        for path in (_FLIGHTS_PATH, _ASSIGNEES_PATH):
            _supabase_request("DELETE", f"{path}?or=(flight_date.lt.{start},flight_date.gt.{end})")
        return
    data = _read_file()
    data["flights"] = {k: v for k, v in data["flights"].items() if start <= v.get("flight_date", "") <= end}
    data["assignees"] = {k: v for k, v in data["assignees"].items() if start <= v.get("flight_date", "") <= end}
    _write_file(data)


def _list_flights(start: Optional[str] = None, end: Optional[str] = None) -> List[Dict[str, Any]]:
    w_start, w_end, _ = _retention_window()
    start = max(start or w_start, w_start)
    end = min(end or w_end, w_end)
    if _supabase_usage_enabled():
        rows: List[Dict[str, Any]] = []
        offset = 0
        while True:
            query = urllib.parse.urlencode(
                {"select": "*", "order": "skd_time.asc", "limit": str(_PAGE_SIZE), "offset": str(offset)}
            )
            page = _supabase_request(
                "GET", f"{_FLIGHTS_PATH}?flight_date=gte.{start}&flight_date=lte.{end}&{query}"
            )
            if not isinstance(page, list):
                raise RuntimeError("월간 SKD 저장소 응답 형식이 올바르지 않습니다.")
            rows.extend(r for r in page if isinstance(r, dict))
            if len(page) < _PAGE_SIZE:
                return rows
            offset += _PAGE_SIZE
    data = _read_file()
    rows = [v for v in data["flights"].values() if start <= v.get("flight_date", "") <= end]
    return sorted(rows, key=lambda r: r.get("skd_time", ""))


def _upsert_rows(rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    if _supabase_usage_enabled():
        for i in range(0, len(rows), 200):
            _supabase_request(
                "POST",
                f"{_FLIGHTS_PATH}?on_conflict=record_key",
                rows[i : i + 200],  # type: ignore[arg-type]
                {"Prefer": "resolution=merge-duplicates,return=minimal"},
            )
        return
    data = _read_file()
    for row in rows:
        data["flights"][row["record_key"]] = row
    _write_file(data)


def _delete_keys(keys: List[str]) -> None:
    if not keys:
        return
    if _supabase_usage_enabled():
        for i in range(0, len(keys), 100):
            values = ",".join('"' + k.replace('"', "") + '"' for k in keys[i : i + 100])
            encoded = urllib.parse.quote(f"in.({values})", safe="")
            _supabase_request("DELETE", f"{_FLIGHTS_PATH}?record_key={encoded}")
        return
    data = _read_file()
    for key in keys:
        data["flights"].pop(key, None)
    _write_file(data)


def _save_monthly_flights(raw_records: List[Dict[str, Any]], replace_dates: bool = True, source: str = "manual") -> Dict[str, Any]:
    """월간 SKD 저장. replace_dates 이면 올린 일자의 기존 편 중 이번 목록에 없는 편은 지운다(SKD 재업로드 반영).
    같은 운항이 이미 있으면 담당 지정과 API 최신값은 유지한다."""
    start, end, _ = _retention_window()
    normalized: Dict[str, Dict[str, Any]] = {}
    invalid = 0
    outside = 0
    for raw in raw_records:
        rec = _normalize_record({**raw, "source": raw.get("source") or source})
        if rec is None:
            invalid += 1
            continue
        if not (start <= rec["flight_date"] <= end):
            outside += 1
            continue
        normalized[rec["record_key"]] = rec

    dates = sorted({r["flight_date"] for r in normalized.values()})
    existing = {r["record_key"]: r for r in _list_flights(dates[0], dates[-1])} if dates else {}

    rows: List[Dict[str, Any]] = []
    for key, rec in normalized.items():
        old = existing.get(key) or {}
        merged = dict(rec)
        for field in ("api_time", "api_remark", "api_gate", "api_updated_at"):
            if not merged.get(field) and old.get(field):
                merged[field] = old[field]
        if not merged.get("assignee_slot"):
            merged["assignee_slot"] = old.get("assignee_slot", "")
        if not merged.get("registration_no"):
            merged["registration_no"] = old.get("registration_no", "")
        rows.append(merged)

    removed: List[str] = []
    if replace_dates and dates:
        date_set = set(dates)
        removed = [k for k, r in existing.items() if r.get("flight_date") in date_set and k not in normalized]

    _upsert_rows(rows)
    _delete_keys(removed)
    _purge_outside_window()
    return {
        "saved": len(rows),
        "removed": len(removed),
        "invalid": invalid,
        "outsideWindow": outside,
        "dates": dates,
        "registrations": [
            {
                "date": r["flight_date"],
                "flight": r["flight"],
                "departureCode": r["departure_code"],
                "arrivalCode": r["arrival_code"],
                "registrationNo": r["registration_no"],
                "updatedAt": r["updated_at"],
            }
            for r in rows
            if r.get("registration_no")
        ],
    }


def _delete_monthly_flight(record_key: str) -> None:
    _delete_keys([record_key])


def _set_assignee_slot(record_key: str, slot: str) -> Optional[Dict[str, Any]]:
    slot = str(slot or "").strip().upper()[:1]
    if slot and slot not in SLOTS:
        raise ValueError("담당은 A, B, C 중 하나여야 합니다.")
    flight_date = record_key.split("|")[0]
    for row in _list_flights(flight_date, flight_date):
        if row.get("record_key") == record_key:
            updated = {**row, "assignee_slot": slot, "updated_at": _ts()}
            _upsert_rows([updated])
            return updated
    return None


# ── 담당 A/B/C 이름 ─────────────────────────────────────────────────────
def _list_assignees(start: Optional[str] = None, end: Optional[str] = None) -> List[Dict[str, Any]]:
    w_start, w_end, _ = _retention_window()
    start = max(start or w_start, w_start)
    end = min(end or w_end, w_end)
    if _supabase_usage_enabled():
        rows = _supabase_request("GET", f"{_ASSIGNEES_PATH}?flight_date=gte.{start}&flight_date=lte.{end}&select=*")
        if not isinstance(rows, list):
            raise RuntimeError("담당자 저장소 응답 형식이 올바르지 않습니다.")
        return [r for r in rows if isinstance(r, dict)]
    return [v for v in _read_file()["assignees"].values() if start <= v.get("flight_date", "") <= end]


def _save_assignees(flight_date: str, shift: str, name_a: str, name_b: str, name_c: str, slot_count: int = 2) -> Dict[str, Any]:
    shift = str(shift or "").strip().upper()
    if shift not in SHIFTS:
        raise ValueError("근무조는 A, C, S 중 하나여야 합니다.")
    flight_date = str(flight_date or "").strip()[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", flight_date):
        raise ValueError("일자 형식이 올바르지 않습니다.")
    row = {
        "assignee_key": f"{flight_date}|{shift}",
        "flight_date": flight_date,
        "shift": shift,
        "name_a": str(name_a or "").strip()[:20],
        "name_b": str(name_b or "").strip()[:20],
        "name_c": str(name_c or "").strip()[:20],
        "slot_count": 3 if slot_count == 3 else 2,
        "updated_at": _ts(),
    }
    if _supabase_usage_enabled():
        def _post(payload: Dict[str, Any]) -> None:
            _supabase_request(
                "POST",
                f"{_ASSIGNEES_PATH}?on_conflict=assignee_key",
                payload,
                {"Prefer": "resolution=merge-duplicates,return=minimal"},
            )

        try:
            _post(row)
        except Exception:
            # slot_count 열을 아직 만들지 않은 경우(SQL 미실행): 이름만 저장한다
            _post({k: v for k, v in row.items() if k != "slot_count"})
    else:
        data = _read_file()
        data["assignees"][row["assignee_key"]] = row
        _write_file(data)
    return row


def _assignee_to_client(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "flightDate": row.get("flight_date", ""),
        "shift": row.get("shift", ""),
        "nameA": row.get("name_a", ""),
        "nameB": row.get("name_b", ""),
        "nameC": row.get("name_c", ""),
        "slotCount": 3 if int(row.get("slot_count") or 2) == 3 else 2,
    }


# ── 인천 API 최신값 반영 ────────────────────────────────────────────────
def _api_row_time(row: Dict[str, Any]) -> str:
    return _norm_datetime(row.get("formattedEstimatedTime") or row.get("estimatedDateTime") or row.get("formattedScheduleTime") or row.get("scheduleDateTime"))


def _api_row_schedule(row: Dict[str, Any]) -> str:
    return _norm_datetime(row.get("formattedScheduleTime") or row.get("scheduleDateTime"))


def _match_api_row(rec: Dict[str, Any], candidates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """같은 편명·노선(있으면) 중 SKD 시각과 가장 가까운 API 행."""
    same = [c for c in candidates if _norm_flight(c.get("flightNo") or c.get("flightId")) == rec["flight"]]
    if rec.get("departure_code") or rec.get("arrival_code"):
        routed = [
            c for c in same
            if (not rec.get("departure_code") or _norm_code(c.get("departureCode")) == rec["departure_code"])
            and (not rec.get("arrival_code") or _norm_code(c.get("arrivalCode")) == rec["arrival_code"])
        ]
        same = routed or same
    if not same:
        return None
    skd = datetime.strptime(rec["skd_time"], "%Y-%m-%d %H:%M")

    def distance(c: Dict[str, Any]) -> float:
        value = _api_row_schedule(c) or _api_row_time(c)
        try:
            return abs((datetime.strptime(value, "%Y-%m-%d %H:%M") - skd).total_seconds())
        except ValueError:
            return float("inf")

    best = min(same, key=distance)
    return best if distance(best) <= 12 * 3600 else None


async def _refresh_monthly_api(fetch_all_kj=None, today: Optional[date] = None) -> Dict[str, Any]:
    """오늘 ~ 3일 뒤 편의 변경시각·상태·게이트를 인천 API 로 갱신한다."""
    if fetch_all_kj is None:
        from app.services.incheon_api import get_all_kj_flight_data as fetch_all_kj  # 늦은 import(순환 방지)
    today = today or _now_kst().date()
    days = [(today + timedelta(days=i)).isoformat() for i in range(API_REFRESH_DAYS_AHEAD + 1)]
    stored = _list_flights(days[0], days[-1])
    if not stored:
        return {"checked": 0, "updated": 0, "days": days}

    api_rows: List[Dict[str, Any]] = []
    for day in days:
        try:
            api_rows.extend(await fetch_all_kj(start_date=day, end_date=day))
        except Exception:
            continue

    now_iso = _ts()
    changed: List[Dict[str, Any]] = []
    replaced_keys: List[str] = []
    for rec in stored:
        match = _match_api_row(rec, api_rows)
        if not match:
            continue
        # SKD 에 출발지/도착지가 비어 있으면(예: 인천 출발편의 도착 공항) 인천 API 의 공항 코드로 채운다.
        # 운항 키에 노선이 들어 있으므로 새 키로 옮기고 기존 키는 지운다.
        fill_dep = rec.get("departure_code") or _norm_code(match.get("departureCode"))
        fill_arr = rec.get("arrival_code") or _norm_code(match.get("arrivalCode"))
        if (fill_dep, fill_arr) != (rec.get("departure_code", ""), rec.get("arrival_code", "")):
            new_key = _record_key(rec["flight_date"], rec["flight"], fill_dep, fill_arr)
            replaced_keys.append(rec["record_key"])
            rec = {**rec, "departure_code": fill_dep, "arrival_code": fill_arr, "record_key": new_key}
        gate = str(match.get("gatenumber") or "").strip()
        new_values = {
            "api_time": _api_row_time(match),
            "api_remark": str(match.get("remark") or "").strip(),
            "api_gate": "" if gate in ("-", "") else gate,
        }
        if any(rec.get(k, "") != v for k, v in new_values.items()) or not rec.get("api_updated_at"):
            changed.append({**rec, **new_values, "api_updated_at": now_iso})
        else:
            changed.append({**rec, "api_updated_at": now_iso})
    _upsert_rows(changed)
    new_keys = {r["record_key"] for r in changed}
    _delete_keys([k for k in replaced_keys if k not in new_keys])
    result = {"checked": len(stored), "updated": len(changed), "days": days, "apiRows": len(api_rows)}
    _last_api_refresh.update({"at": _now_kst(), "result": result})
    return result


async def _maybe_refresh_monthly_api(min_interval_minutes: int = 10, fetch_all_kj=None) -> Optional[Dict[str, Any]]:
    """마지막 갱신 후 min_interval_minutes 가 지났을 때만 갱신(인천 API 호출 절약)."""
    last = _last_api_refresh.get("at")
    if last is not None and (_now_kst() - last) < timedelta(minutes=min_interval_minutes):
        return None
    return await _refresh_monthly_api(fetch_all_kj=fetch_all_kj)


def _last_api_refresh_iso() -> str:
    last = _last_api_refresh.get("at")
    return last.isoformat(timespec="seconds") if last else ""
