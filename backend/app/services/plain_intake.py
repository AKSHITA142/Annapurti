import re
from datetime import datetime, time, timedelta, timezone
from typing import Any, Dict, Optional


class PlainLanguageIntakeParser:
    """
    Robust rule-based parser that translates plain-language food donor descriptions
    into structured listing form parameters for donor review and confirmation.
    
    Example: '50 veg biryani boxes made at 1 pm, pickup till 4'
    """

    @classmethod
    def parse(
        cls,
        text: str,
        base_time: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        if base_time is None:
            base_time = datetime.now(timezone.utc)
        elif base_time.tzinfo is None:
            base_time = base_time.replace(tzinfo=timezone.utc)

        clean_text = text.strip()
        lower_text = clean_text.lower()

        # 1. Quantity extraction (e.g. '50 boxes', '100 meals', '25 kg', '40 packets')
        quantity = 20  # default
        qty_match = re.search(r'\b(\d+)\s*(?:boxes|meals|packets|plates|portions|servings|containers|units|kg|lots)?\b', lower_text)
        if qty_match:
            try:
                quantity = int(qty_match.group(1))
            except ValueError:
                quantity = 20

        lot_size = 10
        total_lots = max(1, (quantity + lot_size - 1) // lot_size)

        # 2. Dietary check (veg vs non-veg)
        non_veg_keywords = ["chicken", "mutton", "fish", "egg", "meat", "non-veg", "nonveg", "prawn"]
        is_veg = not any(kw in lower_text for kw in non_veg_keywords)

        # 3. Category classification
        if any(w in lower_text for w in ["chilled", "blast chilled", "cold cooked"]):
            category = "cooked_chilled"
            storage = "chilled"
        elif any(w in lower_text for w in ["raw", "dairy", "paneer", "milk", "vegetable", "veggies", "fruit", "produce"]):
            category = "raw_refrigerated"
            storage = "chilled"
        elif any(w in lower_text for w in ["sealed", "packaged", "packet", "biscuit", "canned", "dry", "chips"]):
            category = "sealed_packaged"
            storage = "ambient"
        else:
            # Default to cooked_hot for typical surplus catering food
            category = "cooked_hot"
            storage = "ambient" if is_veg else "hot_holding"

        # 4. Extract Name / Description
        # Filter out numbers and common time phrases to isolate the food item
        name = "Surplus Meals"
        food_match = re.search(
            r'(?:(?:veg|non-veg|hot|fresh)\s+)?([a-zA-Z\s]+?)(?:\s+(?:boxes|meals|plates|packets|containers))?(?:\s+(?:made|cooked|prepared|at|pickup|till|until|\d))',
            lower_text,
        )
        if food_match and len(food_match.group(1).strip()) > 2:
            candidate = food_match.group(1).strip()
            # capitalize words
            name = " ".join(w.capitalize() for w in candidate.split())
        else:
            for kw in ["biryani", "khichdi", "dal rice", "roti sabzi", "pulao", "curry", "paneer", "sandwiches", "meals"]:
                if kw in lower_text:
                    name = kw.title()
                    break

        if is_veg and "veg" not in name.lower():
            name = f"Veg {name}"

        # 5. Extract preparation time (e.g. 'made at 1 pm', 'prepared at 12:30', 'cooked at 10 am')
        prepared_at = base_time
        prep_match = re.search(r'(?:made|prepared|cooked)?\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', lower_text)
        if prep_match:
            try:
                hour = int(prep_match.group(1))
                minute = int(prep_match.group(2)) if prep_match.group(2) else 0
                meridiem = prep_match.group(3)
                if meridiem == 'pm' and hour < 12:
                    hour += 12
                elif meridiem == 'am' and hour == 12:
                    hour = 0
                elif not meridiem and hour <= 6:  # typical afternoon assumption
                    hour += 12

                candidate_dt = base_time.replace(hour=hour, minute=minute, second=0, microsecond=0)
                # If candidate is in the future relative to base_time, adjust to past/same day
                if candidate_dt > base_time + timedelta(hours=1):
                    candidate_dt -= timedelta(days=1)
                prepared_at = candidate_dt
            except Exception:
                prepared_at = base_time

        # 6. Extract pickup window end (e.g. 'pickup till 4', 'until 4:30 pm', 'till 5')
        pickup_end = prepared_at + timedelta(hours=3)
        pickup_match = re.search(r'(?:pickup\s+)?(?:till|until|before|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', lower_text)
        if pickup_match:
            try:
                end_hour = int(pickup_match.group(1))
                end_minute = int(pickup_match.group(2)) if pickup_match.group(2) else 0
                meridiem = pickup_match.group(3)
                if meridiem == 'pm' and end_hour < 12:
                    end_hour += 12
                elif not meridiem and end_hour <= 7:
                    end_hour += 12

                candidate_end = base_time.replace(hour=end_hour, minute=end_minute, second=0, microsecond=0)
                if candidate_end < base_time:
                    candidate_end += timedelta(days=1)
                pickup_end = candidate_end
            except Exception:
                pickup_end = prepared_at + timedelta(hours=3)

        pickup_start = base_time
        declared_window_minutes = max(30, int((pickup_end - prepared_at).total_seconds() / 60))

        return {
            "name": name,
            "category": category,
            "veg": is_veg,
            "unit": "meals",
            "lot_size": lot_size,
            "total_lots": total_lots,
            "estimated_meals": quantity,
            "prepared_at": prepared_at.isoformat(),
            "pickup_window_start": pickup_start.isoformat(),
            "pickup_window_end": pickup_end.isoformat(),
            "sender_declared_window_minutes": declared_window_minutes,
            "storage_requirement": storage,
            "raw_text": text,
            "confidence": 0.95,
        }
