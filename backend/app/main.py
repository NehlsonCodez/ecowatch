import asyncio
from contextlib import asynccontextmanager
import logging
from pathlib import Path
import sys

# Ensure backend root directory is in sys.path so app package imports work reliably
BACKEND_DIR = Path(__file__).resolve().parent.parent   # .../ecowatch/backend
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import Base, SessionLocal, engine
from app import models  # noqa: F401  (ensures models are registered on Base before create_all)
from app.routers import (
    alerts as alerts_router,
    auth as auth_router,
    dashboard as dashboard_router,
    devices as devices_router,
    reports as reports_router,
    rooms as rooms_router,
)
from app.seed import seed_if_empty
from app.simulator import simulation_loop

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ecowatch.main")

PROJECT_ROOT = BACKEND_DIR.parent                        # .../ecowatch
FRONTEND_DIR = PROJECT_ROOT / "frontend"


_simulation_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()

    global _simulation_task
    _simulation_task = asyncio.create_task(simulation_loop())
    logger.info("EcoWatch backend ready.")

    yield

    # --- Shutdown ---
    if _simulation_task:
        _simulation_task.cancel()
        try:
            await _simulation_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="EcoWatch API",
    description="Smart Home Electricity Monitoring System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(rooms_router.router)
app.include_router(devices_router.router)
app.include_router(dashboard_router.router)
app.include_router(alerts_router.router)
app.include_router(reports_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "EcoWatch"}


# Serve the frontend (static HTML/CSS/JS) at the root, if it exists.
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
