"""변경 감지(출도착 알림) 테스트 — 지연·게이트 변경·결항·시간 변경이 알림 이력에 남는지 확인한다.

인천 API는 가짜 응답이고 저장소는 임시 파일이라 운영 데이터에 영향이 없다.
사용법 (backend 폴더에서): python scripts/change_check_test.py
"""
import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.getcwd())
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

tmp = tempfile.mkdtemp(prefix="change-check-test-")
for env, name in [
    ("LATEST_SCHEDULE_FILE", "latest.json"), ("SCHEDULE_SLOTS_FILE", "slots.json"), ("PUSH_SUBSCRIPTIONS_FILE", "push.json"),
    ("AUTO_PUSH_STATUS_FILE", "auto.json"), ("NOTIFICATION_HISTORY_FILE", "history.json"),
    ("INCHEON_API_USAGE_FILE", "usage.json"), ("AIRCRAFT_REGISTRATION_FILE", "reg.json"),
]:
    os.environ[env] = os.path.join(tmp, name)
for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_PRIVATE_KEY"):
    os.environ.pop(key, None)
os.environ["INCHEON_API_SERVICE_KEY"] = "dummy"

from app.services import schedule_monitor as monitor  # noqa: E402
from app.services.notification_store import _read_notification_history  # noqa: E402
from app.services.schedule_store import _write_latest_schedule  # noqa: E402

passed = 0


def check(name, condition, detail=""):
    global passed
    if condition:
        passed += 1
        print("OK  ", name)
    else:
        print("FAIL", name, detail)
        sys.exit(1)


def make_row(flight, dep, arr, sched, est=None, gate="621", remark="", **extra):
    est = est or sched
    fmt = lambda v: f"{v[:4]}/{v[4:6]}/{v[6:8]} {v[8:10]}:{v[10:12]}"  # noqa: E731
    return {
        "flightId": flight, "flightNo": flight, "departureCode": dep, "arrivalCode": arr,
        "scheduleDateTime": sched, "estimatedDateTime": est,
        "formattedScheduleTime": fmt(sched), "formattedEstimatedTime": fmt(est),
        "gatenumber": gate, "terminalid": "C01", "remark": remark, "status": "", "canceled": "결항" in remark,
        "delay": sched != est, "sourceType": "arrival" if arr == "ICN" else "departure", **extra,
    }


BASE = {
    "KJ932": make_row("KJ932", "HAN", "ICN", "202611061420"),
    "KJ987": make_row("KJ987", "ICN", "PVG", "202611061435", gate="622"),
    "KJ926": make_row("KJ926", "YNT", "ICN", "202611061520", gate="672"),
    "KJ587": make_row("KJ587", "ICN", "BRU", "202611061615"),
    "KJ977": make_row("KJ977", "ICN", "TSN", "202611061625", gate="672"),
}
ROOM = {
    "id": "latest", "name": "2026.11.06 Schedule Flight", "flightsInput": ", ".join(BASE), "fixed": True,
    "startDateTime": "2026-11-06T14:00", "endDateTime": "2026-11-07T12:00", "lastFetchedAt": "",
    "rows": [dict(r) for r in BASE.values()],
}
_write_latest_schedule(ROOM)

# 다음 조회 결과(가짜 인천 API)
FRESH = {
    "KJ932": make_row("KJ932", "HAN", "ICN", "202611061420", "202611061500", remark="지연"),            # 40분 지연
    "KJ987": make_row("KJ987", "ICN", "PVG", "202611061435", gate="624"),                                # 게이트 변경
    "KJ926": make_row("KJ926", "YNT", "ICN", "202611061520", gate="672", remark="결항"),                 # 결항
    "KJ587": make_row("KJ587", "ICN", "BRU", "202611061615", "202611080300", remark="지연"),             # 조회 기간(~11/07 12:00) 밖으로 지연
    "KJ977": make_row("KJ977", "ICN", "TSN", "202611061625", gate="672"),                                # 변동 없음
}


