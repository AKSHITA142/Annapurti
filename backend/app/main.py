from typing import Any, Dict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routers import admin, allocations, auth, chat, delivery, impact, listings, requests
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.schemas.admin import SimEventRequest, SimScenarioRequest

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Intelligent surplus food redistribution engine with food safety deadlines and routing optimization",
)

@app.on_event("startup")
def startup_db():
    try:
        Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN address VARCHAR(500)"))
                conn.commit()
            except Exception:
                pass
    except Exception:
        pass

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth.router)
app.include_router(listings.router)
app.include_router(requests.router)
app.include_router(allocations.router)
app.include_router(delivery.router)
app.include_router(admin.router)
app.include_router(impact.router)
app.include_router(chat.router)


# Top-level aliases for simulation convenience
@app.post("/sim/event", tags=["Simulation"])
@app.post("/simulate/event", tags=["Simulation"])
def simulate_event_alias(payload: SimEventRequest) -> Dict[str, Any]:
    """Top-level alias for simulation event triggering."""
    session = SessionLocal()
    try:
        from app.sim.event_simulator import EventSimulator
        return EventSimulator.simulate_event(session, payload.event_type, payload.payload)
    finally:
        session.close()


@app.post("/sim/scenario", tags=["Simulation"])
def simulate_scenario_alias(payload: SimScenarioRequest) -> Dict[str, Any]:
    """Top-level alias for scenario generator."""
    from datetime import datetime, timezone
    from app.sim.generator import ScenarioGenerator
    now = datetime.now(timezone.utc)
    scenario = ScenarioGenerator.generate(preset=payload.preset, seed=payload.seed, base_time=now)
    return {
        "status": "scenario_generated",
        "preset": payload.preset,
        "seed": payload.seed,
        "listings_count": len(scenario.listings),
        "requests_count": len(scenario.requests),
        "receivers_count": len(scenario.receivers),
        "vehicles_count": len(scenario.vehicles),
        "traffic_level": scenario.traffic_level,
    }


@app.get("/health", response_model=Dict[str, Any])
def health_check() -> Dict[str, Any]:
    """Health check endpoint checking application and database status."""
    db_status = "unreachable"
    try:
        session = SessionLocal()
        session.execute(text("SELECT 1"))
        session.close()
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return {
        "status": "online",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "database": db_status,
    }


@app.get("/", tags=["Root"])
def root() -> Dict[str, Any]:
    """Root endpoint providing service metadata."""
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/health",
        "description": "FoodRescue-AI optimization and redistribution platform",
    }
