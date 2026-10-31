import os
import sys
from datetime import datetime, timezone
from pathlib import Path
import pytest

# Ensure root directory is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.sim.generator import ScenarioGenerator
from evaluation.baselines import run_nearest_first_baseline, run_fcfs_baseline
from evaluation.run_experiments import evaluate_foodrescue_ai, RESULTS_DIR


def test_scenario_generator_presets():
    """
    Test scenario generator creates all 4 presets correctly with seeded reproducibility.
    """
    for preset in ["small", "medium", "large", "stress"]:
        scenario = ScenarioGenerator.generate(preset=preset, seed=777)
        assert scenario.name == f"{preset}_777"
        assert len(scenario.listings) > 0
        assert len(scenario.requests) > 0
        assert len(scenario.vehicles) > 0
        assert len(scenario.receivers) > 0

    # Test seed reproducibility: two calls with seed 123 produce identical listing IDs
    s1 = ScenarioGenerator.generate(preset="small", seed=123)
    s2 = ScenarioGenerator.generate(preset="small", seed=123)
    assert list(s1.listings.keys()) == list(s2.listings.keys())
    assert [r.id for r in s1.requests] == [r.id for r in s2.requests]


def test_baselines_execution():
    """
    Test that B1 (Nearest) and B2 (FCFS) baselines run and return structured BaselineResult.
    """
    scenario = ScenarioGenerator.generate(preset="small", seed=888)
    now = scenario.base_time

    b1_res = run_nearest_first_baseline(
        scenario.requests,
        scenario.listings,
        scenario.receivers,
        scenario.profiles,
        scenario.vehicles,
        now=now,
    )
    assert b1_res.method_name == "B1_Nearest_Receiver"
    assert b1_res.allocated_lots >= 0

    b2_res = run_fcfs_baseline(
        scenario.requests,
        scenario.listings,
        scenario.receivers,
        scenario.profiles,
        scenario.vehicles,
        now=now,
    )
    assert b2_res.method_name == "B2_FCFS"
    assert b2_res.allocated_lots >= 0


def test_foodrescue_ai_zero_deadline_violations():
    """
    Acceptance check: Our hand-written CSP solver + feedback loop
    MUST have exactly zero deadline violations.
    """
    scenario = ScenarioGenerator.generate(preset="small", seed=999)
    res = evaluate_foodrescue_ai(scenario)

    assert res["method"] == "FoodRescue-AI (Ours)"
    # Hard constraint: 0 deadline violations guaranteed!
    assert res["deadline_violations"] == 0
    assert res["all_valid"] is True