async def fake_get_flight_data(flight_no, start_date, end_date):
    return [dict(FRESH[flight_no])] if flight_no in FRESH else []


monitor.get_flight_data = fake_get_flight_data

result = asyncio.run(monitor._run_schedule_change_check(push_on_change=False))
changed = {c["flight"]: c for c in result["changes"]}
print("   감지:", sorted(changed), "/ 확인한 편:", result["checked"])

check("지연 감지: KJ932", "KJ932" in changed, result["changes"])
check("게이트 변경 감지: KJ987", "KJ987" in changed, result["changes"])
check("결항 감지: KJ926", "KJ926" in changed, result["changes"])
check("변동 없는 편은 알림 없음: KJ977", "KJ977" not in changed, result["changes"])
check("알림 이력에 기록됨", len(_read_notification_history()) >= 1, _read_notification_history())

kj587_alerted = "KJ587" in changed
print("   [참고] 조회 기간 밖으로 지연된 KJ587(예정 16:15 → 변경 11/08 03:00) 알림 여부:", kj587_alerted)
check("★ 조회 기간(종료 시각) 밖으로 지연된 편도 지연 알림이 가야 함", kj587_alerted,
      "KJ587 이 알림 없이 조용히 누락됨 — 기간 필터가 변경시각 기준이라 지연된 편이 조회 결과에서 빠짐")

kj587 = changed.get("KJ587", {})
check("지연된 편이 조회 기간 밖이어도 '출발/도착' 처리되지 않음",
      "출발" not in str(kj587) and "도착 완료" not in str(kj587), kj587)

# 한국 시각 통일: 서버 시간대에 의존하는 datetime.now() 를 쓰지 않는지 확인
from app.services import flight_common  # noqa: E402

check("감시 모듈이 한국 시각(_now_kst)을 사용", monitor._now_kst is flight_common._now_kst)
src = open(monitor.__file__, encoding="utf-8").read()
check("schedule_monitor 에 datetime.now() 직접 호출이 없음", "datetime.now()" not in src)

# ── 실제 도착 vs 시간 경과 추정 ───────────────────────────────────────────
import datetime as _dt  # noqa: E402

_real_now = monitor._now_kst
monitor._now_kst = lambda: _dt.datetime(2026, 11, 6, 14, 10)

INBOUND = {"flightNo": "KJ970", "departureCode": "HKG", "arrivalCode": "ICN", "formattedScheduleTime": "2026/11/06 14:00",
           "formattedEstimatedTime": "2026/11/06 14:00", "remark": "", "status": "", "gatenumber": "621",
           "terminalid": "C01", "sourceType": "arrival"}
inferred_prev = monitor._apply_elapsed_status_to_row(INBOUND)  # 시간이 지나 앱이 '도착'으로 추정한 행
check("도착 예정 시각이 지나도 API 도착 전에는 '도착'이 아니라 '도착 지연'(추정 표시)", inferred_prev["status"] == "도착 지연" and inferred_prev.get("statusInferred") is True, inferred_prev)

changes = monitor._row_changed_fields(inferred_prev, dict(INBOUND, remark="도착"))
check("추정 '도착' 이후 API 가 실제 도착을 알리면 알림이 감(이전엔 누락)", changes and changes[0] == "상태 도착 (도착 확인)", changes)
check("API 가 아직 비어 있으면 가짜 '상태 도착 → -' 알림이 없음", monitor._row_changed_fields(inferred_prev, dict(INBOUND)) == [])

changes = monitor._row_changed_fields(dict(INBOUND, remark="지연"), dict(INBOUND, remark="도착"))
check("지연 → 실제 도착: '도착 확인' 문구가 맨 앞", changes[0] == "상태 지연 → 도착 (도착 확인)", changes)

