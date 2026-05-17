# OCR 기능 삭제 및 초기 화면 개선 적용 가이드

## 목표

- OCR 기능은 현재 앱에서 완전히 제거합니다.
- 추후 OCR은 별도 모듈/브랜치에서 재개발 후 다시 연결합니다.
- 현재 앱은 편명 조회, Monitor Room, FIXED Lite에 집중합니다.

## 교체 파일

아래 파일은 전체 교체하세요.

```txt
backend/app/main.py
backend/requirements.txt
frontend/app/page.tsx
.gitignore
```

## 삭제 파일

아래 파일은 삭제하세요.

```txt
backend/app/routes/ocr.py
backend/app/services/vision_ocr.py
frontend/app/upload/page.tsx
```

## 선택 삭제 파일

현재 앱에서 사용하지 않는 샘플/실험 코드라면 삭제 권장입니다.

```txt
backend/routes/api_calls.py
backend/routes/notification.py
backend/routes/state_change_detection.py
frontend/src/components/FlightMonitor.js
```

해당 파일들이 실제 코드에서 import되지 않는지 확인 후 삭제하세요.

## 적용 명령 예시

PowerShell 기준입니다.

```powershell
git pull --rebase origin main

# 파일 교체 후 OCR 파일 삭제
Remove-Item backend/app/routes/ocr.py -Force
Remove-Item backend/app/services/vision_ocr.py -Force
Remove-Item frontend/app/upload/page.tsx -Force

# 선택 삭제는 파일 존재 여부 확인 후 실행
# Remove-Item backend/routes/api_calls.py -Force
# Remove-Item backend/routes/notification.py -Force
# Remove-Item backend/routes/state_change_detection.py -Force
# Remove-Item frontend/src/components/FlightMonitor.js -Force

git add .
git commit -m "chore: remove OCR and improve home screen"
git push origin main
```

## 배포 후 확인

### Render 백엔드

```txt
https://cargo-ops-backend.onrender.com/docs
```

정상 상태:

- `/ocr/extract`가 보이지 않아야 합니다.
- `/flights/`는 보여야 합니다.
- `/widget/fixed/{room_id}`는 필요 시 남아 있어도 됩니다.

### Vercel 프론트

```txt
https://cargo-ops-webapp.vercel.app
```

정상 상태:

- 초기 화면이 개선된 카드형 대시보드로 보입니다.
- OCR/업로드 메뉴가 보이지 않습니다.
- 편명 조회, FIXED Lite 진입이 가능합니다.
