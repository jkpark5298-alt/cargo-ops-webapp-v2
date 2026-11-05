"""/flights API 스모크 테스트 — 코드를 옮기거나 나눈 뒤 동작이 그대로인지 확인한다.

사용법 (backend 폴더에서):
    python scripts/api_smoke_test.py [결과 JSON 저장 경로]

임시 파일 저장소를 사용하고 인천 API는 가짜 응답으로 대체하므로 외부 호출·실제 데이터 변경이 없다.
같은 스크립트를 변경 전/후 코드에서 실행해 결과 JSON을 비교하면 동작 차이를 찾을 수 있다.
"""
import json
import os
import re
import sys
import tempfile

tmp = tempfile.mkdtemp(prefix="cargo-api-test-")
for env, name in [
    ("LATEST_SCHEDULE_FILE", "latest.json"),
    ("SCHEDULE_SLOTS_FILE", "slots.json"),
    ("PUSH_SUBSCRIPTIONS_FILE", "push.json"),
    ("AUTO_PUSH_STATUS_FILE", "auto.json"),
    ("NOTIFICATION_HISTORY_FILE", "history.json"),
    ("INCHEON_API_USAGE_FILE", "usage.json"),
    ("AIRCRAFT_REGISTRATION_FILE", "reg.json"),
]:
    os.environ[env] = os.path.join(tmp, name)
for env in ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_PRIVATE_KEY"]:
    os.environ.pop(env, None)
os.environ["AUTO_PUSH_ENABLED"] = "false"
os.environ["INCHEON_API_SERVICE_KEY"] = "dummy"

sys.path.insert(0, os.getcwd())

from fastapi.testclient import TestClient  # noqa: E402

import app.routes.flights as flights_pkg  # noqa: E402
from app.main import app  # noqa: E402

# 인천 API 가짜 응답 (분리 전에는 flights 모듈, 분리 후에는 flights.search 모듈에서 import 한다)
FAKE_ROWS = [
    {"flightId": "KJ247", "flightNo": "KJ247", "departureCode": "ATL", "arrivalCode": "ICN",
     "scheduleDateTime": "202610310020", "estimatedDateTime": "202610310020",
     "formattedScheduleTime": "2026/10/31 00:20", "formattedEstimatedTime": "2026/10/31 00:20",
     "gatenumber": "-", "terminalid": "C01", "remark": "", "status": "", "sourceType": "arrival"},
    {"flightId": "KJ283", "flightNo": "KJ283", "departureCode": "SFO", "arrivalCode": "ICN",
     "scheduleDateTime": "202610310305", "estimatedDateTime": "202610312035",
     "formattedScheduleTime": "2026/10/31 03:05", "formattedEstimatedTime": "2026/10/31 20:35",
     "gatenumber": "621", "terminalid": "C01", "remark": "지연", "delay": True, "sourceType": "arrival"},
    {"flightId": "KJ951", "flightNo": "KJ951", "departureCode": "ICN", "arrivalCode": "HAN",
     "scheduleDateTime": "202610310045", "estimatedDateTime": "202610310045",
     "formattedScheduleTime": "2026/10/31 00:45", "formattedEstimatedTime": "2026/10/31 00:45",
     "gatenumber": "622", "terminalid": "C01", "remark": "", "status": "", "sourceType": "departure"},
]


async def fake_get_flight_data(flight_no, start_date, end_date):
    return [dict(r) for r in FAKE_ROWS if r["flightId"] == flight_no]


async def fake_get_all_kj(start_date, end_date):
    return [dict(r) for r in FAKE_ROWS]


target = getattr(flights_pkg, "search", None)
if target is None or not hasattr(target, "get_flight_data"):
    target = flights_pkg
target.get_flight_data = fake_get_flight_data
target.get_all_kj_flight_data = fake_get_all_kj

TS = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?")
KO_TS = re.compile(r"\d{4}\. ?\d{1,2}\. ?\d{1,2}\. [오전후]+ \d{1,2}:\d{2}:\d{2}")


def norm(value):
    """실행 시각에 따라 달라지는 값은 자리표시자로 바꾼다."""
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    text = TS.sub("<ts>", text)
    text = KO_TS.sub("<ts>", text)
    text = re.sub(r"\d{2}\.\d{2}\.\d{2} \d{2}:\d{2}", "<ts>", text)
    return json.loads(text)


results = {}


def call(name, response):
    try:
        body = response.json()
    except Exception:
        body = response.text
    results[name] = {"status": response.status_code, "body": norm(body)}


room = {
    "id": "r1", "name": "테스트 Schedule", "flightsInput": "KJ247, KJ951", "startDateTime": "2026-10-30T21:00",
    "endDateTime": "2026-10-31T12:00", "fixed": True, "lastFetchedAt": "x",
    "rows": [dict(r) for r in FAKE_ROWS if r["flightId"] in ("KJ247", "KJ951")],
}

