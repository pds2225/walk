"""경로이탈 알림용 음성(TTS) 안내 순수 함수 모듈.

기존 알림(토스트·비프·진동)에 더해 이탈 상태별 한국어 음성 안내를 제공한다.
브라우저 ``SpeechSynthesis`` API로 발화하는 JS 스니펫을 생성하며, 부수효과 없는
순수 함수만 둔다(페이지 모듈은 하단에서 ``main()``을 즉시 실행해 import-테스트가
불가하므로 이 로직을 별도 모듈로 분리한다).
"""

from __future__ import annotations

import json
from typing import Optional

# 알림 상태별 한국어 음성 안내 문구 (engine.DeviationState 부분집합 + 도착).
# on_route 등 정상 진행 상태는 의도적으로 제외한다(안내하지 않음).
_TTS_PHRASES = {
    "drifting": "경로를 벗어나기 시작했습니다. 경로를 확인하세요.",
    "deviated": "경로를 이탈하였습니다.",
    "passed_turn": "회전 지점을 지나쳤습니다. 되돌아가세요.",
    "arrived": "목적지에 도착했습니다. 안내를 종료합니다.",
}


def tts_phrase(state: str) -> Optional[str]:
    """알림 상태에 대응하는 한국어 음성 안내 문구를 반환한다.

    정의되지 않은 상태(on_route 포함)는 ``None``을 반환해 음성 안내를 생략한다.
    """
    return _TTS_PHRASES.get(state)


def build_tts_script(phrase: str) -> str:
    """문구를 ko-KR 음성으로 발화하는 JS 스니펫을 반환한다.

    - 한글·따옴표 등은 ``json.dumps``로 안전하게 이스케이프해 스크립트 깨짐을 막는다.
    - 직전 발화가 남아 겹치지 않도록 ``speechSynthesis.cancel()`` 후 ``speak()``.
    - 미지원 브라우저(또는 차단)는 ``try/catch``로 조용히 무시한다.
    """
    text = json.dumps(phrase, ensure_ascii=False)
    return (
        "try{"
        "if(window.speechSynthesis){"
        f"var u=new SpeechSynthesisUtterance({text});"
        "u.lang='ko-KR';"
        # resume(): 크롬은 유휴 시 합성 큐를 'paused'로 두는 버그가 있어 speak() 가 조용히
        # 무시된다 — 발화 직전 resume 으로 깨운다. cancel(): 직전 발화 잔여를 지워 겹침 방지.
        "window.speechSynthesis.resume();"
        "window.speechSynthesis.cancel();"
        "window.speechSynthesis.speak(u);"
        "}"
        "}catch(e){}"
    )


def build_tts_prime_script() -> str:
    """사용자 조작(안내 시작) 시 브라우저 TTS를 '미리 깨우는' JS 스니펫.

    모바일 브라우저는 사용자 제스처 없이 speak()를 무시할 수 있다. 시작 버튼을 누른
    직후 무음(volume=0) 발화를 한 번 재생해 음성 합성을 '해금'하면, 이후 비동기
    rerun(이탈 알림)의 발화가 막히지 않는다. getVoices()로 한국어 음성 목록도 예열한다.
    미지원/차단 브라우저는 try/catch로 조용히 무시한다.
    """
    return (
        "try{"
        "if(window.speechSynthesis){"
        "window.speechSynthesis.getVoices();"
        "window.speechSynthesis.resume();"
        "var u=new SpeechSynthesisUtterance(' ');"
        "u.lang='ko-KR';u.volume=0;"
        "window.speechSynthesis.cancel();"
        "window.speechSynthesis.speak(u);"
        "}"
        "}catch(e){}"
    )
