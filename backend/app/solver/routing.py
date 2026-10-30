import copy
import math
import random
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from app.solver.astar import RouteStateAStar
from app.solver.validator import RouteStop, RouteValidationResult, validate_route


class RoutingEngine:
    @staticmethod
    def cheapest_insertion(
        stops: List[RouteStop],
        start_coord: Tuple[float, float],
        vehicle_capacity: int,
        vehicle_has_cold_storage: bool,
        start_time: datetime,
        traffic_level: str = "medium",
    ) -> List[RouteStop]:
        """
        Builds an initial route using Cheapest Insertion with pickup-before-delivery precedence.
        """
        if not stops:
            return []

        # Group stops by request_id: (pickup_stop, delivery_stop)
        requests: Dict[int, Dict[str, RouteStop]] = {}
        for s in stops:
            requests.setdefault(s.request_id, {})[s.stop_type] = s

        current_route: List[RouteStop] = []

        # Sort requests by deadline tightness or distance
        sorted_req_ids = sorted(
            requests.keys(),
            key=lambda rid: (
                requests[rid].get("delivery", requests[rid].get("pickup")).safe_deadline
                or datetime.max
            ),
        )

        for req_id in sorted_req_ids:
            pair = requests[req_id]
            pickup = pair.get("pickup")
            delivery = pair.get("delivery")

            if not pickup or not delivery:
                # Incomplete pair fallback
                single_stop = pickup or delivery
                if single_stop:
                    best_pos = 0
                    best_cost = float("inf")
                    for pos in range(len(current_route) + 1):
                        cand = current_route[:pos] + [single_stop] + current_route[pos:]
                        res = validate_route(
                            cand,
                            vehicle_capacity,
                            vehicle_has_cold_storage,
                            start_time,
                            start_coord,
                            traffic_level,
                        )
                        if res.is_valid and res.total_time_minutes < best_cost:
                            best_cost = res.total_time_minutes
                            best_pos = pos
                    current_route = (
                        current_route[:best_pos] + [single_stop] + current_route[best_pos:]
                    )
                continue

            # Find best positions (i, j) with i <= j to insert pickup at i and delivery at j+1
            best_i = 0
            best_j = 0
            best_cost = float("inf")
            best_cand: Optional[List[RouteStop]] = None

            n = len(current_route)
            for i in range(n + 1):
                for j in range(i, n + 1):
                    # Insert pickup at i, then delivery at j+1
                    cand = current_route[:i] + [pickup] + current_route[i:j] + [delivery] + current_route[j:]
                    res = validate_route(
                        cand,
                        vehicle_capacity,
                        vehicle_has_cold_storage,
                        start_time,
                        start_coord,
                        traffic_level,
                    )
                    if res.is_valid and res.total_time_minutes < best_cost:
                        best_cost = res.total_time_minutes
                        best_cand = cand
                        best_i = i
                        best_j = j

            if best_cand is not None:
                current_route = best_cand
            else:
                # Feasible pair insertion failed; append to end
                current_route.extend([pickup, delivery])

        return current_route

    @staticmethod
    def two_opt(
        route: List[RouteStop],
        vehicle_capacity: int,
        vehicle_has_cold_storage: bool,
        start_time: datetime,
        start_coord: Tuple[float, float],
        traffic_level: str = "medium",
        max_iterations: int = 50,
    ) -> List[RouteStop]:
        """
        2-opt local search: inverts subsegment route[i:j+1] if valid and reduces cost.
        """
        best_route = list(route)
        res = validate_route(
            best_route, vehicle_capacity, vehicle_has_cold_storage, start_time, start_coord, traffic_level
        )
        if not res.is_valid:
            return best_route

        best_cost = res.total_time_minutes
        improved = True
        iterations = 0

        while improved and iterations < max_iterations:
            improved = False
            iterations += 1
            n = len(best_route)
            for i in range(n - 1):
                for j in range(i + 1, n):
                    # Invert subsegment
                    cand = best_route[:i] + best_route[i : j + 1][::-1] + best_route[j + 1 :]
                    c_res = validate_route(
                        cand,
                        vehicle_capacity,
                        vehicle_has_cold_storage,
                        start_time,
                        start_coord,
                        traffic_level,
                    )
                    if c_res.is_valid and c_res.total_time_minutes < best_cost - 1e-4:
                        best_cost = c_res.total_time_minutes
                        best_route = cand
                        improved = True
                        break
                if improved:
                    break

        return best_route

    @staticmethod
    def relocate(
        route: List[RouteStop],
        vehicle_capacity: int,
        vehicle_has_cold_storage: bool,
        start_time: datetime,
        start_coord: Tuple[float, float],
        traffic_level: str = "medium",
        max_iterations: int = 50,
    ) -> List[RouteStop]:
        """
        Relocate local search: removes stop at i and inserts at j if valid and reduces cost.
        """
        best_route = list(route)
        res = validate_route(
            best_route, vehicle_capacity, vehicle_has_cold_storage, start_time, start_coord, traffic_level
        )
        if not res.is_valid:
            return best_route

        best_cost = res.total_time_minutes
        improved = True
        iterations = 0

        while improved and iterations < max_iterations:
            improved = False
            iterations += 1
            n = len(best_route)
            for i in range(n):
                stop = best_route[i]
                rem = best_route[:i] + best_route[i + 1 :]
                for j in range(len(rem) + 1):
                    cand = rem[:j] + [stop] + rem[j:]
                    c_res = validate_route(
                        cand,
                        vehicle_capacity,
                        vehicle_has_cold_storage,
                        start_time,
                        start_coord,
                        traffic_level,
                    )
                    if c_res.is_valid and c_res.total_time_minutes < best_cost - 1e-4:
                        best_cost = c_res.total_time_minutes
                        best_route = cand
                        improved = True
                        break
                if improved:
                    break

        return best_route

    @staticmethod
    def swap(
        route: List[RouteStop],
        vehicle_capacity: int,
        vehicle_has_cold_storage: bool,
        start_time: datetime,
        start_coord: Tuple[float, float],
        traffic_level: str = "medium",
        max_iterations: int = 50,
    ) -> List[RouteStop]:
        """
        Swap local search: swaps stops at positions i and j if valid and reduces cost.
        """
        best_route = list(route)
        res = validate_route(
            best_route, vehicle_capacity, vehicle_has_cold_storage, start_time, start_coord, traffic_level
        )
        if not res.is_valid:
            return best_route

        best_cost = res.total_time_minutes
        improved = True
        iterations = 0

        while improved and iterations < max_iterations:
            improved = False
            iterations += 1
            n = len(best_route)
            for i in range(n - 1):
                for j in range(i + 1, n):
                    cand = list(best_route)
                    cand[i], cand[j] = cand[j], cand[i]
                    c_res = validate_route(
                        cand,
                        vehicle_capacity,
                        vehicle_has_cold_storage,
                        start_time,
                        start_coord,
                        traffic_level,
                    )
                    if c_res.is_valid and c_res.total_time_minutes < best_cost - 1e-4:
                        best_cost = c_res.total_time_minutes
                        best_route = cand
                        improved = True
                        break
                if improved:
                    break

        return best_route

    @staticmethod
    def simulated_annealing(
        route: List[RouteStop],
        vehicle_capacity: int,
        vehicle_has_cold_storage: bool,
        start_time: datetime,
        start_coord: Tuple[float, float],
        traffic_level: str = "medium",
        initial_temp: float = 100.0,
        cooling_rate: float = 0.95,
        max_steps: int = 200,
        seed: int = 42,
    ) -> List[RouteStop]:
        """
        Simulated Annealing metaheuristic (optional, disabled by default).
        """
        rng = random.Random(seed)
        current = list(route)
        res = validate_route(
            current, vehicle_capacity, vehicle_has_cold_storage, start_time, start_coord, traffic_level
        )
        if not res.is_valid:
            return current

        current_cost = res.total_time_minutes
        best = list(current)
        best_cost = current_cost
        temp = initial_temp

        for step in range(max_steps):
            if temp <= 1e-3 or len(current) < 3:
                break

            # Pick random move: 2-opt, relocate, or swap
            cand = list(current)
            n = len(cand)
            i, j = sorted(rng.sample(range(n), 2))

            move_type = rng.choice(["2opt", "relocate", "swap"])
            if move_type == "2opt":
                cand = cand[:i] + cand[i : j + 1][::-1] + cand[j + 1 :]
            elif move_type == "relocate":
                stop = cand.pop(i)
                cand.insert(j, stop)
            else:
                cand[i], cand[j] = cand[j], cand[i]

            c_res = validate_route(
                cand, vehicle_capacity, vehicle_has_cold_storage, start_time, start_coord, traffic_level
            )
            if c_res.is_valid:
                delta = c_res.total_time_minutes - current_cost
                if delta < 0 or rng.random() < math.exp(-delta / temp):
                    current = cand
                    current_cost = c_res.total_time_minutes
                    if current_cost < best_cost:
                        best = list(current)
                        best_cost = current_cost

            temp *= cooling_rate

        return best

    @classmethod
    def optimize_route(
        cls,
        stops: List[RouteStop],
        start_coord: Tuple[float, float],
        vehicle_capacity: int,
        vehicle_has_cold_storage: bool,
        start_time: datetime,
        traffic_level: str = "medium",
        enable_simulated_annealing: bool = False,
    ) -> Tuple[List[RouteStop], RouteValidationResult]:
        """
        Main routing optimizer:
        - For small instances (<= 6 stops): uses Route-State A* (exact optimal).
        - For larger instances (> 6 stops): uses Cheapest Insertion + 2-opt + relocate + swap.
        """
        if len(stops) <= 6:
            exact_res = RouteStateAStar.solve(
                stops=stops,
                start_coord=start_coord,
                vehicle_capacity=vehicle_capacity,
                vehicle_has_cold_storage=vehicle_has_cold_storage,
                start_time=start_time,
                traffic_level=traffic_level,
            )
            if exact_res is not None:
                optimal_route, _ = exact_res
                validation = validate_route(
                    optimal_route,
                    vehicle_capacity,
                    vehicle_has_cold_storage,
                    start_time,
                    start_coord,
                    traffic_level,
                )
                return optimal_route, validation

        # Heuristic optimization for larger instances or when exact search found no unconstrained path
        route = cls.cheapest_insertion(
            stops, start_coord, vehicle_capacity, vehicle_has_cold_storage, start_time, traffic_level
        )
        route = cls.two_opt(
            route, vehicle_capacity, vehicle_has_cold_storage, start_time, start_coord, traffic_level
        )
        route = cls.relocate(
            route, vehicle_capacity, vehicle_has_cold_storage, start_time, start_coord, traffic_level
        )
        route = cls.swap(
            route, vehicle_capacity, vehicle_has_cold_storage, start_time, start_coord, traffic_level
        )

        if enable_simulated_annealing:
            route = cls.simulated_annealing(
                route, vehicle_capacity, vehicle_has_cold_storage, start_time, start_coord, traffic_level
            )

        validation = validate_route(
            route, vehicle_capacity, vehicle_has_cold_storage, start_time, start_coord, traffic_level
        )
        return route, validation
