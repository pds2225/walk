"""Kakao Maps Web SDK(Roadview)용 JavaScript 키 로더.

Admin Key·REST API 키는 읽지 않는다. Web Map/Roadview 는 브라우저 SDK 이므로
JavaScript 키만 사용한다. 값은 반환 외에 로그·화면에 노출하지 않는다.
"""
from __future__ import annotations

import os

_JS_KEY_NAME = "KAKAO_JAVASCRIPT_KEY"
_js_key_cache: str | None | bool = False


def reset_cache() -> None:
    """테스트용 — 키 캐시를 비운다."""
    global _js_key_cache
    _js_key_cache = False


def _from_secrets() -> str:
    try:
        import streamlit as st
        return str(st.secrets.get(_JS_KEY_NAME, "") or "").strip()
    except Exception:
        return ""


def _from_shared() -> str:
    try:
        from route_builder import _env_shared_values
        return _env_shared_values(_JS_KEY_NAME).get(_JS_KEY_NAME, "").strip()
    except Exception:
        return ""


def kakao_javascript_key() -> str | None:
    """JavaScript 키. 없으면 None. REST/Admin 키로는 폴백하지 않는다."""
    global _js_key_cache
    if _js_key_cache is False:
        key = os.environ.get(_JS_KEY_NAME, "").strip()
        if not key:
            key = _from_secrets()
        if not key:
            key = _from_shared()
        _js_key_cache = key or None
    return _js_key_cache or None


def enabled() -> bool:
    """로드뷰를 켤 JavaScript 키가 있으면 True. 없으면 기존 지도만 쓴다."""
    return kakao_javascript_key() is not None
