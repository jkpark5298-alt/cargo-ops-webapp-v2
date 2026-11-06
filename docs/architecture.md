# Architecture

## 전체 구성

```
브라우저(PWA)                         Render (FastAPI)                   외부
┌──────────────────────┐   HTTPS    ┌────────────────────────┐
│ Next.js (Vercel)      │ ─────────▶ │ /flights  /notion       │ ──▶ 인천공항 화물기 API (공공데이터)
│  /          초기화면   │            │ /weather  /widget       │ ──▶ Notion API
│  /flights   편명조회   │ ◀───────── │ 자동 푸시 루프           │ ──▶ 날씨 API
│  /afocs-skd AFOCS SKD│   푸시     └───────────┬────────────┘ ──▶ Web Push
│  localStorage        │                         │
└──────────────────────┘                  Supabase + /tmp 파일
```

## 프론트엔드 구조

| 위치 | 역할 |
|---|---|
| `app/page.tsx`, `app/home/` | 초기화면. 화면 조립은 `page.tsx`, 기능별 상태·핸들러는 `home/hooks/*`(알림 이력, PWA 푸시, 사진, 일일 Notion, 특이사항 Notion, 텍스트 공유) |
| `app/flights/` | 편명조회. `hooks/*`(슬롯, 등록번호 편집, 조회, 선택·저장)와 `components/*`(탭별 패널·표) |
| `app/afocs-skd/` | Monthly Scheduled Flight 화면(월간 SKD를 일자·근무조별로 표시) |
| `app/components/` | 초기화면 카드(요약·일일 기록·특이사항·날씨·알림 이력 등) |
| `app/lib/` | **세 화면이 공유하는 규칙** (아래) |

### 공용 모듈 (`app/lib/`)

| 파일 | 내용 |
|---|---|
| `flight-types.ts` | `FlightRow`, `MonitorRoom`, `AircraftRegistrationRecord` |
| `flight-keys.ts` | 편명·등록번호 정규화 (`247`→`KJ247`, `7612`→`HL7612`) |
| `aircraft-registration.ts` | 등록 기록 저장(로컬+서버)과 **등록번호 우선순위** |
| `schedule-store.ts` | Schedule Flight 방 로컬 저장, 서버 저장·조회, 편명 목록과 행 맞춤 |
| `schedule-order.ts` | 편 목록의 수동 정렬 순서 저장 |
| `afocs-skd.ts` | AFOCS SKD 날짜·시간 파싱·병합 |
| `api-config.ts` | 백엔드 주소(`BACKEND_URL`) — 여기서만 환경변수를 읽음 |
| `csm-checklist.ts` | CSM CHECK LIST로 편명·SPOT 전달 |
| `notion-api.ts`, `local-storage.ts` | Notion 호출, 일일 기록·사진 로컬 저장(날짜별 Notion 기록 포함) |

## 핵심 규칙

### 등록번호 우선순위
`applyRegistrationToRows` (프론트) / `_apply_aircraft_registrations_to_rows` (백엔드) 가 같은 순서를 사용합니다.

1. 등록 기록 중 일자(+노선)가 맞는 **가장 최근 저장분**
2. (프론트) 이전 스케줄의 같은 일시·노선 행 값
3. 행에 이미 있는 값
4. 이전 스케줄의 같은 편명 값 → 등록 기록의 편명 단독 값(모든 날짜에서 HL이 하나뿐일 때만)

엑셀 업로드와 매뉴얼 저장은 모두 등록 기록을 남깁니다. 그래서 *엑셀 → 매뉴얼 수정* 이면 매뉴얼, *매뉴얼 → 엑셀* 이면 엑셀 값이 유지됩니다.

