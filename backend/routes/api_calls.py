from datetime import datetime, timedelta

# 출발 및 도착 예정 시간 예시
departure_time = datetime(2026, 4, 25, 10, 0)  # 출발 예정 시간
arrival_time = datetime(2026, 4, 25, 12, 0)  # 도착 예정 시간

# 집중 조회 시간대 설정 (출발 예정 시간 5분 전 ~ 도착 예정 시간 10분 후)
departure_focus_start = departure_time - timedelta(minutes=5)  # 출발 예정 5분 전
departure_focus_end = departure_time + timedelta(minutes=10)  # 출발 예정 10분 후

arrival_focus_start = arrival_time - timedelta(minutes=5)  # 도착 예정 5분 전
arrival_focus_end = arrival_time + timedelta(minutes=10)  # 도착 예정 10분 후

# 현재 시간 구하기
current_time = datetime.now()

# 조회 주기 설정
if departure_focus_start <= current_time <= departure_focus_end or arrival_focus_start <= current_time <= arrival_focus_end:
    interval = 5  # 5분 간격 조회
else:
    interval = 30  # 30분 간격 조회

print(f"현재 시간: {current_time}. 조회 주기: {interval}분 간격.")
