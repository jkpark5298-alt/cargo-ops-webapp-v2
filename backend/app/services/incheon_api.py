import copy
import os
import time
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple


class IncheonApiQuotaExceededError(RuntimeError):
    pass


SERVICE_KEY = os.getenv("INCHEON_API_SERVICE_KEY", "").strip()

BASE_URL = "https://apis.data.go.kr/B551177/StatusOfCargoFlightsDeOdp"
DEPARTURES_PATH = "/getCargoDeparturesDeOdp"
ARRIVALS_PATH = "/getCargoArrivalsDeOdp"

CACHE_TTL_SECONDS = 60
_flight_cache: Dict[Tuple[str, str, str], Tuple[float, List[Dict[str, Any]]]] = {}


def _text(node: ET.Element, tag: str) -> str:
    found = node.find(tag)
    if found is None or found.text is None:
        return ""
    return found.text.strip()


def _format_time(value: str) -> str:
    if not value:
        return ""

    digits = "".join(ch for ch in value if ch.isdigit())
    if len(digits) != 12:
        return value

    return f"{digits[:4]}/{digits[4:6]}/{digits[6:8]} {digits[8:10]}:{digits[10:12]}"


def _get_kst_now_str() -> str:
    return (datetime.utcnow() + timedelta(hours=9)).strftime("%Y%m%d%H%M")


def _find_result_code(root: ET.Element) -> str:
    candidates = [
        "./header/resultCode",
        "./response/header/resultCode",
        ".//header/resultCode",
    ]
    for path in candidates:
        value = root.findtext(path, default="").strip()
        if value:
            return value
    return ""


def _find_items(root: ET.Element) -> List[ET.Element]:
    candidates = [
        "./body/items/item",
        "./response/body/items/item",
        ".//body/items/item",
    ]

    for path in candidates:
        items = root.findall(path)
        if items:
            return items

    return []


def _parse_xml_items(xml_text: str, source_type: str) -> List[Dict[str, Any]]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []

    result_code = _find_result_code(root)
    items = _find_items(root)

    if result_code not in {"00", "0", ""}:
        return []

    rows: List[Dict[str, Any]] = []
    now_str = _get_kst_now_str()

    for item in items:
        airline = _text(item, "airline")
        airport_name = _text(item, "airport")
        airport_code = _text(item, "airportCode")
        codeshare = _text(item, "codeshare")
        estimated = _text(item, "estimatedDateTime")
        flight_id = _text(item, "flightId")
        gate = _text(item, "gatenumber")
        master = _text(item, "masterflightid")
        remark = _text(item, "remark")
        schedule = _text(item, "scheduleDateTime")
        terminal = _text(item, "terminalid")
        type_of_flight = _text(item, "typeOfFlight")
        fid = _text(item, "fid")

        is_departure = source_type == "departure"

        departure_code = "ICN" if is_departure else airport_code
        departure_name = "인천공항" if is_departure else airport_name

        arrival_code = airport_code if is_departure else "ICN"
        arrival_name = airport_name if is_departure else "인천공항"

        status_text = ""
        canceled = "결항" in remark
        gate_changed = (
            "게이트변경" in remark
            or "게이트 변경" in remark
            or "GATE CHANGE" in remark.upper()
            or "GATE CHANGED" in remark.upper()
        )
        delay = bool(schedule and estimated and schedule != estimated and not canceled)

        if estimated and estimated <= now_str:
          status_text = "출발" if is_departure else "도착"

        rows.append(
            {
                "airline": airline,
                "flightId": flight_id,
                "flightNo": flight_id,
                "departureCode": departure_code,
                "departureName": departure_name,
                "arrivalCode": arrival_code,
                "arrivalName": arrival_name,
                "scheduleDateTime": schedule,
                "estimatedDateTime": estimated,
                "formattedScheduleTime": _format_time(schedule),
                "formattedEstimatedTime": _format_time(estimated),
                "gatenumber": gate or "-",
                "terminalid": terminal or "-",
                "masterflightid": master or "-",
                "codeshare": codeshare or "-",
                "typeOfFlight": type_of_flight,
                "remark": remark,
                "status": status_text,
                "delay": delay,
                "canceled": canceled,
                "gateChanged": gate_changed,
                "sourceType": source_type,
                "fid": fid,
            }
        )

    return rows


def _is_quota_exceeded_response(status_code: int, body_text: str) -> bool:
    lowered = (body_text or "").lower()
    return status_code == 429 or "quota exceeded" in lowered or "api token quota exceeded" in lowered


