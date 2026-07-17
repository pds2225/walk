"""Walk — 실시간 내비게이션 (목적지 입력 → 경로 생성 → 이탈 감지)."""

from __future__ import annotations

import io
import json
import math
import re
import struct
import sys
import threading
import time
import wave
from functools import lru_cache
from pathlib import Path
from typing import Optional

import streamlit as st
import streamlit.components.v1 as components

try:
    # 재탐색 백그라운드 fetch 의 세션 식별용(공개 API 아님 — 이동 대비 폴백 존재).
    from streamlit.runtime.scriptrunner import get_script_run_ctx
except ImportError:
    get_script_run_ctx = None

_MISSING_DEPENDENCIES: list[str] = []

try:
    import plotly.graph_objects as go
except ModuleNotFoundError:
    go = None  # type: ignore[assignment]
    _MISSING_DEPENDENCIES.append("plotly")

sys.path.insert(0, str(Path(__file__).parent.parent))

from engine import (
    Coordinate,
    EngineConfig,
    EngineResult,
    PositionSample,
    RouteDeviationEngine,
    RouteModel,
    bearing_degrees,
    distance_meters,
)
import gps_filter
import mapbox_matcher
import snap_router
import transit_builder
from alert_voice import build_tts_script, tts_phrase
from route_builder import (
    fetch_walking_route_with_engine, format_korean_address, geocode_address,
    geocode_suggestions, label_with_distance, reverse_geocode, route_engine_label,
    sort_suggestions_by_distance,
)

try:
    from streamlit_js_eval import get_geolocation, streamlit_js_eval as _js_eval
    _HAS_GEO = True
except ImportError:
    _HAS_GEO = False
    _js_eval = None  # type: ignore[assignment]

try:
    from streamlit_autorefresh import st_autorefresh
    _HAS_REFRESH = True
except ImportError:
    _HAS_REFRESH = False

try:
    from streamlit_searchbox import st_searchbox
    _HAS_SEARCHBOX = True
except ImportError:
    _HAS_SEARCHBOX = False

try:
    import pydeck as pdk
    _HAS_PYDECK = True
except ImportError:
    _HAS_PYDECK = False
    pdk = None  # type: ignore[assignment]

# MapLibre 양방향 컴포넌트(부드러운 헤딩업) — declare_component iframe 은 rerun 에도
# 재마운트되지 않아 지도 인스턴스가 살아 있고, 매 틱 easeTo(900ms)로 카메라를
# 애니메이션시켜 pydeck 의 '1초 스텝' 회전을 매끈하게 만든다. 선언은 반드시
# import 되는 별도 모듈에서 — 페이지 스크립트에서 직접 declare 하면 모듈 탐지가
# 실패해 등록이 조용히 죽는다(maplibre_nav_component 모듈 주석 참조).
# 자산 없음·등록 실패 시 pydeck → plotly 순으로 폴백(안내 기능은 어느 층에서도 동작).
try:
    from maplibre_nav_component import maplibre_nav as _maplibre_nav
    _HAS_MAPLIBRE = True
except Exception:
    _maplibre_nav = None
    _HAS_MAPLIBRE = False


# GPS 재측정 주기(초). streamlit_js_eval 프런트엔드는 '같은 js_expressions 문자열'은
# 다시 평가하지 않으므로(once-per-string 가드), 표현식을 고정하면 위치가 세션당 1회만
# 잡혀 내비 중 갱신되지 않는다. 이 주기로 바뀌는 토큰을 표현식에 덧붙여 재측정을 유도한다.
# 안내 중(nav_running)에만 1초 — 유휴(검색·대기) 화면은 5초로 늦춰, 재측정발 rerun이
# 목적지 입력(searchbox 클릭~첫 글자)·지도 조작을 매초 끊는 문제를 줄인다.
_GPS_POLL_BUCKET_RUNNING_SEC = 1
_GPS_POLL_BUCKET_IDLE_SEC = 5


def _gps_poll_bucket_sec() -> int:
    """현재 화면 상태에 맞는 GPS 재측정 주기(초) — 안내 중 1초 / 유휴 5초."""
    return (_GPS_POLL_BUCKET_RUNNING_SEC if st.session_state.get("nav_running")
            else _GPS_POLL_BUCKET_IDLE_SEC)


# 위치 샘플/판정 누적 상한 — 장시간 보행 시 메모리·지도 렌더 무한 증가 차단.
_MAX_SAMPLES = 500

# 자북→진북 편각 보정(도, 동쪽+): 나침반(webkitCompassHeading·absolute alpha)은 '자북'
# 기준인데 GPS heading·경로 방위(bearing_degrees)는 '진북' 기준이라 그대로 섞으면
# 한국에서 약 8~9° 계통 오차가 난다(정지 화살표·'보는 방향' 8분할 안내가 늘 같은
# 방향으로 조금 틀어지던 원인). 국내 전용 앱(TMAP 좌표)이라 남한 평균 ≈8.5°W 상수 보정.
_COMPASS_DECL_DEG = -8.5


