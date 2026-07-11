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
        "window.speechSynthesis.cancel();"
        "window.speechSynthesis.speak(u);"
        "}"
        "}catch(e){}"
    )
