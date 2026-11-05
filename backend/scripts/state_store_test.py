"""알림 이력·푸시 구독·자동 푸시 상태의 Supabase 영구 저장 테스트 (가짜 Supabase + 임시 파일, 운영 영향 없음).

사용법 (backend 폴더에서): python scripts/state_store_test.py
"""
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.getcwd())
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

tmp = tempfile.mkdtemp(prefix="state-store-test-")
for env, name in [("PUSH_SUBSCRIPTIONS_FILE", "push.json"), ("AUTO_PUSH_STATUS_FILE", "auto.json"),
                  ("NOTIFICATION_HISTORY_FILE", "history.json")]:
    os.environ[env] = os.path.join(tmp, name)
os.environ["SUPABASE_URL"] = "https://fake.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "fake"

from app.services import notification_store as ns  # noqa: E402

passed = 0


def check(name, cond, detail=""):
    global passed
    if cond:
        passed += 1
        print("OK  ", name)
    else:
        print("FAIL", name, detail)
        sys.exit(1)


DB = {}
MODE = {"down": False, "no_table": False}


def fake_request(method, path, payload=None, extra_headers=None):
    if MODE["down"] or MODE["no_table"]:
        raise RuntimeError("supabase down")
    if method == "GET":
        key = path.split("doc_key=eq.")[1].split("&")[0]
        return [{"payload": DB[key]}] if key in DB else []
    DB[payload["doc_key"]] = payload["payload"]
    return None


ns._supabase_request = fake_request


def wipe_files():
    for name in ("push.json", "auto.json", "history.json"):
        try:
            os.remove(os.path.join(tmp, name))
        except FileNotFoundError:
            pass


sub = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "x", "auth": "y"}}
ns._write_push_subscriptions([sub])
ns._write_auto_push_status({"enabled": True, "intervalMinutes": 30, "arrivalPreAlertKeys": ["KJ1:202611061200"]})
ns._write_notification_history([{"id": "1", "flight": "KJ932"}])

wipe_files()  # 서버 재시작(/tmp 초기화) 흉내
check("재시작 후에도 푸시 구독 유지", ns._read_push_subscriptions() == [sub])
check("재시작 후에도 알림 이력 유지", ns._read_notification_history() == [{"id": "1", "flight": "KJ932"}])
status = ns._read_auto_push_status()
check("재시작 후에도 자동 푸시 상태·중복 방지 키 유지",
      status["intervalMinutes"] == 30 and status["arrivalPreAlertKeys"] == ["KJ1:202611061200"], status)

ns._write_notification_history([])
check("이력을 비우면 비운 상태가 유지", ns._read_notification_history() == [])

# Supabase 장애 → 파일로 계속 동작
MODE["down"] = True
ns._write_push_subscriptions([sub, {**sub, "endpoint": "https://push.example/def"}])
check("장애 중에도 저장은 파일로 계속(예외 없음)", len(ns._read_push_subscriptions()) == 2)
MODE["down"] = False

# 테이블이 아직 없을 때(SQL 실행 전) → 기존처럼 파일만 사용
DB.clear()
MODE["no_table"] = True
ns._write_auto_push_status({"enabled": False})
check("테이블이 없어도 기존 방식으로 동작", ns._read_auto_push_status()["enabled"] is False)

# Supabase 미설정 → 파일만
MODE["no_table"] = False
ns._supabase_usage_enabled = lambda: False
ns._write_notification_history([{"id": "2"}])
check("Supabase 미설정이면 파일만 사용", ns._read_notification_history() == [{"id": "2"}] and not DB)

shutil.rmtree(tmp, ignore_errors=True)
print(f"\n{passed}개 통과")
