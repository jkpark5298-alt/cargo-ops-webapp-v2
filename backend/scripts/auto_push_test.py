"""자동 푸시 반복문·실행 잠금·만료 구독 정리·API 토큰 테스트 (가짜 인천 API/푸시, 임시 파일 저장소 — 운영 영향 없음).

사용법 (backend 폴더에서): python scripts/auto_push_test.py
"""
import asyncio
import os
import sys
import tempfile

tmp = tempfile.mkdtemp(prefix="auto-push-test-")
for env, name in [
    ("LATEST_SCHEDULE_FILE", "latest.json"), ("SCHEDULE_SLOTS_FILE", "slots.json"), ("PUSH_SUBSCRIPTIONS_FILE", "push.json"),
    ("AUTO_PUSH_STATUS_FILE", "auto.json"), ("NOTIFICATION_HISTORY_FILE", "history.json"),
    ("INCHEON_API_USAGE_FILE", "usage.json"), ("AIRCRAFT_REGISTRATION_FILE", "reg.json"),
]:
    os.environ[env] = os.path.join(tmp, name)
for env in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_PRIVATE_KEY", "API_ACCESS_TOKEN"):
    os.environ.pop(env, None)
os.environ["AUTO_PUSH_ENABLED"] = "true"
os.environ["INCHEON_API_SERVICE_KEY"] = "dummy"
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.getcwd())

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import notification_store as ns  # noqa: E402
from app.services import schedule_monitor as monitor  # noqa: E402
from app.services.schedule_store import _write_latest_schedule  # noqa: E402

passed = 0


def check(name, cond, detail=""):
    global passed
    if cond:
        passed += 1
        print("OK  ", name)
    else:
        print("FAIL", name, detail)
        sys.exit(1)


def row(flight, sched, est=None, gate="621"):
    est = est or sched
    fmt = lambda v: f"{v[:4]}/{v[4:6]}/{v[6:8]} {v[8:10]}:{v[10:12]}"  # noqa: E731
    return {"flightId": flight, "flightNo": flight, "departureCode": "ICN", "arrivalCode": "PVG",
            "scheduleDateTime": sched, "estimatedDateTime": est, "formattedScheduleTime": fmt(sched),
            "formattedEstimatedTime": fmt(est), "gatenumber": gate, "terminalid": "C01", "remark": "", "status": "",
            "sourceType": "departure"}


ROOM = {"id": "latest", "name": "t", "flightsInput": "KJ987", "fixed": True, "startDateTime": "2026-11-06T13:00",
        "endDateTime": "2026-11-06T23:59", "lastFetchedAt": "", "rows": [row("KJ987", "202611061435")]}
_write_latest_schedule(ROOM)

fresh = {"KJ987": row("KJ987", "202611061435", gate="624")}  # 게이트 변경
running = 0
max_running = 0
fetch_calls = 0


async def fake_get_flight_data(flight_no, start_date, end_date):
    global running, max_running, fetch_calls
    fetch_calls += 1
    running += 1
    max_running = max(max_running, running)
    await asyncio.sleep(0.05)
    running -= 1
    return [dict(fresh[flight_no])]


monitor.get_flight_data = fake_get_flight_data

# 1) 동시에 두 번 실행해도 한 번에 하나만 돌고, 같은 변경이 두 번 알림되지 않음
async def concurrent():
    return await asyncio.gather(
        monitor._run_schedule_change_check(push_on_change=False),
        monitor._run_schedule_change_check(push_on_change=False),
    )


a, b = asyncio.run(concurrent())
check("동시 실행이 겹치지 않음(한 번에 하나)", max_running == 1, max_running)
check("같은 변경은 한 번만 감지(알림 중복 없음)", a["changed"] + b["changed"] == 1, (a["changed"], b["changed"]))

# 2) 자동 반복문: 30분 간격이면 1분마다 깨어나도 인천 API 는 간격마다만 조회
fetch_calls = 0
fresh["KJ987"] = row("KJ987", "202611061435", gate="625")
sleeps = []
real_sleep = asyncio.sleep


async def fake_sleep(seconds):
    sleeps.append(seconds)
    if len(sleeps) >= 6:
        raise asyncio.CancelledError()
    await real_sleep(0)


async def run_loop():
    monitor.asyncio.sleep = fake_sleep
    try:
        await monitor._auto_push_loop()
    except asyncio.CancelledError:
        pass
    finally:
        monitor.asyncio.sleep = real_sleep


asyncio.run(run_loop())
interval = monitor._get_current_auto_interval_minutes()
loop_sleeps = [x for x in sleeps if x >= 1]  # 가짜 인천 API 의 짧은 대기(0.05초)는 제외
check("반복문이 1분마다 확인할 때인지만 검사", loop_sleeps and all(x == 60 for x in loop_sleeps), sleeps)
check(f"간격({interval}분) 안에서는 6번 깨어나도 인천 API 는 1회만 조회", fetch_calls == 1, fetch_calls)

# 3) 만료 구독(404/410) 자동 정리
good = {"subscription": {"endpoint": "https://push.example/good", "keys": {}}}
gone = {"subscription": {"endpoint": "https://push.example/gone", "keys": {}}}
broken = {"subscription": {"endpoint": "https://push.example/broken", "keys": {}}}
ns._write_push_subscriptions([good, gone, broken])


