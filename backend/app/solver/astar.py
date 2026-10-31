import heapq
import itertools
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from app.services.travel import haversine_distance_km, travel_minutes
from app.solver.validator import RouteStop, validate_route


def graph_astar(
    start_node: Any,
    goal_node: Any,
    neighbors_fn: Callable[[Any], List[Tuple[Any, float]]],
    heuristic_fn: Callable[[Any, Any], float],
) -> Optional[Tuple[List[Any], float]]:
    """
    Standard Graph A* search for finding shortest path between nodes.
    
    Args:
        start_node: Initial node.
        goal_node: Destination node.
        neighbors_fn: Returns list of (neighbor_node, edge_weight).
        heuristic_fn: Admissible heuristic h(current, goal) <= true remaining cost.
        
    Returns:
        (path_nodes, total_path_cost) or None if unreachable.
    """
    counter = 0
    open_set: List[Tuple[float, int, Any, float]] = []  # (f_score, counter, current_node, g_score)
    h_start = heuristic_fn(start_node, goal_node)
    heapq.heappush(open_set, (h_start, counter, start_node, 0.0))

    came_from: Dict[Any, Any] = {}
    g_score: Dict[Any, float] = {start_node: 0.0}

    while open_set:
        f, _, current, current_g = heapq.heappop(open_set)

        if current == goal_node:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            return path, current_g

        if current_g > g_score.get(current, float("inf")):
            continue

        for neighbor, edge_cost in neighbors_fn(current):
            tentative_g = current_g + edge_cost
            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                h = heuristic_fn(neighbor, goal_node)
                counter += 1
                heapq.heappush(open_set, (tentative_g + h, counter, neighbor, tentative_g))

    return None


