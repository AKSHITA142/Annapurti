import math
import os
import logging
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Traffic multipliers per Phase 2 specifications (labelled simulated in outputs)
TRAFFIC_MULTIPLIERS: Dict[str, float] = {
    "low": 1.0,
    "medium": 1.3,
    "high": 1.7,
}

DEFAULT_SPEED_KMH: float = 30.0
DEFAULT_ROAD_FACTOR: float = 1.3  # Ahmedabad urban grid detour factor
EARTH_RADIUS_KM: float = 6371.0


def haversine_distance_km(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
    """
    Computes great-circle distance between two (lat, lng) coordinates in kilometers.
    """
    lat1, lng1 = coord1
    lat2, lng2 = coord2

    # If coordinates are identical
    if math.isclose(lat1, lat2, abs_tol=1e-7) and math.isclose(lng1, lng2, abs_tol=1e-7):
        return 0.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    # Clamp to avoid precision domain errors in asin
    a = min(1.0, max(0.0, a))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return round(EARTH_RADIUS_KM * c, 4)


class RoadGraphLoader:
    """
    Manages loading the road graph for Ahmedabad, with graceful fallback to Haversine.
    """

    def __init__(self, cache_file: str = "data/ahmedabad_roads.graphml") -> None:
        self.cache_file = cache_file
        self.graph = None
        self.using_fallback: bool = True

    def load_graph(self) -> bool:
        """
        Attempts to load the OSMnx/GraphML road network.
        If unavailable or fails, enables the haversine fallback model.
        """
        if os.path.exists(self.cache_file):
            try:
                import networkx as nx

                self.graph = nx.read_graphml(self.cache_file)
                self.using_fallback = False
                logger.info("Loaded road network graph from %s", self.cache_file)
                return True
            except Exception as e:
                logger.warning(
                    "Failed to load GraphML from %s: %s. Using Haversine fallback.",
                    self.cache_file,
                    str(e),
                )

        self.graph = None
        self.using_fallback = True
        logger.info(
            "Road network graph not cached. Operating with Haversine fallback (30 km/h * 1.3 factor)."
        )
        return False


# Global graph loader
road_loader = RoadGraphLoader()


def travel_minutes(
    coord1: Tuple[float, float],
    coord2: Tuple[float, float],
    traffic_level: str = "medium",
    speed_kmh: float = DEFAULT_SPEED_KMH,
    road_factor: float = DEFAULT_ROAD_FACTOR,
) -> float:
    """
    Calculates estimated travel time in minutes between two coordinates.
    Considers road curvature factor, average urban vehicle speed, and traffic multipliers.
    
    All traffic calculations are labelled simulated.
    """
    if coord1 == coord2:
        return 0.0

    traffic_level = traffic_level.lower()
    multiplier = TRAFFIC_MULTIPLIERS.get(traffic_level, 1.3)

    # Road network estimation via haversine distance * road curvature factor
    dist_km = haversine_distance_km(coord1, coord2)
    effective_road_km = dist_km * road_factor

    # Hours to minutes conversion
    base_minutes = (effective_road_km / speed_kmh) * 60.0
    total_minutes = base_minutes * multiplier

    return round(total_minutes, 2)


class DistanceMatrix:
    """
    Cached distance and travel-time matrix builder for solver scenarios.
    """

    def __init__(self, traffic_level: str = "medium") -> None:
        self.traffic_level: str = traffic_level
        self._cache: Dict[Tuple[Tuple[float, float], Tuple[float, float], str], float] = {}

    def get_travel_time(
        self,
        coord1: Tuple[float, float],
        coord2: Tuple[float, float],
        traffic_level: Optional[str] = None,
    ) -> float:
        """
        Retrieves or calculates cached travel time in minutes.
        """
        level = traffic_level or self.traffic_level
        key = (coord1, coord2, level)
        if key not in self._cache:
            self._cache[key] = travel_minutes(coord1, coord2, traffic_level=level)
        return self._cache[key]

    def build_matrix(
        self,
        locations: List[Tuple[float, float]],
        traffic_level: Optional[str] = None,
    ) -> Dict[Tuple[int, int], float]:
        """
        Builds an N x N travel time lookup matrix for a list of location coordinates.
        Returns a dict indexed by (i, j) location indices.
        """
        level = traffic_level or self.traffic_level
        matrix: Dict[Tuple[int, int], float] = {}
        n = len(locations)
        for i in range(n):
            for j in range(n):
                if i == j:
                    matrix[(i, j)] = 0.0
                else:
                    matrix[(i, j)] = self.get_travel_time(
                        locations[i], locations[j], traffic_level=level
                    )
        return matrix

