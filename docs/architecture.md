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
| `app/afocs-skd/` | AFOCS SKD 화면. `hooks/*`(날씨, 일일 보고 동기화, 정렬)와 `components/*` |
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
`POST /flights/`는 **예정시각 또는 변경시각**이 조회 기간 안이면 포함합니다. 지연되어 변경시각이 기간 밖으로 밀린 편(예: KJ283 예정 03:05 → 변경 20:35)이 기간을 넓히면 나타나는 것은 정상입니다.

### Schedule Flight 저장 계층
1. 브라우저 `localStorage`의 방 목록(`cargo_ops_monitor_rooms_v6`)
2. 서버 `latest-schedule`(초기화면 기준 1개) — 파일(`/tmp`) + Supabase
3. 서버 `schedule-slots`(active/archive 카드 2장) — 파일 + Supabase, 하나를 초기화면에 연동(`linkedSlot`)

Render의 `/tmp`는 재시작하면 사라지므로 운영에서는 Supabase 설정이 필수입니다.

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
