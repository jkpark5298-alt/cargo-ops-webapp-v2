"""항공편 API 요청 본문 모델"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.services.flight_common import AUTO_PUSH_DEFAULT_INTERVAL_MINUTES
class PushSubscriptionRequest(BaseModel):
    subscription: Dict[str, Any]
    userAgent: Optional[str] = None
    deviceName: Optional[str] = None


class TestPushRequest(BaseModel):
    title: str = "KJ Cargo Ops 테스트 알림"
    body: str = "PWA 푸시 알림 수신 준비가 완료되었습니다."
    url: str = "/"


class AutoPushConfigRequest(BaseModel):
    enabled: bool
    intervalMinutes: int = AUTO_PUSH_DEFAULT_INTERVAL_MINUTES


class LatestScheduleRequest(BaseModel):
    room: Dict[str, Any]
    # True 이면 사용자가 편명을 직접 편집한 저장 → 최근 삭제 기록에 있던 편도 다시 넣을 수 있다.
    explicitEdit: bool = False


class ScheduleSlotSaveRequest(BaseModel):
    room: Dict[str, Any]
    rotate: bool = True
    slot: Optional[str] = None
    explicitEdit: bool = False


class ScheduleSlotUpdateRequest(BaseModel):
    room: Dict[str, Any]


class AircraftRegistrationRecord(BaseModel):
    date: str
    flight: str
    departureCode: str = ""
    arrivalCode: str = ""
    registrationNo: str
    updatedAt: Optional[str] = None


class AircraftRegistrationSaveRequest(BaseModel):
    records: List[AircraftRegistrationRecord] = Field(default_factory=list)
    mode: str = "merge"


class NotificationHistoryDeleteItemRequest(BaseModel):
    key: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    checkedAt: Optional[str] = None
    roomName: Optional[str] = None


class FlightQueryRequest(BaseModel):
    flights: List[str] = Field(default_factory=list)
    start: str
    end: str
    # True 이면 예정시각 또는 변경시각 중 하나라도 기간 안인 편을 포함한다. (Schedule Flight 카드 자동 갱신용)
    includeScheduled: bool = False


class FlightRangeRequest(BaseModel):
    start: str
    end: str


class DailyReportTextSaveRequest(BaseModel):
    workDate: str
    status: str = "normal"
    author: str = ""
    note: str = ""
    images: Optional[List[Dict[str, Any]]] = None
    savedAt: Optional[str] = None
