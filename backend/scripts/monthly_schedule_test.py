"""Monthly Scheduled Flight 테스트 (임시 파일 저장소·가짜 인천 API — 운영 영향 없음)

사용법 (backend 폴더에서): python scripts/monthly_schedule_test.py
"""
import asyncio
import json
import os
import sys
import tempfile
from datetime import date, timedelta

tmp = tempfile.mkdtemp(prefix="monthly-test-")
for env, name in [
    ("LATEST_SCHEDULE_FILE", "latest.json"), ("SCHEDULE_SLOTS_FILE", "slots.json"), ("PUSH_SUBSCRIPTIONS_FILE", "push.json"),
    ("AUTO_PUSH_STATUS_FILE", "auto.json"), ("NOTIFICATION_HISTORY_FILE", "history.json"),
    ("INCHEON_API_USAGE_FILE", "usage.json"), ("AIRCRAFT_REGISTRATION_FILE", "reg.json"),
    ("MONTHLY_SCHEDULE_FILE", "monthly.json"),
]:
    os.environ[env] = os.path.join(tmp, name)
for env in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "API_ACCESS_TOKEN"):
    os.environ.pop(env, None)
os.environ["AUTO_PUSH_ENABLED"] = "false"
os.environ["INCHEON_API_SERVICE_KEY"] = "dummy"
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.getcwd())

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import monthly_schedule as ms  # noqa: E402
from app.services.aircraft_registration import _read_aircraft_registrations  # noqa: E402
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


# 기간·제목
check("제목: 'Monthly Scheduled Flight('26.11.1~11.30)'", ms._monthly_title(date(2026, 11, 5)) == "Monthly Scheduled Flight('26.11.1~11.30)", ms._monthly_title(date(2026, 11, 5)))
check("보관: 11월 → 11/01 ~ 12/02", ms._retention_window(date(2026, 11, 5))[:2] == ("2026-11-01", "2026-12-02"))
check("보관: 12월 → 12/01 ~ 다음 해 1/02", ms._retention_window(date(2026, 12, 31))[:2] == ("2026-12-01", "2027-01-02"))
check("보관: 윤년 2월 말일 29일", ms._retention_window(date(2028, 2, 10))[2] == "2028-02-29")
check("ETD/ETA 형식 정규화", [ms._norm_datetime(v) for v in ("2026-11-06 23:15", "2026/11/6 0:45", "202611062315", "2026.11.06 09:00")]
      == ["2026-11-06 23:15", "2026-11-06 00:45", "2026-11-06 23:15", "2026-11-06 09:00"])
check("편명 정규화 KJ0795 → KJ795", ms._norm_flight("KJ0795") == "KJ795" and ms._norm_flight("kj-283") == "KJ283")

today = _now_kst().date()
d0 = today.isoformat()
d1 = (today + timedelta(days=1)).isoformat()
prev_month_day = (today.replace(day=1) - timedelta(days=3)).isoformat()


def rec(flight, when, dep, arr, hl=""):
    return {"flight": flight, "skdTime": when, "departureCode": dep, "arrivalCode": arr, "registrationNo": hl}


# 1) 저장(월간 SKD 업로드)
res = client.post("/flights/monthly-schedule", json={"source": "excel", "records": [
    rec("KJ0795", f"{d0} 23:15", "ICN", "FRA", "HL7423"),
    rec("KJ967", f"{d0} 23:00", "ICN", "HKG", "7620"),
    rec("KJ911", f"{d1} 00:45", "ORD", "ICN", "HL7417"),
    rec("KJ248", f"{d0} 07:10", "ICN", "ATL"),
    rec("OZ0790", f"{d0} 09:00", "MXP", "ICN", "HL7419"),          # KJ 아님 → 제외
    rec("KJ1", "잘못된 시각", "ICN", "NRT"),                         # 시각 없음 → 제외
    rec("KJ22", f"{prev_month_day} 10:00", "ICN", "NRT"),           # 보관 기간 밖 → 제외
]}).json()
check("KJ 편 4건 저장, 잘못된 2건·기간 밖 1건 제외", res["saved"] == 4 and res["invalid"] == 2 and res["outsideWindow"] == 1, res)
check("등록기호 3건이 기존 등록기록에도 저장(③·초기화면에서 사용)", res["registrationSaved"] == 3, res)
regs = {(r["date"], r["flight"]): r["registrationNo"] for r in _read_aircraft_registrations()}
check("등록기록: KJ795 HL7423, 숫자만 넣은 7620 → HL7620", regs.get((d0, "KJ795")) == "HL7423" and regs.get((d0, "KJ967")) == "HL7620", regs)

data = client.get("/flights/monthly-schedule").json()
flights = {f["flight"]: f for f in data["flights"]}
check("조회: 4편, 일자·노선·시각 유지", set(flights) == {"KJ795", "KJ967", "KJ911", "KJ248"} and flights["KJ911"]["flightDate"] == d1 and flights["KJ911"]["skdTime"] == f"{d1} 00:45", data["flights"])
check("조회: 제목·보관 기간 포함", data["title"].startswith("Monthly Scheduled Flight('") and data["window"]["start"].endswith("-01"))

