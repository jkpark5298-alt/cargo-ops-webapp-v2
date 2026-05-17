from fastapi import APIRouter

from app.services.weather import get_current_weather

router = APIRouter()


@router.get("/current")
async def current_weather():
    return await get_current_weather()
