# Frontend (Next.js)

Cargo Ops WebApp의 프론트엔드입니다. (Next.js 14 App Router · React 18 · TypeScript)

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 타입 체크 + 프로덕션 빌드
```

## 환경변수

| 이름 | 설명 |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_BACKEND_URL` | 백엔드 주소. `app/lib/api-config.ts`가 위 순서로 읽음(같은 값으로 설정). 없으면 `https://cargo-ops-backend.onrender.com` |
| `NEXT_PUBLIC_CSM_CHECKLIST_URL` | CSM CHECK LIST 주소(기본 `https://csm-checklist.vercel.app`) |

## 구조

```
app/
  page.tsx                  초기화면 (화면 조립)
  home/                     초기화면 전용: types / constants / helpers / styles / hooks / components
  flights/                  편명조회: page.tsx + hooks/ components/ lib/ styles.ts
  fixed-lite/               AFOCS SKD 화면: page.tsx + hooks/ components/ …
  components/               초기화면 카드 컴포넌트
  lib/                      세 화면 공용 규칙 (docs/architecture.md 참고)
  api/health/               헬스 라우트
public/sw.js               서비스 워커(푸시 수신)
scripts/                   테스트 스크립트
```

각 화면의 `page.tsx`는 상태를 이어 붙이고 JSX를 조립하는 역할만 하고, 기능별 상태·핸들러는 `hooks/use*.ts`에 있습니다. 새 기능은 가능하면 훅과 하위 컴포넌트로 추가하세요.

## 공용 모듈을 먼저 쓰세요

편명·등록번호·스케줄 저장 로직은 `app/lib/`에 한 벌만 있습니다. 화면 파일에 같은 함수를 다시 만들지 마세요.

```ts
import { normalizeFlightKey, getRegistrationNo } from "../lib/flight-keys";
import { applyRegistrationToRows } from "../lib/aircraft-registration";
import { loadRooms, saveLatestScheduleToServer } from "../lib/schedule-store";
import { BACKEND_URL } from "../lib/api-config";
```

## 테스트

```bash
node scripts/test-lib.cjs                                   # 공용 규칙 단위 테스트
npm i --no-save jsdom && node scripts/render-smoke.cjs . out.json   # 세 화면 렌더링·클릭·API 호출 기록
```

리팩터링 전/후 코드로 `render-smoke.cjs`를 각각 실행해 JSON을 `diff` 하면 화면 문구·버튼·호출한 API·저장된 데이터 차이를 확인할 수 있습니다.
