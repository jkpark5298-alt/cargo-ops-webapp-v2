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

## 참고: 이 호출이 자동 푸시도 실행합니다

`/flights/health`는 서버를 깨우는 용도 외에, 호출될 때 **자동 푸시 시각이 되었으면 변경 확인·푸시를 함께 실행**합니다
(`routes/flights/monitoring.py`의 `health_check` → `schedule_monitor._run_auto_push_tick_if_due`).
따라서 cron 호출 간격이 곧 자동 확인의 최소 주기이며, 단순 상태 확인만 필요하면 `GET /health/health`를 사용하세요.
