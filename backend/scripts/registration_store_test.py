"""등록기호 저장소 테스트 — Supabase(가짜 PostgREST)와 임시 파일 저장을 모두 확인한다.

핵심 시나리오: 서버(Render)가 재시작되어 /tmp 파일이 사라져도 Supabase 에서 기록이 복구된다.
사용법 (backend 폴더에서): python scripts/registration_store_test.py
"""
import os
import sys
import tempfile
import urllib.parse
from pathlib import Path

sys.path.insert(0, os.getcwd())
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

tmp = tempfile.mkdtemp(prefix="reg-store-test-")
os.environ["AIRCRAFT_REGISTRATION_FILE"] = os.path.join(tmp, "reg.json")
os.environ["LATEST_SCHEDULE_FILE"] = os.path.join(tmp, "latest.json")
os.environ["SCHEDULE_SLOTS_FILE"] = os.path.join(tmp, "slots.json")
for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"):
    os.environ.pop(key, None)

from fastapi import HTTPException  # noqa: E402

from app.routes.flights import registrations as route  # noqa: E402
from app.services import aircraft_registration as store  # noqa: E402

passed = 0


def check(name, condition, detail=""):
    global passed
    if condition:
        passed += 1
        print("OK  ", name)
    else:
        print("FAIL", name, detail)
        sys.exit(1)


class FakeSupabase:
    """PostgREST 의 필요한 부분만 흉내: GET(select/order/limit/offset), POST upsert(on_conflict=record_key)."""

    def __init__(self):
        self.table = {}
        self.fail = False
        self.calls = []

    def request(self, method, path, payload=None, extra_headers=None):
        self.calls.append((method, path))
        if self.fail:
            raise RuntimeError("supabase down")
        assert path.startswith("/rest/v1/aircraft_registration_records")
        if method == "GET":
            query = urllib.parse.parse_qs(urllib.parse.urlparse(path).query)
            limit = int(query["limit"][0])
            offset = int(query["offset"][0])
            rows = [self.table[k] for k in sorted(self.table)]
            return [dict(r) for r in rows[offset : offset + limit]]
        if method == "POST":
            for row in payload:
                assert row["updated_at"].endswith("Z"), row["updated_at"]  # UTC 로 통일해서 보낸다
                self.table[row["record_key"]] = dict(row)
            return None
        raise AssertionError(method)


fake = FakeSupabase()


def use_supabase(enabled: bool):
    store._supabase_usage_enabled = (lambda: True) if enabled else (lambda: False)
    store._supabase_request = fake.request


def restart_server():
    """Render 재시작: /tmp 파일과 메모리 캐시가 사라진다."""
    Path(os.environ["AIRCRAFT_REGISTRATION_FILE"]).unlink(missing_ok=True)
    store._registration_cache["records"] = None
    store._registration_cache["expires"] = 0.0


def rec(date, flight, dep, arr, no, updated):
    return {"date": date, "flight": flight, "departureCode": dep, "arrivalCode": arr, "registrationNo": no, "updatedAt": updated}


EXCEL = [
    rec("2026-11-06", "KJ977", "ICN", "TSN", "HL8355", "2026-11-05T06:00:00.000Z"),
    rec("2026-11-06", "KJ918", "TAO", "ICN", "HL8319", "2026-11-05T06:00:00.000Z"),
    rec("2026-11-06", "KJ978", "TSN", "ICN", "HL8355", "2026-11-05T06:00:00.000Z"),
]

# ── 1) Supabase 미설정: 기존처럼 파일 저장 ──
use_supabase(False)
restart_server()
saved = store._save_aircraft_registrations(EXCEL)
check("Supabase 미설정: 파일에 저장·조회", len(saved["records"]) == 3 and len(store._read_aircraft_registrations()) == 3)
restart_server()
check("Supabase 미설정: 재시작하면 기록이 사라짐(기존 한계, 그래서 Supabase 필요)", store._read_aircraft_registrations() == [])

# ── 2) Supabase 설정: 재시작해도 복구 ──
use_supabase(True)
restart_server()
saved = store._save_aircraft_registrations(EXCEL)
check("Supabase 저장: 3건이 테이블에 들어감", len(fake.table) == 3 and saved["changed"] == 3, fake.table)
check("저장 시각은 UTC(Z)로 통일", all(r["updated_at"].endswith("Z") for r in fake.table.values()))
restart_server()
records = store._read_aircraft_registrations(strict=True)
check("★ 서버 재시작 후에도 Supabase 에서 3건 복구(KJ977·KJ918·KJ978)", sorted(r["flight"] for r in records) == ["KJ918", "KJ977", "KJ978"], records)
check("복구한 기록의 등록기호가 유지됨", {r["flight"]: r["registrationNo"] for r in records} == {"KJ977": "HL8355", "KJ918": "HL8319", "KJ978": "HL8355"})