class FakeResponse:
    def __init__(self, code):
        self.status_code = code


class FakePushError(Exception):
    def __init__(self, message, code):
        super().__init__(message)
        self.response = FakeResponse(code)


def fake_send(subscription, payload):
    endpoint = subscription.get("endpoint")
    if endpoint.endswith("gone"):
        raise FakePushError("Push failed: 410 Gone", 410)
    if endpoint.endswith("broken"):
        raise FakePushError("Push failed: 500", 500)


ns._send_web_push = fake_send
result = ns._broadcast_web_push({"title": "t", "body": "b"})
left = [i["subscription"]["endpoint"] for i in ns._read_push_subscriptions()]
check("정상 1 / 실패 2 집계", result["sent"] == 1 and result["failed"] == 2, result)
check("410(만료) 구독만 삭제하고 일시 오류(500)는 유지", left == ["https://push.example/good", "https://push.example/broken"] and result["removed"] == 1, left)

# 3-2) 자동 확인 간격: 집중 5분 / 해외 출발편 운항 중 20분 / 평상시 30분
from datetime import datetime  # noqa: E402

real_now = monitor._now_kst


def interval_for(rows, now):
    monitor._now_kst = lambda: now
    try:
        room = {"flightsInput": ", ".join(r["flightNo"] for r in rows), "rows": rows}
        return monitor._get_auto_interval_minutes_for_room(room)
    finally:
        monitor._now_kst = real_now


def inbound(flight, eta, remark=""):  # 해외 출발편(인천 도착)
    r = row(flight, eta)
    r.update({"departureCode": "PVG", "arrivalCode": "ICN", "sourceType": "arrival", "remark": remark})
    return r


def outbound(flight, etd):  # 인천 출발편
    return row(flight, etd)


check("해외 출발편 운항 중(도착 5시간 전)은 20분", interval_for([inbound("KJ970", "202611061400")], datetime(2026, 11, 6, 9, 0)) == 20)
check("도착 1시간 1분 전까지도 20분", interval_for([inbound("KJ970", "202611061400")], datetime(2026, 11, 6, 12, 59)) == 20)
check("도착 1시간 전부터는 집중 5분", interval_for([inbound("KJ970", "202611061400")], datetime(2026, 11, 6, 13, 0)) == 5)
check("도착 30분 후까지 집중 5분, 이후 평상시 30분",
      interval_for([inbound("KJ970", "202611061400")], datetime(2026, 11, 6, 14, 30)) == 5
      and interval_for([inbound("KJ970", "202611061400")], datetime(2026, 11, 6, 14, 31)) == 30)
check("도착까지 16시간을 넘게 남은 해외 출발편은 평상시 30분", interval_for([inbound("KJ970", "202611070800")], datetime(2026, 11, 6, 9, 0)) == 30)
check("도착 확정된 해외 출발편은 20분 대상 아님(30분)", interval_for([inbound("KJ970", "202611061400", "도착")], datetime(2026, 11, 6, 9, 0)) == 30)
check("인천 출발편만 있으면 출발 30분 전까지 평상시 30분", interval_for([outbound("KJ987", "202611061400")], datetime(2026, 11, 6, 9, 0)) == 30)
check("인천 출발편 출발 30분 전부터는 집중 5분", interval_for([outbound("KJ987", "202611061400")], datetime(2026, 11, 6, 13, 30)) == 5)
check("집중 구간 편이 있으면 20분보다 5분이 우선",
      interval_for([inbound("KJ970", "202611061400"), outbound("KJ987", "202611060930")], datetime(2026, 11, 6, 9, 0)) == 5)
check("모드 이름: 5=focus, 20=enroute, 30=normal",
      [monitor._auto_interval_mode(m) for m in (5, 20, 30)] == ["focus", "enroute", "normal"])

# 4) API 토큰
client = TestClient(app)
res = client.post("/flights/push-test", json={})
check("토큰 설정 전에는 기존처럼 동작(인증 검사 없음)", res.status_code != 401, res.status_code)

os.environ["API_ACCESS_TOKEN"] = "secret-token"
for method, path, body in [("post", "/flights/push-test", {}), ("post", "/flights/check-schedule-and-push", None),
                           ("post", "/flights/auto-push/config", {"enabled": False, "intervalMinutes": 30}),
                           ("post", "/flights/push-subscriptions", {"subscription": {"endpoint": "x"}})]:
    r = getattr(client, method)(path, json=body) if body is not None else getattr(client, method)(path)
    check(f"토큰 없으면 거부: {path}", r.status_code == 401, r.status_code)
r = client.post("/flights/push-test", json={}, headers={"X-API-Token": "wrong"})
check("틀린 토큰은 거부", r.status_code == 401, r.status_code)
r = client.post("/flights/push-test", json={}, headers={"X-API-Token": "secret-token"})
check("올바른 토큰이면 통과", r.status_code != 401, r.status_code)
check("조회성 API(health, 상태)는 토큰 없이 사용 가능",
      client.get("/flights/health?tick=false").status_code == 200 and client.get("/flights/auto-push/status").status_code == 200)
status = client.get("/flights/auto-push/status").json()
check("상태 응답에 등록 기기 수가 포함됨", status.get("subscriptionCount") == 2, status)
os.environ.pop("API_ACCESS_TOKEN", None)

print(f"\n{passed}개 통과")
