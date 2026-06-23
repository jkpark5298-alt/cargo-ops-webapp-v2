import asyncio
import math
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import unquote

import httpx

KST = timezone(timedelta(hours=9))

# Incheon Jung-gu Unseo-dong approximate coordinates.
UNSEO_DONG_LAT = 37.4923
UNSEO_DONG_LON = 126.4930
AIRKOREA_STATIONS = [
    os.getenv("AIRKOREA_STATION_NAME", "운서"),
    "영종",
    "송해",
]

MOCK_WEATHER = {
    "success": False,
    "source": "fallback",
    "location": "인천시 중구 운서동",
    "temperature": "19.6",
    "condition": "맑음",
    "feelsLike": "18.0",
    "humidity": "32",
    "windSpeed": "3.3",
    "pm10Grade": "좋음",
    "pm25Grade": "좋음",
    "hourly": [
        {"time": "18시", "condition": "맑음", "temperature": "19", "icon": "☀️"},
        {"time": "21시", "condition": "구름많음", "temperature": "17", "icon": "⛅"},
        {"time": "00시", "condition": "흐림", "temperature": "15", "icon": "☁️"},
        {"time": "03시", "condition": "맑음", "temperature": "14", "icon": "☀️"},
    ],
    "baseTime": "14:00",
    "icon": "☀️",
    "message": "날씨 API 키가 없거나 응답이 없어 예시값을 표시합니다.",
}


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
        res = await client.get(ncst_url, params=common_params, timeout=3.5)
        res.raise_for_status()
        js = res.json()
        return js.get("response", {}).get("body", {}).get("items", {}).get("item", [])

    async def fetch_fcst():
        res = await client.get(fcst_url, params=common_params, timeout=3.5)
        res.raise_for_status()
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

    feels_like = temperature

    return {
        "temperature": str(temperature),
        "condition": condition,
        "feelsLike": str(feels_like),
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
        res = await client.get(url, params=params, timeout=3.5)
        res.raise_for_status()
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


async def _fetch_rksi_metar(client: httpx.AsyncClient) -> dict[str, Any]:
    url = "https://tgftp.nws.noaa.gov/data/observations/metar/stations/RKSI.TXT"
    res = await client.get(url, timeout=3.5)
    res.raise_for_status()
    text = res.text
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        raise ValueError("Invalid METAR format")
        
    obs_time_raw = lines[0]
    metar_line = lines[1]
    
    wind = parse_metar_wind(metar_line)
    temp_hum = parse_metar_temp_humidity(metar_line)
    visibility = parse_metar_visibility(metar_line)
    condition, icon = parse_metar_weather(metar_line)
    
    result = {
        "success": True,
        "source": "metar",
        "location": "인천공항 활주로 (RKSI)",
        "condition": condition,
        "icon": icon,
        "visibility": visibility,
        "baseTime": obs_time_raw.split(" ")[1] if " " in obs_time_raw else obs_time_raw,
        "metarText": metar_line,
    }
    result.update(wind)
    result.update(temp_hum)
    return result


async def get_current_weather() -> dict[str, Any]:
    result = dict(MOCK_WEATHER)
    errors: list[str] = []

    async with httpx.AsyncClient() as client:
        metar_task = _fetch_rksi_metar(client)
        kma_task = _fetch_kma_weather(client)
        air_task = _fetch_airkorea(client)

        metar_res, kma_res, air_res = await asyncio.gather(metar_task, kma_task, air_task, return_exceptions=True)

        if isinstance(metar_res, dict):
            result.update(metar_res)
            result["success"] = True
            result["source"] = "metar"
            result["message"] = "인천공항 실시간 활주로 기상(METAR)을 표시 중입니다."
        else:
            errors.append(f"metar: {metar_res}")

        if isinstance(kma_res, dict):
            if result.get("source") != "metar":
                result.update(kma_res)
                result["success"] = True
                result["source"] = "live"
                result["message"] = "실시간 날씨(기상청)를 표시 중입니다."
            if "hourly" in kma_res:
                result["hourly"] = kma_res["hourly"]
        else:
            errors.append(f"weather: {kma_res}")

        if isinstance(air_res, dict):
            result.update(air_res)
            if result.get("success") is False:
                result["success"] = True
                result["source"] = "partial"

    if errors:
        result["errors"] = errors
    return result
