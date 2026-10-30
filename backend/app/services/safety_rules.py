import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "safety_rules.json"

FALLBACK_RULES: Dict[str, Dict[str, Any]] = {
    "cooked_hot": {
        "max_safe_window_minutes": 240,
        "needs_temperature_control": false if "false" in locals() else False,
        "description": "Cooked food served hot (FSSAI 4-hour window)",
    },
    "cooked_chilled": {
        "max_safe_window_minutes": 480,
        "needs_temperature_control": True,
        "description": "Cooked food blast chilled, requires cold storage",
    },
    "raw_refrigerated": {
        "max_safe_window_minutes": 720,
        "needs_temperature_control": True,
        "description": "Perishable raw produce/dairy, requires cold storage",
    },
    "sealed_packaged": {
        "max_safe_window_minutes": 10080,
        "needs_temperature_control": False,
        "description": "Packaged shelf-stable goods, capped at 7 days",
    },
}

DEFAULT_OPERATIONAL_DEFAULTS: Dict[str, Any] = {
    "load_time_minutes": 10,
    "handover_time_minutes": 5,
    "speed_kmh": 30.0,
    "road_curvature_factor": 1.3,
}


class SafetyRulesService:
    def __init__(self, config_path: Optional[Path] = None) -> None:
        self.config_path = config_path or DEFAULT_CONFIG_PATH
        self.categories: Dict[str, Dict[str, Any]] = FALLBACK_RULES
        self.operational_defaults: Dict[str, Any] = DEFAULT_OPERATIONAL_DEFAULTS
        self._load_config()

    def _load_config(self) -> None:
        """Loads configuration from JSON file with fallback to hardcoded defaults."""
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.categories = data.get("categories", FALLBACK_RULES)
                    self.operational_defaults = data.get(
                        "operational_defaults", DEFAULT_OPERATIONAL_DEFAULTS
                    )
            except Exception:
                self.categories = FALLBACK_RULES
                self.operational_defaults = DEFAULT_OPERATIONAL_DEFAULTS

    def get_category_rule(self, category: str) -> Dict[str, Any]:
        """Returns the safety rule specification for a given food category."""
        return self.categories.get(
            category,
            {
                "max_safe_window_minutes": 240,
                "needs_temperature_control": False,
                "description": "Unknown category, default to conservative 4-hour window",
            },
        )

    def get_max_safe_window_minutes(self, category: str) -> int:
        """Returns the maximum allowed window for this category in minutes."""
        rule = self.get_category_rule(category)
        return int(rule.get("max_safe_window_minutes", 240))

    def requires_cold_storage(self, category: str) -> bool:
        """Constraint: Does this food category require cold storage (temperature control)?"""
        rule = self.get_category_rule(category)
        return bool(rule.get("needs_temperature_control", False))

    def compute_safe_deadline(
        self,
        prepared_at: datetime,
        category: str,
        sender_declared_window_minutes: Optional[int] = None,
    ) -> datetime:
        """
        Computes the definitive hard safe deadline:
        safe_deadline = prepared_at + min(sender_declared_window, category_max_window).
        The sender can only shorten the safety window, NEVER extend it.
        """
        if prepared_at.tzinfo is None:
            prepared_at = prepared_at.replace(tzinfo=timezone.utc)

        category_max_window = self.get_max_safe_window_minutes(category)

        if sender_declared_window_minutes is not None and sender_declared_window_minutes > 0:
            # Sender window is clamped to category maximum
            effective_window_minutes = min(sender_declared_window_minutes, category_max_window)
        else:
            effective_window_minutes = category_max_window

        return prepared_at + timedelta(minutes=effective_window_minutes)

    def is_vehicle_suitable(self, category: str, vehicle_has_cold_storage: bool) -> bool:
        """
        Constraint: Temperature-controlled food requires vehicle with active cold storage.
        Returns True if vehicle satisfies food safety temperature requirement, False otherwise.
        """
        needs_cold = self.requires_cold_storage(category)
        if needs_cold and not vehicle_has_cold_storage:
            return False
        return True

    def check_journey_feasibility(
        self,
        depart_time: datetime,
        travel_to_pickup_minutes: float,
        travel_to_receiver_minutes: float,
        safe_deadline: datetime,
        load_time_minutes: Optional[int] = None,
        handover_time_minutes: Optional[int] = None,
    ) -> Tuple[bool, datetime, float]:
        """
        Constraint: Journey feasibility check.
        arrival_at_receiver = depart + travel_to_pickup + load_time + travel_to_receiver + handover_time
        Must be <= safe_deadline.
        
        Returns:
            (is_feasible, arrival_at_receiver, slack_minutes)
        """
        if depart_time.tzinfo is None:
            depart_time = depart_time.replace(tzinfo=timezone.utc)
        if safe_deadline.tzinfo is None:
            safe_deadline = safe_deadline.replace(tzinfo=timezone.utc)

        load_time = (
            load_time_minutes
            if load_time_minutes is not None
            else int(self.operational_defaults.get("load_time_minutes", 10))
        )
        handover_time = (
            handover_time_minutes
            if handover_time_minutes is not None
            else int(self.operational_defaults.get("handover_time_minutes", 5))
        )

        total_journey_minutes = (
            travel_to_pickup_minutes
            + load_time
            + travel_to_receiver_minutes
            + handover_time
        )

        arrival_at_receiver = depart_time + timedelta(minutes=total_journey_minutes)

        # In seconds for precise boundary check
        slack_seconds = (safe_deadline - arrival_at_receiver).total_seconds()
        slack_minutes = slack_seconds / 60.0

        is_feasible = arrival_at_receiver <= safe_deadline
        return is_feasible, arrival_at_receiver, slack_minutes


# Global singleton instance
safety_service = SafetyRulesService()
