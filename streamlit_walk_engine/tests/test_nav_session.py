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

    def test_go_when_idle_and_origin_present(self):
        assert nav_session.resume_action(
            running=False, has_route=False, has_journey=False, origin_present=True) == "go"

    def test_wait_when_no_origin(self):
        assert nav_session.resume_action(
            running=False, has_route=False, has_journey=False, origin_present=False) == "wait"

    def test_cancel_takes_priority_over_missing_origin(self):
        # 사용자가 새 목적지를 잡았으면 위치 유무와 무관하게 취소.
        assert nav_session.resume_action(
            running=False, has_route=True, has_journey=False, origin_present=False) == "cancel"

    def test_cancel_when_user_choosing_dest(self):
        # 경로 확정 전이라도 새 목적지 입력/선택 중이면 취소(진행 중 검색 보호).
        assert nav_session.resume_action(
            running=False, has_route=False, has_journey=False,
            origin_present=True, user_choosing_dest=True) == "cancel"

    def test_go_when_not_choosing_dest(self):
        assert nav_session.resume_action(
            running=False, has_route=False, has_journey=False,
            origin_present=True, user_choosing_dest=False) == "go"


# ── gps_poll_needed ──────────────────────────────────────────────────────────
class TestGpsPollNeeded:
    def _call(self, **over):
        kw = dict(running=False, origin_present=True, origin_coarse=False,
                  booking_armed=False, dest_entry_active=False)
        kw.update(over)
        return nav_session.gps_poll_needed(**kw)

    def test_typing_pauses_poll_before_first_fix(self):
        # ★리셋 원천차단(A안)★ 입력 중이면 첫 fix 미취득이어도 폴링을 멈춘다 — 첫 GPS
        # fix 가 타이핑 중 도착해 화면을 재생성하며 검색어를 지우던 것을 막는다.
        assert self._call(dest_entry_active=True, origin_present=False) is False

    def test_typing_pauses_poll_with_fix(self):
        assert self._call(dest_entry_active=True, origin_present=True) is False

    def test_typing_pauses_even_with_booking(self):
        # 입력 중이면 예약이 있어도(위치 유무 무관) 폴링을 멈춘다.
        assert self._call(dest_entry_active=True, origin_present=False, booking_armed=True) is False

    def test_pending_activation_resumes_polling_during_entry(self):
        # ★dead-end 탈출★ '출발'을 눌러 활성화를 예약(pending_activation)하면, 입력 중이어도
        # 폴링을 재개해 위치를 확보한다(이땐 타이핑이 끝났으므로 리셋이 무의미).
        assert self._call(dest_entry_active=True, origin_present=False,
                          pending_activation=True) is True

    def test_running_always_polls_even_if_flagged_dest_entry(self):
        # 안내 중엔 입력 상태가 성립하지 않지만, 방어적으로 running 이 우선한다.
        assert self._call(running=True, dest_entry_active=True, origin_present=True) is True

    def test_no_fix_polls_when_not_typing(self):
        # 입력 중이 아니면 첫 fix 취득을 위해 폴링한다(첫 위치 확보 보장).
        assert self._call(origin_present=False, dest_entry_active=False) is True

    def test_coarse_origin_polls_when_not_typing(self):
        assert self._call(origin_present=True, origin_coarse=True) is True

    def test_booking_armed_polls_when_not_typing(self):
        assert self._call(origin_present=True, booking_armed=True) is True

    def test_idle_with_good_fix_does_not_poll(self):
        # 정밀 fix 확보·입력/예약/안내 없음 → 폴링 멈춤(불필요한 rerun 방지).
        assert self._call(origin_present=True) is False
