import asyncio
import math
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import unquote

import httpx

KST = timezone(timedelta(hours=9))

# 외부 날씨 API는 Render(해외 리전)에서 느릴 수 있어 넉넉한 제한 시간과 재시도를 사용한다.
HTTP_TIMEOUT_SECONDS = float(os.getenv("WEATHER_HTTP_TIMEOUT_SECONDS", "8"))
HTTP_RETRIES = int(os.getenv("WEATHER_HTTP_RETRIES", "1"))
METAR_STALE_MINUTES = 180


async def _get(client: httpx.AsyncClient, url: str, params: dict[str, Any] | None = None) -> httpx.Response:
    """GET + 상태 코드 검사, 실패하면 HTTP_RETRIES 만큼 다시 시도."""
    last: Exception | None = None
    for attempt in range(HTTP_RETRIES + 1):
        try:
            res = await client.get(url, params=params, timeout=HTTP_TIMEOUT_SECONDS)
            res.raise_for_status()
            return res
        except Exception as exc:  # noqa: BLE001 - 어떤 실패든 재시도 후 호출한 쪽에서 기록
            last = exc
            if attempt < HTTP_RETRIES:
                await asyncio.sleep(0.4)
    assert last is not None
    raise last


def describe_error(source: str, exc: BaseException) -> str:
    """오류 내용이 비어 있는 예외(시간 초과 등)도 종류가 보이도록 문자열로 만든다."""
    detail = str(exc).strip()
    return f"{source}: {type(exc).__name__}" + (f": {detail}" if detail else "")


# Incheon Jung-gu Unseo-dong approximate coordinates.
UNSEO_DONG_LAT = 37.4923
UNSEO_DONG_LON = 126.4930
AIRKOREA_STATIONS = [
    os.getenv("AIRKOREA_STATION_NAME", "운서"),
    "영종",
    "송해",
]

def _clean_key(value: str | None) -> str:
    if not value:
        return ""
    # data.go.kr keys are often copied URL-encoded. Decode once to avoid double encoding.
    return unquote(value.strip())


def _to_kma_grid(lat: float, lon: float) -> tuple[int, int]:
    """Convert WGS84 lat/lon to KMA DFS grid coordinates."""
    re = 6371.00877
    grid = 5.0
    slat1 = 30.0
    slat2 = 60.0
    olon = 126.0
    olat = 38.0
    xo = 43.0
    yo = 136.0

    degrad = math.pi / 180.0
    re_grid = re / grid
    slat1_rad = slat1 * degrad
    slat2_rad = slat2 * degrad
    olon_rad = olon * degrad
    olat_rad = olat * degrad

    sn = math.tan(math.pi * 0.25 + slat2_rad * 0.5) / math.tan(
        math.pi * 0.25 + slat1_rad * 0.5
    )
    sn = math.log(math.cos(slat1_rad) / math.cos(slat2_rad)) / math.log(sn)
    sf = math.tan(math.pi * 0.25 + slat1_rad * 0.5)
    sf = (sf**sn) * math.cos(slat1_rad) / sn
    ro = math.tan(math.pi * 0.25 + olat_rad * 0.5)
    ro = re_grid * sf / (ro**sn)

    ra = math.tan(math.pi * 0.25 + lat * degrad * 0.5)
    ra = re_grid * sf / (ra**sn)
    theta = lon * degrad - olon_rad
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn

    nx = int(math.floor(ra * math.sin(theta) + xo + 0.5))
    ny = int(math.floor(ro - ra * math.cos(theta) + yo + 0.5))
    return nx, ny


def _latest_ultra_base(now: datetime | None = None) -> tuple[str, str]:
    """KMA ultra short APIs are safest after about 45 minutes past each hour."""
    now = now or datetime.now(KST)
    base = now - timedelta(minutes=45)
    return base.strftime("%Y%m%d"), base.strftime("%H00")


def _format_base_time(base_date: str, base_time: str) -> str:
    try:
        return f"{base_time[:2]}:{base_time[2:4]}"
    except Exception:
        return "-"