with TestClient(app) as client:
    # 시작 이벤트(자동 푸시 워커)가 등록되어 있는지
    results["startup_handlers"] = [h.__name__ for h in app.router.on_startup]

    call("root", client.get("/"))
    call("health", client.get("/health/health"))
    call("flights_health", client.get("/flights/health"))
    call("push_public_key", client.get("/flights/push-public-key"))
    call("push_count", client.get("/flights/push-subscriptions/count"))
    call("incheon_usage_empty", client.get("/flights/incheon-api-usage"))

    # 조회 (예정 범위 밖 지연 편은 변경시각 기준 필터에 걸림 — 기존 동작 유지)
    call("search_manual", client.post("/flights/", json={"flights": ["KJ247", "KJ283"], "start": "2026-10-30T21:00", "end": "2026-10-31T12:00"}))
    call("search_manual_wide", client.post("/flights/", json={"flights": ["KJ283"], "start": "2026-10-30T00:00", "end": "2026-11-01T23:59"}))
    call("search_empty_flights", client.post("/flights/", json={"flights": [], "start": "2026-10-30T21:00", "end": "2026-10-31T12:00"}))
    call("search_bad_range", client.post("/flights/", json={"flights": ["KJ247"], "start": "2026-11-01T00:00", "end": "2026-10-31T00:00"}))
    call("search_kj_all", client.post("/flights/kj-all", json={"start": "2026-10-30T21:00", "end": "2026-10-31T12:00"}))
    call("incheon_usage_after", client.get("/flights/incheon-api-usage"))

    # 등록기호 기록: 엑셀(오래됨) → 매뉴얼(최근)
    call("reg_empty", client.get("/flights/aircraft-registrations"))
    call("reg_save_excel", client.post("/flights/aircraft-registrations", json={"mode": "merge", "records": [
        {"date": "2026-10-31", "flight": "KJ951", "departureCode": "", "arrivalCode": "", "registrationNo": "7620", "updatedAt": "2026-11-01T01:00:00+09:00"}]}))
    call("reg_save_manual", client.post("/flights/aircraft-registrations", json={"mode": "merge", "records": [
        {"date": "2026-10-31", "flight": "KJ951", "departureCode": "ICN", "arrivalCode": "HAN", "registrationNo": "HL7420", "updatedAt": "2026-11-01T02:00:00+09:00"}]}))
    call("reg_list", client.get("/flights/aircraft-registrations"))

    # 최신 스케줄 + 슬롯
    call("latest_empty", client.get("/flights/latest-schedule"))
    call("latest_save", client.post("/flights/latest-schedule", json={"room": room}))
    call("latest_get", client.get("/flights/latest-schedule"))
    call("slots_get", client.get("/flights/schedule-slots"))
    call("slot_save", client.post("/flights/schedule-slots/save", json={"room": room, "rotate": True}))
    call("slot_save_second", client.post("/flights/schedule-slots/save", json={"room": {**room, "id": "r2", "flightsInput": "KJ247", "rows": room["rows"][:1]}, "rotate": True}))
    call("slots_after", client.get("/flights/schedule-slots"))
    call("slot_link_archive", client.post("/flights/schedule-slots/link/archive"))
    call("slot_swap", client.post("/flights/schedule-slots/swap"))
    call("slot_delete_active", client.delete("/flights/schedule-slots/active"))
    call("slot_bad", client.post("/flights/schedule-slots/link/nope"))
    call("slots_delete_all", client.delete("/flights/schedule-slots"))

    # 일일 보고, 알림 기록, 자동 푸시 설정
    call("daily_get_empty", client.get("/flights/daily-report-text", params={"workDate": "2026-10-31"}))
    call("daily_save", client.post("/flights/daily-report-text", json={"workDate": "2026-10-31", "author": "jkpark", "status": "normal", "note": "메모"}))
    call("daily_get", client.get("/flights/daily-report-text", params={"workDate": "2026-10-31"}))
    call("history_get", client.get("/flights/notification-history"))
    call("history_clear", client.post("/flights/notification-history/clear"))
    call("history_delete_item", client.post("/flights/notification-history/delete-item", json={"id": "none"}))
    call("auto_status", client.get("/flights/auto-push/status"))
    call("auto_config", client.post("/flights/auto-push/config", json={"enabled": False, "intervalMinutes": 30}))
    call("check_schedule", client.post("/flights/check-schedule"))

    # 푸시 구독
    call("push_subscribe", client.post("/flights/push-subscriptions", json={"subscription": {"endpoint": "https://e/1", "keys": {"p256dh": "a", "auth": "b"}}}))
    call("push_count_after", client.get("/flights/push-subscriptions/count"))

out = json.dumps(results, ensure_ascii=False, indent=1, sort_keys=True)
if len(sys.argv) > 1:
    open(sys.argv[1], "w", encoding="utf-8").write(out)
statuses = {k: (v["status"] if isinstance(v, dict) else v) for k, v in results.items()}
print(json.dumps(statuses, ensure_ascii=False, sort_keys=True))