depart = dict(INBOUND, departureCode="ICN", arrivalCode="PVG", sourceType="departure")
dep_changes = monitor._row_changed_fields(monitor._apply_elapsed_status_to_row(depart), dict(depart, remark="출발"))
check("출발편도 추정 '출발' 뒤 실제 출발 알림이 누락되지 않음", any(c.startswith("상태") for c in dep_changes), dep_changes)

pre = monitor._get_arrival_prealert_changes("KJ970", dict(INBOUND, remark="지연"), {})
check("사전 알림 문구: 도착 미확인 표시", pre and pre["changes"][0] == "도착 예정 14:00 (아직 도착 미확인)" and "도착 미확인" in pre["changes"][1], pre)
check("실제 도착이 확인된 편에는 사전 알림 없음", monitor._get_arrival_prealert_changes("KJ970", dict(INBOUND, remark="도착"), {}) is None)
check("결항 편에는 사전 알림 없음", monitor._get_arrival_prealert_changes("KJ970", dict(INBOUND, remark="결항"), {}) is None)
# API 파서가 ETA 지난 뒤 붙인 추정 '도착'(remark 는 아직 '지연')은 실제 도착으로 취급하지 않음
parser_inferred = dict(INBOUND, remark="지연", status="도착", statusInferred=True)
check("ETA 가 지나 추정된 '도착'만으로는 알림·'도착 확인'이 나가지 않음",
      monitor._row_changed_fields(dict(INBOUND, remark="지연"), parser_inferred) == [],
      monitor._row_changed_fields(dict(INBOUND, remark="지연"), parser_inferred))
pre2 = monitor._get_arrival_prealert_changes("KJ970", parser_inferred, {})
check("추정 '도착'이 붙어도 API 가 도착을 알리기 전까지는 사전 알림 대상", pre2 is not None and "도착 미확인" in pre2["changes"][0], pre2)

# 인천 API 파서: remark 가 도착을 말하면 실제, 비어 있는데 시각만 지났으면 추정 표시
import xml.etree.ElementTree as _ET  # noqa: E402
from app.services import incheon_api as _api  # noqa: E402


def _items(remark):
    xml = (f"<items><item><airline>KJ</airline><flightId>KJ970</flightId><airport>홍콩</airport><airportCode>HKG</airportCode>"
           f"<scheduleDateTime>200001010000</scheduleDateTime><estimatedDateTime>200001010000</estimatedDateTime>"
           f"<remark>{remark}</remark></item></items>")
    return list(_ET.fromstring(xml))


check("파서: remark 도착이면 추정 아님", _api._rows_from_items(_items("도착"), "arrival")[0]["statusInferred"] is False)
check("파서: remark 비어 있고 시각만 지났으면 추정 표시", _api._rows_from_items(_items(""), "arrival")[0]["statusInferred"] is True)
check("파서: 도착편 remark 도착이면 status 도착", _api._rows_from_items(_items("도착"), "arrival")[0]["status"] == "도착")
check("파서: 도착편 remark 없고 시각만 지나면 status 도착 지연", _api._rows_from_items(_items(""), "arrival")[0]["status"] == "도착 지연")
check("파서: 도착편 remark 지연이고 시각이 지나도 status 도착 지연(도착 아님)", _api._rows_from_items(_items("지연"), "arrival")[0]["status"] == "도착 지연")
check("파서: 결항편은 상태를 추정하지 않음", _api._rows_from_items(_items("결항"), "arrival")[0]["status"] == "")
check("파서: 출발편 remark 없고 시각만 지나면 출발 지연(출발 아님)", _api._rows_from_items(_items(""), "departure")[0]["status"] == "출발 지연")
check("파서: 출발편 remark 출발이면 출발", _api._rows_from_items(_items("출발"), "departure")[0]["status"] == "출발" and _api._rows_from_items(_items("출발"), "departure")[0]["statusInferred"] is False)
monitor._now_kst = _real_now

print(f"\n{passed}개 통과")