def _weather_condition(pty: str | None, sky: str | None) -> tuple[str, str]:
    pty_map = {
        "0": None,
        "1": ("비", "🌧️"),
        "2": ("비/눈", "🌨️"),
        "3": ("눈", "❄️"),
        "5": ("빗방울", "🌦️"),
        "6": ("빗방울/눈날림", "🌨️"),
        "7": ("눈날림", "❄️"),
    }
    if pty and pty in pty_map and pty_map[pty]:
        return pty_map[pty]  # type: ignore[return-value]

    sky_map = {
        "1": ("맑음", "☀️"),
        "3": ("구름많음", "⛅"),
        "4": ("흐림", "☁️"),
    }
    return sky_map.get(str(sky or "1"), ("맑음", "☀️"))


def _build_hourly_forecast(items: list[dict[str, Any]]) -> list[dict[str, str]]:
    by_time: dict[tuple[str, str], dict[str, Any]] = {}

    for item in items:
        fcst_date = str(item.get("fcstDate") or "")
        fcst_time = str(item.get("fcstTime") or "")
        category = str(item.get("category") or "")
        value = item.get("fcstValue")

        if not fcst_date or not fcst_time:
            continue

        key = (fcst_date, fcst_time)
        if key not in by_time:
            by_time[key] = {}
        by_time[key][category] = value

    hourly: list[dict[str, str]] = []

    for (fcst_date, fcst_time), values in sorted(by_time.items()):
        if "T1H" not in values and "SKY" not in values and "PTY" not in values:
            continue

        condition, icon = _weather_condition(
            str(values.get("PTY")) if values.get("PTY") is not None else None,
            str(values.get("SKY")) if values.get("SKY") is not None else None,
        )
        temperature = str(values.get("T1H") or "-")
        label = f"{fcst_time[:2]}시"

        hourly.append(
            {
                "time": label,
                "condition": condition,
                "temperature": temperature,
                "icon": icon,
            }
        )

        if len(hourly) >= 4:
            break

    return hourly


def _grade_text(value: Any) -> str:
    grade_map = {
        "1": "좋음",
        "2": "보통",
        "3": "나쁨",
        "4": "매우나쁨",
    }
    return grade_map.get(str(value or ""), "-")


async def _fetch_kma_weather(client: httpx.AsyncClient) -> dict[str, Any]:
    key = _clean_key(os.getenv("WEATHER_API_KEY"))
    if not key:
        raise RuntimeError("WEATHER_API_KEY is empty")

    nx = int(os.getenv("WEATHER_NX") or 0)
    ny = int(os.getenv("WEATHER_NY") or 0)
    if nx <= 0 or ny <= 0:
        nx, ny = _to_kma_grid(UNSEO_DONG_LAT, UNSEO_DONG_LON)

    base_date, base_time = _latest_ultra_base()
    common_params = {
        "serviceKey": key,
        "pageNo": "1",
        "numOfRows": "1000",
        "dataType": "JSON",
        "base_date": base_date,
        "base_time": base_time,
        "nx": str(nx),
        "ny": str(ny),
    }

    ncst_url = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst"
    fcst_url = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst"

    async def fetch_ncst():
        res = await _get(client, ncst_url, common_params)
        js = res.json()
        return js.get("response", {}).get("body", {}).get("items", {}).get("item", [])

    async def fetch_fcst():
        res = await _get(client, fcst_url, common_params)
        js = res.json()
        return js.get("response", {}).get("body", {}).get("items", {}).get("item", [])

    ncst_items, fcst_items = await asyncio.gather(fetch_ncst(), fetch_fcst())

    current = {item.get("category"): item.get("obsrValue") for item in ncst_items}

    forecast: dict[str, Any] = {}
    for item in fcst_items:
        category = item.get("category")
        if category in {"SKY", "PTY", "T1H"} and category not in forecast:
            forecast[category] = item.get("fcstValue")

    hourly = _build_hourly_forecast(fcst_items)
    temperature = current.get("T1H") or forecast.get("T1H") or "-"
    humidity = current.get("REH") or "-"
    wind_speed = current.get("WSD") or "-"
    pty = current.get("PTY") or forecast.get("PTY")
    sky = forecast.get("SKY")
    condition, icon = _weather_condition(str(pty) if pty is not None else None, str(sky) if sky is not None else None)

    return {
        "temperature": str(temperature),
        "condition": condition,
        "humidity": str(humidity),
        "windSpeed": str(wind_speed),
        "baseTime": _format_base_time(base_date, base_time),
        "icon": icon,
        "hourly": hourly,
    }