# ── 3) 오래된 값은 최근 값을 덮어쓰지 못함 / 최근 값은 덮어씀 ──
stale = store._save_aircraft_registrations([rec("2026-11-06", "KJ977", "ICN", "TSN", "HL0001", "2026-11-05T05:00:00.000Z")])
check("오래된 저장은 무시(변경 0건)", stale["changed"] == 0 and fake.table["2026-11-06|KJ977|ICN|TSN"]["registration_no"] == "HL8355")
newer = store._save_aircraft_registrations([rec("2026-11-06", "KJ977", "ICN", "TSN", "HL7777", "2026-11-05T07:00:00.000Z")])
check("최근 저장은 반영", newer["changed"] == 1 and fake.table["2026-11-06|KJ977|ICN|TSN"]["registration_no"] == "HL7777")

# ── 4) 시각 형식이 섞여도 정확히 비교(+09:00 vs Z) ──
kst_old = rec("2026-11-06", "KJ918", "TAO", "ICN", "HL1111", "2026-11-05T15:00:00+09:00")  # = 06:00Z, 기존과 같은 시각
kst_new = rec("2026-11-06", "KJ918", "TAO", "ICN", "HL2222", "2026-11-05T17:00:00+09:00")  # = 08:00Z, 더 최근
store._save_aircraft_registrations([kst_new])
check("+09:00 형식의 더 최근 시각이 반영됨(문자열 비교로는 틀리는 경우)", fake.table["2026-11-06|KJ918|TAO|ICN"]["registration_no"] == "HL2222")
out = store._save_aircraft_registrations([kst_old])
check("+09:00 형식의 더 오래된 시각은 무시", out["changed"] == 0 and fake.table["2026-11-06|KJ918|TAO|ICN"]["registration_no"] == "HL2222")
check("시각 정규화: +09:00 → UTC Z", store._normalize_updated_at("2026-11-05T15:00:00+09:00") == "2026-11-05T06:00:00.000Z")

# ── 5) replace 모드도 기록을 지우지 않음 ──
before = len(store._read_aircraft_registrations())
store._save_aircraft_registrations([rec("2026-11-07", "KJ111", "ICN", "HKG", "HL7000", "2026-11-05T09:00:00.000Z")], "replace")
check("replace 모드: 기존 기록을 지우지 않고 병합", len(store._read_aircraft_registrations()) == before + 1)
store._save_aircraft_registrations([], "replace")
check("빈 목록 replace 로도 전체가 사라지지 않음", len(store._read_aircraft_registrations()) == before + 1)

# ── 6) 최초 연결 시 /tmp 파일의 기존 기록을 Supabase 로 이전 ──
fake.table.clear()
restart_server()
use_supabase(False)
store._save_aircraft_registrations(EXCEL)           # 파일에만 있는 상태(Supabase 도입 전 기록)
store._registration_cache["records"] = None
use_supabase(True)
migrated = store._read_aircraft_registrations(strict=True)
check("파일 → Supabase 이전: 기존 3건이 테이블로 옮겨짐", len(migrated) == 3 and len(fake.table) == 3, fake.table)

# ── 7) 페이지 단위 조회(1,000건 초과 대비) ──
fake.table.clear()
restart_server()
store._REGISTRATION_PAGE_SIZE = 3
many = [rec("2026-11-06", f"KJ{100 + i}", "ICN", "HKG", "HL7000", "2026-11-05T06:00:00.000Z") for i in range(8)]
store._save_aircraft_registrations(many)
restart_server()
check("페이지 단위로 8건 모두 조회", len(store._read_aircraft_registrations(strict=True)) == 8)
store._REGISTRATION_PAGE_SIZE = 1000

# ── 8) Supabase 장애: 빈 목록으로 응답하지 않고 오류로 알림 ──
restart_server()
fake.fail = True
try:
    store._read_aircraft_registrations(strict=True)
    check("장애 시 strict 조회는 예외", False)
except RuntimeError:
    check("장애 시 strict 조회는 예외(빈 목록 아님)", True)
check("장애 시 내부 계산용 조회는 파일 기록으로 대체(서비스 계속)", isinstance(store._read_aircraft_registrations(strict=False), list))
try:
    import asyncio
    asyncio.run(route.get_aircraft_registrations())
    check("장애 시 GET 은 503", False)
except HTTPException as exc:
    check("장애 시 GET /aircraft-registrations 는 503(빈 목록 200 아님)", exc.status_code == 503, exc.detail)
try:
    from app.routes.flights.models import AircraftRegistrationRecord, AircraftRegistrationSaveRequest
    payload = AircraftRegistrationSaveRequest(records=[AircraftRegistrationRecord(**{k: v for k, v in EXCEL[0].items()})], mode="merge")
    asyncio.run(route.save_aircraft_registrations(payload))
    check("장애 시 POST 는 502", False)
except HTTPException as exc:
    check("장애 시 POST /aircraft-registrations 는 502(저장 실패를 알림)", exc.status_code == 502, exc.detail)
fake.fail = False

# ── 9) 저장 호출 횟수: 조회 캐시로 요청 폭주 방지 ──
restart_server()
fake.calls.clear()
for _ in range(5):
    store._read_aircraft_registrations()
check("짧은 시간의 반복 조회는 Supabase 를 한 번만 호출(캐시)", sum(1 for c in fake.calls if c[0] == "GET") <= 2, fake.calls)

print(f"\n{passed}개 통과")