### 조회 기간 필터
- **조회 화면**(`POST /flights/`, 기본): 변경시각(없으면 예정시각) 기준으로 기간을 거릅니다. 지연되어 변경시각이 기간 밖으로 밀린 편(예: KJ283 예정 03:05 → 변경 20:35)이 조회에서 빠지는 것은 정상입니다.
- **Schedule Flight 카드 자동 갱신·변경 감지**: 예정시각 **또는** 변경시각 중 하나라도 기간 안이면 포함합니다(`includeScheduled: true`, `_row_matches_schedule_or_estimate_range`). 기간 밖으로 크게 지연된 편도 지연 알림이 누락되지 않게 하기 위함입니다.
- 서버 시각 비교(알림 시간대, 자동 갱신 주기 등)는 모두 `_now_kst()`(한국 시각)를 사용합니다. 서버 시간대(UTC)에 의존하는 `datetime.now()`는 쓰지 않습니다.

### 자동 변경 확인·푸시
- 서버 반복문은 1분마다 "확인할 때가 되었는지"만 검사하고, 실제 인천 API 조회는 평상시 30분·해외 출발편 운항 중 20분·집중 시간대 5분 간격입니다(cron의 `/flights/health`와 같은 `_run_auto_push_tick_if_due` 사용).
- 20분 기준: 해외 출발편(인천 도착)이 도착 1시간 전 이전이고 도착까지 16시간 이내로 남은 동안(출발 시각은 API에 없어 도착 시각으로 판단).
- 집중(5분) 기준: 인천 출발편은 출발 30분 전~1시간 후, 해외 출발(인천 도착)편은 도착 1시간 전~30분 후. 해외 출발편(인천 도착)은 도착 10분 전~30분 후에 "도착 예정 HH:MM (아직 도착 미확인)" 사전 알림을 한 번 보냅니다(시각만 보는 안내이며, 도착이 확인됐거나 결항·회항인 편에는 보내지 않음). 실제 도착은 인천 API 상태가 "도착"으로 바뀔 때 "상태 … (도착 확인)" 알림으로 구분합니다. 예정 시각이 지났는데 API가 아직 도착·출발을 알리지 않은 편은 "도착 지연"/"출발 지연"으로 표시하고(진행 중으로 유지), 인천 API remark가 실제로 도착·출발일 때만 "도착"/"출발"(도착은 "도착 확인" 알림)으로 처리합니다. 시간이 지나 추정해 붙인 상태(`statusInferred`)는 변경 비교에서 제외해 실제 도착 알림이 누락되거나 가짜 알림이 가지 않게 합니다.
- 변경 확인은 잠금(`_get_check_lock`)으로 한 번에 하나만 실행해 알림이 중복되지 않습니다.
- 푸시가 404/410으로 실패한 구독은 자동 삭제합니다(`_broadcast_web_push`).

### Monthly Scheduled Flight
- 월간 SKD(편명·등록기호·DEP·ARR·ETD/ETA)는 Supabase `monthly_schedule_flights`(담당 A/B/C 이름은 `monthly_schedule_assignees`)에 일자별로 저장합니다(`supabase/monthly_schedule_flights.sql`). 보관: 현재 달 1일 ~ 다음 달 2일, 그 밖은 저장·조회 때 자동 삭제.
- 인천 API는 오늘 기준 약 ±3일만 제공하므로, 서버가 10분마다, 화면을 열 때는 3분 간격으로(새로고침 버튼은 즉시) **오늘 ~ 3일 뒤** 편의 변경시각·상태·게이트를 월간 SKD에 반영합니다. 홈의 알림·Schedule Flight와는 분리된 보기 전용 데이터입니다.
- 유형 1에서는 시각 변경을 출처별로 보여줍니다: `API 변경`(인천 API 예정 → 변경, 서버가 `api_sched_time`에 저장)과 `SKD 변경`(월간 SKD → 현재 시각). 선택한 일자와 날짜가 다를 때만 날짜를 붙이고, 변동이 없는 줄은 생략합니다.
- 저장한 등록기호는 기존 등록기록(`aircraft_registration_records`)에도 함께 저장해 ③ 등록번호 / AFOCS·초기화면에서 그대로 사용합니다.
- 근무조(업무일자 기준): A 06:31~14:00 / C 14:01~23:59 / S 22:01~익일 06:30. 조를 먼저 고르므로 22:01~23:59 편은 C조·S조 모두에 표시됩니다. 담당은 기본 A·B 두 칸("3칸"을 선택하면 A·B·C)을 근무조 안에서 시간순으로 돌아가며 자동 배정하고, 표시는 이름이 있으면 `A(이름)`, 없으면 `A`입니다. 편별 지정도 가능합니다. 담당 이름이 "박종규"인 편은 행 전체를 굵은 글씨와 굵은 노란 테두리로 강조합니다(`HIGHLIGHT_ASSIGNEE`).

