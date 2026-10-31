from typing import Any, Dict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routers import admin, allocations, auth, delivery, impact, listings, requests
from app.config import settings
from app.db import SessionLocal
from app.schemas.admin import SimEventRequest, SimScenarioRequest

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Intelligent surplus food redistribution engine with food safety deadlines and routing optimization",
)

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
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        db_status = "connected"
    except Exception as e:
        db_status = f"disconnected: {str(e)}"

    return {
        "status": "ok",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "database": db_status,
    }


@app.get("/")
def root() -> Dict[str, str]:
    return {
        "message": f"Welcome to {settings.PROJECT_NAME} API. Visit /docs for documentation.",
        "health": "/health",
        "docs": "/docs",
    }
