from pydantic import BaseModel


class ImpactSummaryResponse(BaseModel):
    published_lots: int
    published_meals: int
    reserved_lots: int
    delivered_lots: int
    delivered_meals: int
    reported_distributed_lots: int
    reported_distributed_meals: int
    utilisation_percentage: float
    estimated_people_served: int
    co2_saved_kg: float
    co2_assumption: str