### Schedule Flight 편 삭제
`DELETE /flights/schedule-flights/{편명}`이 최신 일정과 연동 슬롯에서 편을 한 번에 지우고, 방 안에 삭제 기록(`removedFlights`, 24시간)을 남깁니다. 오래된 화면·다른 기기가 삭제 전 방 전체를 다시 저장해도 서버가 기록에 있는 편을 걸러냅니다. 사용자가 편명을 직접 편집해 저장하거나(`explicitEdit`) 새 Schedule Flight를 저장(rotate)하면 삭제 기록은 풀립니다. 마지막 편까지 삭제한 카드는 보관 카드로 바뀌지 않고 빈 카드로 유지됩니다.

### Schedule Flight 저장 계층
1. 브라우저 `localStorage`의 방 목록(`cargo_ops_monitor_rooms_v6`)
2. 서버 `latest-schedule`(초기화면 기준 1개) — 파일(`/tmp`) + Supabase
3. 서버 `schedule-slots`(active/archive 카드 2장) — 파일 + Supabase, 하나를 초기화면에 연동(`linkedSlot`)

Render의 `/tmp`는 재시작하면 사라지므로 운영에서는 Supabase 설정이 필수입니다.

알림 이력·푸시 구독·자동 푸시 상태(중복 방지 키 포함)는 `app_state_documents` 테이블(`supabase/app_state_documents.sql`)에 저장하고, 테이블이 없거나 장애일 때는 `/tmp` 파일로 대체합니다.

### 등록 기록 저장 계층
- 서버: Supabase `aircraft_registration_records`(기준) + `/tmp` 파일(읽기 캐시·대체). 서버를 재시작해도 기록이 유지됩니다.
- 브라우저: `localStorage`(`cargo_ops_aircraft_registration_records_v1`)는 **서버 목록으로 덮어쓰지 않고 합칩니다**(같은 운항은 나중에 저장한 값이 이김). 서버가 비어 있거나 장애여도 브라우저 기록은 지워지지 않고, 서버에 없는 기록은 다시 올려 복구합니다.
- 저장 시각은 UTC(`…Z`)로 통일해 비교합니다.

### Notion 일일 기록
업무일자별로 저장 기록을 관리하고(`local-storage.ts`), 화면의 "Notion 입력 여부"는 `GET /notion/daily-records?date=`로 Notion에 실제 기록이 있는지 확인합니다. 저장 전에도 같은 날짜 기록이 있으면 새로 만들지 않고 연결합니다.

## 백엔드 계층

`flight_common`(설정·시간·캐시·Supabase) → `flight_rows`(행 파싱, 순수 함수) → `flight_alerts`(문구) → 각 저장소 서비스(`aircraft_registration`, `schedule_store`, `notification_store`, `incheon_usage`, `daily_report_store`) → `schedule_monitor`(변경 감지·자동 푸시) → `routes/flights/*`. 아래 계층은 위 계층을 import 하지 않습니다.

## 변경할 때 확인할 것

- 등록번호·편명 정규화·스케줄 저장 규칙은 **`app/lib/*` 한 곳만** 고치고, 백엔드 `aircraft_registration.py`의 같은 규칙과 맞는지 확인합니다.
- 화면 로직을 옮긴 뒤에는 `frontend/scripts/render-smoke.cjs`, 백엔드는 `backend/scripts/api_smoke_test.py`를 변경 전/후로 실행해 결과를 비교합니다.