# 2) 담당 지정·이름
key967 = flights["KJ967"]["recordKey"]
res = client.post("/flights/monthly-schedule/assignee-slot", json={"recordKey": key967, "slot": "b"}).json()
check("편별 담당 B 지정", res["flight"]["assigneeSlot"] == "B", res)
check("담당은 A/B/C만", client.post("/flights/monthly-schedule/assignee-slot", json={"recordKey": key967, "slot": "D"}).status_code == 400)
res = client.post("/flights/monthly-schedule/assignees", json={"flightDate": d0, "shift": "C", "nameA": "홍길동", "nameB": "", "nameC": "김철수"}).json()
check("근무조별 담당 이름 저장(기본 2칸 A·B)", res["assignee"]["nameA"] == "홍길동" and res["assignee"]["shift"] == "C" and res["assignee"]["slotCount"] == 2, res)
res = client.post("/flights/monthly-schedule/assignees", json={"flightDate": d0, "shift": "A", "nameA": "박종규", "slotCount": 3}).json()
check("3칸(A·B·C) 선택 저장", res["assignee"]["slotCount"] == 3, res)
res = client.post("/flights/monthly-schedule/assignees", json={"flightDate": d0, "shift": "S", "nameA": "x", "slotCount": 7}).json()
check("잘못된 값은 기본 2칸으로", res["assignee"]["slotCount"] == 2, res)
got = {(a["flightDate"], a["shift"]): a for a in client.get("/flights/monthly-schedule").json()["assignees"]}
check("조회에서 근무조별 칸 수 유지", got[(d0, "A")]["slotCount"] == 3 and got[(d0, "C")]["slotCount"] == 2, got)

# 도착지(또는 출발지)가 비어 있으면 ICN 으로 채움
client.post("/flights/monthly-schedule", json={"replaceDates": False, "records": [rec("KJ932", f"{d0} 14:20", "CAN", ""), rec("KJ587", f"{d0} 16:15", "", "BRU")]})
infer = {f["flight"]: (f["departureCode"], f["arrivalCode"]) for f in client.get("/flights/monthly-schedule").json()["flights"]}
check("ARR 빈칸 → ICN, DEP 빈칸 → ICN", infer["KJ932"] == ("CAN", "ICN") and infer["KJ587"] == ("ICN", "BRU"), infer)
client.delete("/flights/monthly-schedule/" + f"{d0}|KJ932|CAN|ICN")
client.delete("/flights/monthly-schedule/" + f"{d0}|KJ587|ICN|BRU")
check("근무조는 A/C/S만", client.post("/flights/monthly-schedule/assignees", json={"flightDate": d0, "shift": "B"}).status_code == 400)

# 3) 같은 일자 SKD 재업로드: 빠진 편 삭제, 담당 지정은 유지
res = client.post("/flights/monthly-schedule", json={"records": [
    rec("KJ967", f"{d0} 23:00", "ICN", "HKG"),
    rec("KJ795", f"{d0} 23:20", "ICN", "FRA", "HL7423"),
]}).json()
data = client.get("/flights/monthly-schedule").json()
flights = {f["flight"]: f for f in data["flights"]}
check("재업로드: 그 일자에 없는 KJ248 삭제, 다른 일자 KJ911 유지", "KJ248" not in flights and "KJ911" in flights, list(flights))
check("재업로드: 담당 지정·등록기호 유지, 시각 갱신", flights["KJ967"]["assigneeSlot"] == "B" and flights["KJ967"]["registrationNo"] == "HL7620" and flights["KJ795"]["skdTime"].endswith("23:20"), flights)

# 4) 한 줄 수정(replaceDates=False)은 다른 편을 지우지 않음
client.post("/flights/monthly-schedule", json={"replaceDates": False, "records": [rec("KJ100", f"{d0} 12:00", "ICN", "NRT")]})
check("한 줄 추가는 같은 일자 다른 편 유지", {"KJ100", "KJ967", "KJ795"} <= {f["flight"] for f in client.get("/flights/monthly-schedule").json()["flights"]})

# 5) 삭제
key100 = next(f["recordKey"] for f in client.get("/flights/monthly-schedule").json()["flights"] if f["flight"] == "KJ100")
client.delete(f"/flights/monthly-schedule/{key100}")
check("편 삭제", "KJ100" not in {f["flight"] for f in client.get("/flights/monthly-schedule").json()["flights"]})

# 6) 보관 기간 밖 기록은 조회 때 자동 삭제
raw = json.loads(open(os.environ["MONTHLY_SCHEDULE_FILE"], encoding="utf-8").read())
raw["flights"]["old"] = {"record_key": "old", "flight_date": prev_month_day, "flight": "KJ9", "skd_time": f"{prev_month_day} 10:00"}
open(os.environ["MONTHLY_SCHEDULE_FILE"], "w", encoding="utf-8").write(json.dumps(raw, ensure_ascii=False))
client.get("/flights/monthly-schedule")
check("지난달 기록 자동 삭제", "old" not in json.loads(open(os.environ["MONTHLY_SCHEDULE_FILE"], encoding="utf-8").read())["flights"])

