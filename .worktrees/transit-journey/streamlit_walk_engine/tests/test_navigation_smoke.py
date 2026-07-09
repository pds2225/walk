import os
from pathlib import Path

from streamlit.testing.v1 import AppTest


PAGE = Path(__file__).resolve().parents[1] / "pages" / "1_Navigation.py"


def test_navigation_page_renders_with_transit_toggle():
    app = AppTest.from_file(str(PAGE))
    app.run(timeout=10)

    assert not app.exception
    assert any("대중교통 포함" in toggle.label for toggle in app.toggle)


def test_navigation_source_clears_journey_for_non_journey_flows():
    source = PAGE.read_text(encoding="utf-8")

    assert 'st.session_state.get("nav_journey") is not None' in source
    assert "_clear_journey_state()" in source
    assert "transit_builder.advance_leg" in source
    assert "transit_builder.fetch_transit_journey" in source
