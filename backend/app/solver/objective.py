import json
import os
import statistics
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_SOLVER_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "solver_config.json"


class ObjectiveEvaluator:
    def __init__(self, config_path: Optional[Path] = None) -> None:
        self.config_path = config_path or DEFAULT_SOLVER_CONFIG_PATH
        self.weights = {
            "distance_weight": 1.0,
            "delivery_cost_weight": 0.5,
            "fairness_penalty_weight": 20.0,
            "utilization_bonus_weight": 0.2,
        }
        self.costs = {
            "self_collect_cost_inr": 0.0,
            "sender_vehicle_cost_per_km_inr": 15.0,
            "simulated_partner_cost_per_km_inr": 25.0,
        }
        self._load_config()

    def _load_config(self) -> None:
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.weights.update(data.get("objective_weights", {}))
                    self.costs.update(data.get("costs", {}))
            except Exception:
                pass

    def compute_fairness_penalty(
        self,
        allocated_by_receiver: Dict[int, int],
        requested_by_receiver: Dict[int, int],
        receiver_priorities: Optional[Dict[int, str]] = None,
    ) -> float:
        """
        Fairness penalty: Variance of served fraction (allocated / requested)
        among receivers with equal declared priority class.
        """
        if not requested_by_receiver:
            return 0.0

        fractions: List[float] = []
        for r_id, req_lots in requested_by_receiver.items():
            if req_lots > 0:
                alloc_lots = allocated_by_receiver.get(r_id, 0)
                fractions.append(min(1.0, alloc_lots / req_lots))

        if len(fractions) < 2:
            return 0.0

        # Variance of served fraction
        return statistics.pvariance(fractions)

    def compute_weighted_cost(
        self,
        total_distance_km: float,
        total_delivery_cost_inr: float,
        fairness_penalty: float,
        resource_utilization: float,
    ) -> float:
        """
        Tie-breaking weighted score:
        cost = 1.0 * distance + 0.5 * cost + 20.0 * fairness - 0.2 * utilization
        Lower is better.
        """
        cost = (
            self.weights["distance_weight"] * total_distance_km
            + self.weights["delivery_cost_weight"] * total_delivery_cost_inr
            + self.weights["fairness_penalty_weight"] * fairness_penalty
            - self.weights["utilization_bonus_weight"] * resource_utilization
        )
        return round(cost, 4)

    def lexicographic_key(
        self,
        is_hard_feasible: bool,
        total_allocated_lots: int,
        unallocated_lots: int,
        weighted_cost: float,
    ) -> Tuple[int, int, int, float]:
        """
        Lexicographic comparison key:
        1. is_hard_feasible: 1 if True, 0 if False (higher is better)
        2. total_allocated_lots: higher is better (maximise safely saved food)
        3. unallocated_lots: lower is better (minimise unallocated/spoiled lots)
        4. weighted_cost: lower is better
        
        Returned as a tuple suitable for Python sorting:
        We negate the maximised values so min() finds the best solution.
        """
        return (
            -1 if is_hard_feasible else 1,  # Feasible first
            -total_allocated_lots,          # More allocated is better
            unallocated_lots,               # Fewer unallocated is better
            weighted_cost,                  # Lower cost is better
        )


objective_evaluator = ObjectiveEvaluator()

