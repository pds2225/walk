"""
Unit tests for alert_voice.py — 경로이탈 음성(TTS) 안내 순수 함수 검증.

커버 범위:
  tts_phrase        → 이탈 상태별 한국어 문구 반환, 정상/미정의 상태는 None
  build_tts_script  → SpeechSynthesis JS 스니펫 구성, json.dumps 안전 이스케이프
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alert_voice import build_tts_prime_script, build_tts_script, tts_phrase


class TestTtsPhrase:
    def test_deviation_states_have_korean_phrase(self):
        for state in ("drifting", "deviated", "passed_turn"):
            phrase = tts_phrase(state)
            assert phrase is not None
            assert phrase.strip() != ""

    def test_phrases_are_distinct(self):
        phrases = [tts_phrase(s) for s in ("drifting", "deviated", "passed_turn")]
        assert len(set(phrases)) == 3

    def test_arrived_has_korean_phrase(self):
        # 도착 안내 — 이탈 문구들과 구분되는 별도 문구
        phrase = tts_phrase("arrived")
        assert phrase is not None and phrase.strip() != ""
        assert phrase not in {tts_phrase(s) for s in ("drifting", "deviated", "passed_turn")}

    def test_deviated_phrase_exact_wording(self):
        # 경로 이탈 시 음성은 "경로를 이탈하였습니다." 로 안내한다(사용자 지정 문구).
        assert tts_phrase("deviated") == "경로를 이탈하였습니다."

    def test_on_route_returns_none(self):
        assert tts_phrase("on_route") is None

    def test_unknown_state_returns_none(self):
        assert tts_phrase("totally_unknown") is None
        assert tts_phrase("") is None


class TestBuildTtsScript:
    def test_contains_speech_synthesis_api_calls(self):
        script = build_tts_script("경로를 이탈했습니다.")
        assert "SpeechSynthesisUtterance" in script
        assert "ko-KR" in script
        assert "speechSynthesis.speak" in script
        # 직전 발화와 겹치지 않도록 취소 후 발화
        assert "speechSynthesis.cancel" in script
        # 미지원/차단 브라우저 보호
        assert "try{" in script
        assert "}catch(e){}" in script

    def test_phrase_is_json_escaped(self):
        phrase = '따옴표 " 와 한글'
        script = build_tts_script(phrase)
        # json.dumps 결과(이스케이프된 따옴표 포함)가 그대로 들어가야 스크립트가 깨지지 않는다.
        assert json.dumps(phrase, ensure_ascii=False) in script

    def test_korean_preserved_non_ascii(self):
        phrase = "회전 지점을 지나쳤습니다."
        script = build_tts_script(phrase)
        # ensure_ascii=False 이므로 한글이 그대로 보존된다.
        assert phrase in script

    def test_resumes_before_speak_for_chrome_pause_bug(self):
        # 크롬이 큐를 'paused'로 두면 speak()가 무시된다 — resume 으로 깨운 뒤 발화.
        script = build_tts_script("안내")
        assert "speechSynthesis.resume" in script
        assert script.index("resume") < script.index("speak")


class TestBuildTtsPrimeScript:
    """안내 시작(제스처) 시 TTS 해금용 무음 발화 스니펫."""

    def test_primes_with_silent_utterance(self):
        script = build_tts_prime_script()
        assert "SpeechSynthesisUtterance" in script
        assert "u.volume=0" in script                 # 무음 — 사용자에게 안 들림
        assert "speechSynthesis.speak" in script
        assert "getVoices" in script                  # 한국어 음성 목록 예열
        assert "ko-KR" in script

    def test_guarded_for_unsupported_browsers(self):
        script = build_tts_prime_script()
        assert "try{" in script and "}catch(e){}" in script
        assert "if(window.speechSynthesis)" in script
