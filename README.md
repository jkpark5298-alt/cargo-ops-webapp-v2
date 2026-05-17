# Cargo Ops Backend - Step 4

이 백엔드는 다음 기능을 담당합니다.

- Google Vision OCR 기반 이미지 문자 추출
- 이름/편명/주기장 1차 파싱
- 인천공항 화물기 API 조회
- 이후 단계에서 알림 엔진 연결 예정

## 1. 로컬 실행

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

## 2. Google Vision 설정

### 권장 방식
Google Cloud 서비스 계정 JSON 전체를 한 줄 문자열로 `GOOGLE_APPLICATION_CREDENTIALS_JSON` 환경변수에 넣습니다.

예시:

```env
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}
```

## 3. 인천공항 API 설정

`.env`에 아래 값을 넣습니다.

```env
INCHEON_API_SERVICE_KEY=발급받은키
```

키가 없으면 `/flights/lookup`은 데모 응답을 반환합니다.

## 4. 주요 API

### 상태 확인
`GET /health`

### OCR 추출
`POST /ocr/extract`
- form-data
- key: `file`

### 편명 조회
`GET /flights/lookup?flight_no=5X123&search_day=20260419`

## 5. Render 배포

- Root Directory: `backend`
- Runtime: Docker
- Environment Variables 등록 필요
