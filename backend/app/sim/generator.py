import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from app.models.listing import FoodListing
from app.models.request import DonationRequest
from app.models.user import User, ReceiverProfile
from app.models.vehicle import Vehicle


@dataclass
class Scenario:
    name: str
    seed: int
    listings: Dict[int, FoodListing]
    requests: List[DonationRequest]
    receivers: Dict[int, User]
    profiles: Dict[int, ReceiverProfile]
    vehicles: List[Vehicle]
    providers: Dict[int, User]
    base_time: datetime
    traffic_level: str


class ScenarioGenerator:
    """
    Seeded scenario generator producing reproducible urban food redistribution benchmarks.
    Centered around Ahmedabad (23.0225° N, 72.5714° E).
    """

    PRESETS = {
        "small": {"num_listings": 3, "num_requests": 8, "num_vehicles": 3, "stress": False},
        "medium": {"num_listings": 10, "num_requests": 40, "num_vehicles": 8, "stress": False},
        "large": {"num_listings": 30, "num_requests": 150, "num_vehicles": 20, "stress": False},
        "stress": {"num_listings": 10, "num_requests": 40, "num_vehicles": 3, "stress": True},
    }

    CATEGORIES = ["cooked_hot", "cooked_chilled", "raw_refrigerated", "sealed_packaged"]

    @classmethod
    def generate(
        cls,
        preset: str = "small",
        seed: int = 42,
        traffic_level: str = "medium",
        base_time: Optional[datetime] = None,
    ) -> Scenario:
        cfg = cls.PRESETS.get(preset, cls.PRESETS["small"])
        rng = random.Random(seed)

        if base_time is None:
            base_time = datetime(2026, 10, 31, 11, 0, 0, tzinfo=timezone.utc)

        center_lat, center_lng = 23.0225, 72.5714
        radius_delta = 0.05  # ~5 km radius around Ahmedabad

        # 1. Generate Providers and Listings
        providers: Dict[int, User] = {}
        listings: Dict[int, FoodListing] = {}

        for i in range(cfg["num_listings"]):
            p_id = 1000 + i
            p_lat = center_lat + rng.uniform(-radius_delta, radius_delta)
            p_lng = center_lng + rng.uniform(-radius_delta, radius_delta)

            provider = User(
                id=p_id,
                name=f"Donor Kitchen {i + 1}",
                email=f"donor_{p_id}_{seed}@test.com",
                role="provider",
                verified=True,
                city="Ahmedabad",
                lat=p_lat,
                lng=p_lng,
            )
            providers[p_id] = provider

            cat = rng.choice(cls.CATEGORIES)
            lot_size = rng.choice([5, 10, 20])
            total_lots = rng.choice([10, 20, 30])

            # Deadline tightness
            if cfg["stress"]:
                deadline_minutes = rng.choice([45, 60, 90])  # Tight perishable deadline
            else:
                if cat == "cooked_hot":
                    deadline_minutes = rng.choice([120, 180, 240])
                elif cat == "cooked_chilled":
                    deadline_minutes = rng.choice([300, 480])
                elif cat == "raw_refrigerated":
                    deadline_minutes = rng.choice([480, 720])
                else:
                    deadline_minutes = rng.choice([1440, 2880])

            prepared_at = base_time - timedelta(minutes=rng.randint(0, 30))
            safe_deadline = prepared_at + timedelta(minutes=deadline_minutes)

            l_id = 2000 + i
            listing = FoodListing(
                id=l_id,
                provider_id=p_id,
                name=f"Batch {i + 1} ({cat})",
                category=cat,
                veg=(rng.random() < 0.8),
                unit="meals",
                lot_size=lot_size,
                total_lots=total_lots,
                available_lots=total_lots,
                reserved_lots=0,
                collected_lots=0,
                delivered_lots=0,
                closed_lots=0,
                prepared_at=prepared_at,
                safe_deadline=safe_deadline,
                pickup_lat=p_lat,
                pickup_lng=p_lng,
                pickup_window_start=base_time,
                pickup_window_end=base_time + timedelta(hours=2),
                delivery_mode_offered="all",
                status="active",
            )
            listings[l_id] = listing

        # 2. Generate Receivers (NGOs) and Profiles
        receivers: Dict[int, User] = {}
        profiles: Dict[int, ReceiverProfile] = {}
        priority_classes = ["shelter", "orphanage", "community_kitchen", "standard"]

        num_receivers = max(3, cfg["num_requests"] // 2)
        for i in range(num_receivers):
            r_id = 3000 + i
            r_lat = center_lat + rng.uniform(-radius_delta, radius_delta)
            r_lng = center_lng + rng.uniform(-radius_delta, radius_delta)

            receiver = User(
                id=r_id,
                name=f"NGO Shelter {i + 1}",
                email=f"ngo_{r_id}_{seed}@test.com",
                role="ngo",
                verified=True,
                city="Ahmedabad",
                lat=r_lat,
                lng=r_lng,
            )
            receivers[r_id] = receiver

            # Profile
            num_cats = rng.randint(2, 4)
            accepted = rng.sample(cls.CATEGORIES, num_cats)
            capacity = rng.choice([30, 50, 80])

            profile = ReceiverProfile(
                id=3500 + i,
                user_id=r_id,
                accepted_categories=accepted,
                daily_intake_capacity=capacity,
                remaining_capacity=capacity,
                operating_hours_start="08:00",
                operating_hours_end="22:00",
                has_vehicle=(rng.random() < 0.4),
                priority_class=rng.choice(priority_classes),
            )
            profiles[r_id] = profile

        # 3. Generate Requests
        requests: List[DonationRequest] = []
        listing_keys = list(listings.keys())
        receiver_keys = list(receivers.keys())

        for i in range(cfg["num_requests"]):
            req_id = 4000 + i
            l_id = rng.choice(listing_keys)
            r_id = rng.choice(receiver_keys)
            lots = rng.choice([2, 5, 8, 10])

            req = DonationRequest(
                id=req_id,
                listing_id=l_id,
                receiver_id=r_id,
                requested_lots=lots,
                status="pending",
                created_at=base_time - timedelta(minutes=rng.randint(1, 60)),
            )
            requests.append(req)

        # 4. Generate Vehicles
        vehicles: List[Vehicle] = []
        provider_keys = list(providers.keys())

        for i in range(cfg["num_vehicles"]):
            v_id = 5000 + i
            owner_id = rng.choice(provider_keys)
            has_cold = (rng.random() < 0.5)

            v = Vehicle(
                id=v_id,
                owner_id=owner_id,
                type="van",
                capacity_lots=rng.choice([25, 40, 60]),
                service_radius_km=25.0,
                lat=center_lat + rng.uniform(-0.02, 0.02),
                lng=center_lng + rng.uniform(-0.02, 0.02),
                has_cold_storage=has_cold,
                is_simulated=True,
            )
            vehicles.append(v)

        return Scenario(
            name=f"{preset}_{seed}",
            seed=seed,
            listings=listings,
            requests=requests,
            receivers=receivers,
            profiles=profiles,
            vehicles=vehicles,
            providers=providers,
            base_time=base_time,
            traffic_level=traffic_level,
        )

