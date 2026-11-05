# Cargo Ops WebApp

인천공항 화물기(에어제타 KJ 편) 운항을 모니터링하고, 현장 업무 기록(사진·메모·Notion)과 알림(PWA 푸시)을 한곳에서 다루는 웹앱입니다.

| 구분 | 기술 | 배포 |
|---|---|---|
| 프론트엔드 | Next.js 14 (App Router) · React 18 · TypeScript | Vercel |
| 백엔드 | FastAPI (Python 3.11) | Render (Docker) |
| 저장소 | Supabase(Postgres) + 서버 임시 파일(`/tmp`) 이중 저장, 브라우저 localStorage | Supabase |
| 외부 연동 | 공공데이터포털 인천공항 화물기 API, Notion, 기상(에어코리아/기상청), Web Push | |

## 화면

| 주소 | 화면 | 설명 |
|---|---|---|
| `/` | 초기화면 | 오늘 업무: Schedule Flight 요약, 알림 이력, PWA 푸시, 일일 업무 기록(사진·메모→Notion), 특이사항 |
| `/flights` | 편명조회 | ① 편명 조회 및 저장 · ② 편명 수정 · ③ 등록번호 / AFOCS (엑셀 일괄 등록 포함) |
| `/afocs-skd` | Monthly Scheduled Flight | 월간 SKD를 일자·근무조(A/C/S)별로 보기. 유형 1(오늘~모레, 인천 API 반영) / 유형 2(월간 SKD 추정). 월간 SKD 입력(붙여넣기·엑셀·한 줄) (예전 주소 `/fixed-lite`도 이 화면으로 연결) |

## 폴더 구조

```
backend/                 FastAPI 서버 (자세한 내용: backend/README.md)
  app/routes/flights/    /flights API (기능별 라우터)
  app/services/          비즈니스 로직 (스케줄 저장, 등록기호, 알림, 인천 API …)
frontend/                Next.js 앱 (자세한 내용: frontend/README.md)
  app/page.tsx           초기화면          app/home/       초기화면의 훅·헬퍼·스타일
  app/flights/           편명조회          app/afocs-skd/ Monthly Scheduled Flight
  app/lib/               세 화면이 공유하는 규칙(편명 정규화, 등록번호 우선순위, 스케줄 저장 …)
supabase/                테이블 생성 SQL
docs/architecture.md     구조·데이터 흐름·핵심 규칙
```

## 실행

```bash
# 백엔드
cd backend
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export INCHEON_API_SERVICE_KEY=발급받은_Decoding_키
uvicorn app.main:app --reload                      # http://localhost:8000

# 프론트엔드
cd frontend
npm install
npm run dev                                        # http://localhost:3000
```

프론트는 `NEXT_PUBLIC_API_BASE_URL`(없으면 `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BACKEND_URL`) 순서로 백엔드 주소를 읽고, 모두 없으면 `https://cargo-ops-backend.onrender.com`을 사용합니다. 세 변수는 같은 값으로 두세요. CSM CHECK LIST 연동 주소는 `NEXT_PUBLIC_CSM_CHECKLIST_URL`(기본 `https://csm-checklist.vercel.app`)입니다.

## 테스트

코드를 옮기거나 나눈 뒤 동작이 그대로인지 확인하는 용도입니다.

```bash
# 프론트: 공용 규칙(편명 정규화·등록번호 우선순위·스케줄 저장소) 단위 테스트
cd frontend && node scripts/test-lib.cjs

# 프론트: 세 화면을 jsdom에서 렌더링(효과·클릭·입력 포함)하고 화면·API 호출을 JSON으로 저장
cd frontend && npm i --no-save jsdom && node scripts/render-smoke.cjs . result.json
#   → 변경 전/후 코드로 각각 실행해 result.json을 diff 하면 동작 차이를 찾을 수 있습니다.

# 백엔드: /flights API 스모크 테스트 (임시 파일 저장소, 인천 API는 가짜 응답)
cd backend && python scripts/api_smoke_test.py result.json
```

## 배포

`main` 브랜치에 푸시하면 백엔드(Render, `autoDeploy`)와 프론트엔드(Vercel)가 자동 배포됩니다.

## 문서

- [docs/architecture.md](docs/architecture.md) — 구조와 핵심 규칙
- [backend/README.md](backend/README.md) — 백엔드 구조·환경변수·API
- [frontend/README.md](frontend/README.md) — 프론트 구조와 공용 모듈
- [CRON_HEALTH_SETUP.md](CRON_HEALTH_SETUP.md) — Render 서버 깨우기·자동 푸시 트리거(cron)
- [PWA_PUSH_GUIDE.md](PWA_PUSH_GUIDE.md) — PWA 웹푸시 구현 가이드