def _get_geolocation_high_accuracy(component_key: str = "walk_hi_acc_geo", multi: bool = False):
    """현재 위치를 enableHighAccuracy로 요청한다 (실패 시 스톡 get_geolocation 폴백).

    스톡 get_geolocation()은 getCurrentPosition을 옵션 없이 호출해 고정밀을 요청하지
    않는다. 여기서는 streamlit_js_eval로 enableHighAccuracy=true 측정을 요청한다.
    반환 형태는 get_geolocation()과 동일: {"coords": {...}, "timestamp": ...} /
    {"error": {...}} / None. (_HAS_GEO 가 True일 때만 호출된다.)

    multi=True: watchPosition으로 여러 측정을 모아 accuracy가 가장 작은(가장 정확한)
    fix를 고른다. enableHighAccuracy 첫 fix가 흔히 ±40~50m로 부정확한 문제를 완화한다.
    종료 조건은 세 가지 — ① 충분히 정확한 fix(≤20m) 또는 최대 4fix가 들어오면 즉시,
    ② soft 마감(2.5초): 그때까지 받은 fix가 하나라도 있으면 best 반환(체감 로딩↓),
    ③ hard 마감(6초): 콜드 GPS로 첫 fix가 늦게 와도 저정밀 폴백으로 헛돌지 않게
    그때까지의 best(없으면 timeout)를 반환. 예전 1.2초 하드캡은 콜드스타트에서 첫
    fix가 도착하기 전 timeout→저정밀 폴백으로 빠지는 문제가 있어 완화했다.
    '최초 위치 취득(nav_origin 미정)' 시에만 쓰고, 라이브 폴링은 단일 fix(빠른 응답)를
    유지해 샘플 빈도를 떨어뜨리지 않는다.

    내비 중 위치가 갱신되도록 표현식 끝에 _gps_poll_bucket_sec() 주기로 바뀌는 주석
    토큰을 붙인다 — 같은 버킷 안에서는 문자열이 같아 값-변경발 무한 rerun이 없고,
    버킷이 바뀔 때마다 프런트엔드가 재평가해 새 fix를 받는다(multi/single 공통 보존).
    """
    bucket = int(time.time() // _gps_poll_bucket_sec())
    # 나침반(DeviceOrientation) 리스너 — iframe 전역(window)에 1회만 등록해 두고 매 GPS
    # 틱마다 방위각을 payload에 실어 보낸다. GPS heading은 이동 중에만 나오므로,
    # 서 있어도 사용자가 '보는 방향'을 알 수 있게 하는 유일한 소스다.
    # iOS: webkitCompassHeading(자북 시계방향, 권한 탭 1회 필요 — _render_compass_enable).
    #      webkitCompassAccuracy<0 은 '보정 안 된 나침반'(8자 흔들기 전) — 배제.
    # Android: deviceorientationabsolute 의 alpha → (360-alpha)%360 = 자북 시계방향.
    # 정확도: 자기 센서는 ±10~15° 떨림이 기본이라 원시 마지막 값 대신 최근 0.8초의
    # '원형 평균'(sin/cos 합산 후 atan2 — 359°↔1° 경계에서 180°로 튀지 않는 평균)을
    # 보낸다(~16Hz 스로틀). 자북→진북 편각 보정은 수신부(_COMPASS_DECL_DEG) 일괄 적용.
    compass_setup_js = (
        "try{if(!window._walkCompass){window._walkCompass={h:null,buf:[]};"
        "var _ce=('ondeviceorientationabsolute' in window)?'deviceorientationabsolute':'deviceorientation';"
        "window.addEventListener(_ce,function(ev){"
        "var h=null;"
        "if(ev.webkitCompassHeading!=null){"
        "if(ev.webkitCompassAccuracy!=null&&ev.webkitCompassAccuracy<0)return;"
        "h=ev.webkitCompassHeading%360;}"
        "else if(ev.absolute&&ev.alpha!=null){h=(360-ev.alpha)%360;}"
        "if(h==null)return;"
        "var C=window._walkCompass,now=Date.now();"
        "if(C.buf.length&&(now-C.buf[C.buf.length-1].t)<60)return;"
        "C.buf.push({t:now,h:h});"
        "while(C.buf.length&&(now-C.buf[0].t)>800)C.buf.shift();"
        "var sx=0,sy=0;for(var i=0;i<C.buf.length;i++){"
        "var r=C.buf[i].h*Math.PI/180;sx+=Math.sin(r);sy+=Math.cos(r);}"
        "C.h=(Math.atan2(sx,sy)*180/Math.PI+360)%360;"
        "},true);}}catch(e){}"
    )
    coords_js = (
        "coords:{accuracy:p.coords.accuracy,altitude:p.coords.altitude,"
        "altitudeAccuracy:p.coords.altitudeAccuracy,heading:p.coords.heading,"
        "latitude:p.coords.latitude,longitude:p.coords.longitude,speed:p.coords.speed},"
        "timestamp:p.timestamp,"
        "compass:(window._walkCompass||{h:null}).h"
    )
    if multi:
        js = (
            "new Promise((resolve)=>{"
            + compass_setup_js +
            "if(!navigator.geolocation){resolve({error:{code:0,message:'no geolocation'}});return;}"
            "var best=null,n=0,done=false;"
            "var fin=function(){if(done)return;done=true;"
            "try{navigator.geolocation.clearWatch(wid);}catch(e){}"
            "resolve(best||{error:{code:3,message:'timeout'}});};"
            "var wid=navigator.geolocation.watchPosition("
            "(p)=>{if(best===null||p.coords.accuracy<best.coords.accuracy){best={" + coords_js + "};}"
            "n++;if(p.coords.accuracy<=20||n>=4){fin();}},"
            "(e)=>{if(best===null&&!done){done=true;resolve({error:{code:e.code,message:e.message}});}},"
            "{enableHighAccuracy:true,maximumAge:0,timeout:10000});"
            "setTimeout(function(){if(best!==null)fin();},2500);"
            "setTimeout(fin,6000);"
            f"}})/* {bucket} */"
        )
    else:
        js = (
            "new Promise((resolve)=>{"
            + compass_setup_js +
            "if(!navigator.geolocation){resolve({error:{code:0,message:'no geolocation'}});return;}"
            "navigator.geolocation.getCurrentPosition("
            "(p)=>resolve({" + coords_js + "}),"
            "(e)=>resolve({error:{code:e.code,message:e.message}}),"
            # maximumAge=1000: 폴링 주기(1초)와 동일하게 — 3000이면 같은 캐시 fix가
            # 최대 3틱 재처리돼 스무딩·판정이 stale 좌표로 오염된다. 0 금지: 매 틱
            # 콜드 재취득(1~3초)이 강제돼 실효 샘플 주기가 오히려 나빠진다.
            "{enableHighAccuracy:true,maximumAge:1000,timeout:10000});"
            f"}})/* {bucket} */"
        )
    geo = None
    if _js_eval is not None:
        try:
            geo = _js_eval(js_expressions=js, key=component_key)
        except Exception:
            geo = None
    if not geo:  # 첫 렌더 None·예외 → 스톡 경로 폴백
        geo = get_geolocation()
    return geo


def _get_ip_geolocation(component_key: str = "walk_ip_geo"):
    """브라우저에서 IP 지오로케이션으로 도시 수준 '대략 위치'를 조회한다.

    PC처럼 GPS가 없어 브라우저 geolocation이 실패(POSITION_UNAVAILABLE/TIMEOUT)할 때,
    최소한의 위치라도 인식시켜 목적지 입력·경로 탐색이 막히지 않게 하는 폴백이다.
    반드시 사용자 브라우저에서 fetch 해야 사용자 IP 기준 위치가 잡힌다 — 서버측
    requests로 조회하면 스트림릿 서버(클라우드 데이터센터) IP가 잡혀 무의미하다.

    반환 형태는 geolocation과 호환: {"coords": {"latitude","longitude","accuracy":None},
    "city": str|None, "source": "ip"} / {"error": {...}} / None(첫 렌더·대기).
    CORS·HTTPS를 지원하는 무키(無key) 서비스 두 곳을 순차 폴백한다(첫 곳 실패 시 다음).
    js_expressions 문자열이 고정이라 프런트엔드가 세션당 1회만 fetch하고, 결과가 오면
    컴포넌트 값 변경으로 rerun이 유발돼 대기(None)→결과로 자동 갱신된다.
    """
    if _js_eval is None:
        return {"error": {"message": "no js eval"}}
    js = (
        "new Promise((resolve)=>{"
        "var svcs=["
        "{u:'https://ipapi.co/json/',f:(d)=>[d.latitude,d.longitude,d.city]},"
        "{u:'https://ipwho.is/',f:(d)=>[d.latitude,d.longitude,d.city]}"
        "];var i=0;"
        "function nx(){"
        "if(i>=svcs.length){resolve({error:{code:2,message:'ip geo failed'}});return;}"
        "var s=svcs[i++];"
        "fetch(s.u).then(r=>r.json()).then(d=>{var g=s.f(d);"
        "if(g[0]!=null&&g[1]!=null&&isFinite(+g[0])&&isFinite(+g[1])){"
        "resolve({coords:{latitude:+g[0],longitude:+g[1],accuracy:null},"
        "city:g[2]||null,source:'ip'});"
        "}else{nx();}}).catch(()=>nx());}"
        "nx();})"
    )
    try:
        return _js_eval(js_expressions=js, key=component_key)
    except Exception:
        return {"error": {"code": 2, "message": "ip geo exception"}}


# ── 상수 ──────────────────────────────────────────────────────────────────────

STATE_COLOR = {
    "on_route": "#27ae60", "drifting": "#f39c12",
    "deviated": "#e74c3c", "passed_turn": "#8e44ad",
}
STATE_LABEL = {
    "on_route": "경로 유지", "drifting": "이탈 시작",
    "deviated": "경로 이탈", "passed_turn": "회전 미이행",
}
ACTION_LABEL = {
    "none": "정상", "monitor": "모니터링 중",
    "warn_user": "경고", "reroute_candidate": "재탐색 필요",
}
ACTION_COLOR = {
    "none": "#27ae60", "monitor": "#f39c12",
    "warn_user": "#e67e22", "reroute_candidate": "#e74c3c",
}


def render_dependency_error() -> None:
    missing = ", ".join(_MISSING_DEPENDENCIES)
    st.error(f"필수 Python 패키지가 설치되지 않았습니다: {missing}")
    st.markdown("Streamlit Cloud에서는 앱을 재부팅하거나 requirements.txt 설치 로그를 확인하세요.")
    st.code(
        "python -m pip install -r requirements.txt\n"
        "python -m streamlit run streamlit_walk_engine/app.py",
        language="powershell",
    )


# ── 세션 상태 ─────────────────────────────────────────────────────────────────

def _init() -> None:
    for k, v in {
        "nav_origin": None,
        # 표시 전용 스무딩 좌표 — nav_origin(수용된 raw fix, 판정용)과 이원화.
        # smoothed 좌표가 엔진 판정에 유입되면 median lag(2~3초)만큼 판정도 늦는다.
        "nav_display_origin": None,
        # 게이팅(도착·레그 전환·snap)용 최신 accuracy — 수용/기각 무관 매 GPS 응답 갱신.
        "nav_gating_acc": None,
        "nav_origin_coarse": False,
        "nav_origin_source": None,  # None | "gps" | "ip" | "cache" | "manual" — 대략위치 안내 문구 분기용
        "nav_lastfix_tried": False,        # 마지막 위치 캐시 복원 시도 완료 여부(1회)
        "nav_lastfix_saved_coord": None,   # 마지막으로 LS에 저장한 좌표(저장 스로틀용)
        "nav_raw_gps": None,
        "nav_compass_deg": None,   # 나침반 방위각(진북 시계방향, 정지 시 방향 표시용)
        "nav_map_bearing": None,   # 헤딩업 지도 직전 방위(헤딩 순간 결측 시 유지용)
        "nav_jump_reject_streak": 0,
        "nav_dest": None,
        "nav_route": None,
        "nav_engine": None,
        "nav_results": [],
        "nav_samples": [],
        "nav_running": False,
        "nav_prev_coord": None,
        "nav_prev_ts_ms": None,
        "nav_config": EngineConfig(),
        "nav_last_alerted_state": "on_route",
        "nav_last_weak_toast_ts_ms": None,
        "nav_alert_enabled": True,
        "nav_tts_enabled": True,
        "nav_turn_announced_id": None,   # 회전 예고 음성을 낸 회전점 id(회전점당 1회)
        "nav_origin_address": None,
        "nav_origin_address_coord": None,
        "nav_dest_display": None,
        "nav_snap_suppress_since_ms": None,   # ON_ROUTE_LIKELY 억제 시작 시각(시간상한용)
        "nav_journey_start_ts_ms": None,      # 다구간 여정 전체 시작(레그 _reset 에 안 지워짐)
        "nav_journey_reroute_total": 0,       # 다구간 여정 누적 재탐색 횟수
        "nav_fix_received_ms": None,          # 마지막 실측 fix 수신 시각(서버 시계, 신선도 표시용)
        "nav_reroute_enabled": True,
        "nav_last_reroute_ts_ms": None,
        "nav_reroute_count": 0,
        "nav_search_history": [],
        "nav_pending_hist": None,
        "nav_booking_history": [],
        "nav_favorites": [],
        "nav_route_bookings": [],
        "nav_active_booking_id": None,
        "nav_last_booking_check_ms": None,
        "nav_dest_input": "",
        "nav_route_engine": None,
        "nav_route_info": None,
        "nav_arrival_summary": None,
        "nav_start_ts_ms": None,
        "nav_recent_fixes": [],
        "nav_journey": None,
        "nav_active_leg_index": 0,
        "nav_transit_enabled": True,
    }.items():
        if k not in st.session_state:
            st.session_state[k] = v


def _reset() -> None:
    for k in ("nav_engine", "nav_results", "nav_samples",
              "nav_running", "nav_prev_coord", "nav_prev_ts_ms"):
        st.session_state[k] = (
            [] if "results" in k or "samples" in k
            else False if k == "nav_running"
            else None
        )
    st.session_state["nav_last_alerted_state"] = "on_route"
    st.session_state["nav_last_weak_toast_ts_ms"] = None
    st.session_state["nav_last_reroute_ts_ms"] = None
    st.session_state["nav_reroute_count"] = 0
    st.session_state["nav_arrival_summary"] = None
    st.session_state["nav_start_ts_ms"] = None
    st.session_state["nav_recent_fixes"] = []
    # 표시 스무딩 체인·게이팅 accuracy도 새 안내 기준으로 재시드(다음 fix에서 재구성).
    st.session_state["nav_display_origin"] = None
    st.session_state["nav_gating_acc"] = None


def _activate_route(
    origin: Coordinate,
    dest: Coordinate,
    display_name: str,
    route: RouteModel,
    *,
    start_now: bool,
) -> None:
    st.session_state.update({
        "nav_dest": dest,
        "nav_dest_display": display_name,
        "nav_route": route,
        "nav_engine": RouteDeviationEngine(route, st.session_state["nav_config"]),
    })
    _reset()
    if start_now:
        st.session_state.update({
            "nav_running": True,
            "nav_engine": RouteDeviationEngine(route, st.session_state["nav_config"]),
            "nav_results": [],
            "nav_samples": [],
            "nav_prev_coord": None,
            "nav_prev_ts_ms": None,
        })


# ── 공통 헬퍼 ─────────────────────────────────────────────────────────────────

def _fetch_route(origin: Coordinate, dest: Coordinate) -> RouteModel:
    """경로 탐색 + 엔진 라벨/부가정보(총거리·ETA·안내문)를 현재 세션에 기록."""
    route, engine_label, route_info = fetch_walking_route_with_engine(origin, dest)
    st.session_state["nav_route_engine"] = engine_label
    st.session_state["nav_route_info"] = route_info
    return route


# ── 재탐색 결과 전달 채널 (세션 밖 전역) ─────────────────────────────────────
# 왜 세션 밖인가: 안내 중 1초 autorefresh 가 계속 rerun 을 만드는데, Streamlit(fastReruns)은
# 새 rerun 이 오면 실행 중이던 스크립트를 중단시킨다. 경로 API(1.5~3초)를 기다리던 실행은
# '고아'가 되고, 그 뒤의 어떤 st.session_state 접근도 StopException 으로 죽어 새 경로
# 커밋(경로·엔진·쿨다운·토스트·음성)이 통째로 유실됐다(실기기 '재탐색 후 경로 수정 안 됨'.
# E2E 재현: fetch 22회 성공에도 경로 불변·쿨다운 미기록으로 매 표본 재호출 폭주, 실패
# 경고 st.warning 도 같은 가드에 죽어 무증상). 그래서 fetch 는 백그라운드 스레드에서 하고
# (스레드 안에서는 st.* 접근 금지), 결과를 이 전역 dict 에 세션 id 로 보관했다가
# '다음 rerun 시작부'(_commit_pending_reroute)에서 커밋한다 — 새 rerun 의 세션 쓰기는 안전.
# ⚠ 보관소는 이 파일(페이지) 전역이면 안 된다: 페이지 스크립트는 rerun 마다 재실행돼
# 전역이 매번 빈 dict 로 초기화된다(E2E 실증). sys.modules 에 캐시되는 gps_filter 모듈의
# 전역을 참조해 rerun 을 건너 살아남게 한다.
_PENDING_REROUTE = gps_filter.PENDING_REROUTE
_PENDING_REROUTE_LOCK = gps_filter.PENDING_REROUTE_LOCK
_REROUTE_IN_FLIGHT = "__in_flight__"


def _session_id() -> str:
    """세션 식별자(컨텍스트 없으면 단일 폴백 키 — bare/AppTest 환경)."""
    if get_script_run_ctx is not None:
        ctx = get_script_run_ctx()
        if ctx is not None:
            return ctx.session_id
    return "_no_ctx"


def _start_reroute_fetch(sid: str, origin: Coordinate, dest: Coordinate) -> None:
    """재탐색 fetch 를 백그라운드로 시작(이미 진행/대기 중이면 무시).

    워커 스레드는 st.* 를 절대 만지지 않는다 — 순수 네트워크 호출만 하고 결과를
    _PENDING_REROUTE 에 남긴다(커밋은 다음 rerun 의 _commit_pending_reroute 몫).
    """
    with _PENDING_REROUTE_LOCK:
        if sid in _PENDING_REROUTE:
            return
        _PENDING_REROUTE[sid] = {"state": _REROUTE_IN_FLIGHT}

    def _work() -> None:
        try:
            route, engine_label, route_info = fetch_walking_route_with_engine(origin, dest)
            payload = {"state": "ok", "route": route, "engine_label": engine_label,
                       "route_info": route_info, "dest": dest}
        except Exception as e:  # noqa: BLE001 — 실패도 커밋 채널로 넘겨 화면에 표시
            payload = {"state": "error", "error": str(e), "dest": dest}
        with _PENDING_REROUTE_LOCK:
            _PENDING_REROUTE[sid] = payload

    threading.Thread(target=_work, daemon=True, name="nav-reroute-fetch").start()


def _commit_pending_reroute() -> None:
    """백그라운드 재탐색 결과를 커밋한다 — 매 rerun 시작부에서 호출(사유: _PENDING_REROUTE 주석)."""
    sid = _session_id()
    with _PENDING_REROUTE_LOCK:
        pending = _PENDING_REROUTE.get(sid)
        if pending is None or pending.get("state") == _REROUTE_IN_FLIGHT:
            return
        del _PENDING_REROUTE[sid]
    if not st.session_state.get("nav_running"):
        return  # 기다리는 사이 중지/초기화 — 결과 폐기
    if st.session_state.get("nav_dest") != pending.get("dest"):
        return  # 목적지가 바뀜 — 옛 목적지의 경로 폐기
    if pending["state"] == "error":
        st.warning(f"자동 재탐색 실패: {pending['error']}")
        return
    new_route = pending["route"]
    st.session_state["nav_route_engine"] = pending["engine_label"]
    st.session_state["nav_route_info"] = pending["route_info"]
    new_count = st.session_state["nav_reroute_count"] + 1
    st.session_state.update({
        "nav_route":               new_route,
        "nav_engine":              RouteDeviationEngine(new_route, st.session_state["nav_config"]),
        "nav_results":             [],
        "nav_samples":             [],
        "nav_prev_coord":          None,
        "nav_last_reroute_ts_ms":  int(time.time() * 1000),
        "nav_reroute_count":       new_count,
        "nav_last_alerted_state":  "on_route",
        "nav_last_weak_toast_ts_ms": None,
        # 새 경로의 회전점 id 가 옛 id 와 겹쳐도 예고가 막히지 않게 리셋
        "nav_turn_announced_id":   None,
    })
    if st.session_state.get("nav_journey") is not None:
        # 여정 누적 집계 — nav_reroute_count 는 레그 전환 시 리셋되므로 별도.
        st.session_state["nav_journey_reroute_total"] = \
            (st.session_state.get("nav_journey_reroute_total") or 0) + 1
    st.toast(f"🔄 길을 다시 찾았어요 (재탐색 {new_count}회) — 새 경로로 안내합니다")
    # 이탈 음성 뒤 재탐색 성공이 화면 토스트뿐이면 폰을 안 보는 보행자는 새 경로를
    # 찾았는지 알 수 없다 → 성공도 음성으로. 회전 방향은 id 리셋 덕에 이어서 예고된다.
    if st.session_state["nav_tts_enabled"]:
        components.html(
            "<script>(function(){"
            + build_tts_script("경로를 다시 찾았습니다. 새 경로로 안내합니다.")
            + "})();</script>",
            height=0,
        )


def _clear_journey_state() -> None:
    st.session_state["nav_journey"] = None
    st.session_state["nav_active_leg_index"] = 0


def _activate_leg(journey: transit_builder.Journey, active_index: int, *, start_now: bool) -> None:
    """Activate one journey leg. Only tracked walk legs bind the deviation engine."""
    safe_index = max(0, min(active_index, len(journey.legs) - 1))
    leg = journey.legs[safe_index]
    st.session_state["nav_journey"] = journey
    st.session_state["nav_active_leg_index"] = safe_index
    st.session_state["nav_route_engine"] = leg.walk_engine_label or journey.source
    st.session_state["nav_route_info"] = leg.route_info

    if leg.mode == "walk" and leg.tracked and leg.route is not None:
        _activate_route(leg.start, leg.end, leg.end_label, leg.route, start_now=start_now)
        return

    st.session_state.update({
        "nav_dest": leg.end,
        "nav_dest_display": leg.end_label,
        "nav_route": None,
        "nav_engine": None,
    })
    _reset()


def _activate_journey(journey: transit_builder.Journey, *, start_now: bool) -> None:
    st.session_state["nav_journey"] = journey
    st.session_state["nav_active_leg_index"] = 0
    # 여정 전체 소요시간·누적 재탐색 집계 초기화(레그 전환 _reset 에는 안 지워짐).
    st.session_state["nav_journey_start_ts_ms"] = None
    st.session_state["nav_journey_reroute_total"] = 0
    _activate_leg(journey, 0, start_now=start_now)


def _meters_text(value: int | None) -> str:
    if value is None:
        return ""
    return f"{value / 1000:.1f}km" if value >= 1000 else f"{value}m"


def _minutes_text(seconds: int | None) -> str:
    if seconds is None:
        return ""
    return f"약 {max(1, round(seconds / 60))}분"


def _render_journey(journey: transit_builder.Journey, active_index: int) -> None:
    """Render the whole journey as compact vertical cards."""
    if not journey.legs:
        return
    active_index = max(0, min(active_index, len(journey.legs) - 1))
    st.markdown("#### 전체 여정")
    summary_bits = [_meters_text(journey.total_distance_meters), _minutes_text(journey.total_time_seconds)]
    summary = " · ".join(bit for bit in summary_bits if bit)
    st.caption(f"{journey.source}" + (f" · {summary}" if summary else ""))
    for i, leg in enumerate(journey.legs):
        active = i == active_index
        icon = {"walk": "🚶", "subway": "🚇", "bus": "🚌", "transfer": "↔️"}.get(leg.mode, "•")
        title = f"{icon} {leg.start_label} → {leg.end_label}"
        detail = ""
        if leg.transit is not None:
            parts = [leg.transit.line_name]
            if leg.transit.station_count:
                parts.append(f"{leg.transit.station_count}개 정류장")
            parts.extend([_meters_text(leg.transit.distance_meters), _minutes_text(leg.transit.time_seconds)])
            detail = " · ".join(part for part in parts if part)
        elif leg.route_info is not None:
            detail = " · ".join(
                part for part in (_meters_text(leg.route_info.total_distance_meters),
                                  _minutes_text(leg.route_info.total_time_seconds))
                if part
            )
        elif leg.mode == "walk":
            detail = "실시간 안내를 준비하지 못했습니다"
        prefix = "현재 구간 · " if active else ""
        st.markdown(f"**{prefix}{title}**")
        if detail:
            st.caption(detail)
        if active and leg.mode in ("subway", "bus"):
            st.info(f"{leg.transit.board_station if leg.transit else leg.start_label}에서 타고 "
                    f"{leg.transit.alight_station if leg.transit else leg.end_label}에서 내리세요.")
        if active and leg.mode == "walk" and not leg.tracked:
            st.warning("이 도보 구간은 실시간 안내를 만들지 못했습니다. 실제 길을 확인한 뒤 다음 구간으로 넘어가세요.")

    active_leg = journey.legs[active_index]
    if active_index < len(journey.legs) - 1:
        # 대중교통/미추적 도보 = 버튼이 유일한 진행 수단(주 버튼). 추적 도보에도 보조 버튼을
        # 제공한다 — 역 입구 등에서 GPS 정확도가 35~50m에 걸리면 자동 도착판정(is_arrival,
        # ≤20m·≤35m)이 영영 안 떠 다음 구간으로 못 넘어가는 막다른길이 생긴다(수동 탈출구).
        adv_label = ("내렸어요 · 다음 구간" if active_leg.mode in ("subway", "bus")
                     else "다음 구간으로")
        adv_primary = active_leg.mode in ("subway", "bus") or not active_leg.tracked
        if st.button(adv_label, width="stretch",
                     type="primary" if adv_primary else "secondary"):
            _activate_leg(journey, active_index + 1, start_now=True)
            st.rerun()
    elif active_leg.mode in ("subway", "bus") or (active_leg.mode == "walk" and not active_leg.tracked):
        # 마지막 구간이 대중교통/미추적 도보면 자동 도착판정 대상이 아니어서 여정이 영영
        # 안 끝난다 — 수동 종료로 마무리하고 예약 자동활성화(nav_journey 가드)도 되살린다.
        if st.button("도착했어요 · 안내 종료", width="stretch", type="primary"):
            st.session_state["nav_arrival_summary"] = "🏁 도착 완료"
            _clear_journey_state()
            st.session_state["nav_running"] = False
            st.rerun()


def _route_summary_text() -> str | None:
    """현재 경로의 '총 435m · 도보 약 6분' 표시 문자열 (정보 없으면 None)."""
    info = st.session_state.get("nav_route_info")
    if info is None or info.total_distance_meters is None:
        return None
    meters = info.total_distance_meters
    dist = f"{meters / 1000:.1f}km" if meters >= 1000 else f"{meters}m"
    if info.total_time_seconds:
        return f"총 {dist} · 도보 약 {max(1, round(info.total_time_seconds / 60))}분"
    return f"총 {dist}"


def _make_id(prefix: str) -> str:
    return f"{prefix}-{int(time.time() * 1000)}"


def _booking_coord(booking: dict, prefix: str) -> Coordinate:
    return Coordinate(
        latitude=float(booking[f"{prefix}_lat"]),
        longitude=float(booking[f"{prefix}_lon"]),
    )


def _make_booking(
    start_query: str, start_display: str, start_coord: Coordinate,
    dest_query: str, dest_display: str, dest_coord: Coordinate,
    radius_m: int,
) -> dict:
    return {
        "id": _make_id("booking"),
        "label": f"{start_query} → {dest_query}",
        "start_query": start_query, "dest_query": dest_query,
        "start_display": start_display, "dest_display": dest_display,
        "start_lat": start_coord.latitude, "start_lon": start_coord.longitude,
        "dest_lat": dest_coord.latitude, "dest_lon": dest_coord.longitude,
        "radius_m": radius_m, "enabled": True,
    }


def _remember_booking_history(start_query: str, dest_query: str, radius_m: int) -> None:
    entry = {
        "id": _make_id("bkhist"),
        "label": f"{start_query} → {dest_query}",
        "start_query": start_query,
        "dest_query": dest_query,
        "radius_m": radius_m,
    }
    history = [
        h for h in st.session_state["nav_booking_history"]
        if not (h.get("start_query") == start_query and h.get("dest_query") == dest_query)
    ]
    history.insert(0, entry)
    st.session_state["nav_booking_history"] = history[:20]
    _save_list_to_ls(_LS_KEY_BOOKINGS, st.session_state["nav_booking_history"])


def _exit_tag(query: str) -> str:
    m = re.search(r"(.+?역)\s*(\d+)\s*번?\s*출구", query)
    return f" ({m.group(2)}번출구)" if m else ""


def _exit_label(query: str, display_name: str) -> str:
    m = re.search(r"(.+?역)\s*(\d+)\s*번?\s*출구", query)
    if not m:
        return display_name
    station, num = m.group(1), m.group(2)
    if f"Exit {num}" in display_name or f"{num}번출구" in display_name:
        return display_name
    return f"{display_name}  🚇 {station} {num}번출구 기준"


# ── localStorage 영속화 ───────────────────────────────────────────────────────

_LS_KEY           = "walk_navi_history"
_LS_KEY_BOOKINGS  = "walk_navi_booking_history"
_LS_KEY_FAVORITES = "walk_navi_favorites"
_LS_KEY_LASTFIX   = "walk_navi_last_fix"

# 마지막 위치 캐시를 새로 저장할 최소 이동거리(m) — 매 폴링마다 쓰지 않도록 스로틀.
_LASTFIX_SAVE_MOVE_M = 100.0


def _save_list_to_ls(key: str, items: list) -> None:
    payload = json.dumps(items, ensure_ascii=False)
    js_payload = json.dumps(payload)
    components.html(
        f"<script>try{{localStorage.setItem('{key}',{js_payload})}}catch(e){{}}</script>",
        height=0,
    )


def _load_list_from_ls(key: str, state_key: str, limit: int) -> None:
    """localStorage → session_state 복원. streamlit-js-eval 첫 렌더는 None 반환 후 재실행."""
    if not _HAS_GEO or _js_eval is None:
        return
    if st.session_state[state_key]:
        return
    raw = _js_eval(js_expressions=f"localStorage.getItem('{key}')", key=f"ls_{state_key}")
    if raw:
        try:
            loaded = json.loads(raw)
            if isinstance(loaded, list):
                st.session_state[state_key] = loaded[:limit]
        except Exception:
            pass


def _load_history_from_ls() -> None:
    _load_list_from_ls(_LS_KEY,           "nav_search_history",  10)
    _load_list_from_ls(_LS_KEY_BOOKINGS,  "nav_booking_history", 20)
    _load_list_from_ls(_LS_KEY_FAVORITES, "nav_favorites",       50)


def _save_last_fix(lat: float, lon: float, accuracy: Optional[float], ts: Optional[int]) -> None:
    """마지막으로 확인된 위치를 localStorage에 저장한다(재방문 즉시 부트스트랩용).

    _LASTFIX_SAVE_MOVE_M 이상 이동했을 때만 호출돼(호출부 스로틀) 매 폴링마다 스크립트가
    주입되지 않는다. 실측 GPS fix(source=='gps')만 저장한다 — IP/캐시 대략위치는 저장 금지.
    """
    obj = {"lat": lat, "lon": lon, "accuracy": accuracy, "ts": ts}
    js_payload = json.dumps(json.dumps(obj))
    components.html(
        f"<script>try{{localStorage.setItem('{_LS_KEY_LASTFIX}',{js_payload})}}catch(e){{}}</script>",
        height=0,
    )


def _restore_last_fix() -> None:
    """재방문 시 저장된 마지막 위치를 즉시 '대략 위치'로 복원한다(source=='cache').

    현재 위치가 아직 없을 때만(nav_origin is None) 부트스트랩으로 세팅한다. 이후 실측
    GPS fix가 오면 점프 가드를 건너뛰고 즉시 대체된다(is_plausible_step 앞 from_bootstrap).
    캐시는 과거 위치라 부정확할 수 있으므로 coarse=True로 두고 안내 문구를 구분한다.
    streamlit-js-eval 첫 렌더는 None(대기·키없음 공통) — 값이 오면 컴포넌트 rerun으로 갱신.
    """
    if not _HAS_GEO or _js_eval is None:
        return
    if st.session_state.get("nav_lastfix_tried"):
        return
    if st.session_state.get("nav_origin") is not None:
        st.session_state["nav_lastfix_tried"] = True  # 이미 위치 있음 → 캐시 복원 불필요
        return
    raw = _js_eval(js_expressions=f"localStorage.getItem('{_LS_KEY_LASTFIX}')", key="ls_last_fix")
    if raw is None:
        return  # 대기(다음 rerun에서 값 도착) 또는 키 없음 — 어느 쪽이든 무해
    st.session_state["nav_lastfix_tried"] = True
    try:
        d = json.loads(raw)
        lat, lon = float(d["lat"]), float(d["lon"])
    except (ValueError, TypeError, KeyError):
        return
    st.session_state["nav_origin"] = Coordinate(latitude=lat, longitude=lon)
    # 부트스트랩은 판정/표시 좌표를 같은 값으로 시드(스무딩 이력이 없으므로 동일).
    st.session_state["nav_display_origin"] = st.session_state["nav_origin"]
    # accuracy는 None으로 둬 옛 정밀도를 현재값처럼 보이지 않게 한다(안내는 cache 문구가 담당).
    st.session_state["nav_raw_gps"] = {
        "coords": {"latitude": lat, "longitude": lon, "accuracy": None},
        "timestamp": d.get("ts"),
    }
    st.session_state["nav_origin_coarse"] = True
    st.session_state["nav_origin_source"] = "cache"


# ── 알림 ─────────────────────────────────────────────────────────────────────

_ALERT = {
    "drifting":    {"freqs": [660],           "durs": [320],       "vibrate": [150],              "toast": "⚠️ 이탈 시작 — 경로를 확인하세요"},
    "deviated":    {"freqs": [880, 660],       "durs": [250, 380],  "vibrate": [200, 100, 300],    "toast": "🚨 경로 이탈 — 재탐색이 필요합니다"},
    "passed_turn": {"freqs": [880, 880, 880],  "durs": [140, 140, 220], "vibrate": [100, 60, 100, 60, 200], "toast": "↩️ 회전 미이행 — 되돌아가야 합니다"},
    "arrived":     {"freqs": [523, 659, 784],  "durs": [150, 150, 280], "vibrate": [80, 50, 80, 50, 160],   "toast": "🏁 목적지 도착 — 안내를 종료합니다"},
}

# 재탐색 최소 간격(ms) — 직전 재탐색 후 이만큼 지나야 다시 재탐색한다(연속 재탐색 방지).
# 시뮬레이션상 값(2~12초)은 재탐색 횟수에 거의 영향 없음(워밍업·재중심화가 지배) — 폭주
# 방지 안전벨트 역할. 사용자 요청으로 3초. (근본 개선은 맵매칭/스냅투루트가 필요)
_REROUTE_COOLDOWN_MS = 3_000

# 표본 간 시간 공백이 이보다 크면(백그라운드 복귀 등) 엔진 판정 이력을 리셋한다 —
# 엔진 내부 drift 시작시각이 공백을 가로질러 살아남으면 복귀 첫 표본에서 이탈
# 지속시간이 수분으로 뻥튀기되어 디바운스(연속샘플·지속시간)를 우회한다.
_GPS_GAP_RESET_MS = 30_000

# 마지막 실측 fix 수신 후 이보다 오래되면 '○초 전 위치'로 신선도를 표시한다 —
# 백그라운드 전환으로 폴링이 멈추면 옛 위치가 현재처럼 보이는 문제 방지.
_FIX_STALE_MS = 15_000


def _mapbox_confirms_deviation(samples) -> Optional[bool]:
    """Mapbox Map Matching 으로 이탈 후보를 실제 도로에 스냅해 판정한다(3상).
    True=진짜 이탈(재탐색 진행) / False=경로 위(GPS 튐, 재탐색 거부) / None=판단 불가
    (토큰 없음·좌표 부족·네트워크 실패·저신뢰) → 호출측이 무료 판정 기본값으로 폴백한다.
    이탈 후보가 워밍업·쿨다운을 통과했을 때만(재탐색 직전) 호출된다 → rate limit(분당 300)·비용 절약."""
    if not mapbox_matcher.enabled():
        return None
    route_obj = st.session_state.get("nav_route")
    polyline = getattr(route_obj, "polyline", None) or ()
    planned = [(c.longitude, c.latitude) for c in polyline]
    trace = [(s.longitude, s.latitude) for s in samples]
    if len(planned) < 2 or len(trace) < mapbox_matcher.MIN_TRACE_POINTS:
        return None
    try:
        return mapbox_matcher.confirm_deviation(trace, planned)
    except Exception:  # noqa: BLE001 — 확인층 이상이 안내 루프를 죽이면 안 된다(보류로 강등)
        return None


_SNAP_WINDOW = 6  # 진행도 판정에 쓰는 최근 표본 개수


def _build_snap_window(results, samples):
    """최근 표본으로 snap_router 입력 윈도 + 순변위(윈도 첫↔끝 직선거리) + 최신 GPS 정확도를 만든다."""
    pairs = list(zip(results, samples))[-_SNAP_WINDOW:]
    window = []
    first_pos = last_pos = None
    prev = None
    for r, s in pairs:
        cur = Coordinate(latitude=s.latitude, longitude=s.longitude)
        moved = 0.0 if prev is None else distance_meters(prev, cur)
        window.append(snap_router.SnapSample(
            along_m=r.metrics.route_distance_along_meters,
            offset_m=r.metrics.distance_from_route_meters,
            ts_ms=s.timestamp_ms,
            moved_m=moved,
        ))
        if first_pos is None:
            first_pos = cur
        last_pos = cur
        prev = cur
    net_move = distance_meters(first_pos, last_pos) if (first_pos is not None and last_pos is not None) else 0.0
    acc = _gating_accuracy()  # 기각 구간에서도 최신 accuracy로 snap/재탐색 게이팅
    return window, net_move, acc


# ON_ROUTE_LIKELY(지터 vs 평행도로 구분불가) 억제의 시간 상한 — 지터 편향은 수십 초 안에
# 끝나지만 평행도로 실이탈은 지속된다. 큰 횡거리 억제가 이만큼 이어지면 한 번 재탐색을
# 허용해 '실이탈 영구 놓침'을 막는다(도로망 없이 가능한 최선의 구분).
_SNAP_SUPPRESS_MAX_MS = 90_000


def _reroute_suppressed(results, samples, now_ms: int, deviation_state: str = "deviated") -> bool:
    """재탐색을 막아야 하면 True. 무료 진행도 판정(snap_router) + 유료 도로망 확인(Mapbox)을 결합한다.

    · STATIONARY(제자리 흔들림) → 무료 확정 거부(안전, 쿨다운 안 건드림 → 다음 표본 즉시 재평가).
    · passed_turn(회전 미이행) → 거부 안 함 — 근거가 횡거리가 아니라 '회전점 통과'라서
      옆거리 기반 ON_ROUTE_LIKELY 억제에 눌리면 안 된다(정지 보호만 유지).
    · OFF_ROUTE_CONFIRMED(진짜 이탈) → 거부 안 함(재탐색 허용).
    · 애매(ON_ROUTE_LIKELY/DEFER) → Mapbox 판정 우선(True 허용/False 거부), 판단불가(None)면
      무료 기본값으로 폴백: 저정확도(>FAIR) 이탈은 알림 파이프라인과 동일하게 보류하고,
      ON_ROUTE_LIKELY 는 거부하되 큰 횡거리 억제가 _SNAP_SUPPRESS_MAX_MS 이상 지속되면 허용.
    """
    if len(results) < snap_router.MIN_WINDOW or len(samples) < snap_router.MIN_WINDOW:
        return False
    window, net_move, acc = _build_snap_window(results, samples)
    state = snap_router.classify(window, latest_accuracy_m=acc, net_move_m=net_move)
    if state == snap_router.STATIONARY:
        st.session_state["nav_snap_suppress_since_ms"] = None
        return True
    if deviation_state == "passed_turn" or state == snap_router.OFF_ROUTE_CONFIRMED:
        st.session_state["nav_snap_suppress_since_ms"] = None
        return False
    # 애매: 도로망 확인이 가능하면 Mapbox 가 판단(우회 금지). 판단불가(None)는 아래 폴백.
    verdict = _mapbox_confirms_deviation(samples)
    if verdict is True:
        st.session_state["nav_snap_suppress_since_ms"] = None
        return False
    if verdict is False:
        st.session_state["nav_last_reroute_ts_ms"] = now_ms  # 경로 위 확인 → 잠깐 쿨다운
        return True
    # 무료 폴백 ①: 저정확도(>FAIR_ACCURACY_M) 이탈 후보는 재탐색 보류 — 알림이 mute 되는
    # 나쁜 신호로 경로를 다시 만들면 튄 위치 기준의 잘못된 경로가 생긴다(churn).
    if acc is not None and acc > gps_filter.FAIR_ACCURACY_M:
        return True
    if state != snap_router.ON_ROUTE_LIKELY:
        return False
    # 무료 폴백 ②: ON_ROUTE_LIKELY 억제 — 단 큰 횡거리(이탈확정 임계 이상)로 억제가 계속되면
    # 시간 상한 후 한 번 허용(평행도로 실이탈 영구 놓침 방지).
    if window[-1].offset_m >= snap_router.OFF_ROUTE_OFFSET_M:
        since = st.session_state.get("nav_snap_suppress_since_ms")
        if since is None:
            st.session_state["nav_snap_suppress_since_ms"] = now_ms
        elif now_ms - since > _SNAP_SUPPRESS_MAX_MS:
            st.session_state["nav_snap_suppress_since_ms"] = None
            return False
    else:
        st.session_state["nav_snap_suppress_since_ms"] = None
    return True


@lru_cache(maxsize=8)
def _alert_tone_wav(state: str) -> bytes:
    """상태별 알림음 WAV(모노 22.05kHz, 감쇠 사인음 연속).

    소리는 components.html(iframe) WebAudio 가 아니라 st.audio(최상위 문서)로 재생한다 —
    모바일 브라우저는 제스처 없이 만들어진 iframe 속 AudioContext 를 suspended 로 묶어
    소리가 전혀 나지 않았다(실기기 '이탈해도 아무 반응 없음' 보고의 근본 원인).
    최상위 문서 <audio autoplay> 는 사용자가 페이지를 한 번이라도 탭했으면 재생된다.
    """
    cfg = _ALERT[state]
    rate = 22050
    frames = bytearray()
    for freq, dur in zip(cfg["freqs"], cfg["durs"]):
        n = int(rate * dur / 1000)
        for i in range(n):
            env = math.exp(-3.0 * i / max(n, 1))
            frames += struct.pack(
                "<h", int(0.6 * 32767 * env * math.sin(2 * math.pi * freq * i / rate)))
        frames += b"\x00\x00" * int(rate * 0.08)  # 음 사이 80ms 무음
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(frames))
    return buf.getvalue()


