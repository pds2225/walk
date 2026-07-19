# -*- coding: utf-8 -*-
"""nav_session.py 순수 함수 동작 테스트 — 자동 재개/세션 복원 판정 분기 고정.

코드리뷰에서 반복 지적된 분기(손상 JSON·만료 세션·새 목적지 덮어쓰기·위치 대기)를
동작으로 검증해 회귀를 막는다.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import nav_session  # noqa: E402

_HOUR = 60 * 60 * 1000
_MAX_AGE = 6 * _HOUR


def _raw(**over):
    obj = {"lat": 37.5665, "lon": 126.9780, "label": "경복궁", "transit": True, "ts": 1_000_000}
    obj.update(over)
    return json.dumps(obj, ensure_ascii=False)


# ── classify_saved_session ───────────────────────────────────────────────────
class TestClassifySavedSession:
    def test_valid_resume(self):
        s = nav_session.classify_saved_session(_raw(ts=1_000_000), 1_000_000, _MAX_AGE)
        assert s.status == "resume"
        assert abs(s.data["lat"] - 37.5665) < 1e-9
        assert abs(s.data["lon"] - 126.9780) < 1e-9
        assert s.data["label"] == "경복궁"
        assert s.data["transit"] is True

    def test_malformed_json_is_bad(self):
        assert nav_session.classify_saved_session("{not json", 1_000_000, _MAX_AGE).status == "bad"

    def test_missing_coords_is_bad(self):
        assert nav_session.classify_saved_session(
            json.dumps({"label": "x"}), 1_000_000, _MAX_AGE).status == "bad"

    def test_non_numeric_coords_is_bad(self):
        assert nav_session.classify_saved_session(
            json.dumps({"lat": "north", "lon": "east"}), 1_000_000, _MAX_AGE).status == "bad"

    def test_expired_beyond_max_age(self):
        # ts 가 max_age 보다 더 과거 → expired
        now = 1_000_000 + _MAX_AGE + 1
        assert nav_session.classify_saved_session(_raw(ts=1_000_000), now, _MAX_AGE).status == "expired"

    def test_within_max_age_resumes(self):
        now = 1_000_000 + _MAX_AGE  # 경계(같음) → 아직 유효
        assert nav_session.classify_saved_session(_raw(ts=1_000_000), now, _MAX_AGE).status == "resume"

    def test_missing_ts_skips_age_check(self):
        raw = json.dumps({"lat": 37.5, "lon": 127.0})  # ts 없음
        s = nav_session.classify_saved_session(raw, 9_999_999_999, _MAX_AGE)
        assert s.status == "resume"

    def test_bad_ts_skips_age_check_but_resumes(self):
        raw = json.dumps({"lat": 37.5, "lon": 127.0, "ts": "nope"})
        assert nav_session.classify_saved_session(raw, 9_999_999_999, _MAX_AGE).status == "resume"

    def test_defaults_label_empty_and_transit_true(self):
        raw = json.dumps({"lat": 37.5, "lon": 127.0})
        s = nav_session.classify_saved_session(raw, 1_000_000, _MAX_AGE)
        assert s.data["label"] == "" and s.data["transit"] is True

    def test_transit_false_preserved(self):
        s = nav_session.classify_saved_session(_raw(transit=False), 1_000_000, _MAX_AGE)
        assert s.data["transit"] is False


# ── resume_action ────────────────────────────────────────────────────────────
class TestResumeAction:
    def test_cancel_when_running(self):
        assert nav_session.resume_action(
            running=True, has_route=False, has_journey=False, origin_present=True) == "cancel"

    def test_cancel_when_route_exists(self):
        assert nav_session.resume_action(
            running=False, has_route=True, has_journey=False, origin_present=True) == "cancel"

    def test_cancel_when_journey_exists(self):
        assert nav_session.resume_action(
            running=False, has_route=False, has_journey=True, origin_present=True) == "cancel"

    def test_cancel_when_new_destination_exists(self):
        assert nav_session.resume_action(
            running=False, has_route=False, has_journey=False,
            has_new_destination=True, origin_present=True) == "cancel"

    def test_go_when_idle_and_origin_present(self):
        assert nav_session.resume_action(
            running=False, has_route=False, has_journey=False, origin_present=True) == "go"

    def test_wait_when_no_origin(self):
        assert nav_session.resume_action(
            running=False, has_route=False, has_journey=False, origin_present=False) == "wait"

    def test_cancel_takes_priority_over_missing_origin(self):
        # 사용자가 새 목적지를 잡았으면 위치 유무와 무관하게 취소.
        assert nav_session.resume_action(
            running=False, has_route=False, has_journey=False,
            has_new_destination=True, origin_present=False) == "cancel"