async def _fetch_airkorea(client: httpx.AsyncClient) -> dict[str, Any]:
    key = _clean_key(os.getenv("AIRKOREA_API_KEY"))
    if not key:
        raise RuntimeError("AIRKOREA_API_KEY is empty")

    url = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty"

    async def fetch_station(station: str) -> dict[str, Any]:
        params = {
            "serviceKey": key,
            "returnType": "json",
            "numOfRows": "1",
            "pageNo": "1",
            "stationName": station,
            "dataTerm": "DAILY",
            "ver": "1.3",
        }
        res = await _get(client, url, params)
        data = res.json()
        items = data.get("response", {}).get("body", {}).get("items", [])
        if not items:
            raise RuntimeError(f"No data for station {station}")
        item = items[0]
        return {
            "pm10Grade": _grade_text(item.get("pm10Grade")),
            "pm25Grade": _grade_text(item.get("pm25Grade")),
            "airStation": station,
            "airBaseTime": item.get("dataTime"),
        }

    stations = [s for s in AIRKOREA_STATIONS if s]
    tasks = [fetch_station(station) for station in stations]

    last_error: Exception = RuntimeError("AirKorea station data not found")
    for future in asyncio.as_completed(tasks):
        try:
            result = await future
            return result
        except Exception as exc:
            last_error = exc

    raise last_error


def get_wind_direction_text(deg: float) -> str:
    directions = ["북", "북북동", "북동", "동북동", "동", "동남동", "남동", "남남동", "남", "남남서", "남서", "서남서", "서", "서북서", "북서", "북북서"]
    idx = int((deg + 11.25) / 22.5) % 16
    return directions[idx]


def calculate_humidity(temp: float, dew_point: float) -> float:
    a = 17.625
    b = 243.04
    alpha_dew = (a * dew_point) / (b + dew_point)
    alpha_temp = (a * temp) / (b + temp)
    rh = 100.0 * math.exp(alpha_dew - alpha_temp)
    return min(100.0, max(0.0, round(rh, 1)))


def parse_metar_weather(metar_text: str) -> tuple[str, str]:
    weather_desc = []
    
    if "TSRA" in metar_text:
        weather_desc.append("뇌우 동반 비")
    elif "TS" in metar_text:
        weather_desc.append("뇌우")
        
    if "SHRA" in metar_text:
        weather_desc.append("소나기 비")
    elif "-RA" in metar_text:
        weather_desc.append("약한 비")
    elif "+RA" in metar_text:
        weather_desc.append("강한 비")
    elif "RA" in metar_text and "뇌우" not in "".join(weather_desc):
        weather_desc.append("비")
        
    if "-DZ" in metar_text:
        weather_desc.append("약한 이슬비")
    elif "DZ" in metar_text:
        weather_desc.append("이슬비")
        
    if "-SN" in metar_text:
        weather_desc.append("약한 눈")
    elif "+SN" in metar_text:
        weather_desc.append("강한 눈")
    elif "SN" in metar_text:
        weather_desc.append("눈")
        
    if "FG" in metar_text:
        weather_desc.append("안개 (시정장애)")
    elif "BR" in metar_text:
        weather_desc.append("박무 (옅은 안개)")
    elif "HZ" in metar_text:
        weather_desc.append("연무")

    if not weather_desc:
        if "CAVOK" in metar_text:
            return "맑음 (시정 양호)", "☀️"
        if "OVC" in metar_text:
            return "흐림", "☁️"
        if "BKN" in metar_text:
            return "구름많음", "⛅"
        if "SCT" in metar_text or "FEW" in metar_text:
            return "구름조금", "⛅"
        return "맑음", "☀️"
        
    desc = ", ".join(weather_desc)
    icon = "☀️"
    if "비" in desc or "소나기" in desc or "이슬비" in desc:
        icon = "🌧️"
    elif "눈" in desc:
        icon = "❄️"
    elif "안개" in desc or "박무" in desc or "연무" in desc:
        icon = "🌫️"
    elif "뇌우" in desc:
        icon = "⚡"
        
    return desc, icon


