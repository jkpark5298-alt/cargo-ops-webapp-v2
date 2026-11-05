"""/flights API — 기능별 라우터를 하나로 묶습니다."""

from fastapi import APIRouter

from app.routes.flights.push import router as push_router
from app.routes.flights.monitoring import router as monitoring_router
from app.routes.flights.history import router as history_router
from app.routes.flights.daily_report import router as daily_report_router
from app.routes.flights.registrations import router as registrations_router
from app.routes.flights.schedule import router as schedule_router
from app.routes.flights.search import router as search_router

router = APIRouter()
router.include_router(push_router)
router.include_router(monitoring_router)
router.include_router(history_router)
router.include_router(daily_report_router)
router.include_router(registrations_router)
router.include_router(schedule_router)
router.include_router(search_router)
