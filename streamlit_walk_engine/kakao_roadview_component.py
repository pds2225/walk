"""Kakao 로드뷰 컴포넌트 등록 모듈.

declare_component 는 호출한 모듈 이름으로 등록된다. Streamlit 페이지(pages/*.py)
안에서 직접 부르면 모듈 탐지가 실패해 iframe 404 가 난다. MapLibre 와 같이
import 되는 이 모듈에서 선언한다.

프런트 자산: components/kakao_roadview/index.html
"""
from pathlib import Path

import streamlit.components.v1 as components

_ASSET_DIR = Path(__file__).resolve().parent / "components" / "kakao_roadview"

if not (_ASSET_DIR / "index.html").is_file():
    raise ImportError(f"kakao_roadview 프런트 자산 없음: {_ASSET_DIR}")

kakao_roadview = components.declare_component("walk_kakao_roadview", path=str(_ASSET_DIR))
