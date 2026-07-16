"""MapLibre 안내 지도 컴포넌트 등록 모듈.

declare_component 는 '호출한 모듈 이름'으로 컴포넌트를 등록하는데(모듈명.이름),
Streamlit 페이지 스크립트(pages/*.py) 안에서 직접 부르면 inspect 가 모듈을 찾지
못해 등록이 조용히 실패한다(프론트 iframe 404 — 실브라우저 검증으로 확정).
그래서 정식 컴포넌트 패키지처럼 'import 되는 모듈'에서 선언한다 — 여기서는
등록 이름이 maplibre_nav_component.walk_maplibre_nav 로 안정적으로 잡힌다.

프런트 자산: components/maplibre_nav/index.html (계약·안전장치 주석은 그 파일에).
자산이 없으면 ImportError 를 던져 페이지가 pydeck → plotly 로 폴백하게 한다.
"""
from pathlib import Path

import streamlit.components.v1 as components

_ASSET_DIR = Path(__file__).resolve().parent / "components" / "maplibre_nav"

if not (_ASSET_DIR / "index.html").is_file():
    raise ImportError(f"maplibre_nav 프런트 자산 없음: {_ASSET_DIR}")

maplibre_nav = components.declare_component("walk_maplibre_nav", path=str(_ASSET_DIR))
