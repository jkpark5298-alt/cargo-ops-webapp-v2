# Cargo Ops Backend

FastAPI 서버입니다. 인천공항 화물기 API 조회, Schedule Flight 저장·동기화, 등록기호 관리, 변경 감지·웹푸시, Notion 기록, 날씨를 제공합니다.

## 구조

```
app/main.py                  앱 생성, CORS, 라우터 등록
app/routes/
  health.py                  GET /health/health
  weather.py  widget.py      날씨 / 위젯용 고정 스케줄 요약
  notion.py                  /notion  일일·특이사항 Notion 기록, 날짜별 조회
  flights/                   /flights  (기능별 라우터를 __init__.py에서 묶음)
    search.py                편명·KJ 전체 조회
    schedule.py              최신 Schedule Flight, 슬롯(active/archive)
    registrations.py         항공기 등록기호
    daily_report.py          Daily 업무보고 텍스트
    push.py                  푸시 구독·테스트
    monitoring.py            변경 확인, 자동 푸시, 호출량, 헬스체크
    history.py               알림 기록
    models.py                요청 본문 모델
app/services/
  incheon_api.py             공공데이터 인천공항 화물기 API 호출·파싱
  flight_common.py           환경설정·파일 경로·KST·검색 캐시·Supabase 요청
  flight_rows.py             편 행 파싱·시간 범위·상태 판정(순수 함수)
  flight_alerts.py           알림/푸시 문구
  aircraft_registration.py   등록기호 기록 정규화·저장·행 적용
  schedule_store.py          최신 스케줄과 슬롯 저장·동기화 (파일 + Supabase)
  schedule_monitor.py        변경 감지, 자동 푸시 루프
  notification_store.py      알림 기록·푸시 구독·자동 푸시 상태, 웹푸시 발송
  incheon_usage.py           인천 API 일일 호출량
  daily_report_store.py      Daily 업무보고 텍스트(Supabase)
  notion.py  weather.py      Notion / 날씨 연동
scripts/
  api_smoke_test.py          /flights API 스모크 테스트
  generate_vapid_keys.py     웹푸시 VAPID 키 생성
```

서비스 계층은 아래 방향으로만 의존합니다(순환 없음):
`flight_common` → `flight_rows` → `flight_alerts` → `notification_store` … → `schedule_monitor` → 라우터.

## 실행

```bash
cd backend
pip install -r requirements.txt
INCHEON_API_SERVICE_KEY=키 uvicorn app.main:app --reload
```