# 7) 인천 API 최신값 반영(가짜 API)
api_calls = []


async def fake_all_kj(start_date, end_date):
    api_calls.append(start_date)
    if start_date == d0:
        return [
            {"flightNo": "KJ967", "departureCode": "ICN", "arrivalCode": "HKG", "formattedScheduleTime": f"{d0.replace('-', '/')} 23:00",
             "formattedEstimatedTime": f"{d0.replace('-', '/')} 23:40", "remark": "지연", "gatenumber": "623"},
            {"flightNo": "KJ795", "departureCode": "ICN", "arrivalCode": "FRA", "formattedScheduleTime": f"{d0.replace('-', '/')} 23:20",
             "formattedEstimatedTime": f"{d0.replace('-', '/')} 23:20", "remark": "", "gatenumber": "-"},
        ]
    return []


result = asyncio.run(ms._refresh_monthly_api(fetch_all_kj=fake_all_kj))
check("API 갱신: 오늘~3일 뒤(4일) 조회", len(api_calls) == 4 and api_calls[0] == d0, api_calls)
flights = {f["flight"]: f for f in client.get("/flights/monthly-schedule").json()["flights"]}
check("API 변경시각·상태·게이트 반영", flights["KJ967"]["apiTime"] == f"{d0} 23:40" and flights["KJ967"]["apiRemark"] == "지연" and flights["KJ967"]["apiGate"] == "623", flights["KJ967"])
check("API 예정시각도 저장(API 변경 표시용)", flights["KJ967"]["apiSchedTime"] == f"{d0} 23:00" and flights["KJ795"]["apiSchedTime"] == f"{d0} 23:20", flights["KJ967"])
check("게이트 '-'는 빈칸, SKD 시각은 그대로", flights["KJ795"]["apiGate"] == "" and flights["KJ795"]["skdTime"].endswith("23:20"), flights["KJ795"])
check("API 에 없는 편은 API 값 없음", flights["KJ911"]["apiTime"] == "", flights["KJ911"])

# 도착지가 빈 인천 출발편: 인천 API 공항 코드로 채우고 중복 없이 키를 옮김
client.post("/flights/monthly-schedule", json={"replaceDates": False, "records": [rec("KJ587", f"{d0} 16:15", "ICN", "")]})
before = [f for f in client.get("/flights/monthly-schedule").json()["flights"] if f["flight"] == "KJ587"]
check("준비: ICN 출발 KJ587 의 도착지가 비어 있음", len(before) == 1 and before[0]["arrivalCode"] == "", before)


async def fake_all_kj_with_587(start_date, end_date):
    rows = await fake_all_kj(start_date, end_date)
    if start_date == d0:
        rows.append({"flightNo": "KJ587", "departureCode": "ICN", "arrivalCode": "BRU", "formattedScheduleTime": f"{d0.replace('-', '/')} 16:15",
                     "formattedEstimatedTime": f"{d0.replace('-', '/')} 17:00", "remark": "지연", "gatenumber": "621"})
    return rows


ms._last_api_refresh["at"] = None
asyncio.run(ms._refresh_monthly_api(fetch_all_kj=fake_all_kj_with_587))
after = [f for f in client.get("/flights/monthly-schedule").json()["flights"] if f["flight"] == "KJ587"]
check("API 로 ICN 출발편 도착지(BRU) 채움, 편은 1건만(중복 없음)", len(after) == 1 and after[0]["arrivalCode"] == "BRU" and after[0]["apiTime"].endswith("17:00") and after[0]["recordKey"].endswith("|ICN|BRU"), after)

api_calls.clear()
asyncio.run(ms._maybe_refresh_monthly_api(10, fetch_all_kj=fake_all_kj))
check("10분 안 재요청은 인천 API 호출 생략", api_calls == [], api_calls)

# 7-2) 화면 새로고침: 일반 열기는 3분 간격 생략, 새로고침 버튼(force)은 즉시 인천 API 재조회
import app.services.incheon_api as _incheon  # noqa: E402

api_calls.clear()
_incheon.get_all_kj_flight_data = fake_all_kj
client.get("/flights/monthly-schedule?refresh=true&force=true")
check("force=true: 방금 갱신했어도 인천 API 를 다시 조회", len(api_calls) == 4, api_calls)
api_calls.clear()
client.get("/flights/monthly-schedule?refresh=true")
check("force 없이 열면 3분 안 재요청은 생략", api_calls == [], api_calls)
ms._last_api_refresh["at"] = _now_kst() - timedelta(minutes=4)
client.get("/flights/monthly-schedule?refresh=true")
check("3분이 지나면 일반 열기도 다시 조회", len(api_calls) == 4, api_calls)

# 8) 토큰 보호
os.environ["API_ACCESS_TOKEN"] = "t"
check("토큰 설정 시 저장은 토큰 필요", client.post("/flights/monthly-schedule", json={"records": []}).status_code == 401)
check("조회는 토큰 없이 가능", client.get("/flights/monthly-schedule").status_code == 200)
os.environ.pop("API_ACCESS_TOKEN", None)

print(f"\n{passed}개 통과")
