"""Kakao 로드뷰 — JavaScript 키 로더와 컴포넌트 계약 테스트.

실제 키·네트워크 호출 없이, REST/Admin 키 폴백 금지와 프런트 계약을 고정한다.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import kakao_js_key as kjk  # noqa: E402
import route_builder  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "pages" / "1_Navigation.py"
HTML = ROOT / "components" / "kakao_roadview" / "index.html"
COMP = ROOT / "kakao_roadview_component.py"


def _isolate_sources(monkeypatch) -> None:
    kjk.reset_cache()
    monkeypatch.delenv("KAKAO_JAVASCRIPT_KEY", raising=False)
    monkeypatch.setattr(kjk, "_from_secrets", lambda: "")
    monkeypatch.setattr(kjk, "_from_shared", lambda: "")


def test_env_javascript_key(monkeypatch):
    _isolate_sources(monkeypatch)
    monkeypatch.setenv("KAKAO_JAVASCRIPT_KEY", "js-test-key")
    kjk.reset_cache()
    assert kjk.kakao_javascript_key() == "js-test-key"
    assert kjk.enabled() is True


def test_missing_key_is_disabled(monkeypatch):
    _isolate_sources(monkeypatch)
    kjk.reset_cache()
    assert kjk.kakao_javascript_key() is None
    assert kjk.enabled() is False


def test_does_not_fall_back_to_rest_or_admin(monkeypatch):
    _isolate_sources(monkeypatch)
    monkeypatch.setenv("KAKAO_REST_API_KEY", "rest-should-not-be-used")
    monkeypatch.setenv("KAKAO_ADMIN_KEY", "admin-should-not-be-used")
    kjk.reset_cache()
    assert kjk.kakao_javascript_key() is None


def test_javascript_key_typo_is_flagged():
    hints = route_builder.misnamed_key_hints({"KAKAO_JAVASCRIPT_KEY_ID"})
    assert any("KAKAO_JAVASCRIPT_KEY" in h for h in hints)


def test_component_declared_outside_navigation_page():
    page = PAGE.read_text(encoding="utf-8")
    mod = COMP.read_text(encoding="utf-8")
    assert "from kakao_roadview_component import kakao_roadview" in page
    assert 'components.declare_component("walk_kakao_roadview"' in mod
    assert "declare_component(" not in page
    assert 'key="nav_roadview"' in page
    assert 'options=["지도", "로드뷰"]' in page
    assert "def _roadview_latlng(" in page
    assert "KAKAO_JAVASCRIPT_KEY" in page


def test_roadview_html_contract():
    html = HTML.read_text(encoding="utf-8")
    assert "streamlit:componentReady" in html
    assert "streamlit:render" in html
    assert "streamlit:setFrameHeight" in html
    assert "kakao.maps.Roadview" in html
    assert "getNearestPanoId" in html
    assert "autoload=false" in html
    assert "dapi.kakao.com/v2/maps/sdk.js" in html
    assert "KAKAO_ADMIN" not in html
    assert "KAKAO_REST" not in html
    assert "args.appkey" in html
    assert "new kakao.maps.LatLng(a.lat, a.lng)" in html