## 환경변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `INCHEON_API_SERVICE_KEY` | — | 공공데이터포털 인천공항 화물기 API 서비스키(Decoding 키) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase 저장소(없으면 `/tmp` 파일만 사용 → 서버 재시작 시 사라짐) |
| `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | — | 웹푸시 VAPID 키 (`scripts/generate_vapid_keys.py`) |
| `AUTO_PUSH_ENABLED`, `AUTO_PUSH_INTERVAL_MINUTES` | `true`, `30` | 자동 변경 확인·푸시 |
| `NOTION_TOKEN`, `NOTION_DAILY_DATABASE_ID`, `NOTION_ISSUE_DATABASE_ID` | — | Notion 기록 |
| `NOTION_VERSION`, `NOTION_MAX_IMAGE_BYTES` | `2026-03-11`, 20MB | Notion API 버전, 이미지 최대 크기 |
| `WEATHER_API_KEY`, `WEATHER_NX`, `WEATHER_NY`, `AIRKOREA_API_KEY`, `AIRKOREA_STATION_NAME`, `WEATHER_CACHE_TTL_SECONDS` | | 날씨 |
| `FLIGHT_SEARCH_CACHE_TTL_SECONDS`, `FLIGHT_SEARCH_CACHE_MAX_ITEMS` | `180`, `60` | 조회 결과 메모리 캐시 |
| `INCHEON_API_DEPARTURE_DAILY_LIMIT`, `INCHEON_API_ARRIVAL_DAILY_LIMIT`, `INCHEON_API_WARNING_RATE` | `100000`, `100000`, `90` | 인천 API 호출량 경고 기준 |
| `LATEST_SCHEDULE_FILE`, `SCHEDULE_SLOTS_FILE`, `PUSH_SUBSCRIPTIONS_FILE`, `AUTO_PUSH_STATUS_FILE`, `NOTIFICATION_HISTORY_FILE`, `INCHEON_API_USAGE_FILE`, `AIRCRAFT_REGISTRATION_FILE` | `/tmp/cargo_ops_*.json` | 임시 파일 저장 위치(테스트 시 바꿔서 사용) |

## API

| 메서드·경로 | 설명 |
|---|---|
| `POST /flights/` | 편명 목록 조회 (`flights`, `start`, `end`). 예정시각 또는 변경시각 기준 기간 필터는 `flight_rows._row_matches_time_range` |
| `POST /flights/kj-all` | 기간 내 KJ 전체 조회 |
| `GET·POST /flights/latest-schedule` | 초기화면 기준 Schedule Flight(고정 방) 조회·저장 |
| `POST /flights/latest-schedule/check-push-and-save` | 변경 확인 + 푸시 + 저장 |
| `GET·DELETE /flights/schedule-slots`, `POST …/save`, `…/link/{slot}`, `…/swap`, `DELETE …/{slot}` | Schedule Flight 카드 2장(active/archive) 관리, 초기화면 연동 |
| `GET·POST /flights/aircraft-registrations` | 등록기호 기록 조회·저장(`mode`: merge/replace) |
| `GET·POST /flights/daily-report-text` | Daily 업무보고 텍스트 공유 |
| `POST /flights/check-schedule`, `…/check-schedule-and-push` | 변경 확인 / 확인 후 푸시 |
| `GET /flights/auto-push/status`, `POST …/config` | 자동 푸시 상태·설정 |
| `GET /flights/push-public-key`, `POST /flights/push-subscriptions`, `GET …/count`, `POST /flights/push-test` | 웹푸시 |
| `GET·DELETE /flights/notification-history`, `POST …/clear`, `POST …/delete-item` | 알림 기록 |
| `GET /flights/incheon-api-usage`, `GET …/incheon-api-probe` | 인천 API 호출량·진단 |
| `GET /flights/health` | 서버 깨우기용. 호출될 때 자동 푸시 시각이 되었으면 함께 실행([CRON_HEALTH_SETUP.md](../CRON_HEALTH_SETUP.md)). `?tick=false`면 실행하지 않고 상태만 반환 |
| `GET /health/health` | 단순 상태 확인 |
| `GET /notion/links`, `GET·POST /notion/daily-records`, `PATCH·DELETE …/{page_id}`, `POST /notion/issue-records`, `PATCH·DELETE …/{page_id}` | Notion 기록. `GET /notion/daily-records?date=YYYY-MM-DD`는 그 날짜 기록이 Notion에 있는지 조회 |
| `GET /weather/current`, `GET /widget/fixed/{room_id}` | 날씨 / 위젯 요약 |

## 등록기호 우선순위

프론트(`frontend/app/lib/aircraft-registration.ts`)와 같은 순서로 행에 적용합니다.
1. 일자(+노선)가 맞는 **가장 최근에 저장한** 등록 기록
2. 행에 이미 있는 값
3. 편명 단독 기록

엑셀 업로드와 매뉴얼 저장은 모두 등록 기록으로 남으므로 "나중에 저장한 값이 이깁니다".

## 테스트

```bash
python scripts/api_smoke_test.py result.json
```
임시 파일 저장소와 가짜 인천 API로 `/flights` 주요 API를 호출해 응답을 JSON으로 저장합니다. 코드를 옮기거나 나눈 뒤 변경 전/후 결과를 `diff` 해서 동작 차이를 확인합니다.
