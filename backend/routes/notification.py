import requests

def send_push_notification(message):
    # 푸시 알림 보내는 로직 (예: Firebase, Web Push API 등 사용)
    push_url = "https://example.com/push-notification-api"
    payload = {
        "message": message,
        "user_id": "user123",  # 사용자 ID 예시
    }
    response = requests.post(push_url, json=payload)
    return response

def notify_state_change(flight_number, state):
    message = f"Flight {flight_number} has changed state: {state}"
    send_push_notification(message)
    
# 예시로, 출발 예정 시간이 변경되었을 때 알림 전송
if departure_focus_start <= current_time <= departure_focus_end:
    notify_state_change("KJ972", "Departed")
