"""Schedule Flight 편 삭제 테스트 — 삭제한 편이 오래된 화면·다른 기기의 저장으로 되살아나지 않는지 확인한다.

임시 파일 저장소를 사용하므로 운영 데이터에 영향이 없다.
사용법 (backend 폴더에서): python scripts/schedule_delete_test.py
"""
import os
import sys
import tempfile
from datetime import timedelta

tmp = tempfile.mkdtemp(prefix="schedule-delete-test-")
for env, name in [
    ("LATEST_SCHEDULE_FILE", "latest.json"), ("SCHEDULE_SLOTS_FILE", "slots.json"), ("PUSH_SUBSCRIPTIONS_FILE", "push.json"),
    ("AUTO_PUSH_STATUS_FILE", "auto.json"), ("NOTIFICATION_HISTORY_FILE", "history.json"),
    ("INCHEON_API_USAGE_FILE", "usage.json"), ("AIRCRAFT_REGISTRATION_FILE", "reg.json"),
]:
    os.environ[env] = os.path.join(tmp, name)
for env in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_PRIVATE_KEY"):
    os.environ.pop(env, None)
os.environ["AUTO_PUSH_ENABLED"] = "false"
os.environ["INCHEON_API_SERVICE_KEY"] = "dummy"
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.getcwd())

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import schedule_store as store  # noqa: E402

client = TestClient(app)
passed = 0


def check(name, cond, detail=""):
    global passed
    if cond:
        passed += 1
        print("OK  ", name)
    else:
        print("FAIL", name, detail)
        sys.exit(1)


def row(flight, dep="ICN", arr="PVG", t="202611061435"):
    return {"flightId": flight, "flightNo": flight, "departureCode": dep, "arrivalCode": arr,
            "scheduleDateTime": t, "estimatedDateTime": t, "formattedScheduleTime": t, "formattedEstimatedTime": t,
            "gatenumber": "621", "sourceType": "departure"}


FLIGHTS = ["KJ283", "KJ987", "KJ971"]


def room(flights=FLIGHTS, name="2026.11.06 Schedule Flight"):
    return {"id": "r1", "name": name, "flightsInput": ", ".join(flights), "fixed": True,
            "startDateTime": "2026-11-06T13:00", "endDateTime": "2026-11-06T23:59",
            "lastFetchedAt": "", "rows": [row(f) for f in flights]}


def latest():
    return client.get("/flights/latest-schedule").json()["room"]


def names(r):
    return [x.strip() for x in str((r or {}).get("flightsInput") or "").split(",") if x.strip()]


def slot_room(slot="active"):
    return (client.get("/flights/schedule-slots").json().get(slot) or {}).get("room")


# 준비: 활성 카드로 저장(연동 슬롯 = active)
client.post("/flights/schedule-slots/save", json={"room": room(), "rotate": True})
check("준비: 최신 일정에 3편", names(latest()) == FLIGHTS, latest())

# 1) 삭제 API
res = client.delete("/flights/schedule-flights/kj-283").json()
check("삭제 API 성공(해당 편이 있었음)", res["success"] and res["removed"] is True, res)
check("최신 일정에서 KJ283 삭제", names(latest()) == ["KJ987", "KJ971"], names(latest()))
check("연동 슬롯에서도 KJ283 삭제(한 번에)", names(slot_room("active")) == ["KJ987", "KJ971"], names(slot_room("active")))
check("행도 함께 삭제", [r["flightNo"] for r in latest()["rows"]] == ["KJ987", "KJ971"])

# 2) 오래된 화면이 삭제 전 방 전체를 다시 저장 → 되살아나면 안 됨
res = client.post("/flights/latest-schedule", json={"room": room()}).json()
check("오래된 사본의 latest-schedule 저장: 응답에서 KJ283 제외", names(res["room"]) == ["KJ987", "KJ971"], names(res["room"]))
check("오래된 사본 저장 후에도 서버 최신 일정에 KJ283 없음", "KJ283" not in names(latest()), names(latest()))
check("오래된 사본 저장 후에도 연동 슬롯에 KJ283 없음", "KJ283" not in names(slot_room("active")), names(slot_room("active")))

client.post("/flights/schedule-slots/save", json={"room": room(), "rotate": False, "slot": "active"})
check("오래된 사본의 슬롯 저장도 KJ283 되살리지 못함", "KJ283" not in names(latest()) and "KJ283" not in names(slot_room("active")))

# 3) 사용자가 직접 편명을 편집해 다시 넣으면 허용
res = client.post("/flights/latest-schedule", json={"room": room(), "explicitEdit": True}).json()
check("편명 직접 편집(explicitEdit)이면 다시 추가 가능", names(res["room"]) == FLIGHTS, names(res["room"]))
res = client.post("/flights/latest-schedule", json={"room": room()}).json()
check("다시 추가한 뒤에는 일반 저장도 유지", names(res["room"]) == FLIGHTS, names(res["room"]))

# 4) 삭제 기록은 24시간 뒤 만료
client.delete("/flights/schedule-flights/KJ971")
check("준비: KJ971 삭제됨", "KJ971" not in names(latest()))
original_ttl = store.REMOVED_FLIGHT_TTL
store.REMOVED_FLIGHT_TTL = timedelta(seconds=-1)  # 유효 기간이 지난 상황을 흉내
res = client.post("/flights/latest-schedule", json={"room": room()}).json()
store.REMOVED_FLIGHT_TTL = original_ttl
check("유효 기간이 지난 삭제 기록은 무시", "KJ971" in names(res["room"]), names(res["room"]))

# 5) 새 Schedule Flight 저장(rotate)은 삭제 기록을 초기화
client.delete("/flights/schedule-flights/KJ283")
check("준비: KJ283 삭제됨", "KJ283" not in names(latest()))
client.post("/flights/schedule-slots/save", json={"room": room(name="새 카드"), "rotate": True})
check("새 Schedule Flight 저장 시 삭제했던 편도 다시 포함", "KJ283" in names(latest()), names(latest()))

# 6) 마지막 편까지 삭제해도 이전(보관) 카드로 바뀌지 않음
check("준비: 보관 카드에 이전 일정이 있음", bool(names(slot_room("archive"))), slot_room("archive"))
for f in list(FLIGHTS):
    client.delete(f"/flights/schedule-flights/{f}")
check("모든 편 삭제 후 최신 일정은 빈 카드", names(latest()) == [], latest())
store._sync_latest_schedule_from_linked_slot()
check("서버가 슬롯 기준으로 정리해도 보관 카드가 올라오지 않음", names(latest()) == [], names(latest()))
check("연동 슬롯은 그대로 active", client.get("/flights/schedule-slots").json()["linkedSlot"] == "active")

# 7) 없는 편 삭제도 오류 없이 처리
res = client.delete("/flights/schedule-flights/KJ000")
check("없는 편 삭제도 성공 응답(removed=false)", res.status_code == 200 and res.json()["removed"] is False, res.text)
res = client.delete("/flights/schedule-flights/%20")
check("잘못된 편명은 400 또는 404", res.status_code in (400, 404, 405, 422), res.status_code)

print(f"\n{passed}개 통과")
