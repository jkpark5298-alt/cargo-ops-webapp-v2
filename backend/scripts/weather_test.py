"""날씨 서비스 테스트 — 외부 API(NOAA, aviationweather, 기상청, 에어코리아)를 가짜로 대체해 실패·부분 성공·성공을 확인한다.

사용법 (backend 폴더에서): python scripts/weather_test.py
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

os.environ["WEATHER_API_KEY"] = "dummy"
os.environ["AIRKOREA_API_KEY"] = "dummy"
os.environ["WEATHER_HTTP_RETRIES"] = "0"
sys.path.insert(0, os.getcwd())

import httpx  # noqa: E402

from app.routes import weather as weather_route  # noqa: E402
from app.services import weather as svc  # noqa: E402

REAL_CLIENT = httpx.AsyncClient
passed = 0
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def check(name, condition, detail=""):
    global passed
    if condition:
        passed += 1
        print("OK  ", name)
    else:
        print("FAIL", name, detail)
        sys.exit(1)


METAR_LINE = "RKSI 050730Z 27010KT CAVOK 16/11 Q1012 NOSIG"
NOAA_TEXT = "2026/11/05 07:30\n" + METAR_LINE + "\n"

KMA_NCST = {"response": {"body": {"items": {"item": [
    {"category": "T1H", "obsrValue": "16.1"}, {"category": "REH", "obsrValue": "70"},
    {"category": "WSD", "obsrValue": "4.9"}, {"category": "PTY", "obsrValue": "0"}]}}}}
KMA_FCST = {"response": {"body": {"items": {"item": [
    {"fcstDate": "20261105", "fcstTime": f"{h:02d}00", "category": c, "fcstValue": v}
    for h, t in ((18, "15"), (19, "14"), (20, "14"), (21, "13"))
    for c, v in (("T1H", t), ("SKY", "1"), ("PTY", "0"))]}}}}
AIR = {"response": {"body": {"items": [{"pm10Grade": "1", "pm25Grade": "2", "dataTime": "2026-11-05 16:00"}]}}}


def make_client(noaa=True, awc=True, kma=True, air=True):
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "tgftp" in url:
            if not noaa:
                raise httpx.ConnectTimeout("")
            return httpx.Response(200, text=NOAA_TEXT)
        if "aviationweather" in url:
            if not awc:
                raise httpx.ReadTimeout("")
            return httpx.Response(200, text="METAR " + METAR_LINE + "\n")
        if "getUltraSrtNcst" in url or "getUltraSrtFcst" in url:
            if not kma:
                raise httpx.ReadTimeout("")
            return httpx.Response(200, json=KMA_NCST if "Ncst" in url else KMA_FCST)
        if "ArpltnInforInqireSvc" in url:
            if not air:
                return httpx.Response(500, text="boom")
            return httpx.Response(200, json=AIR)
        return httpx.Response(404)

    return lambda **kw: REAL_CLIENT(transport=httpx.MockTransport(handler), **kw)


def run(**flags):
    httpx.AsyncClient = make_client(**flags)
    try:
        return asyncio.run(svc.get_current_weather())
    finally:
        httpx.AsyncClient = REAL_CLIENT


# 1) 전부 실패 → 예시값 없이 실패로 응답
r = run(noaa=False, awc=False, kma=False, air=False)
check("전부 실패: success False, 출처 unavailable", r["success"] is False and r["source"] == "unavailable", r)
check("전부 실패: 가짜 숫자가 없음(기온·습도·풍속·예보·미세먼지·체감)",
      not any(k in r for k in ("temperature", "humidity", "windSpeed", "hourly", "pm10Grade", "pm25Grade", "feelsLike")), r)
check("전부 실패: 오류에 출처와 예외 종류가 남음(빈 문자열 아님)",
      any("metar" in e and "ConnectTimeout" in e for e in r["errors"]) and any(e.startswith("kma: ReadTimeout") for e in r["errors"])
      and any(e.startswith("airkorea:") for e in r["errors"]), r["errors"])
check("전부 실패: 안내 문구", "불러오지 못했습니다" in r["message"])

# 2) NOAA 실패 → aviationweather.gov 로 대체
r = run(noaa=False, kma=False, air=False)
check("NOAA 실패 시 aviationweather.gov로 대체", r["success"] and r["metarSource"] == "aviationweather.gov", r)

# 3) METAR만 성공: 실제 값만 표시, 나머지는 비움
r = run(kma=False, air=False)
check("METAR만 성공: 기온 16.0·풍속 5.1·서풍·시정", r["success"] and r["source"] == "metar" and r["temperature"] == "16.0"
      and r["windSpeed"] == "5.1" and r["windDirectionText"] == "서" and "10km" in r["visibility"], r)
check("METAR만 성공: 습도는 이슬점으로 계산(72%)", r["humidity"] == "72", r["humidity"])
check("METAR만 성공: 예보·미세먼지는 가짜 값 없이 비어 있고 안내됨", "hourly" not in r and "pm10Grade" not in r
      and r["missing"] == ["hourly", "air"] and "시간별 예보" in r["message"] and "미세먼지" in r["message"], r)
check("METAR만 성공: 체감온도를 실제로 계산(기온과 다름)", r["feelsLike"] not in (None, "16.0"), r.get("feelsLike"))
check("METAR 관측 시각은 KST(07:30Z → 16:30)", r["baseTime"] == "16:30" and r["observedAt"].startswith("2026-11-05T16:30"), r.get("baseTime"))

# 4) 모두 성공
r = run()
check("모두 성공: 예보 4건과 미세먼지(좋음/보통)", len(r["hourly"]) == 4 and r["pm10Grade"] == "좋음" and r["pm25Grade"] == "보통" and "missing" not in r, r)

# 5) METAR 실패, 기상청 성공 → live
r = run(noaa=False, awc=False)
check("METAR 실패·기상청 성공: source live, 기온 16.1", r["success"] and r["source"] == "live" and r["temperature"] == "16.1", r)

# 6) 시각 변환·체감온도 단위 테스트
kst = svc._metar_observed_kst("RKSI 312350Z 00000KT", datetime(2026, 11, 1, 0, 10, tzinfo=timezone.utc))
check("월 경계(31일 23:50Z → 11/01 08:50 KST)", kst.strftime("%m-%d %H:%M") == "11-01 08:50", kst)
check("관측 시각이 없으면 None", svc._metar_observed_kst("NO TIME") is None)
check("윈드칠: 0℃·풍속 5m/s → 약 -4.9", abs(float(svc.calculate_feels_like(0, 50, 5)) - (-4.9)) < 0.2, svc.calculate_feels_like(0, 50, 5))
check("값이 부족하면 체감온도 None", svc.calculate_feels_like(20, None, None) is None and svc.calculate_feels_like("x", 50, 1) is None)

# 7) 라우트 캐시: 실패는 짧게, 성공은 길게, refresh 는 캐시 무시
calls = {"n": 0, "ok": False}


async def fake_current():
    calls["n"] += 1
    return {"success": calls["ok"], "source": "metar" if calls["ok"] else "unavailable"}


weather_route.get_current_weather = fake_current
weather_route.WEATHER_CACHE = None
weather_route.WEATHER_CACHE_EXPIRES_AT = 0.0
a = asyncio.run(weather_route.current_weather(refresh=False))
b = asyncio.run(weather_route.current_weather(refresh=False))
check("실패 응답도 잠깐은 캐시(30초) — 연속 호출 시 재조회하지 않음", calls["n"] == 1 and b["cached"] is True)
calls["ok"] = True
c = asyncio.run(weather_route.current_weather(refresh=True))
check("refresh=true 는 캐시를 건너뜀(복구된 값 즉시 반영)", calls["n"] == 2 and c["success"] is True and c["cached"] is False and c["source"] == "metar")
d = asyncio.run(weather_route.current_weather(refresh=False))
check("성공 응답은 캐시되며 출처(source)가 덮어써지지 않음", calls["n"] == 2 and d["cached"] is True and d["source"] == "metar")
check("실패 캐시 시간이 성공 캐시보다 짧음", weather_route.WEATHER_FAILURE_CACHE_TTL_SECONDS < weather_route.WEATHER_CACHE_TTL_SECONDS)

print(f"\n{passed}개 통과")
