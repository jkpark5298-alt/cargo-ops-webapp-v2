"""알림·자동 확인 API 접근 토큰 검사

환경변수 API_ACCESS_TOKEN 이 설정되어 있으면 보호 대상 요청은 X-API-Token 헤더가 같아야 한다.
환경변수가 없으면 검사하지 않는다(설정 전 배포가 기존처럼 동작하도록).
"""

from __future__ import annotations

from typing import Optional
import hmac
import os

from fastapi import Header, HTTPException


def require_api_token(x_api_token: Optional[str] = Header(default=None)) -> None:
    expected = os.getenv("API_ACCESS_TOKEN", "").strip()
    if not expected:
        return

    given = (x_api_token or "").strip()
    if not given or not hmac.compare_digest(given.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="API 접근 토큰이 올바르지 않습니다.")