def _trigger_alert(state: str, tts: bool = True) -> None:
    cfg = _ALERT.get(state)
    if cfg is None:
        return
    st.toast(cfg["toast"])
    # 소리: 최상위 문서에서 자동재생(위 _alert_tone_wav 설명 참조). 플레이어 바가 잠깐
    # 보이는 것은 의도 — 무슨 알림이 울렸는지 시각 단서도 된다(다음 rerun에 사라짐).
    st.audio(_alert_tone_wav(state), format="audio/wav", autoplay=True)
    # 진동·음성은 iframe 스크립트 유지(진동은 Android 한정, 음성은 브라우저 TTS).
    voice_script = ""
    if tts:
        phrase = tts_phrase(state)
        if phrase:
            voice_script = build_tts_script(phrase)
    components.html(
        f"<script>(function(){{"
        f"try{{if(navigator.vibrate)navigator.vibrate({cfg['vibrate']});}}catch(e){{}}"
        f"{voice_script}"
        f"}})();</script>",
        height=0,
    )


# 다음 회전 예고 음성 '기본' 거리(m). 실제 엔진+GPS 노이즈(σ6m)+1초 폴링 시뮬(720회 보행) 실측:
# 10m = 보통 걸음(시속 5km) 평균 9초 전(천천 14s/빠름 7s, 최악 p10 3.6s — 음성 2초+반응 확보).
# 30m 는 평균 24초 전으로 너무 일렀음(실기기 피드백).
# accuracy가 나쁘면 gps_filter.announce_distance_m 이 이 기본값을 최대 20m까지 키운다.
_TURN_ANNOUNCE_M = 10.0
_TURN_LABEL = {"left": "좌회전", "right": "우회전"}  # 직진은 예고 소음이라 생략


def _maybe_announce_turn(result, tts_enabled: bool,
                         accuracy_m: Optional[float] = None) -> None:
    """다음 회전이 가까워지면 '잠시 후 좌/우회전입니다'를 음성·토스트로 예고한다.

    예고 거리는 GPS accuracy로 보정한다(announce_distance_m): 기본 10m, accuracy가
    나쁠수록 최대 20m — 오차 큰 측위는 회전점 도달이 늦게 보여 예고가 회전을 지나친
    뒤 나오는 문제 보정. 상태 경고(이탈 등)와 별개인 '어디로 가라' 안내. 같은
    회전점은 다시 예고하지 않는다(nav_turn_announced_id, 회전점당 1회 — 1초 폴링
    반복 발화 방지). 재탐색 시 id 를 리셋해 새 경로의 회전도 정상 예고된다.
    """
    turn_id = result.metrics.nearest_turn_point_id
    dist = result.metrics.distance_to_next_turn_point_meters
    announce_at = gps_filter.announce_distance_m(accuracy_m, base_m=_TURN_ANNOUNCE_M)
    if not turn_id or dist is None or dist > announce_at:
        return
    if st.session_state.get("nav_turn_announced_id") == turn_id:
        return
    direction = None
    route_now = st.session_state.get("nav_route")
    if route_now is not None:
        for tp in route_now.turn_points:
            if tp.id == turn_id:
                direction = tp.direction
                break
    label = _TURN_LABEL.get(direction or "")
    if not label:
        return  # 직진·방향 불명은 예고 생략
    st.session_state["nav_turn_announced_id"] = turn_id
    st.toast(f"{_DIR_ARROW.get(direction, '↑')} 잠시 후 {label} — {dist:.0f}m 앞")
    if tts_enabled:
        components.html(
            f"<script>(function(){{{build_tts_script(f'잠시 후 {label}입니다.')}}})();</script>",
            height=0,
        )


# ── 도착 판정 ─────────────────────────────────────────────────────────────────

def _gating_accuracy() -> Optional[float]:
    """게이팅(도착·레그 전환·snap 재탐색)용 최신 GPS accuracy.

    nav_raw_gps 의 accuracy 는 '수용된' fix 의 것이라, 신호가 나빠져 fix 가 계속
    기각되는 구간에서는 옛 '좋은' accuracy 로 게이팅돼 조기 도착·잘못된 레그 전환이
    난다. nav_gating_acc(수용/기각 무관 매 GPS 응답 갱신)를 우선하고, 아직 없으면
    기존 경로(nav_raw_gps)로 폴백한다. alert_level 쪽은 기존 raw 경로 유지(의도).
    """
    acc = st.session_state.get("nav_gating_acc")
    if acc is not None:
        return acc
    return (st.session_state.get("nav_raw_gps") or {}).get("coords", {}).get("accuracy")


def _maybe_finish_arrival(origin: Coordinate) -> bool:
    """목적지 도착 반경 진입 시 안내 종료 + 요약 기록. 도착 처리되면 True.

    이탈 판정보다 먼저 호출한다 — 목적지 근처에서 잔여 이탈 알림이 울리지 않도록.
    """
    dest: Optional[Coordinate] = st.session_state["nav_dest"]
    if dest is None:
        return False
    acc = _gating_accuracy()  # 기각 구간에서도 최신 accuracy로 조기 도착 오판 방지
    if not gps_filter.is_arrival(distance_meters(origin, dest), acc):
        return False

    parts: list[str] = []
    samples = st.session_state["nav_samples"]
    journey = st.session_state.get("nav_journey")
    # 소요시간 기준: 다구간 여정이면 여정 전체 시작(레그 _reset 에 안 지워지는 키),
    # 아니면 이번 안내 시작 — 없으면 현재 버퍼 첫 샘플로 폴백.
    start_ts = (st.session_state.get("nav_journey_start_ts_ms") if journey is not None else None) \
        or st.session_state.get("nav_start_ts_ms")
    if start_ts is None and samples:
        start_ts = samples[0].timestamp_ms
    if start_ts is not None:
        # 끝시각도 같은 시계(클라이언트 fix)로 계산 — 서버 벽시계와 섞으면 폰 시계
        # 오차만큼 소요시간이 부풀거나 항상 1분으로 표시된다.
        end_ts = samples[-1].timestamp_ms if samples else int(time.time() * 1000)
        elapsed_min = (end_ts - start_ts) / 60_000
        parts.append(f"소요 약 {max(1, round(elapsed_min))}분")
    reroutes = st.session_state.get("nav_reroute_count", 0)
    if journey is not None:
        reroutes = max(reroutes, st.session_state.get("nav_journey_reroute_total") or 0)
    if reroutes > 0:
        parts.append(f"재탐색 {reroutes}회")
    detail = " · ".join(parts)
    st.session_state["nav_arrival_summary"] = "🏁 도착 완료" + (f" — {detail}" if detail else "")
    st.session_state["nav_running"] = False
    st.session_state["nav_active_booking_id"] = None  # 같은 예약 경로 재발동 허용
    if journey is not None and transit_builder.is_last_leg(
            journey, st.session_state.get("nav_active_leg_index", 0)):
        # 여정 마지막 구간 도착 = 여정 종료. journey 를 지워야 예약 자동활성화
        # (nav_journey 가드)가 ↺초기화 없이도 다시 동작한다.
        _clear_journey_state()
    if st.session_state["nav_alert_enabled"]:
        _trigger_alert("arrived", st.session_state["nav_tts_enabled"])
    else:
        st.toast("🏁 목적지에 도착했습니다")
    return True


# ── 샘플 생성 ─────────────────────────────────────────────────────────────────

def _make_sample(
    coord: Coordinate,
    raw_gps: Optional[dict],
    prev_coord: Optional[Coordinate],
    prev_ts_ms: Optional[int],
) -> PositionSample:
    ts_ms = int((raw_gps or {}).get("timestamp", time.time() * 1000))
    gps_c = (raw_gps or {}).get("coords", {})
    gps_heading = gps_c.get("heading")
    gps_speed   = gps_c.get("speed")

    # 파생값(직전 좌표 기반) — 충분히 이동했을 때만 계산
    derived_heading: Optional[float] = None
    derived_speed: Optional[float] = None
    if prev_coord is not None and distance_meters(prev_coord, coord) > 0.5:
        derived_heading = bearing_degrees(prev_coord, coord)
        elapsed = (ts_ms - prev_ts_ms) / 1000.0 if prev_ts_ms and ts_ms > prev_ts_ms else 1.0
        derived_speed = distance_meters(prev_coord, coord) / elapsed

    # GPS heading/speed 신뢰 윈도우(저속 노이즈·극단 과속 배제) + 보행 상한 클램프
    heading, speed = gps_filter.sanitize_motion(
        gps_heading, gps_speed, derived_heading, derived_speed)

    return PositionSample(
        latitude=coord.latitude,
        longitude=coord.longitude,
        heading_degrees=heading,
        speed_meters_per_second=speed,
        timestamp_ms=ts_ms,
    )


# ── 지도 ─────────────────────────────────────────────────────────────────────

_DIR_ARROW = {"left": "↰", "right": "↱", "straight": "↑"}  # 회전 방향→화살표 (지도 마커·다음회전 배지 공용)