def parse_metar_wind(metar_text: str) -> dict[str, Any]:
    wind_match = re.search(r"\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)\b", metar_text)
    if not wind_match:
        return {}
        
    dir_raw = wind_match.group(1)
    speed_raw = wind_match.group(2)
    gust_raw = wind_match.group(3)
    unit = wind_match.group(4)
    
    speed = float(speed_raw)
    gust = float(gust_raw) if gust_raw else None
    
    if unit == "KT":
        speed_ms = round(speed * 0.51444, 1)
        gust_ms = round(gust * 0.51444, 1) if gust is not None else None
    else:
        speed_ms = speed
        gust_ms = gust
        
    if dir_raw == "VRB":
        direction_deg = None
        direction_text = "변동성"
    elif dir_raw == "000" and speed == 0:
        direction_deg = 0
        direction_text = "정온 (Calm)"
    else:
        direction_deg = int(dir_raw)
        direction_text = get_wind_direction_text(direction_deg)
        
    return {
        "windSpeedKnots": speed,
        "windSpeed": str(speed_ms),
        "windGustKnots": gust,
        "windGust": str(gust_ms) if gust_ms is not None else None,
        "windDirection": direction_deg,
        "windDirectionText": direction_text,
    }


def parse_metar_temp_humidity(metar_text: str) -> dict[str, Any]:
    temp_match = re.search(r"\b(M?\d{2})\/(M?\d{2})\b", metar_text)
    if not temp_match:
        return {}
        
    def to_temp(val: str) -> float:
        if val.startswith("M"):
            return -float(val[1:])
        return float(val)
        
    temp = to_temp(temp_match.group(1))
    dew = to_temp(temp_match.group(2))
    
    humidity = calculate_humidity(temp, dew)
    
    return {
        "temperature": str(round(temp, 1)),
        "dewPoint": str(round(dew, 1)),
        "humidity": str(int(humidity)),
    }


def parse_metar_visibility(metar_text: str) -> str:
    if "CAVOK" in metar_text:
        return "10km 이상 (CAVOK)"
        
    vis_match = re.search(r"\b(\d{4})[A-Z]*\b", metar_text)
    if vis_match:
        meters = int(vis_match.group(1))
        if meters == 9999:
            return "10km 이상"
        elif meters >= 1000:
            return f"{round(meters / 1000, 1)}km"
        else:
            return f"{meters}m"
            
    vis_sm_match = re.search(r"\b(\d+)\bSM", metar_text)
    if vis_sm_match:
        miles = int(vis_sm_match.group(1))
        return f"{round(miles * 1.609, 1)}km"
        
    return "-"


def _metar_observed_kst(metar_text: str, now_utc: datetime | None = None) -> datetime | None:
    """METAR의 관측 시각(일·시·분, UTC)을 KST 시각으로 바꾼다. (예: 050730Z → 11/05 16:30 KST)"""
    match = re.search(r"\b(\d{2})(\d{2})(\d{2})Z\b", metar_text)
    if not match:
        return None

    day, hour, minute = (int(value) for value in match.groups())
    now_utc = now_utc or datetime.now(timezone.utc)
    year, month = now_utc.year, now_utc.month
    # 월말에 지난달 기록을 읽는 경우(관측 일이 오늘보다 크면 지난달로 본다)
    if day > now_utc.day + 1:
        month -= 1
        if month == 0:
            month, year = 12, year - 1

    try:
        observed = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
    except ValueError:
        return None
    return observed.astimezone(KST)


def calculate_feels_like(temp_c: Any, humidity_pct: Any, wind_ms: Any) -> str | None:
    """체감온도. 기온 10℃ 이하·풍속 1.3m/s 이상이면 기상청 체감온도(윈드칠), 그 외는 겉보기 온도(수증기압·풍속 반영).

    값을 계산할 수 없으면 None (화면에는 '-'로 표시)."""
    try:
        temp = float(temp_c)
    except (TypeError, ValueError):
        return None

    try:
        wind = float(wind_ms)
    except (TypeError, ValueError):
        wind = None
    try:
        humidity = float(humidity_pct)
    except (TypeError, ValueError):
        humidity = None

    if wind is not None and temp <= 10 and wind >= 1.3:
        v = wind * 3.6
        value = 13.12 + 0.6215 * temp - 11.37 * (v**0.16) + 0.3965 * temp * (v**0.16)
        return str(round(value, 1))

    if humidity is not None and wind is not None:
        vapor = humidity / 100.0 * 6.105 * math.exp(17.27 * temp / (237.7 + temp))
        value = temp + 0.33 * vapor - 0.70 * wind - 4.00
        return str(round(value, 1))

    return None


