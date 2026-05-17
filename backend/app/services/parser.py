import re
from typing import List, Dict


# =========================
# 1. 편명 추출
# =========================
def extract_flight_numbers(text: str) -> List[str]:
    if not text:
        return []

    pattern = r"\b[A-Z]{2}\d{3,4}\b"
    return list(set(re.findall(pattern, text)))


# =========================
# 2. 이름 + 주기장 매핑
# =========================
def extract_name_parking(text: str) -> Dict[str, str]:
    result = {}

    if not text:
        return result

    lines = text.split("\n")

    current_name = None

    for line in lines:
        line = line.strip()

        # 이름 찾기 (A 박종규 / 박종규 / B김기성 등)
        name_match = re.search(r"(?:[ABC]\s*)?([가-힣]{2,4})", line)

        if name_match:
            current_name = name_match.group(1)

        # 주기장 (숫자 + R/L 포함)
        parking_match = re.search(r"\b\d{3}[RL]?\b", line)

        if current_name and parking_match:
            result[current_name] = parking_match.group()

    return result
