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

def seed_test_data():
    """Seeds test accounts and active test listings for end-to-end flow testing."""
    from datetime import datetime, timedelta, timezone
    from app.models.user import User, ReceiverProfile
    from app.models.listing import FoodListing

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # 1. Test Donor Account
        donor = db.query(User).filter(User.email == "donor.test@foodrescue.ai").first()
        if not donor:
            donor = User(
                name="Annapurna Restaurant & Caterers",
                email="donor.test@foodrescue.ai",
                role="provider",
                city="Ahmedabad",
                address="CG Road, Navrangpura, Ahmedabad",
                lat=23.0300,
                lng=72.5580,
                verified=True,
            )
            db.add(donor)
            db.commit()
            db.refresh(donor)
        else:
            donor.name = "Annapurna Restaurant & Caterers"
            donor.address = "CG Road, Navrangpura, Ahmedabad"
            donor.lat = 23.0300
            donor.lng = 72.5580
            db.commit()

        # 2. Test NGO Account
        ngo = db.query(User).filter(User.email == "ngo.test@foodrescue.ai").first()
        if not ngo:
            ngo = User(
                name="Apang Manav Mandal Shelter",
                email="ngo.test@foodrescue.ai",
                role="ngo",
                city="Ahmedabad",
                address="Drive In Road, Ahmedabad",
                lat=23.0450,
                lng=72.5270,
                verified=True,
            )
            db.add(ngo)
            db.commit()
            db.refresh(ngo)
            ngo_prof = ReceiverProfile(
                user_id=ngo.id,
                accepted_categories=["cooked_hot", "cooked_chilled", "raw_refrigerated", "sealed_packaged"],
                daily_intake_capacity=100,
                remaining_capacity=100,
                operating_hours_start="08:00",
                operating_hours_end="22:00",
                has_vehicle=False,
                priority_class="high",
            )
            db.add(ngo_prof)
            db.commit()
        else:
            ngo.name = "Apang Manav Mandal Shelter"
            ngo.address = "Drive In Road, Ahmedabad"
            ngo.lat = 23.0450
            ngo.lng = 72.5270
            db.commit()

        # 3. Test Both Account
        both_user = db.query(User).filter(User.email == "both.test@foodrescue.ai").first()
        if not both_user:
            both_user = User(
                name="Community Food Hub",
                email="both.test@foodrescue.ai",
                role="both",
                city="Ahmedabad",
                address="Maninagar, Ahmedabad",
                lat=22.9940,
                lng=72.6030,
                verified=True,
            )
            db.add(both_user)
            db.commit()
            db.refresh(both_user)
            both_prof = ReceiverProfile(
                user_id=both_user.id,
                accepted_categories=["cooked_hot", "cooked_chilled", "raw_refrigerated", "sealed_packaged"],
                daily_intake_capacity=80,
                remaining_capacity=80,
                operating_hours_start="08:00",
                operating_hours_end="22:00",
                has_vehicle=True,
                priority_class="standard",
            )
            db.add(both_prof)
            db.commit()
        else:
            both_user.name = "Community Food Hub"
            both_user.address = "Maninagar, Ahmedabad"
            both_user.lat = 22.9940
            both_user.lng = 72.6030
            db.commit()

        # 4. Pre-Populated Sample Active Listings linked to Test Donor
        from app.models.log import InventoryLog
        deleted_notes = [
            r[0] for r in db.query(InventoryLog.note)
            .filter(InventoryLog.action == "deleted")
            .all()
            if r[0]
        ]
        thali_deleted = any("100 Fresh Veg Thali Packets" in n for n in deleted_notes)
        rice_deleted = any("50 Kg Sealed Rice & Dal Packets" in n for n in deleted_notes)

        # Listing 1: 100 Fresh Veg Thali Packets (cooked_hot, 4h deadline)
        thali = None
        if not thali_deleted:
            thali = (
                db.query(FoodListing)
                .filter(
                    FoodListing.provider_id == donor.id,
                    FoodListing.name == "100 Fresh Veg Thali Packets",
                )
                .first()
            )
        deadline_thali = now + timedelta(hours=4)
        if not thali:
            thali = FoodListing(
                provider_id=donor.id,
                name="100 Fresh Veg Thali Packets",
                category="cooked_hot",
                veg=True,
                unit="meals",
                lot_size=10,
                total_lots=10,
                available_lots=10,
                reserved_lots=0,
                collected_lots=0,
                delivered_lots=0,
                closed_lots=0,
                prepared_at=now,
                safe_deadline=deadline_thali,
                storage_requirement="ambient",
                pickup_lat=23.0300,
                pickup_lng=72.5580,
                pickup_window_start=now,
                pickup_window_end=now + timedelta(hours=2),
                delivery_mode_offered="sender_vehicle",
                delivery_contribution_type="nominal_token",
                contribution_amount=50.0,
                status="active",
            )
            db.add(thali)
        else:
            thali.prepared_at = now
            thali.safe_deadline = deadline_thali
            if thali.status != "completed":
                thali.status = "active"
                if thali.available_lots == 0 and thali.reserved_lots == 0 and thali.delivered_lots == 0:
                    thali.available_lots = 10

        # Listing 2: 50 Kg Sealed Rice & Dal Packets (sealed_packaged, 48h deadline)
        rice = None
        if not rice_deleted:
            rice = (
                db.query(FoodListing)
                .filter(
                    FoodListing.provider_id == donor.id,
                    FoodListing.name == "50 Kg Sealed Rice & Dal Packets",
                )
                .first()
            )
        deadline_rice = now + timedelta(hours=48)
        if not rice:
            rice = FoodListing(
                provider_id=donor.id,
                name="50 Kg Sealed Rice & Dal Packets",
                category="sealed_packaged",
                veg=True,
                unit="packets",
                lot_size=10,
                total_lots=5,
                available_lots=5,
                reserved_lots=0,
                collected_lots=0,
                delivered_lots=0,
                closed_lots=0,
                prepared_at=now,
                safe_deadline=deadline_rice,
                storage_requirement="ambient",
                pickup_lat=23.0300,
                pickup_lng=72.5580,
                pickup_window_start=now,
                pickup_window_end=now + timedelta(hours=24),
                delivery_mode_offered="sender_vehicle",
                delivery_contribution_type="free",
                contribution_amount=0.0,
                status="active",
            )
            db.add(rice)
        else:
            rice.prepared_at = now
            rice.safe_deadline = deadline_rice
            if rice.status != "completed":
                rice.status = "active"
                if rice.available_lots == 0 and rice.reserved_lots == 0 and rice.delivered_lots == 0:
                    rice.available_lots = 5

        db.commit()
    except Exception as e:
        db.rollback()
    finally:
        db.close()

async def periodic_expiry_sweeper():
    """Background task that periodically checks and expires spoiled listings and stale reservations."""
    import asyncio
    from app.services.inventory import InventoryService
    while True:
        try:
            await asyncio.sleep(30)
            db = SessionLocal()
            try:
                InventoryService.expire_spoiled_listings(db)
                InventoryService.expire_stale_reservations(db)
            except Exception:
                pass
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception:
            pass


@app.on_event("startup")
async def startup_db():
    try:
        Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN address VARCHAR(500)"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE food_listings ADD COLUMN is_archived BOOLEAN DEFAULT 0"))
                conn.commit()
            except Exception:
                pass
        seed_test_data()
    except Exception:
        pass

    import asyncio
    asyncio.create_task(periodic_expiry_sweeper())

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"^https?://.*",
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
        "status": "ok",
        "state": "online",
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
        "message": f"Welcome to {settings.PROJECT_NAME} - FoodRescue-AI redistribution platform",
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/health",
        "description": "FoodRescue-AI optimization and redistribution platform",
    }