def _build_map(
    route: RouteModel,
    dest: Coordinate,
    results: list[EngineResult],
    samples: list[PositionSample],
    height: int = 560,
    ui_revision: str = "nav-map",
    display_coord: Optional[Coordinate] = None,
) -> go.Figure:
    fig  = go.Figure()
    lats = [c.latitude  for c in route.polyline]
    lons = [c.longitude for c in route.polyline]

    fig.add_trace(go.Scattermap(
        lat=lats, lon=lons, mode="lines",
        line=dict(width=5, color="#2980b9"), name="경로", hoverinfo="skip",
    ))

    dir_emoji = _DIR_ARROW
    for tp in route.turn_points:
        fig.add_trace(go.Scattermap(
            lat=[tp.coordinate.latitude], lon=[tp.coordinate.longitude],
            mode="markers+text",
            # 보라색: 현재 위치(초록/노랑/빨강 상태색)·경고 주황과 겹치지 않게 — 실기기에서
            # '회전'과 '현재 위치'가 같은 주황 계열로 보여 구분이 안 된다는 보고.
            marker=dict(size=14, color="#8e44ad"),
            text=[f"{dir_emoji.get(tp.direction, '↑')} 회전"],
            textposition="top right",
            name="회전",
            hovertemplate=f"회전 지점 ({tp.direction})<extra></extra>",
        ))

    fig.add_trace(go.Scattermap(
        lat=[lats[0]], lon=[lons[0]], mode="markers+text",
        marker=dict(size=14, color="#2980b9"),
        text=["출발"], textposition="top right", name="출발", showlegend=False,
    ))
    fig.add_trace(go.Scattermap(
        lat=[dest.latitude], lon=[dest.longitude], mode="markers+text",
        marker=dict(size=16, color="#e74c3c"),
        text=["목적지"], textposition="top right", name="목적지", showlegend=False,
    ))

    # 과거 샘플을 트레이스 1개로 병합(샘플당 트레이스 추가 → figure 비대·렌더 지연 방지).
    hist_r, hist_s = results[:-1], samples[:-1]
    if hist_s:
        fig.add_trace(go.Scattermap(
            lat=[s.latitude for s in hist_s],
            lon=[s.longitude for s in hist_s],
            mode="markers",
            marker=dict(size=9, color=[STATE_COLOR[r.state] for r in hist_r], opacity=0.55),
            showlegend=False,
            hovertext=[
                f"샘플 {i+1} | {STATE_LABEL[r.state]} | {r.metrics.distance_from_route_meters:.1f}m"
                for i, r in enumerate(hist_r)
            ],
            hoverinfo="text",
        ))

    if results:
        last_r, last_s = results[-1], samples[-1]
        # 현재 위치 마커는 표시용 스무딩 좌표(display_coord)에 찍는다 — 판정 샘플이
        # raw로 이원화되면서(P1-3) raw 지터가 마커 떨림으로 그대로 보이지 않게.
        # 상태색·지표(hover)는 판정 결과(last_r) 그대로 사용. display 미제공 시 샘플 폴백.
        cur_lat = display_coord.latitude if display_coord is not None else last_s.latitude
        cur_lon = display_coord.longitude if display_coord is not None else last_s.longitude
        # 진행 방향(GPS 헤딩)을 8방향 화살표로 마커 가운데에 얹는다 — 지도만 봐도
        # 내가 어느 쪽으로 걷는 중인지 보이게(실기기 요청). 헤딩이 없으면 점만.
        hdg = last_s.heading_degrees
        if hdg is None:
            # 정지 상태(GPS 헤딩 없음)엔 나침반 방위각으로 폴백 — 서 있어도 지도에서
            # 내가 '보는 방향'이 보인다(나침반 미지원/미권한이면 기존처럼 점만).
            hdg = st.session_state.get("nav_compass_deg")
        arrow = "↑↗→↘↓↙←↖"[int(((hdg % 360) + 22.5) // 45) % 8] if hdg is not None else ""
        fig.add_trace(go.Scattermap(
            lat=[cur_lat], lon=[cur_lon],
            mode="markers+text" if arrow else "markers",
            marker=dict(size=22, color=STATE_COLOR[last_r.state]),
            text=[arrow] if arrow else None,
            textfont=dict(size=15, color="white"),
            textposition="middle center",
            name="현재 위치",
            hovertemplate=(
                f"현재 위치<br>상태: <b>{STATE_LABEL[last_r.state]}</b><br>"
                f"경로까지: {last_r.metrics.distance_from_route_meters:.1f}m<br>"
                f"점수: {last_r.score:.3f}<extra></extra>"
            ),
        ))
        clat, clon = cur_lat, cur_lon
    else:
        mid = len(lats) // 2
        clat, clon = lats[mid], lons[mid]

    fig.update_layout(
        # uirevision: 1초 rerun 마다 지도를 새로 그려도 사용자가 만진 확대/이동(카메라)을
        # 유지한다(실기기 보고: 확대해도 1초 뒤 원래대로 돌아감). revision 값이 바뀔 때
        # (재탐색·새 경로)만 카메라가 새 경로 기준으로 초기화된다. 사용자가 아직 지도를
        # 만지지 않았다면 기존처럼 현재 위치를 따라간다.
        map=dict(style="open-street-map", center=dict(lat=clat, lon=clon), zoom=15,
                 uirevision=ui_revision),
        uirevision=ui_revision,
        height=height,
        margin=dict(l=0, r=0, t=0, b=0),
        # 글자색을 명시해야 한다: 다크 테마에서 plotly 기본 글자색(흰색)이 흰 범례
        # 배경 위에 얹혀 '경로/회전/현재 위치' 라벨이 안 보인다(실기기 보고).
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1,
                    bgcolor="rgba(255,255,255,0.9)", bordercolor="#ddd", borderwidth=1,
                    font=dict(color="#1a1a1a", size=12)),
    )
    return fig


# 안내 중(pydeck) 지도 기본 축척 — rerun 간 '동일 값'이어야 한다(아래 diff-merge 계약).
# 사용자가 핀치줌하면 그 값이 유지되고, 이 상수는 첫 진입 축척으로만 쓰인다.
_DECK_ZOOM = 17


def _hex_rgb(hex_color: str, alpha: Optional[int] = None) -> list[int]:
    """'#rrggbb' → [r,g,b(,a)] — deck.gl 색상 형식."""
    h = hex_color.lstrip("#")
    rgb = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return rgb + [alpha] if alpha is not None else rgb


def _heading_up_bearing(samples: list[PositionSample]) -> float:
    """헤딩업 지도 방위 — GPS 헤딩(이동 중) → 나침반(정지) → 직전 방위(순간 결측 유지) → 0.

    직전 방위(nav_map_bearing)를 세션에 남겨, 헤딩·나침반이 잠깐 끊겨도 지도가
    북쪽으로 스냅백하지 않는다. pydeck·MapLibre 지도 공용.
    """
    hdg = samples[-1].heading_degrees if samples else None
    if hdg is None:
        hdg = st.session_state.get("nav_compass_deg")
    if hdg is None:
        hdg = st.session_state.get("nav_map_bearing")
    bearing = float(hdg) % 360.0 if hdg is not None else 0.0
    st.session_state["nav_map_bearing"] = bearing
    return bearing


def _build_map_deck(
    route: RouteModel,
    dest: Coordinate,
    results: list[EngineResult],
    samples: list[PositionSample],
    display_coord: Optional[Coordinate] = None,
):
    """안내 중 지도(pydeck) — 티맵식 헤딩업(진행 방향이 항상 위) + 사용자 핀치줌 유지.

    Streamlit 1.38+ 프런트엔드는 initial_view_state 를 통째로 적용하지 않고 직전
    rerun 값과 '키 단위'로 비교해 바뀐 키만 현재 카메라에 merge 한다(useDeckGl.tsx).
    그래서:
    - latitude/longitude/bearing 은 매 틱 갱신 → 현재 위치 따라가기 + 헤딩업 회전
    - zoom 은 rerun 간 동일 상수(_DECK_ZOOM) → diff 에서 제외돼 사용자 핀치줌 유지
    plotly uirevision 은 zoom·bearing 을 하나의 '사용자 뷰' 그룹으로 묶어 이 조합이
    구조적으로 불가능했다(PR#56 무효의 근본 원인). 정본: 위키 walk-pydeck-headingup.
    주의: TextLayer 는 기본 charset 이 ASCII 라 한글 라벨엔 character_set="auto" 필수.
    """
    bearing = _heading_up_bearing(samples)

    if display_coord is not None:
        clat, clon = display_coord.latitude, display_coord.longitude
    elif samples:
        clat, clon = samples[-1].latitude, samples[-1].longitude
    else:
        mid = route.polyline[len(route.polyline) // 2]
        clat, clon = mid.latitude, mid.longitude

    layers = [
        pdk.Layer(
            "PathLayer", id="route",
            data=[{"path": [[c.longitude, c.latitude] for c in route.polyline]}],
            get_path="path", get_color=_hex_rgb("#2980b9"), width_min_pixels=5,
        ),
    ]
    labels = [
        {"p": [route.polyline[0].longitude, route.polyline[0].latitude], "t": "출발"},
        {"p": [dest.longitude, dest.latitude], "t": "목적지"},
    ]
    if route.turn_points:
        layers.append(pdk.Layer(
            "ScatterplotLayer", id="turns",
            data=[{"p": [tp.coordinate.longitude, tp.coordinate.latitude]}
                  for tp in route.turn_points],
            get_position="p", get_fill_color=_hex_rgb("#8e44ad"), radius_min_pixels=6,
        ))
        labels += [
            {"p": [tp.coordinate.longitude, tp.coordinate.latitude],
             "t": f"{_DIR_ARROW.get(tp.direction, '↑')} 회전"}
            for tp in route.turn_points
        ]
    layers.append(pdk.Layer(
        "ScatterplotLayer", id="dest",
        data=[{"p": [dest.longitude, dest.latitude]}],
        get_position="p", get_fill_color=_hex_rgb("#e74c3c"), radius_min_pixels=8,
    ))
    hist_r, hist_s = results[:-1], samples[:-1]
    if hist_s:
        layers.append(pdk.Layer(
            "ScatterplotLayer", id="history",
            data=[{"p": [s.longitude, s.latitude],
                   "c": _hex_rgb(STATE_COLOR[r.state], alpha=140)}
                  for s, r in zip(hist_s, hist_r)],
            get_position="p", get_fill_color="c", radius_min_pixels=4,
        ))
    if results:
        cur = [clon, clat] if display_coord is not None else \
            [samples[-1].longitude, samples[-1].latitude]
        layers.append(pdk.Layer(
            "ScatterplotLayer", id="me",
            data=[{"p": cur}], get_position="p",
            get_fill_color=_hex_rgb(STATE_COLOR[results[-1].state]),
            radius_min_pixels=11,
        ))
        # 헤딩업에서는 진행 방향이 항상 화면 위 — 현재 위치 화살표는 고정 '▲'.
        layers.append(pdk.Layer(
            "TextLayer", id="me-arrow",
            data=[{"p": cur, "t": "▲"}], get_position="p", get_text="t",
            get_color=[255, 255, 255], get_size=14, character_set="auto",
        ))
    layers.append(pdk.Layer(
        "TextLayer", id="labels",
        data=labels, get_position="p", get_text="t",
        get_size=13, get_color=[26, 26, 26], character_set="auto",
        get_pixel_offset=[0, -18],
    ))
    view = pdk.ViewState(latitude=clat, longitude=clon, zoom=_DECK_ZOOM,
                         bearing=bearing, pitch=0)
    # map_style="road": 토큰 없는 Carto 도로 스타일 — pydeck 기본(dark)은 보행 지도에 부적합.
    return pdk.Deck(layers=layers, initial_view_state=view, map_style="road")


def _maplibre_nav_args(
    route: RouteModel,
    dest: Coordinate,
    results: list[EngineResult],
    samples: list[PositionSample],
    display_coord: Optional[Coordinate] = None,
    height: int = 640,
) -> dict:
    """MapLibre 컴포넌트에 보낼 지도 데이터 — pydeck 지도(_build_map_deck)와 동일 요소.

    zoom(_DECK_ZOOM)은 '최초 진입' 축척으로만 쓰인다 — iframe 이 rerun 에도 살아 있어
    이후엔 사용자가 만진 줌이 지도 안에서 그대로 유지된다(컴포넌트가 easeTo 에 zoom 을
    넣지 않는 계약 — components/maplibre_nav/index.html 주석 참조). 좌표는 [lon, lat].
    """
    bearing = _heading_up_bearing(samples)
    if display_coord is not None:
        clat, clon = display_coord.latitude, display_coord.longitude
    elif samples:
        clat, clon = samples[-1].latitude, samples[-1].longitude
    else:
        mid = route.polyline[len(route.polyline) // 2]
        clat, clon = mid.latitude, mid.longitude

    pois = [
        {"p": [route.polyline[0].longitude, route.polyline[0].latitude],
         "t": "출발", "c": "#2980b9"},
        {"p": [dest.longitude, dest.latitude], "t": "목적지", "c": "#e74c3c"},
    ] + [
        {"p": [tp.coordinate.longitude, tp.coordinate.latitude],
         "t": f"{_DIR_ARROW.get(tp.direction, '↑')} 회전", "c": "#8e44ad"}
        for tp in route.turn_points
    ]
    hist_r, hist_s = results[:-1], samples[:-1]
    me = None
    if results:
        me = {"p": ([clon, clat] if display_coord is not None
                    else [samples[-1].longitude, samples[-1].latitude]),
              "c": STATE_COLOR[results[-1].state]}
    return {
        "center": [clon, clat], "bearing": bearing, "zoom": _DECK_ZOOM,
        "route": [[c.longitude, c.latitude] for c in route.polyline],
        "history": [{"p": [s.longitude, s.latitude], "c": STATE_COLOR[r.state]}
                    for s, r in zip(hist_s, hist_r)],
        "pois": pois, "me": me, "height": height,
    }


_DEFAULT_CENTER = Coordinate(latitude=37.5665, longitude=126.9780)  # 서울시청


def _build_placeholder_map(center: Optional[Coordinate]) -> go.Figure:
    """경로 생성 전에도 표시하는 기본 지도 (현재 위치 또는 서울시청 중심)."""
    c = center or _DEFAULT_CENTER
    fig = go.Figure()
    # Scattermap 트레이스가 하나도 없으면 plotly가 map 서브플롯 대신 빈 좌표축을 그린다
    fig.add_trace(go.Scattermap(lat=[], lon=[], mode="markers", showlegend=False, hoverinfo="skip"))
    if center is not None:
        fig.add_trace(go.Scattermap(
            lat=[c.latitude], lon=[c.longitude], mode="markers+text",
            marker=dict(size=16, color="#2980b9"),
            text=["현재 위치"], textposition="top right", showlegend=False,
            hovertemplate="현재 위치<extra></extra>",
        ))
    fig.update_layout(
        map=dict(style="open-street-map", center=dict(lat=c.latitude, lon=c.longitude),
                 zoom=15 if center is not None else 12, uirevision="nav-placeholder"),
        uirevision="nav-placeholder",
        height=400,
        margin=dict(l=0, r=0, t=0, b=0),
        showlegend=False,
    )
    return fig


# ── 판정 패널 ─────────────────────────────────────────────────────────────────

def _render_metrics(results: list[EngineResult]) -> None:
    if not results:
        if st.session_state.get("nav_running"):
            st.info("안내 중 · 위치 측정 대기")
        else:
            st.info("내비게이션을 시작하면 실시간 판정이 표시됩니다.")
        return
    last = results[-1]
    # ── 상태(가장 큰 시각 요소) ──
    st.markdown(
        f'<div style="background:{STATE_COLOR[last.state]};color:white;font-weight:bold;'
        f'padding:10px 18px;border-radius:10px;text-align:center;font-size:1.05rem;'
        f'margin-bottom:6px">{STATE_LABEL[last.state]}</div>',
        unsafe_allow_html=True,
    )
    st.markdown(
        f'<div style="background:{ACTION_COLOR[last.suggested_next_action]};color:white;'
        f'padding:7px 14px;border-radius:8px;text-align:center;font-size:0.88rem">'
        f'🔔 {ACTION_LABEL[last.suggested_next_action]}</div>',
        unsafe_allow_html=True,
    )

    # ── 보행자 핵심 지표 (크게 위에): 다음 회전 = '지금 할 일', 경로까지 거리 ──
    next_turn_m = last.metrics.distance_to_next_turn_point_meters
    if next_turn_m is not None:
        info = st.session_state.get("nav_route_info")
        turn_id = last.metrics.nearest_turn_point_id
        turn_desc = (
            info.turn_descriptions.get(turn_id)
            if (info is not None and turn_id) else None
        )
        # 다음 회전 방향을 큰 화살표로 — route.turn_points에서 방향 조회(없으면 직진 ↑).
        route_now = st.session_state.get("nav_route")
        arrow = "↑"
        turn_coord = None
        if route_now is not None and turn_id:
            for tp in route_now.turn_points:
                if tp.id == turn_id:
                    arrow = _DIR_ARROW.get(tp.direction, "↑")
                    turn_coord = tp.coordinate
                    break
        # 나침반이 있으면 '보는 방향 기준' 상대 방향을 함께 안내 — 서 있는 사용자는
        # 경로 진행방향 기준 좌/우를 알 수 없으므로, 지금 보는 쪽 기준으로 풀어 준다.
        facing_html = ""
        compass = st.session_state.get("nav_compass_deg")
        origin_now = st.session_state.get("nav_origin")
        if compass is not None and turn_coord is not None and origin_now is not None:
            rel = (bearing_degrees(origin_now, turn_coord) - compass) % 360.0
            facing_label = ("정면", "오른쪽 앞", "오른쪽", "오른쪽 뒤",
                            "뒤쪽", "왼쪽 뒤", "왼쪽", "왼쪽 앞")[int((rel + 22.5) // 45) % 8]
            facing_html = (f'<div style="font-size:0.85rem;margin-top:2px;opacity:0.95">'
                           f'🧭 보는 방향 기준 <b>{facing_label}</b></div>')
        st.markdown(
            f'<div style="background:#1d6fb8;color:white;border-radius:12px;'
            f'padding:14px 16px;text-align:center;margin:8px 0 4px">'
            f'<div style="font-size:0.8rem;opacity:0.9">다음 회전까지</div>'
            f'<div style="font-size:2.4rem;font-weight:800;line-height:1.15">{arrow} {next_turn_m:.0f}m</div>'
            + (f'<div style="font-size:0.95rem;margin-top:2px">{turn_desc}</div>' if turn_desc else "")
            + facing_html
            + '</div>',
            unsafe_allow_html=True,
        )
    # ── 상세 지표 (개발/디버그용 — 기본 접음) ──
    # '경로까지 거리·이탈 지속'도 여기로: 걷는 중 화면은 '다음 회전' 카드 하나로 단순하게
    # (수치 지표가 크게 나와 봐야 보행자는 해석 부담만 늘어난다 — 실기기 피드백).
    with st.expander("상세 지표", expanded=False):
        st.metric("경로까지 거리", f"{last.metrics.distance_from_route_meters:.1f} m")
        if last.metrics.drift_duration_ms > 0:
            st.metric("이탈 지속", f"{last.metrics.drift_duration_ms / 1000:.1f}s")
        st.metric("이탈 점수", f"{last.score:.3f}")
        st.metric("헤딩 차이", f"{last.metrics.heading_difference_degrees:.0f}°")
        st.metric("샘플 수",   len(results))
        if st.session_state.get("nav_reroute_count", 0) > 0:
            st.metric("재탐색 횟수", f"{st.session_state['nav_reroute_count']}회")


# ── 예약 추가 헬퍼 ────────────────────────────────────────────────────────────

def _add_single_booking(booking_start: str, booking_dest: str, booking_radius: int) -> None:
    with st.spinner("예약 출발지와 목적지 확인 중..."):
        try:
            start_result = geocode_address(booking_start)
            dest_result  = geocode_address(booking_dest)
            if start_result is None:
                st.error("예약 출발지를 찾을 수 없어요 — 다른 주소나 장소명(예: 서울역 1번출구)으로 바꿔 보세요.")
            elif dest_result is None:
                st.error("예약 목적지를 찾을 수 없어요 — 다른 주소나 장소명(예: 경복궁)으로 바꿔 보세요.")
            else:
                start_coord, start_display = start_result
                dest_coord,  dest_display_raw = dest_result
                booking = _make_booking(
                    booking_start, start_display, start_coord,
                    booking_dest, _exit_label(booking_dest, dest_display_raw), dest_coord,
                    booking_radius,
                )
                st.session_state["nav_route_bookings"].insert(0, booking)
                _remember_booking_history(booking_start, booking_dest, booking_radius)
                st.success("예약 경로를 추가했습니다.")
        except requests.exceptions.Timeout:
            st.error("예약 추가 중 네트워크 시간이 초과되었습니다.")
        except requests.exceptions.ConnectionError:
            st.error("예약 추가 중 네트워크에 연결할 수 없습니다.")
        except Exception as e:
            st.error(f"예약 추가 실패: {e}")


def _add_bulk_bookings(bulk_text: str, booking_radius: int) -> None:
    added  = 0
    failed: list[str] = []
    with st.spinner("예약 경로를 일괄 확인 중..."):
        for line in bulk_text.splitlines():
            raw = line.strip()
            if not raw:
                continue
            if "->" in raw:
                parts = raw.split("->", 1)
            elif "," in raw:
                parts = raw.split(",", 1)
            else:
                failed.append(f"{raw}: 출발지와 목적지를 '->'로 구분해 주세요.")
                continue
            start_query, dest_query = parts[0].strip(), parts[1].strip()
            if not start_query or not dest_query:
                failed.append(f"{raw}: 출발지 또는 목적지가 비어 있습니다.")
                continue
            try:
                sr = geocode_address(start_query)
                dr = geocode_address(dest_query)
                if sr is None or dr is None:
                    failed.append(f"{raw}: 주소를 찾을 수 없어요 — 역·건물명으로 바꿔 보세요.")
                    continue
                sc, sd = sr
                dc, dd_raw = dr
                st.session_state["nav_route_bookings"].insert(0, _make_booking(
                    start_query, sd, sc,
                    dest_query, _exit_label(dest_query, dd_raw), dc,
                    booking_radius,
                ))
                _remember_booking_history(start_query, dest_query, booking_radius)
                added += 1
            except Exception as e:
                failed.append(f"{raw}: {e}")
    if added:
        st.success(f"예약 경로 {added}개를 추가했습니다.")
    if failed:
        st.warning("일부 예약은 추가하지 못했습니다.")
        for msg in failed[:5]:
            st.caption(msg)


# ── 예약 자동 활성화 ──────────────────────────────────────────────────────────

def _try_activate_booking(origin: Optional[Coordinate]) -> None:
    if origin is None or st.session_state["nav_running"] or st.session_state.get("nav_journey") is not None:
        return
    now_ms = int(time.time() * 1000)
    last_check = st.session_state["nav_last_booking_check_ms"]
    if last_check is not None and now_ms - last_check < 5_000:
        return
    st.session_state["nav_last_booking_check_ms"] = now_ms

    for booking in st.session_state["nav_route_bookings"]:
        if not booking.get("enabled", True):
            continue
        start = _booking_coord(booking, "start")
        outside = distance_meters(origin, start) > float(booking.get("radius_m", 80))
        if st.session_state.get("nav_active_booking_id") == booking["id"]:
            # 이미 이 예약을 시작한 적이 있다. 출발 반경 안에 서 있는 동안엔 재발동을
            # 억제하고(도착 전 ↺ 초기화 직후 자동 재시작 루프 방지), 반경을 벗어나면
            # 재무장해 다음에 다시 출발지로 오면 정상 활성화되게 한다.
            if outside:
                st.session_state["nav_active_booking_id"] = None
            continue
        if outside:
            continue
        dest = _booking_coord(booking, "dest")
        activated = False
        with st.spinner(f"예약 경로 활성화 중: {booking['label']}"):
            try:
                route = _fetch_route(origin, dest)
                _clear_journey_state()
                _activate_route(origin, dest, booking["dest_display"], route, start_now=True)
                st.session_state["nav_active_booking_id"] = booking["id"]
                st.toast(f"예약 경로 시작: {booking['label']}")
                activated = True
            except Exception as e:
                st.warning(f"예약 경로 활성화 실패: {e}")
        if activated:
            # 이 프레임은 상단 st_autorefresh 등록을 not-running 상태로 이미 지나쳤다 —
            # rerun 해야 3초 폴링·이탈감지가 즉시 시작된다(수동 '▶ 시작' 등 형제 진입점과 동일).
            st.rerun()
        break


# ── 사이드바 섹션 ─────────────────────────────────────────────────────────────

@st.cache_data(ttl=600, show_spinner=False)
def _reverse_geocode_cached(lat: float, lon: float) -> Optional[str]:
    """좌표→주소 역지오코딩(캐시). 같은 위치 반복 호출 시 네트워크·지연 절약."""
    return reverse_geocode(Coordinate(latitude=lat, longitude=lon))


@st.cache_data(ttl=300, show_spinner=False)
def _suggest_destinations(query: str, lat3: Optional[float] = None,
                          lon3: Optional[float] = None) -> list:
    """검색어 후보 목록(캐시). 같은 검색어는 재호출 없이 즉시 반환 — API 절약·rerun 안전.

    lat3/lon3 = 현재 위치(소수 3자리≈110m 반올림 — 걷는 동안 캐시 히트 유지).
    위치를 주면 TMAP 이 후보 자체를 '가까운 순'으로 골라온다 — 전국 인기순 상위
    5개만 받아 그중에서 정렬하던 한계(근처 지점이 후보에 아예 못 듦) 제거."""
    center = (Coordinate(latitude=lat3, longitude=lon3)
              if lat3 is not None and lon3 is not None else None)
    return geocode_suggestions(query, 5, center=center)


def _origin_round3() -> tuple[Optional[float], Optional[float]]:
    """현재 위치를 소수 3자리로 반올림해 검색 캐시 키로 반환(없으면 (None, None))."""
    o = st.session_state.get("nav_origin")
    return (round(o.latitude, 3), round(o.longitude, 3)) if o is not None else (None, None)


def _dest_entry_active() -> bool:
    """사용자가 목적지를 '실시간 입력(검색)' 중인지 판정.

    목적지 입력 화면에서는 GPS 재폴링(약 1초 주기 rerun)·autorefresh 가 계속 rerun 을
    만드는데, 그 rerun 이 st_searchbox 입력 도중 끼어들면 드롭다운·포커스가 끊겨 검색어가
    사라지고 '두 번 입력'해야 하는 문제가 생긴다. 입력 중에는 주기적 rerun 을 멈춰 이를 막는다.

    - searchbox 모드: 위젯 내부 검색어(nav_dest_sb['search'])가 남아 있고 아직 후보를
      고르지 않았을 때(result is None) True — 후보를 고른 뒤엔 재선택돼도 안전하므로 False.
    - 안내 진행 중(nav_running)에는 항상 False: 주행 중 GPS 폴링을 멈추면 안 된다.
    """
    if st.session_state.get("nav_running"):
        return False
    sb = st.session_state.get("nav_dest_sb")
    if isinstance(sb, dict):
        return bool((sb.get("search") or "").strip()) and sb.get("result") is None
    return False


def _render_compass_enable() -> None:
    """iOS 나침반(방향) 권한 요청 버튼 — 나침반 값이 아직 없을 때만 노출.

    iOS 13+ 은 DeviceOrientationEvent.requestPermission() 을 '사용자 제스처 콜스택'
    안에서 불러야 해서 st.button(rerun 후 js 평가)로는 불가 — iframe 안의 실제 HTML
    버튼 onclick 으로 요청한다(components.html). Android 는 권한 없이 자동 수집되므로
    나침반 값이 들어오는 즉시 이 메뉴가 사라지고, PC 등 미지원 기기는 눌러도 안내만
    나온다. 권한은 origin 단위라 GPS 수집 iframe 의 리스너에도 함께 적용된다.
    """
    if not _HAS_GEO or st.session_state.get("nav_compass_deg") is not None:
        return
    with st.expander("🧭 방향(나침반) 켜기 — iPhone은 탭 1회 필요", expanded=False):
        st.caption("서 있어도 '보는 방향'이 지도 화살표·다음 회전 안내에 반영돼요. "
                   "Android는 자동으로 켜집니다(이 메뉴가 사라지면 정상).")
        components.html(
            '<button id="b" style="font-size:15px;padding:8px 14px;border-radius:8px;'
            'border:1px solid #bbb;background:#f7f7f7;cursor:pointer">🧭 나침반 켜기</button> '
            '<span id="s" style="font-size:13px"></span>'
            '<script>document.getElementById("b").onclick=async function(){'
            'var s=document.getElementById("s");'
            'try{if(window.DeviceOrientationEvent&&DeviceOrientationEvent.requestPermission){'
            'var r=await DeviceOrientationEvent.requestPermission();'
            's.textContent=(r==="granted")?"켜졌어요 ✓ 곧 화살표에 반영됩니다":"거부됨 — 브라우저 설정에서 허용 필요";'
            '}else{s.textContent="이 기기는 버튼 없이 자동 인식돼요";}'
            '}catch(e){s.textContent="요청 실패: "+e;}};</script>',
            height=52,
        )


def _search_places(query: str) -> list:
    """st_searchbox 콜백 — 입력 즉시 자동완성 후보를 (라벨, 값) 목록으로 반환.

    현재 위치(nav_origin)가 있으면 가까운 순으로 정렬하고 라벨에 거리를 붙여
    (label_with_distance), 동명 장소 오선택을 줄인다. 현재 위치가 없으면 기존 순서·
    라벨(format_place_label 상당)로 동작한다. 값=(Coordinate, display) 튜플.
    _suggest_destinations 가 @st.cache_data 라 같은 검색어는 즉시 반환된다.
    빈 입력·오류는 빈 리스트(searchbox가 안전하게 빈 목록을 표시).
    """
    q = (query or "").strip()
    if not q:
        return []
    try:
        origin = st.session_state.get("nav_origin")
        suggestions = sort_suggestions_by_distance(
            _suggest_destinations(q, *_origin_round3()), origin)
        return [
            (label_with_distance(disp, coord, origin), (coord, disp))
            for coord, disp in suggestions
        ]
    except Exception:
        return []


def _render_dest_inputs() -> None:
    """목적지 입력 + 후보 미리보기 (running 분기와 무관하게 위젯/키 동일).

    streamlit-searchbox 설치 시: 입력 즉시 자동완성 드롭다운(_search_places). 선택 시
    nav_dest_picked=(coord,disp)·nav_dest_input=disp 로 기존 세션키에 매핑한다.
    미설치 시: 기존 text_input + selectbox 미리보기 흐름을 100% 그대로 유지(폴백 안전).
    """
    if _HAS_SEARCHBOX:
        sel = st_searchbox(
            _search_places,
            placeholder="예) 경복궁, 강남역 10번출구",
            label="",  # 안내문은 '목적지' 제목 우측에 한 줄로 표시(중복 라벨 제거)
            key="nav_dest_sb",
        )
        if sel is not None:
            coord, disp = sel
            st.session_state["nav_dest_picked"] = (coord, disp)
            st.session_state["nav_dest_input"] = disp
        else:
            # nav_dest_input 은 의도적으로 건드리지 않는다: 즐겨찾기·타이핑 텍스트가
            # 세션에 남아 있을 때 경로 찾기의 geocode 폴백(geocode_address)이 사용해야
            # 하기 때문이다. 출발지처럼 ""로 비우면 그 폴백 경로가 깨진다.
            st.session_state["nav_dest_picked"] = None
        # (1) 즐겨찾기·히스토리가 nav_dest_input만 설정했을 때(picked=None) 사용자 인지 안내
        if st.session_state.get("nav_dest_input") and not st.session_state.get("nav_dest_picked"):
            st.caption(f"📌 선택된 목적지: {st.session_state['nav_dest_input']}")
        return

    st.text_input(
        "주소 또는 장소명",
        placeholder="예) 경복궁, 강남역 10번출구",
        key="nav_dest_input",
        label_visibility="collapsed",  # 안내문은 '목적지' 제목 우측에 표시
    )

    # 경로 찾기 전 미리보기: 입력한 장소가 검색되는지 + 후보를 즉시 보여준다.
    dest_q = (st.session_state.get("nav_dest_input") or "").strip()
    if dest_q:
        try:
            with st.spinner("장소 검색 중…"):
                suggestions = _suggest_destinations(dest_q, *_origin_round3())
        except Exception:
            suggestions = []
        origin = st.session_state.get("nav_origin")
        suggestions = sort_suggestions_by_distance(suggestions, origin)
        if len(suggestions) == 1:
            # 후보가 하나면 고를 게 없다 — selectbox 단계를 건너뛰어 탭을 줄인다.
            st.session_state["nav_dest_picked"] = suggestions[0]
            st.caption(f"✅ {label_with_distance(suggestions[0][1], suggestions[0][0], origin)}")
        elif suggestions:
            choice_idx = st.selectbox(
                f"도착지 선택 (후보 {len(suggestions)}곳)",
                range(len(suggestions)),
                format_func=lambda i: label_with_distance(
                    suggestions[i][1], suggestions[i][0], origin),
                key="nav_dest_pick",
            )
            st.session_state["nav_dest_picked"] = suggestions[choice_idx]
        else:
            st.warning(f"'{dest_q}' — 일치하는 장소를 찾지 못했습니다. 다른 이름이나 가까운 지하철역 출구로 검색해 보세요.")
            st.session_state["nav_dest_picked"] = None
    else:
        st.session_state["nav_dest_picked"] = None


def _sidebar_destination(favorites: list, running: bool = False) -> None:
    """목적지 입력(최상단) + 출발지(기본 현재 위치·접기) + 경로 찾기 전 후보 미리보기 + 즐겨찾기/히스토리.

    running=True(내비 진행 중)이면 입력 영역을 접어 지도·판정이 한 화면에 보이게 한다.
    이때 목적지 text_input은 접힌 expander 안에 그대로 마운트해 위젯·세션키를 보존하고,
    출발지/즐겨찾기 하위 expander는 설정 단계 전용이라 렌더를 생략한다(중첩 expander 금지).
    """
    # 현재 위치 힌트 (출발지 placeholder·기본값 안내에 공통 사용)
    origin_now = st.session_state.get("nav_origin")
    origin_addr = st.session_state.get("nav_origin_address")
    if origin_addr:
        cur_hint = origin_addr
    elif origin_now is not None:
        cur_hint = f"{origin_now.latitude:.5f}, {origin_now.longitude:.5f}"
    else:
        cur_hint = "현재 위치 취득 중…"

    # ── 내비 진행 중: 입력 영역을 접어 화면을 비운다(위젯은 마운트 유지) ──
    if running:
        with st.expander("📍 목적지 바꾸기", expanded=False):
            _render_dest_inputs()
        _render_action_buttons()  # 안내 중: ⏹ 중지 / ↺ 초기화
        return

    # ── 목적지 (최상단: 첫 행동을 가장 위에) ──
    # 안내문('주소 또는 장소명')은 제목 우측에 한 줄로 — 입력칸 위 라벨을 없애 세로 공간 절약.
    st.markdown(
        '<div class="walk-dest-head">'
        '<span class="walk-dest-title">목적지</span>'
        '<span class="walk-dest-hint">주소 또는 장소명</span>'
        '</div>',
        unsafe_allow_html=True,
    )
    _render_dest_inputs()

    # 핵심 동선: 목적지 입력칸 '바로 아래'에 출발 버튼(탐색+시작). 부가 설정은 그 아래로.
    _render_action_buttons()

    # ── 최근 검색 원탭 칩 — 반복 목적지를 접힌 메뉴 대신 한 번에 다시 안내(검색 마찰↓) ──
    recent = st.session_state["nav_search_history"][:3]
    if recent:
        st.caption("최근")
        cols = st.columns(len(recent))
        for i, h in enumerate(recent):
            with cols[i]:
                if st.button(f"🕐 {h['query']}{_exit_tag(h['query'])}", key=f"recent_chip_{i}",
                             width="stretch"):
                    st.session_state["nav_pending_hist"] = h
                    st.rerun()

    # ── 출발지 (기본은 현재 위치이므로 접어 둠 — 바꿀 때만 펼침) ──
    with st.expander("출발지 바꾸기 (기본: 현재 위치)", expanded=False):
        # 자동완성(st_searchbox)을 여기서는 쓰지 않는다: react-select 드롭다운이 모바일
        # expander 안에서 잘리거나 터치가 안 돼 '출발지 바꾸기 사용불가'가 된다(실기기 보고).
        # 네이티브 text_input+selectbox 는 expander 안에서도 정상 동작한다(목적지는 expander
        # 밖 최상단이라 searchbox 유지).
        st.text_input(
            "출발지 (비우면 현재 위치 사용)",
            placeholder=f"📍 {cur_hint}",
            key="nav_start_input",
        )
        start_q = (st.session_state.get("nav_start_input") or "").strip()
        if start_q:
            try:
                with st.spinner("장소 검색 중…"):
                    s_sugg = _suggest_destinations(start_q, *_origin_round3())
            except Exception:
                s_sugg = []
            s_origin = st.session_state.get("nav_origin")
            s_sugg = sort_suggestions_by_distance(s_sugg, s_origin)
            if s_sugg:
                s_choice_idx = st.selectbox(
                    f"출발지 선택 (후보 {len(s_sugg)}곳)",
                    range(len(s_sugg)),
                    format_func=lambda i: label_with_distance(
                        s_sugg[i][1], s_sugg[i][0], s_origin),
                    key="nav_start_pick",
                )
                st.session_state["nav_start_picked"] = s_sugg[s_choice_idx]
            else:
                st.warning(f"'{start_q}' — 찾지 못했습니다. 비우면 현재 위치가 출발지로 쓰입니다.")
                st.session_state["nav_start_picked"] = None
        else:
            st.session_state["nav_start_picked"] = None
            st.caption(f"📍 현재 위치를 출발지로 사용: {cur_hint}")

    # '대중교통 포함'은 별도 토글 대신 출발 버튼 2개(🚶 걷기 / 🚇 대중교통+걷기)가
    # 그 자리에서 nav_transit_enabled 를 설정한다(_render_action_buttons). 최근검색 칩·
    # 자동 재탐색은 마지막에 누른 모드를 따른다. (위젯 key 를 세션 저장키로 쓰지 않는
    # 원칙은 유지 — 버튼 핸들러가 세션에 직접 대입)
    # [향후 슬롯] 멀티 provider(검색 소스 선택·지도 언어 토글)는 여기 아래 '고급 설정'
    # 접기로 추가 예정 — 검색 전면은 단순하게 유지하고 고급 옵션만 접어 둔다.

    # 즐겨찾기 관리 (최근 검색은 위 원탭 칩으로 대체 — 중복 목록 제거).
    if favorites:
        with st.expander("⭐ 즐겨찾기", expanded=False):
            fav_opts = ["선택 안 함"] + [f"{f['name']} · {f['address']}" for f in favorites]
            sel = st.selectbox("즐겨찾기에서 선택", fav_opts, key="fav_dest_sel")
            if sel != "선택 안 함":
                addr = favorites[fav_opts.index(sel) - 1]["address"]
                if st.button("목적지에 입력", key="fav_to_dest", width="stretch"):
                    st.session_state["nav_dest_input"] = addr
                    st.rerun()


def _sidebar_favorites(favorites: list) -> None:
    """즐겨찾기 추가·삭제 관리 패널."""
    with st.expander("즐겨찾기 관리", expanded=False):
        fav_name = st.text_input("명칭", placeholder="예) 회사, 집, 학교", key="fav_name_in")
        fav_addr = st.text_input("주소", placeholder="예) 서울역 1번출구",  key="fav_addr_in")
        if st.button("즐겨찾기 추가", disabled=(not fav_name or not fav_addr), width="stretch"):
            new_fav = {
                "id":      _make_id("fav"),
                "name":    fav_name.strip(),
                "address": fav_addr.strip(),
            }
            updated = [
                f for f in favorites
                if f.get("name") != new_fav["name"] and f.get("address") != new_fav["address"]
            ]
            updated.insert(0, new_fav)
            st.session_state["nav_favorites"] = updated[:50]
            _save_list_to_ls(_LS_KEY_FAVORITES, updated[:50])
            st.success("즐겨찾기를 추가했습니다.")
            st.rerun()

        for fav in favorites[:10]:
            col_n, col_d = st.columns([3, 1])
            with col_n:
                st.caption(f"{fav['name']} · {fav['address']}")
            with col_d:
                if st.button("삭제", key=f"fav_del_{fav['id']}"):
                    st.session_state["nav_favorites"] = [f for f in favorites if f["id"] != fav["id"]]
                    _save_list_to_ls(_LS_KEY_FAVORITES, st.session_state["nav_favorites"])
                    st.rerun()


def _sidebar_bookings(favorites: list, origin: Optional[Coordinate]) -> None:
    """예약 경로 추가·관리 패널 + 자동 활성화 트리거."""
    with st.expander("🗓️ 예약 경로 (자주 가는 길 저장)", expanded=False):

        # 즐겨찾기 → 예약 입력칸 자동 채움
        if favorites:
            fav_opts = ["선택 안 함"] + [f"{f['name']} · {f['address']}" for f in favorites]
            sel = st.selectbox("즐겨찾기 주소 불러오기", fav_opts, key="bk_fav_sel")
            if sel != "선택 안 함":
                sel_addr = favorites[fav_opts.index(sel) - 1]["address"]
                col_s, col_d = st.columns(2)
                with col_s:
                    if st.button("출발지에 입력", key="fav_to_bk_start", width="stretch"):
                        st.session_state["booking_start_input"] = sel_addr
                        st.rerun()
                with col_d:
                    if st.button("목적지에 입력", key="fav_to_bk_dest", width="stretch"):
                        st.session_state["booking_dest_input"] = sel_addr
                        st.rerun()

        # 예약 히스토리 버튼 → 입력칸 자동 채움
        booking_history = st.session_state["nav_booking_history"]
        if booking_history:
            st.caption("예약 히스토리")
            for i, item in enumerate(booking_history[:5]):
                if st.button(f"🕘 {item['label']}", key=f"bkhist_{i}", width="stretch"):
                    st.session_state["booking_start_input"] = item["start_query"]
                    st.session_state["booking_dest_input"]  = item["dest_query"]
                    st.rerun()

        booking_start  = st.text_input("예약 출발지", placeholder="예) 서울역 1번출구", key="booking_start_input")
        booking_dest   = st.text_input("예약 목적지", placeholder="예) 경복궁",         key="booking_dest_input")
        booking_radius = st.slider("출발지 도착 판정 반경 (m)", 30, 300, 80, step=10)

        if st.button("예약 추가", disabled=(not booking_start or not booking_dest), width="stretch"):
            _add_single_booking(booking_start, booking_dest, booking_radius)

        bulk_text = st.text_area(
            "여러 개 한 번에 추가",
            placeholder="예)\n서울역 1번출구 -> 경복궁\n강남역 10번출구 -> 코엑스",
            key="booking_bulk_input",
            height=90,
        )
        if st.button("일괄 예약 추가", disabled=not bulk_text.strip(), width="stretch"):
            _add_bulk_bookings(bulk_text, booking_radius)

    # 활성 예약 목록
    bookings = st.session_state["nav_route_bookings"]
    if bookings:
        for booking in bookings:
            dist_text = (
                f" · 현재 {distance_meters(origin, _booking_coord(booking, 'start')):.0f}m"
                if origin is not None else ""
            )
            st.caption(f"{booking['label']} · 반경 {booking['radius_m']}m{dist_text}")
            col_a, col_b = st.columns(2)
            with col_a:
                enabled = st.toggle("활성", value=booking.get("enabled", True), key=f"bk_on_{booking['id']}")
                booking["enabled"] = enabled
            with col_b:
                if st.button("삭제", key=f"bk_del_{booking['id']}"):
                    st.session_state["nav_route_bookings"] = [b for b in bookings if b["id"] != booking["id"]]
                    if st.session_state.get("nav_active_booking_id") == booking["id"]:
                        st.session_state["nav_active_booking_id"] = None
                    st.rerun()

    _try_activate_booking(origin)


# ── 메인 ─────────────────────────────────────────────────────────────────────

def _find_and_activate(dest_text: str, origin: Optional[Coordinate], *, start_now: bool) -> bool:
    """목적지를 찾아 경로/여정을 활성화한다. 성공하면 True.

    start_now=True 면 안내까지 바로 시작한다 — 예약 자동활성화(_try_activate_booking)가
    이미 쓰는 검증된 경로(_activate_route/_activate_journey)를 그대로 재사용하므로
    도착판정·엔진 활성 로직에 새 분기를 만들지 않는다.
    검색 실패는 여기서 안내하고 False를 반환(네트워크 예외는 호출부에서 처리).
    """
    if origin is None:  # 버튼이 disabled 되지만 방어적으로(정적 타입도 일치)
        st.error("현재 위치를 아직 찾지 못했어요. 잠시 후 다시 시도해 주세요.")
        return False
    # 미리보기에서 고른 후보가 있으면 그 좌표로 바로 경로 생성(재지오코딩 생략).
    picked = st.session_state.get("nav_dest_picked")
    result = picked if picked is not None else geocode_address(dest_text)
    if result is None:
        st.error("목적지를 찾을 수 없습니다. 다른 주소나 장소명으로 다시 시도해 주세요.")
        return False
    dest, display_name = result
    # 출발지: 입력+선택 후보가 있으면 그 좌표, 없으면 현재 위치(GPS).
    start_picked = st.session_state.get("nav_start_picked")
    start_input = (st.session_state.get("nav_start_input") or "").strip()
    start_coord = start_picked[0] if (start_input and start_picked) else origin
    confirmed = _exit_label(dest_text, display_name)
    if st.session_state.get("nav_transit_enabled", True):
        journey = transit_builder.fetch_transit_journey(start_coord, dest)
        _activate_journey(journey, start_now=start_now)
        # _activate_leg 은 활성 leg 의 end_label(도보 강등 시 '도착', 대중교통이면 첫 역)을
        # nav_dest_display 로 넣는다 → 배너가 '📌 도착'이 되어 실제 목적지명이 사라진다.
        st.session_state["nav_dest_display"] = confirmed
        if journey.source.startswith("도보 강등"):
            # 여기서 바로 st.info를 그리면 start_now=True 경로의 st.rerun()에 출력이
            # 폐기된다. 사유(source)를 플래그로 남겨 rerun 이후 한 번만 표시한다.
            st.session_state["nav_downgrade_notice"] = journey.source
    else:
        route = _fetch_route(start_coord, dest)
        _clear_journey_state()
        _activate_route(start_coord, dest, confirmed, route, start_now=start_now)
    hist = [h for h in st.session_state["nav_search_history"] if h["query"] != dest_text]
    hist.insert(0, {"query": dest_text, "display_name": confirmed,
                    "lat": dest.latitude, "lon": dest.longitude})
    st.session_state["nav_search_history"] = hist[:10]
    _save_list_to_ls(_LS_KEY, hist[:10])
    return True


def _plan_summary_text() -> str:
    """활성 계획 요약 — 여정이면 전체 합계, 아니면 도보 경로 요약(없으면 빈 문자열)."""
    journey_now = st.session_state.get("nav_journey")
    if journey_now is not None:
        bits = [_meters_text(journey_now.total_distance_meters),
                _minutes_text(journey_now.total_time_seconds)]
        return " · ".join(bit for bit in bits if bit)
    return _route_summary_text() or ""


def _run_activation(dest_text: str, origin: Optional[Coordinate], *, start_now: bool) -> bool:
    """스피너 + 네트워크 예외 처리를 감싼 `_find_and_activate` 실행. 성공하면 True.

    `st.rerun()`은 여기서 호출하지 않는다 — RerunException 이 아래 except 에
    삼켜지지 않도록 호출부가 try 밖에서 처리한다.
    """
    with st.spinner(f"'{dest_text}' 경로 찾는 중…"):
        try:
            return _find_and_activate(dest_text, origin, start_now=start_now)
        except requests.exceptions.Timeout:
            st.error("네트워크 시간 초과. 인터넷 연결을 확인하고 다시 시도해 주세요.")
        except requests.exceptions.ConnectionError:
            st.error("네트워크에 연결할 수 없습니다.")
        except Exception as e:
            st.error(f"경로 찾기 실패: {e}")
    return False


def _render_action_buttons() -> None:
    """경로 탐색·시작·초기화 버튼 (도착지 입력 직후 표시).

    origin/dest_text/nav_config 는 세션에서 읽어 위젯 위치와 독립적으로 동작한다.
    슬라이더(고급설정)가 이 버튼보다 아래에 있어도, 버튼 클릭은 별도 rerun이라
    직전 확정된 nav_config 가 쓰여 stale 이 발생하지 않는다(슬라이더는 collapsed
    expander 안이라도 매 rerun 실행되어 nav_config 가 매번 재기록됨).
    """
    origin: Optional[Coordinate] = st.session_state["nav_origin"]
    dest_text: str = st.session_state.get("nav_dest_input", "")

    # 모바일 친화: 가로 3열(폰에서 좁음) 대신 세로 스택 + 전폭 버튼으로 터치 타깃 확대.
    # 경로 찾기(주)는 가장 크게, 시작/초기화는 그 아래.
    running = bool(st.session_state["nav_running"])
    has_plan = (st.session_state["nav_route"] is not None
                or st.session_state.get("nav_journey") is not None)
    ready = bool(dest_text) and origin is not None
    started = False  # st.rerun()은 try 밖에서 호출 — 예외 처리에 삼켜지지 않게.

    # 안내 중에는 탐색 버튼을 숨겨 화면을 비우고 오탭(주행 중 재검색)을 막는다.
    if not running:
        if origin is None:
            st.caption("📍 현재 위치 확인 중 — 잡히면 출발 버튼이 활성화됩니다")
        elif not dest_text:
            st.caption("먼저 목적지를 입력하세요")

        # 단계 병합: '경로 찾기 → 시작' 두 번 누르던 것을 한 번으로.
        # 대중교통 포함 여부는 별도 토글 대신 출발 버튼 2개로 그 자리에서 고른다
        # (🚶 걷기 = 도보 전용 / 🚇 대중교통+걷기 = 지하철·버스 포함). 이미 계획이
        # 있으면 '▶ 시작'(캐시)이 주 동작이므로 두 버튼은 강조를 낮춘다(다시 찾기).
        walk_col, transit_col = st.columns(2)
        with walk_col:
            if st.button("🚶 걷기", disabled=not ready, width="stretch",
                         type="primary" if not has_plan else "secondary"):
                st.session_state["nav_transit_enabled"] = False
                started = _run_activation(dest_text, origin, start_now=True)
        with transit_col:
            if st.button("🚇 대중교통+걷기", disabled=not ready, width="stretch",
                         type="primary" if not has_plan else "secondary"):
                st.session_state["nav_transit_enabled"] = True
                started = _run_activation(dest_text, origin, start_now=True)

        # 출발 전에 경로만 확인하고 싶을 때 (계획이 아직 없을 때만 노출 — 있으면 ▶ 시작 사용).
        if (not has_plan) and st.button("🔍 경로만 보기", disabled=not ready,
                                        width="stretch"):
            if _run_activation(dest_text, origin, start_now=False):
                summary = _plan_summary_text()
                suffix = f" — {summary}" if summary else ""
                st.success(f"경로를 찾았어요{suffix}. ▶ 시작을 누르면 안내가 시작됩니다")

    if started:
        # 첫 구간이 도보면 안내가 바로 시작되고, 대중교통이면 여정 카드로 진행한다.
        st.toast("🚶 안내를 시작합니다" if st.session_state["nav_running"]
                 else "여정을 준비했어요 — 구간 카드에서 진행하세요")
        st.rerun()

    # 도보 강등 안내는 rerun 이후에 한 번만 표시(위 st.rerun()에 출력이 폐기되지 않게).
    # 사유를 구분해 안내한다 — 키가 있는데 실패한 경우 '키 없음'이라고 하면 오해를 준다.
    downgrade = st.session_state.pop("nav_downgrade_notice", "")
    if downgrade:
        if "키 없음" in downgrade:
            st.info("대중교통 API 키가 없어 도보 안내로 전환했습니다.")
        else:
            st.info("대중교통 경로를 가져오지 못해 도보 안내로 전환했습니다.")

    if st.session_state.get("nav_dest_display"):
        st.info(f"📌 {st.session_state['nav_dest_display']}")
        journey_now = st.session_state.get("nav_journey")
        if journey_now is not None:
            # 대중교통 여정: '🚶 총 375m'는 정류장까지 첫 도보 구간이라 전체로 오해된다.
            # 전체 여정 합계를 보여주고, 구간별 상세는 아래 여정 카드로 안내한다.
            bits = [_meters_text(journey_now.total_distance_meters),
                    _minutes_text(journey_now.total_time_seconds)]
            jsummary = " · ".join(b for b in bits if b)
            if jsummary:
                st.caption(f"🧭 전체 여정 {jsummary} · 구간별 안내는 아래 카드")
        else:
            summary = _route_summary_text()
            if summary:
                st.caption(f"🚶 {summary}")

    # 시작/중지 (경로가 있을 때만) — 전폭으로 한 손 탭 쉽게. 보행 중 '중지'는 크게 강조.
    route: Optional[RouteModel] = st.session_state["nav_route"]
    if route is not None:
        if st.session_state["nav_running"]:
            if st.button("⏹ 중지", width="stretch", type="primary"):
                st.session_state["nav_running"] = False
                st.rerun()
        else:
            if st.button("▶ 시작", disabled=(origin is None), width="stretch", type="primary"):
                st.session_state.update({
                    "nav_running":  True,
                    "nav_engine":   RouteDeviationEngine(route, st.session_state["nav_config"]),
                    "nav_results":  [],
                    "nav_samples":  [],
                    "nav_arrival_summary": None,
                    "nav_start_ts_ms": None,
                })
                st.toast("🚶 안내를 시작합니다")
                st.rerun()

    # 초기화는 보조 동작 — 시작/중지 아래 전폭으로 분리(오탭 방지).
    if st.button("↺ 초기화", width="stretch"):
        for k in ("nav_route", "nav_dest", "nav_dest_display", "nav_engine", "nav_results",
                  "nav_samples", "nav_prev_coord", "nav_prev_ts_ms", "nav_route_info"):
            st.session_state[k] = [] if "results" in k or "samples" in k else None
        _clear_journey_state()
        st.session_state["nav_running"] = False
        st.session_state["nav_arrival_summary"] = None
        # nav_active_booking_id 는 여기서 지우지 않는다 — 출발 반경 안에 서 있는 채로
        # 지우면 _try_activate_booking 이 5초 뒤 예약을 다시 자동 시작해 초기화가
        # 무력화된다. 대신 그 함수가 '출발 반경을 벗어나면' 재무장한다.
        st.rerun()

    # 경로 엔진명(기술 정보)은 보조 정보 — 작은 캡션으로 맨 아래.
    st.caption(f"경로 엔진: {st.session_state.get('nav_route_engine') or route_engine_label()}")


def main() -> None:
    st.set_page_config(page_title="도보 내비게이션", page_icon="🚶", layout="wide",
                       initial_sidebar_state="collapsed")
    if _MISSING_DEPENDENCIES:
        render_dependency_error()
        st.stop()

    _init()
    _load_history_from_ls()
    _restore_last_fix()  # 재방문 시 마지막 위치를 즉시 대략위치로 부트스트랩(실측/IP가 곧 대체)

    _booking_armed = any(b.get("enabled", True)
                         for b in st.session_state.get("nav_route_bookings") or [])
    # 첫 fix 미취득·대략위치(IP/캐시) 상태 — 유휴 버킷이 5초로 늘어나면 '값 도착→rerun'
    # 우연 루프만으로는 재측정이 멎을 수 있어, 완만한 5초 rerun 으로 정밀 fix 승격을 보장한다.
    _needs_idle_fix = (st.session_state["nav_origin"] is None
                       or st.session_state.get("nav_origin_coarse", False))
    # 목적지 입력 중에는 주기적 rerun 을 멈춘다 — 입력 도중 rerun 이 searchbox 를 끊어
    # 검색어가 리셋되고 '두 번 입력'하게 되는 문제 방지(_dest_entry_active). 안내 중은 제외.
    if _HAS_REFRESH and (st.session_state["nav_running"]
                         or ((_booking_armed or _needs_idle_fix)
                             and not _dest_entry_active())):
        # 예약이 있으면 유휴 중에도 완만히(10초) rerun 을 유지한다 — rerun 이 없으면 GPS
        # 재폴링→출발반경 진입 감지→예약 자동활성화가 영영 못 깨어난다(정지 화면).
        # 안내 중 1초 폴링(사용자 지정): 1초마다 재서 연속 3회 감지 ≈ 3초 내 이탈 확정.
        _iv = (1000 if st.session_state["nav_running"]
               else 5_000 if _needs_idle_fix else 10_000)
        st_autorefresh(interval=_iv, key="nav_refresh")

    # 백그라운드 재탐색 결과가 있으면 이 rerun 시작부에서 커밋 — 이후의 엔진 판정·지도가
    # 같은 run 안에서 곧바로 새 경로를 쓴다(사유: _PENDING_REROUTE 주석).
    _commit_pending_reroute()

    # 검색 히스토리 버튼 클릭 처리 — 저장된 좌표로 바로 경로 탐색
    pending_hist = st.session_state.get("nav_pending_hist")
    if pending_hist is not None:
        st.session_state["nav_pending_hist"] = None
        hist_origin: Optional[Coordinate] = st.session_state["nav_origin"]
        if hist_origin is not None:
            with st.spinner(f"'{pending_hist['query']}' 경로 찾는 중..."):
                try:
                    hist_dest = Coordinate(latitude=pending_hist["lat"], longitude=pending_hist["lon"])
                    hist_label = pending_hist["display_name"]
                    # '바로 출발'과 동일하게 '대중교통 포함' 설정을 존중한다.
                    # (예전엔 항상 도보 전용이라 두 진입점의 동작이 갈렸다.)
                    if st.session_state.get("nav_transit_enabled", True):
                        journey = transit_builder.fetch_transit_journey(hist_origin, hist_dest)
                        _activate_journey(journey, start_now=False)
                        st.session_state["nav_dest_display"] = hist_label
                        if journey.source.startswith("도보 강등"):
                            st.session_state["nav_downgrade_notice"] = journey.source
                    else:
                        new_route = _fetch_route(hist_origin, hist_dest)
                        _clear_journey_state()
                        _activate_route(hist_origin, hist_dest, hist_label, new_route, start_now=False)
                    st.success(f"'{pending_hist['query']}' 경로를 찾았어요")
                except Exception as e:
                    st.error(f"경로 찾기 실패: {e}")

    st.markdown("## 🚶 도보 내비게이션")
    st.caption("가고 싶은 곳을 입력하면 걷는 길을 안내하고, 길을 벗어나면 바로 알려줍니다.")

    # 모바일: 사이드바·햄버거 제거 → 컨트롤을 본문에 표시.
    # 시각 토큰(색·버튼·카드·타이포)으로 "앱 느낌"을 주되, 로직/DOM 구조는 건드리지 않음.
    st.markdown(
        """
        <style>
        /* ── 디자인 토큰 (라이트 기본, 다크 자동 대응) ───────────────────────── */
        :root {
          --walk-brand: #1d6fb8;         /* 기본 브랜드(파랑) — 경로·강조 */
          --walk-brand-strong: #14568f;
          --walk-go: #12a150;            /* 출발·긍정 */
          --walk-warn: #d9822b;          /* 주의 */
          --walk-danger: #d64545;        /* 이탈·오류 */
          --walk-surface: #f6f8fa;       /* 카드 배경 */
          --walk-border: #e3e7ec;
          --walk-muted: #4a4a4a;
          --walk-radius: 14px;
          --walk-shadow: 0 1px 3px rgba(0,0,0,.09), 0 1px 2px rgba(0,0,0,.05);
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --walk-surface: #1a1d24; --walk-border: #2a2f3a; --walk-muted: #b3b8c0;
            --walk-shadow: 0 1px 3px rgba(0,0,0,.5);
          }
        }
        /* 사이드바·햄버거(펼침 버튼) 완전 제거 — 네이밍 변형 모두 커버 */
        [data-testid="stSidebar"],
        section[data-testid="stSidebar"],
        [data-testid="stSidebarCollapsedControl"],
        [data-testid="collapsedControl"],
        [data-testid="stSidebarCollapseButton"],
        button[kind="header"],
        button[kind="headerNoPadding"] { display: none !important; }
        /* 상단 헤더 공간 회수(모바일 한 화면 확보) */
        [data-testid="stHeader"], header[data-testid="stHeader"] { height: 0 !important; min-height: 0 !important; }
        .block-container { padding: 0.5rem 0.7rem 3rem !important; max-width: 100% !important; }

        /* ── 타이포: 제목 간결·본문 가독 ─────────────────────────────────────── */
        .block-container h2 { font-weight: 800 !important; letter-spacing: -0.01em; margin: 0.1rem 0 0.1rem !important; }
        .block-container h3 { font-weight: 700 !important; }

        /* 목적지 제목 + 우측 안내문('주소 또는 장소명') 한 줄 배치 (입력칸 위 라벨 제거) */
        .walk-dest-head { display: flex; align-items: baseline; gap: 0.6rem;
                          flex-wrap: wrap; margin: 0.25rem 0 0.35rem; }
        .walk-dest-title { font-size: 1.45rem; font-weight: 800; letter-spacing: -0.01em; }
        .walk-dest-hint { font-size: 1.05rem; font-weight: 500; color: var(--walk-muted); }

        /* ── 버튼: 크고 둥근 터치 타깃 ───────────────────────────────────────── */
        .stButton > button {
          min-height: 46px !important; border-radius: var(--walk-radius) !important;
          font-weight: 700 !important; font-size: 1rem !important; transition: filter .12s ease;
        }
        .stButton > button:active { filter: brightness(0.94); }
        /* 주요 버튼(경로찾기·시작) — 브랜드색 강조 (kind/data-testid 변형 모두 커버) */
        .stButton > button[kind="primary"],
        [data-testid="stBaseButton-primary"] {
          background: var(--walk-brand) !important; border-color: var(--walk-brand) !important;
          color: #fff !important; box-shadow: var(--walk-shadow) !important;
        }
        .stButton > button[kind="primary"]:hover,
        [data-testid="stBaseButton-primary"]:hover { background: var(--walk-brand-strong) !important; }

        /* ── 카드감: expander·알림을 부드러운 카드로 ─────────────────────────── */
        [data-testid="stExpander"] {
          border: 1px solid var(--walk-border) !important; border-radius: var(--walk-radius) !important;
          box-shadow: var(--walk-shadow); overflow: hidden;
        }
        [data-testid="stExpander"] summary { font-weight: 600 !important; }
        [data-testid="stAlert"] { border-radius: var(--walk-radius) !important; }
        /* 입력칸: 살짝 둥글게 + 편안한 높이 */
        [data-testid="stTextInputRootElement"] input,
        .stTextInput input { border-radius: 10px !important; min-height: 42px !important; }

        /* ── 접근성 (기존 유지·강화) ─────────────────────────────────────────── */
        button:focus-visible, input:focus-visible, select:focus-visible,
        textarea:focus-visible, [tabindex]:focus-visible {
          outline: 2px solid var(--walk-brand) !important; outline-offset: 2px !important;
        }
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
        }
        [data-testid="stCaptionContainer"], .stCaption { color: var(--walk-muted) !important; }
        </style>
        """,
        unsafe_allow_html=True,
    )

    # ── 컨트롤 (사이드바 제거 → 본문 표시) ──────────────────────────────────────
    with st.container():
        favorites = st.session_state["nav_favorites"]
        running = bool(st.session_state["nav_running"])

        # 목적지 입력 바로 아래에 출발 버튼이 오도록 _sidebar_destination 안에서 함께 렌더한다.
        # 단, 도보 안내 중엔 '가는 길'(판정+지도)이 최상단에 오도록 입력·버튼을 지도
        # 아래로 미룬다(실기기 요청). 대중교통 여정 화면은 기존 순서 유지.
        defer_controls = running and st.session_state.get("nav_journey") is None
        if not defer_controls:
            _sidebar_destination(favorites, running=running)

        # 내비 진행 중엔 '현재 위치' 헤더/구분선을 숨겨 지도·판정에 자리를 양보.
        if not running:
            st.divider()
            st.markdown("**현재 위치**")
            _render_compass_enable()  # iOS 나침반 권한(탭 1회) — 값 들어오면 자동 숨김
        if _HAS_GEO:
            # nav 실행 중, 위치 미취득, 또는 대략 위치(부트스트랩)면 계속 폴링해
            # 더 정확한 fix로 자동 교체한다. (모바일은 첫 GPS fix로 곧 정밀 위치 확보)
            need_gps_poll = (
                st.session_state["nav_running"]
                or st.session_state["nav_origin"] is None
                or st.session_state.get("nav_origin_coarse", False)
                # 예약 대기 중에도 폴링 — 정확한 fix 확보 후 폴링이 멈추면 출발반경
                # 진입을 감지하지 못해 예약 자동활성화가 사실상 동작하지 않는다.
                or any(b.get("enabled", True)
                       for b in st.session_state.get("nav_route_bookings") or [])
            )
            # 목적지 입력 중에는 재폴링(약 1초 주기 rerun)을 멈춰 searchbox 가 끊기지 않게 한다.
            # 단 위치가 아직 없으면(첫 fix 미취득) 계속 폴링 — 첫 위치 취득은 막지 않는다.
            if _dest_entry_active() and st.session_state["nav_origin"] is not None:
                need_gps_poll = False
            if need_gps_poll:
                # 최초 취득 시에만 다중 샘플로 best fix 선택(첫 fix 부정확 완화), 라이브는 단일.
                geo = _get_geolocation_high_accuracy(multi=(st.session_state["nav_origin"] is None))
                # 나침반 방위각(payload 동승)을 세션에 최신화 — 정지 시 마커 화살표·
                # '보는 방향 기준' 안내용. 미지원/미권한 기기는 None 유지(기능 저하 없음).
                if isinstance(geo, dict) and geo.get("compass") is not None:
                    try:
                        # 자북(센서) → 진북(GPS 헤딩·경로 방위와 같은 기준) 편각 보정
                        st.session_state["nav_compass_deg"] = (
                            float(geo["compass"]) + _COMPASS_DECL_DEG) % 360.0
                    except (TypeError, ValueError):
                        pass
                if geo and geo.get("coords"):
                    c = geo["coords"]
                    acc = c.get("accuracy")
                    # 게이팅용 accuracy는 수용/기각과 무관하게 매 응답 최신화 — fix가
                    # 계속 기각되는 신호 악화 구간에서 옛 '좋은' accuracy로 도착·레그
                    # 전환이 게이팅되던 문제. (위치 자체는 기각 시 미갱신 정책 유지)
                    st.session_state["nav_gating_acc"] = acc
                    if gps_filter.is_fix_usable(acc):
                        new_origin = Coordinate(latitude=float(c["latitude"]), longitude=float(c["longitude"]))
                        # 점프(텔레포트) 가드 — 비현실적으로 튄 fix는 위치 갱신에서 제외.
                        # 단 연속 기각·장시간 경과 시엔 강제 수용(고착 방지, is_plausible_step 내부 escape).
                        prev = st.session_state["nav_origin"]
                        prev_raw = st.session_state["nav_raw_gps"] or {}
                        prev_acc = prev_raw.get("coords", {}).get("accuracy")
                        prev_ts = prev_raw.get("timestamp")
                        new_ts = geo.get("timestamp")
                        elapsed_ms = (new_ts - prev_ts) if (prev_ts and new_ts and new_ts > prev_ts) else 0
                        # IP(도시 수준)·캐시(과거 위치) 대략위치를 앵커로 둔 경우, 실제 GPS
                        # fix는 수 km 떨어져 점프로 오인·기각된다. 이들은 신뢰 낮은 부트스트랩이므로
                        # 첫 실측 fix가 즉시 이기게 점프 가드를 건너뛴다(prev None과 동일 취급).
                        from_bootstrap = st.session_state.get("nav_origin_source") in ("ip", "cache")
                        # 동일 fix 멱등성 가드: timestamp가 같으면 브라우저 maximumAge
                        # 캐시가 돌려준 '같은' fix — 새 측정처럼 재처리하면 recent 버퍼가
                        # 동일 점으로 차고 blend가 stale fix로 지수 수렴하며 reject streak
                        # 도 오염된다. 이 틱 전체를 건너뛴다(위치·버퍼·streak 모두 유지).
                        dup_fix = gps_filter.should_skip_duplicate_fix(
                            new_ts, prev_ts) and not from_bootstrap
                        plausible = (not dup_fix) and (
                            prev is None or from_bootstrap or gps_filter.is_plausible_step(
                                prev.latitude, prev.longitude,
                                new_origin.latitude, new_origin.longitude,
                                elapsed_ms, acc, prev_acc,
                                reject_streak=st.session_state["nav_jump_reject_streak"],
                            )
                        )
                        if plausible:
                            # 판정 raw / 표시 smoothed 이원화 — smoothed 좌표가 엔진
                            # 샘플·도착·레그 전환 판정에 유입되면 스무딩 lag(2~3초)만큼
                            # 판정도 늦는다. nav_origin은 수용된 raw fix 그대로(판정용),
                            # nav_display_origin만 스무딩(지도 마커·현재위치 카드 표시용).
                            #  큰 이동→raw / 정지→median(이상치 억제) / 보통→accuracy 가중 blend.
                            recent = st.session_state["nav_recent_fixes"]
                            recent.append((new_origin.latitude, new_origin.longitude))
                            if len(recent) > gps_filter.SMOOTH_RECENT_WINDOW:
                                del recent[:-gps_filter.SMOOTH_RECENT_WINDOW]
                            # 표시 체인의 prev 앵커는 이전 '표시' 좌표 — raw prev를 앵커로
                            # 쓰면 blend가 raw 지터에 재오염돼 이원화 효과가 사라진다.
                            disp_prev = st.session_state.get("nav_display_origin") or prev
                            if disp_prev is None:
                                smoothed = new_origin
                            else:
                                moved = distance_meters(disp_prev, new_origin)
                                if moved >= gps_filter.SMOOTH_SKIP_MOVE_M:
                                    smoothed = new_origin
                                    # 큰 점프(백그라운드 복귀·신호 재획득) — 갭 이전 fix 가
                                    # 이후 정지 median 을 옛 위치로 되튕기지(teleport back)
                                    # 않게 버퍼를 현재 fix 만 남긴다.
                                    del recent[:-1]
                                elif gps_filter.is_stationary(recent):
                                    # per-tick 이동량(<2.0m) 판정은 1초 폴링에서 정상 보행
                                    # (틱당 ~1.1m)을 '정지'로 오분류했다 — 버퍼 순변위
                                    # (보행 ~5.5m vs 정지 <2.5m)로만 정지를 인정한다.
                                    mlat, mlon = gps_filter.median_position(recent)
                                    smoothed = Coordinate(latitude=mlat, longitude=mlon)
                                else:
                                    blat, blon = gps_filter.accuracy_weighted_blend(
                                        disp_prev.latitude, disp_prev.longitude, prev_acc,
                                        new_origin.latitude, new_origin.longitude, acc)
                                    smoothed = Coordinate(latitude=blat, longitude=blon)
                            st.session_state["nav_origin"] = new_origin
                            st.session_state["nav_display_origin"] = smoothed
                            st.session_state["nav_raw_gps"] = geo
                            # 신선도 기준(서버 시계) — fix timestamp(폰 시계)와 섞지 않는다.
                            st.session_state["nav_fix_received_ms"] = int(time.time() * 1000)
                            st.session_state["nav_jump_reject_streak"] = 0
                            st.session_state["nav_origin_coarse"] = False
                            st.session_state["nav_origin_source"] = "gps"
                            # 재방문 부트스트랩용 마지막 위치 캐시 — 처음이거나 100m 이상
                            # 이동했을 때만 저장(매 폴링 스크립트 주입 방지).
                            saved = st.session_state.get("nav_lastfix_saved_coord")
                            if saved is None or distance_meters(
                                    Coordinate(latitude=saved[0], longitude=saved[1]), smoothed
                            ) > _LASTFIX_SAVE_MOVE_M:
                                _save_last_fix(smoothed.latitude, smoothed.longitude,
                                               acc, geo.get("timestamp"))
                                st.session_state["nav_lastfix_saved_coord"] = (
                                    smoothed.latitude, smoothed.longitude)
                        elif not dup_fix:
                            # 진짜 '점프 기각'만 streak 증가 — 중복 fix(dup_fix)는 기각이
                            # 아니라 '이미 처리한 fix'이므로 streak·토스트 없이 조용히 skip.
                            st.session_state["nav_jump_reject_streak"] += 1
                            st.toast("위치가 잠깐 크게 튀어 한 번 건너뛰었어요")
                    elif st.session_state["nav_origin"] is None or st.session_state.get("nav_origin_coarse"):
                        # 부트스트랩: 정확한 fix가 아직 없으면 대략 위치라도 잡아 표시한다.
                        # (실내·지하·약전파에선 Wi-Fi/네트워크 위치라 ±50m를 넘는다 — 기다리기만
                        #  하면 영원히 안 잡히므로 일단 잡고 폴링 유지 → 정밀 fix가 오면 위
                        #  is_fix_usable 분기에서 스무딩 위치로 자동 교체된다.)
                        # 안내 문구는 아래 '현재 위치' 표시부에서 한 번만 낸다(중복 경고 방지).
                        new_origin = Coordinate(latitude=float(c["latitude"]), longitude=float(c["longitude"]))
                        st.session_state["nav_origin"] = new_origin
                        # 부트스트랩(대략 위치): 판정/표시 좌표 동일 시드.
                        st.session_state["nav_display_origin"] = new_origin
                        st.session_state["nav_raw_gps"] = geo
                        st.session_state["nav_origin_coarse"] = True
                        st.session_state["nav_origin_source"] = "gps"
                elif isinstance(geo, dict) and geo.get("error") and st.session_state["nav_origin"] is None:
                    # 브라우저 위치가 '실패(error)'로 확정된 경우에만 폴백한다 — 아직 대기(None)면
                    # 모바일은 곧 GPS fix가 오므로 성급히 IP로 잡지 않는다(엉뚱한 도시로 튀는 인상 방지).
                    # PC처럼 GPS가 없어도 목적지 입력·경로 탐색이 막히지 않도록 IP 기반 '대략 위치'라도
                    # 인식시킨다. 이후 정밀 GPS fix가 오면 위 is_fix_usable 분기에서, 사용자가 출발지를
                    # 직접 입력하면 아래 '출발지 바꾸기'에서 각각 이 대략 위치를 대체한다.
                    ip_geo = _get_ip_geolocation()
                    if ip_geo and ip_geo.get("coords"):
                        c = ip_geo["coords"]
                        try:
                            st.session_state["nav_origin"] = Coordinate(
                                latitude=float(c["latitude"]), longitude=float(c["longitude"]))
                            # 부트스트랩: 판정/표시 좌표 동일 시드(스무딩 이력 없음).
                            st.session_state["nav_display_origin"] = st.session_state["nav_origin"]
                            st.session_state["nav_raw_gps"] = ip_geo
                            st.session_state["nav_origin_coarse"] = True
                            st.session_state["nav_origin_source"] = "ip"
                            st.rerun()
                        except (TypeError, ValueError):
                            pass
                    if st.session_state["nav_origin"] is None:
                        # IP 폴백이 아직 대기(None)이거나 실패 → 상황별 안내 + 수동 입력 유도.
                        geo_code = geo.get("error", {}).get("code")
                        if ip_geo is None:
                            st.caption("📍 위치 확인 중… (대략 위치라도 잡으면 바로 출발할 수 있어요)")
                        elif geo_code == 1:  # PERMISSION_DENIED
                            st.warning(
                                "위치 권한이 차단됐어요. 주소창 왼쪽 자물쇠 → 위치 → '허용'으로 바꾸거나, "
                                "아래 **‘출발지 바꾸기’** 에서 출발 주소를 직접 입력하면 바로 경로를 찾을 수 있어요."
                            )
                        else:  # POSITION_UNAVAILABLE(2) / TIMEOUT(3) / IP 폴백까지 실패
                            st.warning(
                                "위치 신호를 받지 못했어요. 아래 **‘출발지 바꾸기’** 에서 출발 주소나 장소명"
                                "(예: 합정역 7번출구)을 직접 입력하면 바로 경로를 찾을 수 있어요. "
                                "정확한 실시간 안내는 휴대폰에서 열어 주세요."
                            )
                elif st.session_state["nav_origin"] is None:
                    # 아직 위치 대기 중(None) — 모바일은 곧 첫 GPS fix가 온다.
                    st.caption("📍 위치 확인 중…")
            else:
                if st.button("📍 위치 새로고침", width="stretch"):
                    st.session_state["nav_origin"] = None
                    st.session_state["nav_display_origin"] = None  # 표시 좌표도 함께 무효화
                    st.session_state["nav_origin_coarse"] = False
                    st.session_state["nav_origin_source"] = None
                    st.rerun()
        else:
            st.caption("GPS 패키지 미설치 — 수동 입력")
            lat_in = st.number_input("위도", value=37.5665, format="%.6f", step=0.0001)
            lon_in = st.number_input("경도", value=126.9780, format="%.6f", step=0.0001)
            if st.button("위치 설정"):
                st.session_state.update({
                    "nav_origin":              Coordinate(latitude=lat_in, longitude=lon_in),
                    # 수동 입력 부트스트랩: 판정/표시 좌표 동일 시드.
                    "nav_display_origin":      Coordinate(latitude=lat_in, longitude=lon_in),
                    "nav_raw_gps":             None,
                    "nav_origin_address":      None,
                    "nav_origin_address_coord": None,
                    "nav_origin_coarse":       False,
                    "nav_origin_source":       "manual",
                })

        origin: Optional[Coordinate] = st.session_state["nav_origin"]
        if origin:
            cached_coord: Optional[Coordinate] = st.session_state["nav_origin_address_coord"]
            if cached_coord is None or distance_meters(cached_coord, origin) > 100:
                try:
                    # 표시 직전 1회 한국식 정규화 — 국가명 숨김·우편번호 (NNNNN) 앞으로·광역→세부 순.
                    # 두 표시처(현재위치 카드·출발지 placeholder)가 같은 값을 읽어 자동 전파.
                    addr = format_korean_address(
                        _reverse_geocode_cached(round(origin.latitude, 5), round(origin.longitude, 5)))
                    st.session_state["nav_origin_address"]       = addr
                    st.session_state["nav_origin_address_coord"] = origin
                except (requests.exceptions.RequestException, ValueError, KeyError):
                    # 네트워크/파싱 실패 → 주소 미설정, 좌표 폴백 유지(예상외 예외는 삼키지 않고 표면화).
                    pass
            addr = st.session_state["nav_origin_address"]
            acc = (st.session_state["nav_raw_gps"] or {}).get("coords", {}).get("accuracy")
            q = gps_filter.accuracy_quality(acc)
            coarse = bool(st.session_state.get("nav_origin_coarse"))
            acc_txt = f" (±{acc:.0f}m)" if acc else ""
            # '현재 위치' 카드의 좌표 텍스트는 표시용 스무딩 좌표(P1-3 이원화) —
            # raw 지터가 좌표 숫자 떨림으로 보이지 않게. 판정·역지오코딩은 raw 유지.
            disp_origin = st.session_state.get("nav_display_origin") or origin
            # 내비 중엔 현재 위치 카드(주소·정확도)를 한 줄 caption으로 축약 — 지도에 마커로도 보임.
            if running:
                where = addr or f"{disp_origin.latitude:.5f}, {disp_origin.longitude:.5f}"
                dot = "🟡" if coarse else {"good": "🟢", "fair": "🟡", "poor": "🔴"}.get(q, "⚪")
                # 앱 전환·화면 잠금으로 폴링이 멈추면 옛 위치가 '현재'처럼 보인다 — 신선도 표시.
                rx = st.session_state.get("nav_fix_received_ms")
                now_srv = int(time.time() * 1000)
                stale = (f"  ⏸ {int((now_srv - rx) / 1000)}초 전 위치"
                         if rx and now_srv - rx > _FIX_STALE_MS else "")
                st.caption(f"📍 {where}  {dot}" + ("  (대략 위치)" if coarse else "") + stale)
            else:
                if addr:
                    st.success(f"📍 {addr}")
                else:
                    st.caption(f"📍 {disp_origin.latitude:.5f}, {disp_origin.longitude:.5f}")
                # 위치 상태는 '한 줄'만 낸다 — 대략 위치면 그 안내만(정확도 등급 중복 표시 금지).
                if coarse:
                    origin_src = st.session_state.get("nav_origin_source")
                    if origin_src == "cache":
                        st.caption(
                            "🕘 최근 확인 위치 — 현재 위치(GPS)를 잡는 중이에요. "
                            "잠시 뒤 자동으로 갱신됩니다."
                        )
                    elif origin_src == "ip":
                        st.caption(
                            f"⚠️ 대략적 위치(IP 기반){acc_txt} — 도시 수준이라 실제와 멀 수 있어요. "
                            "정확한 출발지는 위 **‘출발지 바꾸기’** 에서 주소·장소명을 입력하거나, "
                            "휴대폰(GPS)에서 열면 자동으로 정확해집니다."
                        )
                    else:
                        st.caption(
                            f"⚠️ 대략적 위치{acc_txt} — 실내·지하·약전파에선 정확도가 낮아요. "
                            "하늘이 트인 곳으로 나오면 자동으로 정확해집니다."
                        )
                elif q == "good":
                    st.caption(f"🟢 위치 정확{acc_txt}")
                elif q == "fair":
                    st.caption(f"🟡 위치 보통{acc_txt} — 실내·고층에선 잠깐 부정확할 수 있어요")
                elif q == "poor":
                    st.caption(f"🔴 위치 약함{acc_txt} — 하늘이 트인 곳으로 나오면 정확해져요")
                else:
                    st.caption("⚪ 수동 입력")

        # 알림 설정: nav_config·민감도 슬라이더는 매 rerun 실행돼야 하므로(엔진 재구성)
        # 위젯 자체는 항상 렌더하고, 헤더/구분선만 내비 중 숨겨 화면을 단순화한다.
        if not running:
            st.divider()
            st.markdown("**⚙️ 알림 설정**")
        # 자주 쓰는 토글은 본문에, 민감도 슬라이더는 '고급 설정'으로 접어 화면을 단순화.
        with st.container():
            reroute_on = st.toggle(
                "길 벗어나면 자동 재탐색", value=st.session_state["nav_reroute_enabled"],
                help="경로 이탈·회전 미이행 감지 시 현재 위치 기준으로 재탐색 (3초 쿨다운)")
            alert_on = st.toggle(
                "이탈 시 소리·진동 경고", value=st.session_state["nav_alert_enabled"],
                help="소리+진동 · 삐 1번=벗어나기 시작 / 삐 2번=경로 이탈(재탐색) / 삐 3번=회전 지나침")
            tts_on = st.toggle(
                "음성 안내", value=st.session_state["nav_tts_enabled"],
                help="이탈 상태를 한국어 음성(TTS)으로 안내 (브라우저 음성 합성)")
            # 걷기 전에 폰에서 소리·진동이 실제로 나는지 확인하는 버튼. 이 탭 자체가
            # 브라우저에 '사용자 상호작용'을 만들어 이후 자동재생 허용에도 도움이 된다.
            if st.button("🔔 소리·진동 테스트", width="stretch"):
                st.audio(_alert_tone_wav("deviated"), format="audio/wav", autoplay=True)
                components.html(
                    "<script>try{if(navigator.vibrate)navigator.vibrate([200,100,300]);}"
                    "catch(e){}</script>", height=0)
                st.toast("🔔 알림 테스트 — 삐삐 소리가 나면 정상입니다")
            with st.expander("🔧 고급 설정 (이탈 감지 민감도)", expanded=False):
                st.caption("GPS가 얼마나 벗어나야 경고할지 — 보통은 기본값 그대로 두세요")
                drift_t = st.slider(
                    "경고 시작 거리(m)", 5, 20, 10,
                    help="경로에서 이만큼(m) 벗어나면 '주의' 경고가 울려요 (삐 1번)")
                # 확정 거리는 시작 거리 이상·강한 이탈 거리(기본 25m) 이하(drift<=deviation<=strong).
                dev_t = st.slider(
                    "이탈 확정 거리(m)", drift_t, 25, max(15, drift_t),
                    help="이만큼(m) 벗어난 상태가 이어지면 '이탈'로 확정하고 재탐색해요 (삐 2번)")
                # 이탈 확정을 더 빨리 알리도록 기본 2샘플(과거 3). GPS 노이즈 오탐이
                # 잦으면 이 값을 올리세요(높을수록 둔감·오탐↓, 낮을수록 민감·반응↑).
                min_consec = st.slider(
                    "연속 감지 횟수", 1, 5, 3,
                    help="GPS는 약 1초마다 위치를 재요. 연속으로 이 횟수만큼 벗어나야 이탈 확정 — "
                         "3이면 약 3초. GPS가 한 번 튄 것으로 오판하지 않기 위한 안전장치예요")
        st.session_state["nav_reroute_enabled"] = reroute_on
        st.session_state["nav_alert_enabled"] = alert_on
        st.session_state["nav_tts_enabled"] = tts_on
        st.session_state["nav_config"] = EngineConfig(
            route_drift_distance_threshold_meters=float(drift_t),
            route_deviation_distance_threshold_meters=float(dev_t),
            minimum_consecutive_samples_for_deviation=min_consec,
            # 이탈 확정 지속시간 기준을 4초→2초로(빠른 안내). 연속샘플 OR 지속시간
            # 둘 중 먼저 충족되면 확정되므로, 둘 다 낮춰 체감 반응을 앞당긴다.
            minimum_drift_duration_ms=2000,
        )

    # ── 자주 가는 길·관리 (핵심 동선 아래로 배치) ─────────────────────────────
    # 내비 진행 중엔 관리 패널을 숨긴다 — 예약 자동활성화(_try_activate_booking)는
    # nav_running=True에서 즉시 return하므로 기능 손실 없이 화면만 비운다.
    if not running:
        st.divider()
        _sidebar_favorites(favorites)
        _sidebar_bookings(favorites, origin)

    # ── 도착 판정 (이탈 판정보다 우선) ────────────────────────────────────────
    arrived_now = False
    journey_for_advance = st.session_state.get("nav_journey")
    if journey_for_advance is not None and st.session_state["nav_running"] and origin is not None:
        active_idx = st.session_state.get("nav_active_leg_index", 0)
        if not transit_builder.is_last_leg(journey_for_advance, active_idx):
            acc = _gating_accuracy()  # 기각 구간에서도 최신 accuracy로 레그 전환 게이팅
            next_idx = transit_builder.advance_leg(journey_for_advance, active_idx, origin, acc)
            if next_idx != active_idx:
                _activate_leg(journey_for_advance, next_idx, start_now=True)
                st.rerun()
    if st.session_state["nav_running"] and origin is not None:
        arrived_now = _maybe_finish_arrival(origin)

    # ── GPS 샘플 처리 ─────────────────────────────────────────────────────────
    if not arrived_now and st.session_state["nav_running"] and origin is not None:
        engine: Optional[RouteDeviationEngine] = st.session_state["nav_engine"]
        prev_coord: Optional[Coordinate] = st.session_state["nav_prev_coord"]
        if engine is not None and (prev_coord is None or distance_meters(prev_coord, origin) > 1.0):
            sample = _make_sample(origin, st.session_state["nav_raw_gps"], prev_coord,
                                  st.session_state["nav_prev_ts_ms"])
            prev_ts = st.session_state["nav_prev_ts_ms"]
            if (prev_ts is not None and st.session_state["nav_route"] is not None
                    and sample.timestamp_ms - prev_ts > _GPS_GAP_RESET_MS):
                # 긴 공백(백그라운드 복귀 등) — 엔진만 재생성해 이탈 판정 이력을 리셋
                # (경로·샘플·알림 이력은 유지, 복귀 첫 표본의 지속시간 뻥튀기 방지).
                engine = RouteDeviationEngine(st.session_state["nav_route"],
                                              st.session_state["nav_config"])
                st.session_state["nav_engine"] = engine
            result = engine.process_sample(sample)
            st.session_state["nav_results"].append(result)
            st.session_state["nav_samples"].append(sample)
            st.session_state["nav_prev_coord"]   = origin
            st.session_state["nav_prev_ts_ms"]   = sample.timestamp_ms
            if st.session_state["nav_start_ts_ms"] is None:
                st.session_state["nav_start_ts_ms"] = sample.timestamp_ms  # 이번 안내(레그) 시작
            if (st.session_state.get("nav_journey") is not None
                    and st.session_state.get("nav_journey_start_ts_ms") is None):
                # 다구간 여정 '전체' 시작 — 레그 전환 _reset 에 지워지지 않아
                # 도착 요약이 마지막 구간이 아닌 전체 소요시간을 보여준다.
                st.session_state["nav_journey_start_ts_ms"] = sample.timestamp_ms
            # 누적 상한(슬라이싱 호환 위해 list 유지) — 장시간 보행 시 렌더·메모리 폭증 차단.
            if len(st.session_state["nav_results"]) > _MAX_SAMPLES:
                st.session_state["nav_results"] = st.session_state["nav_results"][-_MAX_SAMPLES:]
                st.session_state["nav_samples"] = st.session_state["nav_samples"][-_MAX_SAMPLES:]

            acc = (st.session_state["nav_raw_gps"] or {}).get("coords", {}).get("accuracy")
            lvl = gps_filter.alert_level(acc, result.state)
            now_ms = int(time.time() * 1000)
            decision = gps_filter.decide_alert(
                result.state,
                st.session_state["nav_last_alerted_state"],
                lvl,
                now_ms,
                st.session_state["nav_last_weak_toast_ts_ms"],
                st.session_state["nav_alert_enabled"],
            )
            if decision.fire_full:
                _trigger_alert(result.state, st.session_state["nav_tts_enabled"])
            if decision.fire_weak_toast:
                st.toast("⚠️ 경로 이탈 가능 — 위치 정확도 낮음, 확인 필요")
            st.session_state["nav_last_alerted_state"] = decision.new_last_alerted
            st.session_state["nav_last_weak_toast_ts_ms"] = decision.new_last_weak_ts_ms

            # 다음 회전 예고 — 상태 경고와 별개인 '어디로 가라' 음성 안내.
            # accuracy를 넘겨 예고 거리를 보정한다(나쁜 신호 = 더 일찍 예고).
            _maybe_announce_turn(result, st.session_state["nav_tts_enabled"], acc)

            dest_coord: Optional[Coordinate] = st.session_state["nav_dest"]
            if (
                st.session_state["nav_reroute_enabled"]
                and result.state in ("deviated", "passed_turn")
                and dest_coord is not None
            ):
                now_ms      = int(time.time() * 1000)
                last_reroute = st.session_state["nav_last_reroute_ts_ms"]
                nav_samples  = st.session_state["nav_samples"]
                warmup = gps_filter.in_reroute_warmup(
                    len(nav_samples),
                    # 경과시간은 클라이언트 fix 시계끼리만 뺀다 — 서버 벽시계와 섞으면
                    # 폰 시계 오차(±30초)만으로 워밍업 30초 가드가 무력화/과연장된다.
                    (nav_samples[-1].timestamp_ms - nav_samples[0].timestamp_ms)
                    if nav_samples else 0,
                )
                if (
                    not warmup
                    and (last_reroute is None or (now_ms - last_reroute) > _REROUTE_COOLDOWN_MS)
                    and not _reroute_suppressed(st.session_state["nav_results"], nav_samples,
                                                now_ms, result.state)
                ):
                    # 쿨다운을 fetch '이전'에 기록: 예전엔 fetch 뒤 커밋이 rerun 중단으로
                    # 유실되면 쿨다운도 안 남아 매 표본(~1.4초) fetch 폭주가 됐다(E2E 22회).
                    st.session_state["nav_last_reroute_ts_ms"] = now_ms
                    # 동기 _fetch_route 금지: 1초 autorefresh 가 fetch 대기 중 이 실행을
                    # 중단시키면 이후 모든 세션 쓰기가 유실된다 → 백그라운드 fetch 후
                    # 다음 rerun 시작부(_commit_pending_reroute)에서 커밋.
                    _start_reroute_fetch(_session_id(), origin, dest_coord)

    # ── 지도 + 판정 패널 ──────────────────────────────────────────────────────
    route = st.session_state["nav_route"]
    dest  = st.session_state["nav_dest"]
    journey = st.session_state.get("nav_journey")

    if journey is not None:
        _render_journey(journey, st.session_state.get("nav_active_leg_index", 0))

    if route is None or dest is None:
        if journey is None:
            st.info("목적지를 입력하고 '경로 찾기'를 누르세요. 지도는 현재 위치 기준으로 표시됩니다.")
        else:
            st.info("현재 구간은 실시간 도보 경로가 없어 지도는 현재 위치 기준으로 표시됩니다.")
        # 경로 전 지도 마커도 표시용 좌표(스무딩) — 없으면 판정 좌표 폴백.
        st.plotly_chart(
            _build_placeholder_map(st.session_state.get("nav_display_origin") or origin),
            width="stretch")
        return

    if (not st.session_state["nav_running"]) and st.session_state.get("nav_arrival_summary"):
        st.success(st.session_state["nav_arrival_summary"])
        st.caption("새 목적지를 입력하거나 ↺ 초기화로 다시 시작하세요")

    # 모바일: 가로 [3,1] 분할은 판정 패널이 찌그러진다 → 세로 스택.
    #   - 보행 중: '지금 할 일'(판정)을 지도 위로 올려 가장 먼저 보이게.
    #   - 그 외: 지도를 먼저, 판정/요약은 아래로.
    def _render_map() -> None:
        # 폰 세로 화면에서 지도가 뷰포트를 꽉 채우면 지도 아래 컨트롤(정지·목적지 바꾸기)로
        # 스크롤이 막힌다(지도 캔버스가 세로 스와이프를 팬으로 가로챔). 지도 아래에 스크롤로
        # 잡을 여백이 남도록 높이를 낮춘다 — 보행 중엔 조금 더 크게(방향 배지가 위에 있음).
        map_h = 460 if st.session_state["nav_running"] else 400
        if st.session_state["nav_running"] and _HAS_MAPLIBRE:
            # 안내 중 1순위: MapLibre 컴포넌트 — iframe 유지 + easeTo(900ms)로
            # 부드러운 헤딩업 회전 + 핀치줌 유지(제스처 중 따라가기 일시정지).
            _maplibre_nav(
                **_maplibre_nav_args(route, dest, st.session_state["nav_results"],
                                     st.session_state["nav_samples"],
                                     display_coord=st.session_state.get("nav_display_origin"),
                                     height=map_h),
                key="nav_map_ml", default=None,
            )
            return
        if st.session_state["nav_running"] and _HAS_PYDECK:
            # 안내 중 2순위(폴백): 헤딩업 지도(pydeck) — 진행 방향이 항상 위 + 핀치줌 유지.
            # (plotly 는 zoom·bearing 이 uirevision 한 그룹이라 동시 불가 — _build_map_deck 주석)
            st.pydeck_chart(
                _build_map_deck(route, dest, st.session_state["nav_results"],
                                st.session_state["nav_samples"],
                                display_coord=st.session_state.get("nav_display_origin")),
                height=map_h, key="nav_map_deck",
            )
            return
        # 유휴(미리보기·도착 요약): 기존 plotly 지도 유지 — 주기 rerun 이 없어
        # uirevision 만으로 카메라가 보존되고, 헤딩업 회전이 필요 없는 화면.
        # 확대/이동 유지: revision 이 같으면 사용자 카메라 보존(_build_map 주석 참조).
        # 재탐색(nav_reroute_count)·새 경로(양끝 좌표)에서만 값이 바뀌어 리셋된다.
        rev = (f"route-{st.session_state['nav_reroute_count']}"
               f"-{route.polyline[0].latitude:.5f}-{route.polyline[-1].longitude:.5f}")
        st.plotly_chart(
            _build_map(route, dest, st.session_state["nav_results"],
                       st.session_state["nav_samples"], height=map_h,
                       ui_revision=rev,
                       # 현재 위치 마커만 표시용 스무딩 좌표(판정은 raw 유지 — P1-3 이원화)
                       display_coord=st.session_state.get("nav_display_origin")),
            width="stretch",
            key="nav_map",
        )

    arrived = (not st.session_state["nav_running"]) and bool(st.session_state.get("nav_arrival_summary"))
    if st.session_state["nav_running"]:
        if st.session_state["nav_results"]:
            # 판정(상태·다음 회전·핵심 지표)을 지도 위 가장 큰 요소로.
            _render_metrics(st.session_state["nav_results"])
        else:
            # 시작 직후~첫 GPS 샘플 전: '눌렸나?' 혼란 방지용 생존 신호.
            st.info("🧭 안내 중 — 위치를 받는 중입니다. 곧 첫 판정이 표시됩니다")
        _render_map()
        # 컨트롤(목적지 바꾸기·중지/초기화)은 지도 아래로 — '가는 길'이 먼저 보이게.
        with st.expander("📍 목적지 바꾸기", expanded=False):
            _render_dest_inputs()
        _render_action_buttons()
    else:
        _render_map()
        st.markdown("#### 도착 — 안내 종료" if arrived else "#### 현재 판정")
        _render_metrics(st.session_state["nav_results"])


import requests  # noqa: E402 — exception types used in _add_single_booking
main()