METAR_SOURCES = (
    ("NOAA", "https://tgftp.nws.noaa.gov/data/observations/metar/stations/RKSI.TXT"),
    ("aviationweather.gov", "https://aviationweather.gov/api/data/metar?ids=RKSI&format=raw"),
)


def _extract_metar_line(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for line in lines:
        if re.search(r"\b\d{6}Z\b", line):
            return line
    raise ValueError("Invalid METAR format")


async def _fetch_rksi_metar(client: httpx.AsyncClient) -> dict[str, Any]:
    """인천공항(RKSI) METAR. 첫 번째 출처가 실패하면 다음 출처로 대체한다."""
    failures: list[str] = []
    metar_line = ""
    used_source = ""
    for name, url in METAR_SOURCES:
        try:
            res = await _get(client, url)
            metar_line = _extract_metar_line(res.text)
            used_source = name
            break
        except Exception as exc:  # noqa: BLE001
            failures.append(describe_error(name, exc))

    if not metar_line:
        raise RuntimeError("; ".join(failures))

    wind = parse_metar_wind(metar_line)
    temp_hum = parse_metar_temp_humidity(metar_line)
    visibility = parse_metar_visibility(metar_line)
    condition, icon = parse_metar_weather(metar_line)
    observed = _metar_observed_kst(metar_line)

    result: dict[str, Any] = {
        "location": "인천공항 활주로 (RKSI)",
        "condition": condition,
        "icon": icon,
        "visibility": visibility,
        "metarText": metar_line,
        "metarSource": used_source,
    }
    if observed is not None:
        result["baseTime"] = observed.strftime("%H:%M")
        result["observedAt"] = observed.isoformat()
        age = (datetime.now(KST) - observed).total_seconds() / 60
        result["ageMinutes"] = max(0, int(age))
        result["stale"] = age > METAR_STALE_MINUTES
    result.update(wind)
    result.update(temp_hum)
    return result


async def get_current_weather() -> dict[str, Any]:
    """현재 날씨. 가져오지 못한 항목은 비워 두고(예시값을 채우지 않음) errors에 이유를 남긴다."""
    result: dict[str, Any] = {
        "success": False,
        "source": "unavailable",
        "location": "인천시 중구 운서동",
        "fetchedAt": datetime.now(KST).isoformat(timespec="seconds"),
    }
    errors: list[str] = []
    missing: list[str] = []

    async with httpx.AsyncClient() as client:
        metar_res, kma_res, air_res = await asyncio.gather(
            _fetch_rksi_metar(client),
            _fetch_kma_weather(client),
            _fetch_airkorea(client),
            return_exceptions=True,
        )

    if isinstance(metar_res, dict):
        result.update(metar_res)
        result["success"] = True
        result["source"] = "metar"
    else:
        errors.append(describe_error("metar", metar_res))

    if isinstance(kma_res, dict):
        if result["source"] != "metar":
            for key in ("temperature", "humidity", "windSpeed", "condition", "icon", "baseTime"):
                if kma_res.get(key) not in (None, "", "-"):
                    result[key] = kma_res[key]
            result["success"] = True
            result["source"] = "live"
        if kma_res.get("hourly"):
            result["hourly"] = kma_res["hourly"]
        else:
            missing.append("hourly")
    else:
        errors.append(describe_error("kma", kma_res))
        missing.append("hourly")

    if isinstance(air_res, dict):
        result.update(air_res)
    else:
        errors.append(describe_error("airkorea", air_res))
        missing.append("air")

    feels_like = calculate_feels_like(result.get("temperature"), result.get("humidity"), result.get("windSpeed"))
    if feels_like is not None:
        result["feelsLike"] = feels_like

    if result["success"]:
        parts = []
        if "hourly" in missing:
            parts.append("시간별 예보")
        if "air" in missing:
            parts.append("미세먼지")
        base = "인천공항 METAR" if result["source"] == "metar" else "기상청 초단기실황"
        result["message"] = f"{base} 기준" + (f" · {', '.join(parts)}는 불러오지 못했습니다." if parts else "")
        if result.get("stale"):
            result["message"] += " · 관측 시각이 3시간 이상 지났습니다."
    else:
        result["message"] = "날씨 정보를 불러오지 못했습니다. 잠시 후 갱신해 주세요."

    if missing:
        result["missing"] = missing
    if errors:
        result["errors"] = errors
    return result
