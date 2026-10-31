import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db import Base, SessionLocal, engine
from app.models.delivery import DeliveryConfirmation, DeliveryJob, UtilizationReport
from app.models.listing import FoodListing
from app.models.log import DecisionLog
from app.models.request import DonationRequest
from app.models.user import ReceiverProfile, User
from app.models.vehicle import Vehicle


def seed_database(force: bool = False):
    """
    Populates the database with realistic demo donors, NGOs, vehicles,
    active food listings, and decision logs centered around Ahmedabad (23.0225° N, 72.5714° E).
    Idempotent: skips if demo data is already present unless force=True.
    """
    print("Initializing FoodRescue-AI database schema...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        existing_user = db.query(User).filter(User.email == "taj.caterers@ahmedabad.com").first()
        if existing_user and not force:
            print("Demo dataset already present. Skipping seed (use --force to overwrite).")
            return

        if force:
            print("Force re-seeding: clearing existing data...")
            db.query(DecisionLog).delete()
            db.query(UtilizationReport).delete()
            db.query(DeliveryConfirmation).delete()
            db.query(DeliveryJob).delete()
            db.query(DonationRequest).delete()
            db.query(FoodListing).delete()
            db.query(Vehicle).delete()
            db.query(ReceiverProfile).delete()
            db.query(User).delete()
            db.commit()

        now = datetime.now(timezone.utc)

        print("Seeding users (Donors, NGOs, Admin)...")
        # 1. Donors / Food Providers
        donor1 = User(
            name="Grand Taj Caterers & Banquets",
            email="taj.caterers@ahmedabad.com",
            role="provider",
            verified=True,
            city="Ahmedabad",
            lat=23.0365,
            lng=72.5611,
        )
        donor2 = User(
            name="Iscon Thal Banquets",
            email="iscon.thal@ahmedabad.com",
            role="provider",
            verified=True,
            city="Ahmedabad",
            lat=23.0298,
            lng=72.5072,
        )
        donor3 = User(
            name="Gujarat University Central Mess",
            email="mess@gujaratuni.ac.in",
            role="provider",
            verified=True,
            city="Ahmedabad",
            lat=23.0384,
            lng=72.5458,
        )
        donor4 = User(
            name="Havmor Fresh Dairy Outlet",
            email="dairy@havmor.com",
            role="provider",
            verified=True,
            city="Ahmedabad",
            lat=22.9984,
            lng=72.5998,
        )

        # 2. Receivers / Verified NGOs
        ngo1 = User(
            name="Akshaya Patra Kitchen Hub",
            email="akshaya.patra@ahmedabad.org",
            role="ngo",
            verified=True,
            city="Ahmedabad",
            lat=23.0258,
            lng=72.5833,
        )
        ngo2 = User(
            name="Apang Manav Mandal Shelter",
            email="apang.mandal@ahmedabad.org",
            role="ngo",
            verified=True,
            city="Ahmedabad",
            lat=23.0372,
            lng=72.5284,
        )
        ngo3 = User(
            name="Shishu Gruh Child Orphanage",
            email="shishu.gruh@ahmedabad.org",
            role="ngo",
            verified=True,
            city="Ahmedabad",
            lat=23.0125,
            lng=72.5645,
        )
        ngo4 = User(
            name="Robin Hood Army Volunteer Chapter",
            email="rha.ahmedabad@robinhood.org",
            role="volunteer",
            verified=True,
            city="Ahmedabad",
            lat=23.0521,
            lng=72.5539,
        )

        # 3. Super Admin
        admin = User(
            name="City AMC Operations Admin",
            email="admin@amc.gov.in",
            role="admin",
            verified=True,
            city="Ahmedabad",
            lat=23.0225,
            lng=72.5714,
        )

        db.add_all([donor1, donor2, donor3, donor4, ngo1, ngo2, ngo3, ngo4, admin])
        db.commit()

        # Refresh IDs
        for u in [donor1, donor2, donor3, donor4, ngo1, ngo2, ngo3, ngo4, admin]:
            db.refresh(u)

        print("Seeding Receiver Profiles with priority classes...")
        prof1 = ReceiverProfile(
            user_id=ngo1.id,
            accepted_categories=["cooked_hot", "cooked_chilled", "raw_refrigerated", "sealed_packaged"],
            daily_intake_capacity=100,
            remaining_capacity=100,
            operating_hours_start="07:00",
            operating_hours_end="22:00",
            has_vehicle=True,
            priority_class="community_kitchen",
        )
        prof2 = ReceiverProfile(
            user_id=ngo2.id,
            accepted_categories=["cooked_hot", "cooked_chilled", "sealed_packaged"],
            daily_intake_capacity=50,
            remaining_capacity=50,
            operating_hours_start="08:00",
            operating_hours_end="21:00",
            has_vehicle=False,
            priority_class="shelter",
        )
        prof3 = ReceiverProfile(
            user_id=ngo3.id,
            accepted_categories=["cooked_hot", "cooked_chilled", "raw_refrigerated", "sealed_packaged"],
            daily_intake_capacity=40,
            remaining_capacity=40,
            operating_hours_start="08:00",
            operating_hours_end="20:00",
            has_vehicle=False,
            priority_class="orphanage",
        )
        prof4 = ReceiverProfile(
            user_id=ngo4.id,
            accepted_categories=["cooked_hot", "sealed_packaged"],
            daily_intake_capacity=30,
            remaining_capacity=30,
            operating_hours_start="09:00",
            operating_hours_end="23:00",
            has_vehicle=True,
            priority_class="standard",
        )

        db.add_all([prof1, prof2, prof3, prof4])
        db.commit()

        print("Seeding Fleet Vehicles...")
        v1 = Vehicle(
            owner_id=donor1.id,
            type="van",
            capacity_lots=60,
            service_radius_km=25.0,
            available_from="08:00",
            available_to="22:00",
            lat=23.0365,
            lng=72.5611,
            has_cold_storage=True,
            is_simulated=False,
        )
        v2 = Vehicle(
            owner_id=donor2.id,
            type="truck",
            capacity_lots=80,
            service_radius_km=30.0,
            available_from="07:00",
            available_to="23:00",
            lat=23.0298,
            lng=72.5072,
            has_cold_storage=False,
            is_simulated=False,
        )
        v3 = Vehicle(
            owner_id=ngo1.id,
            type="auto",
            capacity_lots=30,
            service_radius_km=15.0,
            available_from="08:00",
            available_to="21:00",
            lat=23.0258,
            lng=72.5833,
            has_cold_storage=False,
            is_simulated=True,
        )

        db.add_all([v1, v2, v3])
        db.commit()

        print("Seeding Food Listings across FSSAI categories...")
        # Listing 1: Cooked Hot (4h max window)
        l1 = FoodListing(
            provider_id=donor1.id,
            name="Hot Gujarati Dal & Khichdi Meal Trays",
            category="cooked_hot",
            veg=True,
            unit="meals",
            lot_size=10,
            total_lots=20,
            available_lots=12,
            reserved_lots=8,
            collected_lots=0,
            delivered_lots=0,
            closed_lots=0,
            prepared_at=now - timedelta(minutes=45),
            safe_deadline=now + timedelta(minutes=195),  # 240m from prep
            storage_requirement="ambient",
            pickup_lat=23.0365,
            pickup_lng=72.5611,
            pickup_window_start=now,
            pickup_window_end=now + timedelta(hours=2),
            delivery_mode_offered="sender_vehicle",
            delivery_contribution_type="free",
            status="active",
        )

        # Listing 2: Cooked Chilled (8h max window)
        l2 = FoodListing(
            provider_id=donor2.id,
            name="Blast-Chilled Vegetable Biryani Containers",
            category="cooked_chilled",
            veg=True,
            unit="meals",
            lot_size=10,
            total_lots=15,
            available_lots=9,
            reserved_lots=6,
            collected_lots=0,
            delivered_lots=0,
            closed_lots=0,
            prepared_at=now - timedelta(hours=1),
            safe_deadline=now + timedelta(hours=7),
            storage_requirement="chilled",
            pickup_lat=23.0298,
            pickup_lng=72.5072,
            pickup_window_start=now,
            pickup_window_end=now + timedelta(hours=3),
            delivery_mode_offered="all",
            delivery_contribution_type="free",
            status="active",
        )

        # Listing 3: Raw Refrigerated Dairy (12h max window)
        l3 = FoodListing(
            provider_id=donor4.id,
            name="Fresh Cottage Cheese (Paneer) Packets",
            category="raw_refrigerated",
            veg=True,
            unit="packets",
            lot_size=10,
            total_lots=10,
            available_lots=10,
            reserved_lots=0,
            collected_lots=0,
            delivered_lots=0,
            closed_lots=0,
            prepared_at=now - timedelta(hours=2),
            safe_deadline=now + timedelta(hours=10),
            storage_requirement="chilled",
            pickup_lat=22.9984,
            pickup_lng=72.5998,
            pickup_window_start=now,
            pickup_window_end=now + timedelta(hours=4),
            delivery_mode_offered="all",
            delivery_contribution_type="free",
            status="active",
        )

        # Listing 4: Sealed Packaged (7 days max window)
        l4 = FoodListing(
            provider_id=donor3.id,
            name="Sealed Whole-Wheat Bread & Nutri Biscuits",
            category="sealed_packaged",
            veg=True,
            unit="packets",
            lot_size=10,
            total_lots=30,
            available_lots=30,
            reserved_lots=0,
            collected_lots=0,
            delivered_lots=0,
            closed_lots=0,
            prepared_at=now - timedelta(hours=6),
            safe_deadline=now + timedelta(days=6),
            storage_requirement="ambient",
            pickup_lat=23.0384,
            pickup_lng=72.5458,
            pickup_window_start=now,
            pickup_window_end=now + timedelta(hours=8),
            delivery_mode_offered="self_collect",
            delivery_contribution_type="free",
            status="active",
        )

        db.add_all([l1, l2, l3, l4])
        db.commit()

        for l in [l1, l2, l3, l4]:
            db.refresh(l)

        print("Seeding Initial Requests & Planned Delivery Job...")
        r1 = DonationRequest(
            listing_id=l1.id,
            receiver_id=ngo2.id,
            requested_lots=8,
            allocated_lots=8,
            status="allocated",
            reservation_expires_at=now + timedelta(minutes=30),
        )
        r2 = DonationRequest(
            listing_id=l2.id,
            receiver_id=ngo3.id,
            requested_lots=6,
            allocated_lots=6,
            status="allocated",
            reservation_expires_at=now + timedelta(minutes=30),
        )

        db.add_all([r1, r2])
        db.commit()
        db.refresh(r1)
        db.refresh(r2)

        # Planned Delivery Job with OTP 749201
        job1 = DeliveryJob(
            vehicle_id=v1.id,
            request_ids=[r1.id, r2.id],
            planned_start_time=now + timedelta(minutes=15),
            status="assigned",
            otp_code="749201",
            route={
                "vehicle_id": v1.id,
                "stops": [
                    {
                        "stop_id": 1,
                        "request_id": r1.id,
                        "stop_type": "pickup",
                        "coord": [l1.pickup_lat, l1.pickup_lng],
                        "lot_change": 8,
                        "name": f"Pickup ({l1.name})",
                        "safe_deadline": l1.safe_deadline.isoformat(),
                    },
                    {
                        "stop_id": 2,
                        "request_id": r1.id,
                        "stop_type": "delivery",
                        "coord": [ngo2.lat, ngo2.lng],
                        "lot_change": -8,
                        "name": f"Handover to {ngo2.name}",
                        "safe_deadline": l1.safe_deadline.isoformat(),
                    },
                    {
                        "stop_id": 3,
                        "request_id": r2.id,
                        "stop_type": "pickup",
                        "coord": [l2.pickup_lat, l2.pickup_lng],
                        "lot_change": 6,
                        "name": f"Pickup ({l2.name})",
                        "safe_deadline": l2.safe_deadline.isoformat(),
                    },
                    {
                        "stop_id": 4,
                        "request_id": r2.id,
                        "stop_type": "delivery",
                        "coord": [ngo3.lat, ngo3.lng],
                        "lot_change": -6,
                        "name": f"Handover to {ngo3.name}",
                        "safe_deadline": l2.safe_deadline.isoformat(),
                    },
                ],
            },
        )
        db.add(job1)
        db.commit()

        # Seed sample decision logs for Admin Explain View
        print("Seeding Decision Audit Trail logs...")
        logs = [
            DecisionLog(
                entity_type="listing",
                entity_id=l1.id,
                step="inventory",
                decision="accept",
                reason_code="LISTING_PUBLISHED",
                message=f"Food listing '{l1.name}' registered with 20 lots. FSSAI safe deadline locked at {l1.safe_deadline.strftime('%H:%M UTC')}.",
                payload={"category": l1.category, "total_lots": l1.total_lots},
            ),
            DecisionLog(
                entity_type="request",
                entity_id=r1.id,
                step="inventory",
                decision="reserve",
                reason_code="RESERVED_SUCCESS",
                message=f"Row-lock atomic reservation confirmed: 8 lots reserved for {ngo2.name}.",
                payload={"listing_id": l1.id, "reserved_lots": 8},
            ),
            DecisionLog(
                entity_type="request",
                entity_id=r2.id,
                step="domain_pruning",
                decision="accept",
                reason_code="CATEGORY_ACCEPTABLE",
                message=f"Receiver {ngo3.name} accepts cooked_chilled meals. Intake capacity validated.",
                payload={"receiver_id": ngo3.id, "priority_class": "orphanage"},
            ),
            DecisionLog(
                entity_type="route",
                entity_id=v1.id,
                step="routing",
                decision="accept",
                reason_code="ZERO_DEADLINE_VIOLATION_CONFIRMED",
                message="Vehicle #1 route state validated: arrival times are 45m ahead of perishable safe deadlines.",
                payload={"stops_count": 4, "slack_minutes": 45.2},
            ),
        ]
        db.add_all(logs)
        db.commit()

        print("FoodRescue-AI demo dataset successfully seeded!")

    finally:
        db.close()


if __name__ == "__main__":
    force_seed = "--force" in sys.argv
    seed_database(force=force_seed)

