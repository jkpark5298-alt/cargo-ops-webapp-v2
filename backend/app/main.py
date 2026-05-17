from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.flights import router as flights_router
from app.routes.health import router as health_router
from app.routes.notion import router as notion_router
from app.routes.weather import router as weather_router
from app.routes.widget import router as widget_router

app = FastAPI(title="Cargo Ops Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "ok": True,
        "message": "Cargo Ops Backend Running",
    }


app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(flights_router, prefix="/flights", tags=["flights"])
app.include_router(widget_router, prefix="/widget", tags=["widget"])
app.include_router(weather_router, prefix="/weather", tags=["weather"])
app.include_router(notion_router, prefix="/notion", tags=["notion"])