async def _fetch_one_day(
    client: httpx.AsyncClient,
    flight_no: str,
    search_day: str,
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []

    common_params = {
        "serviceKey": SERVICE_KEY,
        "pageNo": 1,
        "numOfRows": 100,
        "searchday": search_day,
        "from_time": "0000",
        "to_time": "2400",
        "flight_id": flight_no,
        "inqtimechcd": "E",
        "lang": "K",
        "type": "xml",
    }

    for path, source_type in [
        (DEPARTURES_PATH, "departure"),
        (ARRIVALS_PATH, "arrival"),
    ]:
        url = f"{BASE_URL}{path}"

        try:
            res = await client.get(url, params=common_params)
            body_text = res.text

            if _is_quota_exceeded_response(res.status_code, body_text):
                raise IncheonApiQuotaExceededError("한도 초과로 조회 불가")

            if res.status_code != 200:
                continue

            parsed = _parse_xml_items(body_text, source_type=source_type)
            results.extend(parsed)

        except IncheonApiQuotaExceededError:
            raise
        except Exception:
            continue

    return results


def _date_range(start_date: str, end_date: str) -> List[str]:
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()

    if end < start:
        start, end = end, start

    days: List[str] = []
    current = start
    while current <= end:
        days.append(current.strftime("%Y%m%d"))
        current += timedelta(days=1)

    return days


def _get_cached_flight_data(
    flight_no: str,
    start_date: str,
    end_date: str,
) -> Optional[List[Dict[str, Any]]]:
    key = (flight_no, start_date, end_date)
    now = time.time()

    cached = _flight_cache.get(key)
    if not cached:
        return None

    expires_at, data = cached
    if now > expires_at:
        _flight_cache.pop(key, None)
        return None

    return copy.deepcopy(data)


def _set_cached_flight_data(
    flight_no: str,
    start_date: str,
    end_date: str,
    rows: List[Dict[str, Any]],
) -> None:
    key = (flight_no, start_date, end_date)
    _flight_cache[key] = (time.time() + CACHE_TTL_SECONDS, copy.deepcopy(rows))


async def get_flight_data(
    flight_no: str,
    start_date: str,
    end_date: str,
) -> List[Dict[str, Any]]:
    if not SERVICE_KEY:
        raise ValueError("INCHEON_API_SERVICE_KEY 환경변수가 비어 있습니다.")

    cached = _get_cached_flight_data(flight_no, start_date, end_date)
    if cached is not None:
        return cached

    day_list = _date_range(start_date, end_date)
    all_rows: List[Dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=20.0) as client:
        for day in day_list:
            rows = await _fetch_one_day(client, flight_no, day)
            all_rows.extend(rows)

    deduped: List[Dict[str, Any]] = []
    seen = set()

    for row in all_rows:
        key = (
            row.get("flightId", ""),
            row.get("scheduleDateTime", ""),
            row.get("estimatedDateTime", ""),
            row.get("departureCode", ""),
            row.get("arrivalCode", ""),
            row.get("gatenumber", ""),
            row.get("terminalid", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)

    deduped.sort(
        key=lambda x: (
            x.get("scheduleDateTime", ""),
            x.get("flightId", ""),
        )
    )

    _set_cached_flight_data(flight_no, start_date, end_date, deduped)
    return copy.deepcopy(deduped)


async def get_all_kj_flight_data(
    start_date: str,
    end_date: str,
) -> List[Dict[str, Any]]:
    if not SERVICE_KEY:
        raise ValueError("INCHEON_API_SERVICE_KEY 환경변수가 비어 있습니다.")

    cache_flight_no = "__ALL_KJ__"
    cached = _get_cached_flight_data(cache_flight_no, start_date, end_date)
    if cached is not None:
        return cached

    day_list = _date_range(start_date, end_date)
    all_rows: List[Dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=20.0) as client:
        for day in day_list:
            rows = await _fetch_one_day(client, "", day)
            all_rows.extend(rows)

    filtered_kj_rows = [
        row
        for row in all_rows
        if str(row.get("flightId") or row.get("flightNo") or "").upper().startswith("KJ")
    ]

    deduped: List[Dict[str, Any]] = []
    seen = set()

    for row in filtered_kj_rows:
        key = (
            row.get("flightId", ""),
            row.get("scheduleDateTime", ""),
            row.get("estimatedDateTime", ""),
            row.get("departureCode", ""),
            row.get("arrivalCode", ""),
            row.get("gatenumber", ""),
            row.get("terminalid", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)

    deduped.sort(
        key=lambda x: (
            x.get("scheduleDateTime", ""),
            x.get("flightId", ""),
        )
    )

    _set_cached_flight_data(cache_flight_no, start_date, end_date, deduped)
    return copy.deepcopy(deduped)
