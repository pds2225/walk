"""
Cross-verification tests: Python engine must produce the same state transitions
as the TypeScript simulator for the four canonical scenarios in scenarios.py.

Reference output (npm run simulate):
  normal_walking  → all on_route
  mild_drift      → on_route → drifting  (last sample drifting)
  strong_deviation→ on_route → drifting → deviated
  missed_turn     → on_route → drifting → passed_turn
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import RouteDeviationEngine
from scenarios import get_scenarios


def run_scenario(key: str) -> list[str]:
    """Return list of state strings for every sample in the given scenario."""
    scenario = next(s for s in get_scenarios() if s.key == key)
    engine = RouteDeviationEngine(scenario.route)
    return [engine.process_sample(sample).state for sample in scenario.samples]


class TestNormalWalking:
    def test_all_samples_on_route(self):
        states = run_scenario("normal_walking")
        assert all(s == "on_route" for s in states), f"unexpected states: {states}"

    def test_no_drifting_or_worse(self):
        states = run_scenario("normal_walking")
        assert "drifting" not in states
        assert "deviated" not in states
        assert "passed_turn" not in states


class TestMildDrift:
    def test_last_sample_is_drifting(self):
        states = run_scenario("mild_drift")
        assert states[-1] == "drifting", f"last state was {states[-1]}, expected drifting"

    def test_starts_on_route(self):
        states = run_scenario("mild_drift")
        assert states[0] == "on_route"

    def test_no_deviated_or_passed_turn(self):
        states = run_scenario("mild_drift")
        assert "deviated" not in states
        assert "passed_turn" not in states


class TestStrongDeviation:
    def test_deviated_appears_at_least_once(self):
        states = run_scenario("strong_deviation")
        assert "deviated" in states, f"deviated never reached: {states}"

    def test_starts_on_route(self):
        states = run_scenario("strong_deviation")
        assert states[0] == "on_route"

    def test_drifting_precedes_deviated(self):
        states = run_scenario("strong_deviation")
        first_drifting = next((i for i, s in enumerate(states) if s == "drifting"), None)
        first_deviated = next((i for i, s in enumerate(states) if s == "deviated"), None)
        assert first_drifting is not None, "drifting state never appeared"
        assert first_deviated is not None, "deviated state never appeared"
        assert first_drifting < first_deviated, "expected drifting before deviated"


class TestMissedTurn:
    def test_passed_turn_appears_at_least_once(self):
        states = run_scenario("missed_turn")
        assert "passed_turn" in states, f"passed_turn never reached: {states}"

    def test_starts_on_route(self):
        states = run_scenario("missed_turn")
        assert states[0] == "on_route"

    def test_no_deviated(self):
        states = run_scenario("missed_turn")
        assert "deviated" not in states, f"unexpected deviated in missed_turn: {states}"
