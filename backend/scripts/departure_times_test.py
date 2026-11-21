"""초기화면 출발 일시(표시 전용) API 테스트 — 임시 파일 저장소, 운영 영향 없음

사용법 (backend 폴더에서): python scripts/departure_times_test.py
"""
import os
import sys
import tempfile

tmp = tempfile.mkdtemp(prefix="departure-test-")
for env, name in [
    ("LATEST_SCHEDULE_FILE", "latest.json"), ("SCHEDULE_SLOTS_FILE", "slots.json"), ("PUSH_SUBSCRIPTIONS_FILE", "push.json"),
    ("AUTO_PUSH_STATUS_FILE", "auto.json"), ("NOTIFICATION_HISTORY_FILE", "history.json"),
    ("INCHEON_API_USAGE_FILE", "usage.json"), ("AIRCRAFT_REGISTRATION_FILE", "reg.json"),
    ("MONTHLY_SCHEDULE_FILE", "monthly.json"), ("DEPARTURE_TIMES_FILE", "dep.json"),
]:
    os.environ[env] = os.path.join(tmp, name)
for env in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "API_ACCESS_TOKEN"):
    os.environ.pop(env, None)
os.environ["AUTO_PUSH_ENABLED"] = "false"
os.environ["INCHEON_API_SERVICE_KEY"] = "dummy"
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.getcwd())

from datetime import timedelta  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.flight_common import _now_kst  # noqa: E402

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


today = _now_kst().date().isoformat()
check("처음에는 비어 있음", client.get("/flights/departure-times").json()["items"] == {})

res = client.post("/flights/departure-times", json={"date": today, "flight": "kj 918", "departure": f"{today} 14:10"})
items = res.json()["items"]
check("저장: 편명 정규화(KJ918)·일자 키", res.status_code == 200 and items[f"{today}|KJ918"]["departure"] == f"{today} 14:10", res.text)
check("조회로 다시 읽힘", client.get("/flights/departure-times").json()["items"][f"{today}|KJ918"]["departure"] == f"{today} 14:10")

client.post("/flights/departure-times", json={"date": today, "flight": "KJ918", "departure": f"{today} 15:30"})
check("같은 편 다시 저장하면 덮어씀", client.get("/flights/departure-times").json()["items"][f"{today}|KJ918"]["departure"] == f"{today} 15:30")

tomorrow = (_now_kst().date() + timedelta(days=1)).isoformat()
client.post("/flights/departure-times", json={"date": tomorrow, "flight": "KJ918", "departure": f"{tomorrow} 09:00"})
got = client.get("/flights/departure-times").json()["items"]
check("같은 편명도 일자가 다르면 별도 저장", len(got) == 2 and got[f"{tomorrow}|KJ918"]["departure"] == f"{tomorrow} 09:00", got)

check("형식 오류는 400", client.post("/flights/departure-times", json={"date": today, "flight": "KJ918", "departure": "14:10"}).status_code == 400)
check("일자 오류는 400", client.post("/flights/departure-times", json={"date": "11/21", "flight": "KJ918", "departure": ""}).status_code == 400)

client.post("/flights/departure-times", json={"date": today, "flight": "KJ918", "departure": ""})
got = client.get("/flights/departure-times").json()["items"]
check("빈 값으로 저장하면 삭제", f"{today}|KJ918" not in got and f"{tomorrow}|KJ918" in got, got)

old = (_now_kst().date() - timedelta(days=60)).isoformat()
client.post("/flights/departure-times", json={"date": old, "flight": "KJ1", "departure": f"{old} 10:00"})
client.post("/flights/departure-times", json={"date": today, "flight": "KJ2", "departure": f"{today} 10:00"})
check("45일 지난 기록은 저장 때 정리", f"{old}|KJ1" not in client.get("/flights/departure-times").json()["items"])

os.environ["API_ACCESS_TOKEN"] = "t"
check("토큰 설정 시 저장은 토큰 필요", client.post("/flights/departure-times", json={"date": today, "flight": "KJ3", "departure": ""}).status_code == 401)
check("조회는 토큰 없이 가능", client.get("/flights/departure-times").status_code == 200)
os.environ.pop("API_ACCESS_TOKEN", None)

print(f"\n{passed}개 통과")
