from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.delivery import UtilizationReport
from app.models.listing import FoodListing
from app.schemas.impact import ImpactSummaryResponse

router = APIRouter(prefix="/impact", tags=["Impact"])


@router.get("/summary", response_model=ImpactSummaryResponse)
def get_impact_summary(db: Session = Depends(get_db)) -> ImpactSummaryResponse:
    """
    Computes cumulative food rescue impact metrics:
    published, reserved, delivered, reported distributed, utilisation percentage,
    estimated people served, and CO2 emissions saved with explicit UNEP/FAO benchmark assumption.
    """
    listings = db.query(FoodListing).all()
    reports = db.query(UtilizationReport).all()

    published_lots = sum(l.total_lots for l in listings)
    published_meals = sum(l.total_lots * l.lot_size for l in listings)
    reserved_lots = sum(l.reserved_lots for l in listings)
    delivered_lots = sum(l.delivered_lots for l in listings)
    delivered_meals = sum(l.delivered_lots * l.lot_size for l in listings)

    reported_distributed_lots = sum(r.reported_distributed_lots for r in reports)
    reported_distributed_meals = 0
    people_served = sum(r.people_served for r in reports)

    for r in reports:
        lot_size = 10
        if r.request and r.request.listing:
            lot_size = r.request.listing.lot_size
        reported_distributed_meals += r.reported_distributed_lots * lot_size

    # Fallback people served estimate if not recorded manually
    if people_served == 0:
        people_served = reported_distributed_meals if reported_distributed_meals > 0 else delivered_meals

    utilisation_pct = 0.0
    if delivered_lots > 0:
        utilisation_pct = min(100.0, (reported_distributed_lots / delivered_lots) * 100.0)

    # 1 meal rescued ~ 1.0 kg CO2e emissions avoided (2.5 kg CO2e per kg food saved)
    effective_meals_rescued = max(delivered_meals, reported_distributed_meals)
    co2_saved_kg = round(effective_meals_rescued * 1.0, 2)

    return ImpactSummaryResponse(
        published_lots=published_lots,
        published_meals=published_meals,
        reserved_lots=reserved_lots,
        delivered_lots=delivered_lots,
        delivered_meals=delivered_meals,
        reported_distributed_lots=reported_distributed_lots,
        reported_distributed_meals=reported_distributed_meals,
        utilisation_percentage=round(utilisation_pct, 1),
        estimated_people_served=people_served,
        co2_saved_kg=co2_saved_kg,
        co2_assumption="Based on UNEP/FAO benchmarks: 1 meal rescued avoids approx 1.0 kg of CO2e emissions (2.5 kg CO2e per kg of food).",
    )
