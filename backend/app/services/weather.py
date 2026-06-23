import asyncio
import math
import os
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


async def get_current_weather() -> dict[str, Any]:
    result = dict(MOCK_WEATHER)
    errors: list[str] = []

    async with httpx.AsyncClient() as client:
        kma_task = _fetch_kma_weather(client)
        air_task = _fetch_airkorea(client)

        kma_res, air_res = await asyncio.gather(kma_task, air_task, return_exceptions=True)

        if isinstance(kma_res, Exception):
            errors.append(f"weather: {kma_res}")
        elif isinstance(kma_res, dict):
            result.update(kma_res)
            result["success"] = True
            result["source"] = "live"
            result["message"] = "실시간 날씨를 표시 중입니다."

        if isinstance(air_res, Exception):
            errors.append(f"air: {air_res}")
        elif isinstance(air_res, dict):
            result.update(air_res)
            if result.get("success") is False:
                result["success"] = True
                result["source"] = "partial"

    result["location"] = "인천시 중구 운서동"
    if errors:
        result["errors"] = errors
    return result
