# Render 서버 깨우기용 health endpoint

## 추가된 URL

```txt
https://cargo-ops-backend.onrender.com/flights/health
```

## cron-job.org 권장 설정

- URL: https://cargo-ops-backend.onrender.com/flights/health
- Method: GET
- Schedule: Every 5 minutes
- Timeout: 30 seconds
- Save responses: 선택
- Notifications: 실패 시 알림 켜기 권장

## 정상 응답 예

```json
{
  "success": true,
  "service": "cargo-ops-backend",
  "status": "ok",
  "nowKst": "2026-05-14T12:30:00",
  "autoPushEnabled": true,
  "intervalMinutes": 5,
  "mode": "focus",
  "lastRunAt": "2026-05-14T12:25:00",
  "lastMessage": "자동 확인 완료(집중 5분): 변경 없음, 재조회 1건",
  "scheduleFlightCount": 1,
  "rowCount": 1
}
```
