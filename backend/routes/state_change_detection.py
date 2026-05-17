def check_state_change(flight_number, previous_state, current_state):
    if previous_state != current_state:
        print(f"State changed for flight {flight_number}: {previous_state} -> {current_state}")
        return True
    return False

# 예시: 출발 상태와 도착 상태 비교
previous_departure_state = "Scheduled"
current_departure_state = "Departed"

previous_arrival_state = "Scheduled"
current_arrival_state = "Arrived"

# 출발 상태 변화 감지
if check_state_change("KJ972", previous_departure_state, current_departure_state):
    send_push_notification("Flight KJ972 has departed.")

# 도착 상태 변화 감지
if check_state_change("KJ972", previous_arrival_state, current_arrival_state):
    send_push_notification("Flight KJ972 has arrived.")