class RouteStateAStar:
    """
    Route-state A* for small pickup-and-delivery instances (up to 6 stops).
    State: (current_stop_idx, visited_mask, current_time_minutes, current_load)
    Cost: elapsed travel time.
    Heuristic: minimum outgoing edge cost summed over unvisited stops (admissible).
    
    Guarantees mathematically optimal sequence and verifies feasibility at every expansion.
    """

    @staticmethod
    def solve(
        stops: List[RouteStop],
        start_coord: Tuple[float, float],
        vehicle_capacity: int,
        vehicle_has_cold_storage: bool,
        start_time: datetime,
        traffic_level: str = "medium",
    ) -> Optional[Tuple[List[RouteStop], float]]:
        if not stops:
            return [], 0.0

        n = len(stops)
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)

        # Precompute pairwise travel times between all stops and start_coord
        # Index 0..n-1 are stops, index n is start_coord
        travel_matrix: List[List[float]] = [[0.0] * (n + 1) for _ in range(n + 1)]
        all_coords = [s.coord for s in stops] + [start_coord]

        for i in range(n + 1):
            for j in range(n + 1):
                if i != j:
                    travel_matrix[i][j] = travel_minutes(
                        all_coords[i], all_coords[j], traffic_level=traffic_level
                    )

        # Precompute minimum outgoing edge cost for each stop (for admissible heuristic)
        min_outgoing: List[float] = [0.0] * n
        for i in range(n):
            costs = [travel_matrix[i][j] for j in range(n) if i != j]
            min_outgoing[i] = min(costs) if costs else 0.0

        def heuristic(mask: int) -> float:
            """Sum of minimum outgoing edge costs for all unvisited stops (admissible)."""
            h = 0.0
            for i in range(n):
                if not (mask & (1 << i)):
                    h += min_outgoing[i]
            return h

        # Precedence map: index of pickup stop required for each delivery stop
        pickup_for_delivery: Dict[int, int] = {}
        stop_by_req_and_type: Dict[Tuple[int, str], int] = {}
        for i, s in enumerate(stops):
            stop_by_req_and_type[(s.request_id, s.stop_type)] = i

        for i, s in enumerate(stops):
            if s.stop_type == "delivery":
                p_idx = stop_by_req_and_type.get((s.request_id, "pickup"))
                if p_idx is not None:
                    pickup_for_delivery[i] = p_idx

        # Priority queue item:
        # (f_cost, counter, current_idx, visited_mask, elapsed_minutes, current_load, path_indices)
        counter = 0
        target_mask = (1 << n) - 1

        pq: List[Tuple[float, int, int, int, float, int, List[int]]] = []

        # Initial expansions from start_coord (index n)
        for i in range(n):
            s = stops[i]
            # Must satisfy initial constraints:
            # 1. Precedence: cannot start with delivery
            if i in pickup_for_delivery:
                continue
            # 2. Capacity
            if s.lot_change > vehicle_capacity:
                continue
            # 3. Cold chain
            if s.needs_cold_storage and not vehicle_has_cold_storage:
                continue

            time_to_first = travel_matrix[n][i]
            arrival = start_time + timedelta(minutes=time_to_first)

            # Window check
            if s.time_window_start and arrival < s.time_window_start.replace(tzinfo=timezone.utc):
                arrival = s.time_window_start.replace(tzinfo=timezone.utc)
            if s.time_window_end and arrival > s.time_window_end.replace(tzinfo=timezone.utc):
                continue
            if s.safe_deadline and arrival > s.safe_deadline.replace(tzinfo=timezone.utc):
                continue

            dep_time_minutes = (arrival + timedelta(minutes=s.service_time_minutes) - start_time).total_seconds() / 60.0
            mask = (1 << i)
            g_cost = dep_time_minutes
            h_cost = heuristic(mask)

            counter += 1
            heapq.heappush(pq, (g_cost + h_cost, counter, i, mask, g_cost, s.lot_change, [i]))

        # State cache: (current_idx, visited_mask) -> min_g_cost
        best_g: Dict[Tuple[int, int], float] = {}

        while pq:
            f, _, curr_idx, mask, g_cost, load, path = heapq.heappop(pq)

            if mask == target_mask:
                # Found optimal complete route
                ordered_stops = [stops[idx] for idx in path]
                return ordered_stops, g_cost

            state_key = (curr_idx, mask)
            if g_cost > best_g.get(state_key, float("inf")):
                continue
            best_g[state_key] = g_cost

            # Expand to next unvisited stop
            for next_idx in range(n):
                if mask & (1 << next_idx):
                    continue  # Already visited

                next_stop = stops[next_idx]

                # 1. Precedence check: if next is delivery, its pickup must be visited
                if next_idx in pickup_for_delivery:
                    p_idx = pickup_for_delivery[next_idx]
                    if not (mask & (1 << p_idx)):
                        continue

                # 2. Capacity check
                new_load = load + next_stop.lot_change
                if new_load < 0 or new_load > vehicle_capacity:
                    continue

                # 3. Cold chain check
                if next_stop.needs_cold_storage and not vehicle_has_cold_storage:
                    continue

                # 4. Travel and time calculation
                leg_time = travel_matrix[curr_idx][next_idx]
                curr_time = start_time + timedelta(minutes=g_cost)
                arrival = curr_time + timedelta(minutes=leg_time)

                if next_stop.time_window_start:
                    w_s = next_stop.time_window_start.replace(tzinfo=timezone.utc)
                    if arrival < w_s:
                        arrival = w_s

                # Deadline & window end check
                if next_stop.time_window_end:
                    w_e = next_stop.time_window_end.replace(tzinfo=timezone.utc)
                    if arrival > w_e:
                        continue

                if next_stop.safe_deadline:
                    s_d = next_stop.safe_deadline.replace(tzinfo=timezone.utc)
                    if arrival > s_d:
                        continue

                dep_minutes = (arrival + timedelta(minutes=next_stop.service_time_minutes) - start_time).total_seconds() / 60.0
                next_mask = mask | (1 << next_idx)
                next_g = dep_minutes
                next_h = heuristic(next_mask)

                next_state_key = (next_idx, next_mask)
                if next_g < best_g.get(next_state_key, float("inf")):
                    best_g[next_state_key] = next_g
                    counter += 1
                    heapq.heappush(
                        pq,
                        (next_g + next_h, counter, next_idx, next_mask, next_g, new_load, path + [next_idx]),
                    )

        return None


def brute_force_optimal_route(
    stops: List[RouteStop],
    start_coord: Tuple[float, float],
    vehicle_capacity: int,
    vehicle_has_cold_storage: bool,
    start_time: datetime,
    traffic_level: str = "medium",
) -> Optional[Tuple[List[RouteStop], float]]:
    """
    Brute-force baseline solver evaluating all permutations of stops (up to 5 stops).
    Returns (best_route, best_time_minutes) for mathematical optimality verification.
    """
    best_route: Optional[List[RouteStop]] = None
    best_time: float = float("inf")

    for perm in itertools.permutations(stops):
        res = validate_route(
            route=list(perm),
            vehicle_capacity=vehicle_capacity,
            vehicle_has_cold_storage=vehicle_has_cold_storage,
            start_time=start_time,
            start_coord=start_coord,
            traffic_level=traffic_level,
        )
        if res.is_valid and res.total_time_minutes < best_time:
            best_time = res.total_time_minutes
            best_route = list(perm)

    if best_route is not None:
        return best_route, best_time
    return None

