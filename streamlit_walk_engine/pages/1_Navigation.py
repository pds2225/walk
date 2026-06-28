"""Walk — 실시간 내비게이션 (목적지 입력 → 경로 생성 → 이탈 감지)."""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from typing import Optional

import streamlit as st
import streamlit.components.v1 as components

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
from alert_voice import build_tts_script, tts_phrase
from route_builder import (
    fetch_walking_route_with_engine, geocode_address, geocode_suggestions,
    reverse_geocode, route_engine_label,
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


# GPS 재측정 주기(초). streamlit_js_eval 프런트엔드는 '같은 js_expressions 문자열'은
# 다시 평가하지 않으므로(once-per-string 가드), 표현식을 고정하면 위치가 세션당 1회만
# 잡혀 내비 중 갱신되지 않는다. 이 주기로 바뀌는 토큰을 표현식에 덧붙여 재측정을 유도한다.
_GPS_POLL_BUCKET_SEC = 3

# 위치 샘플/판정 누적 상한 — 장시간 보행 시 메모리·지도 렌더 무한 증가 차단.
_MAX_SAMPLES = 500


def _get_geolocation_high_accuracy(component_key: str = "walk_hi_acc_geo", multi: bool = False):
    """현재 위치를 enableHighAccuracy로 요청한다 (실패 시 스톡 get_geolocation 폴백).

    스톡 get_geolocation()은 getCurrentPosition을 옵션 없이 호출해 고정밀을 요청하지
    않는다. 여기서는 streamlit_js_eval로 enableHighAccuracy=true 측정을 요청한다.
    반환 형태는 get_geolocation()과 동일: {"coords": {...}, "timestamp": ...} /
    {"error": {...}} / None. (_HAS_GEO 가 True일 때만 호출된다.)

    multi=True: watchPosition으로 짧게(최대 ~1.2초·최대 3fix) 여러 측정을 모아 accuracy가
    가장 작은(가장 정확한) fix를 고른다. 단 충분히 정확한 fix(≤20m)가 들어오면 즉시
    반환해 첫 위치 체감 로딩을 줄인다. enableHighAccuracy 첫 fix가 흔히 ±40~50m로
    부정확한 문제를 완화한다 — '최초 위치 취득(nav_origin 미정)' 시에만 쓰고, 라이브
    폴링은 단일 fix(빠른 응답)를 유지해 샘플 빈도를 떨어뜨리지 않는다.

    내비 중 위치가 갱신되도록 표현식 끝에 _GPS_POLL_BUCKET_SEC 주기로 바뀌는 주석
    토큰을 붙인다 — 같은 버킷 안에서는 문자열이 같아 값-변경발 무한 rerun이 없고,
    버킷이 바뀔 때마다 프런트엔드가 재평가해 새 fix를 받는다(multi/single 공통 보존).
    """
    bucket = int(time.time() // _GPS_POLL_BUCKET_SEC)
    coords_js = (
        "coords:{accuracy:p.coords.accuracy,altitude:p.coords.altitude,"
        "altitudeAccuracy:p.coords.altitudeAccuracy,heading:p.coords.heading,"
        "latitude:p.coords.latitude,longitude:p.coords.longitude,speed:p.coords.speed},"
        "timestamp:p.timestamp"
    )
    if multi:
        js = (
            "new Promise((resolve)=>{"
            "if(!navigator.geolocation){resolve({error:{code:0,message:'no geolocation'}});return;}"
            "var best=null,n=0,done=false;"
            "var fin=function(){if(done)return;done=true;"
            "try{navigator.geolocation.clearWatch(wid);}catch(e){}"
            "resolve(best||{error:{code:3,message:'timeout'}});};"
            "var wid=navigator.geolocation.watchPosition("
            "(p)=>{if(best===null||p.coords.accuracy<best.coords.accuracy){best={" + coords_js + "};}"
            "n++;if(p.coords.accuracy<=20||n>=3){fin();}},"
            "(e)=>{if(best===null&&!done){done=true;resolve({error:{code:e.code,message:e.message}});}},"
            "{enableHighAccuracy:true,maximumAge:0,timeout:10000});"
            "setTimeout(fin,1200);"
            f"}})/* {bucket} */"
        )
    else:
        js = (
            "new Promise((resolve)=>{"
            "if(!navigator.geolocation){resolve({error:{code:0,message:'no geolocation'}});return;}"
            "navigator.geolocation.getCurrentPosition("
            "(p)=>resolve({" + coords_js + "}),"
            "(e)=>resolve({error:{code:e.code,message:e.message}}),"
            "{enableHighAccuracy:true,maximumAge:0,timeout:10000});"
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
        "nav_raw_gps": None,
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
        "nav_origin_address": None,
        "nav_origin_address_coord": None,
        "nav_dest_display": None,
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


# ── 알림 ─────────────────────────────────────────────────────────────────────

_ALERT = {
    "drifting":    {"freqs": [660],           "durs": [320],       "vibrate": [150],              "toast": "⚠️ 이탈 시작 — 경로를 확인하세요"},
    "deviated":    {"freqs": [880, 660],       "durs": [250, 380],  "vibrate": [200, 100, 300],    "toast": "🚨 경로 이탈 — 재탐색이 필요합니다"},
    "passed_turn": {"freqs": [880, 880, 880],  "durs": [140, 140, 220], "vibrate": [100, 60, 100, 60, 200], "toast": "↩️ 회전 미이행 — 되돌아가야 합니다"},
    "arrived":     {"freqs": [523, 659, 784],  "durs": [150, 150, 280], "vibrate": [80, 50, 80, 50, 160],   "toast": "🏁 목적지 도착 — 안내를 종료합니다"},
}


def _trigger_alert(state: str, tts: bool = True) -> None:
    cfg = _ALERT.get(state)
    if cfg is None:
        return
    st.toast(cfg["toast"])
    tone_calls: list[str] = []
    offset_ms = 0
    for freq, dur in zip(cfg["freqs"], cfg["durs"]):
        tone_calls.append(f"""
        setTimeout(function(){{
            try{{
                var c=new(window.AudioContext||window.webkitAudioContext)();
                c.resume().then(function(){{
                    var o=c.createOscillator(),g=c.createGain();
                    o.connect(g);g.connect(c.destination);
                    o.type='sine';o.frequency.value={freq};
                    g.gain.setValueAtTime(0.35,c.currentTime);
                    g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+{dur/1000:.3f});
                    o.start(c.currentTime);o.stop(c.currentTime+{dur/1000:.3f});
                }});
            }}catch(e){{}}
        }},{offset_ms});""")
        offset_ms += dur + 80
    voice_script = ""
    if tts:
        phrase = tts_phrase(state)
        if phrase:
            voice_script = build_tts_script(phrase)
    components.html(
        f"<script>(function(){{{' '.join(tone_calls)}"
        f"try{{if(navigator.vibrate)navigator.vibrate({cfg['vibrate']});}}catch(e){{}}"
        f"{voice_script}"
        f"}})();</script>",
        height=0,
    )


# ── 도착 판정 ─────────────────────────────────────────────────────────────────

def _maybe_finish_arrival(origin: Coordinate) -> bool:
    """목적지 도착 반경 진입 시 안내 종료 + 요약 기록. 도착 처리되면 True.

    이탈 판정보다 먼저 호출한다 — 목적지 근처에서 잔여 이탈 알림이 울리지 않도록.
    """
    dest: Optional[Coordinate] = st.session_state["nav_dest"]
    if dest is None:
        return False
    acc = (st.session_state["nav_raw_gps"] or {}).get("coords", {}).get("accuracy")
    if not gps_filter.is_arrival(distance_meters(origin, dest), acc):
        return False

    parts: list[str] = []
    samples = st.session_state["nav_samples"]
    # 여정 시작 시각 기준(샘플 상한 trim과 무관) — 없으면 현재 버퍼 첫 샘플로 폴백.
    start_ts = st.session_state.get("nav_start_ts_ms")
    if start_ts is None and samples:
        start_ts = samples[0].timestamp_ms
    if start_ts is not None:
        elapsed_min = (int(time.time() * 1000) - start_ts) / 60_000
        parts.append(f"소요 약 {max(1, round(elapsed_min))}분")
    if st.session_state.get("nav_reroute_count", 0) > 0:
        parts.append(f"재경로 {st.session_state['nav_reroute_count']}회")
    detail = " · ".join(parts)
    st.session_state["nav_arrival_summary"] = "🏁 도착 완료" + (f" — {detail}" if detail else "")
    st.session_state["nav_running"] = False
    st.session_state["nav_active_booking_id"] = None  # 같은 예약 경로 재발동 허용
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

def _build_map(
    route: RouteModel,
    dest: Coordinate,
    results: list[EngineResult],
    samples: list[PositionSample],
) -> go.Figure:
    fig  = go.Figure()
    lats = [c.latitude  for c in route.polyline]
    lons = [c.longitude for c in route.polyline]

    fig.add_trace(go.Scattermap(
        lat=lats, lon=lons, mode="lines",
        line=dict(width=5, color="#2980b9"), name="경로", hoverinfo="skip",
    ))

    dir_emoji = {"left": "↰", "right": "↱", "straight": "↑"}
    for tp in route.turn_points:
        fig.add_trace(go.Scattermap(
            lat=[tp.coordinate.latitude], lon=[tp.coordinate.longitude],
            mode="markers+text",
            marker=dict(size=14, color="#e67e22"),
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
        fig.add_trace(go.Scattermap(
            lat=[last_s.latitude], lon=[last_s.longitude], mode="markers",
            marker=dict(size=22, color=STATE_COLOR[last_r.state]),
            name="현재 위치",
            hovertemplate=(
                f"현재 위치<br>상태: <b>{STATE_LABEL[last_r.state]}</b><br>"
                f"경로까지: {last_r.metrics.distance_from_route_meters:.1f}m<br>"
                f"점수: {last_r.score:.3f}<extra></extra>"
            ),
        ))
        clat, clon = last_s.latitude, last_s.longitude
    else:
        mid = len(lats) // 2
        clat, clon = lats[mid], lons[mid]

    fig.update_layout(
        map=dict(style="open-street-map", center=dict(lat=clat, lon=clon), zoom=15),
        height=560,
        margin=dict(l=0, r=0, t=0, b=0),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1,
                    bgcolor="rgba(255,255,255,0.85)", bordercolor="#ddd", borderwidth=1),
    )
    return fig


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
                 zoom=15 if center is not None else 12),
        height=560,
        margin=dict(l=0, r=0, t=0, b=0),
        showlegend=False,
    )
    return fig


# ── 판정 패널 ─────────────────────────────────────────────────────────────────

def _render_status_badge(results: list[EngineResult]) -> None:
    if not results:
        return
    last = results[-1]
    st.markdown(
        f'<div style="background:{STATE_COLOR[last.state]};color:white;font-weight:bold;'
        f'padding:14px 18px;border-radius:10px;text-align:center;font-size:1.15rem;'
        f'margin-bottom:8px">'
        f'{STATE_LABEL[last.state]}'
        f'<span style="font-size:0.85rem;font-weight:normal;margin-left:12px;opacity:0.9">'
        f'{ACTION_LABEL[last.suggested_next_action]}'
        f'</span></div>',
        unsafe_allow_html=True,
    )


def _render_metrics(results: list[EngineResult]) -> None:
    if not results:
        st.info("내비게이션을 시작하면 실시간 판정이 표시됩니다.")
        return
    last = results[-1]
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
    st.divider()
    st.metric("이탈 점수",    f"{last.score:.3f}")
    st.metric("경로까지 거리", f"{last.metrics.distance_from_route_meters:.1f} m")
    st.metric("헤딩 차이",    f"{last.metrics.heading_difference_degrees:.0f}°")
    st.metric("샘플 수",      len(results))
    if last.metrics.distance_to_next_turn_point_meters is not None:
        st.metric("다음 회전", f"{last.metrics.distance_to_next_turn_point_meters:.0f} m")
        info = st.session_state.get("nav_route_info")
        turn_id = last.metrics.nearest_turn_point_id
        if info is not None and turn_id and info.turn_descriptions.get(turn_id):
            st.caption(f"↪️ {info.turn_descriptions[turn_id]}")
    if last.metrics.drift_duration_ms > 0:
        st.metric("이탈 지속", f"{last.metrics.drift_duration_ms / 1000:.1f}s")
    if st.session_state.get("nav_reroute_count", 0) > 0:
        st.metric("재경로 횟수", f"{st.session_state['nav_reroute_count']}회")


# ── 예약 추가 헬퍼 ────────────────────────────────────────────────────────────

def _add_single_booking(booking_start: str, booking_dest: str, booking_radius: int) -> None:
    with st.spinner("예약 출발지와 목적지 확인 중..."):
        try:
            start_result = geocode_address(booking_start)
            dest_result  = geocode_address(booking_dest)
            if start_result is None:
                st.error("예약 출발지를 찾을 수 없습니다.")
            elif dest_result is None:
                st.error("예약 목적지를 찾을 수 없습니다.")
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
                    failed.append(f"{raw}: 주소를 찾을 수 없습니다.")
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
    if origin is None or st.session_state["nav_running"]:
        return
    now_ms = int(time.time() * 1000)
    last_check = st.session_state["nav_last_booking_check_ms"]
    if last_check is not None and now_ms - last_check < 5_000:
        return
    st.session_state["nav_last_booking_check_ms"] = now_ms

    for booking in st.session_state["nav_route_bookings"]:
        if not booking.get("enabled", True):
            continue
        if st.session_state.get("nav_active_booking_id") == booking["id"]:
            continue
        start = _booking_coord(booking, "start")
        if distance_meters(origin, start) > float(booking.get("radius_m", 80)):
            continue
        dest = _booking_coord(booking, "dest")
        with st.spinner(f"예약 경로 활성화 중: {booking['label']}"):
            try:
                route = _fetch_route(origin, dest)
                _activate_route(origin, dest, booking["dest_display"], route, start_now=True)
                st.session_state["nav_active_booking_id"] = booking["id"]
                st.toast(f"예약 경로 시작: {booking['label']}")
            except Exception as e:
                st.warning(f"예약 경로 활성화 실패: {e}")
        break


# ── 사이드바 섹션 ─────────────────────────────────────────────────────────────

@st.cache_data(ttl=600, show_spinner=False)
def _reverse_geocode_cached(lat: float, lon: float) -> Optional[str]:
    """좌표→주소 역지오코딩(캐시). 같은 위치 반복 호출 시 네트워크·지연 절약."""
    return reverse_geocode(Coordinate(latitude=lat, longitude=lon))


@st.cache_data(ttl=300, show_spinner=False)
def _suggest_destinations(query: str) -> list:
    """검색어 후보 목록(캐시). 같은 검색어는 재호출 없이 즉시 반환 — API 절약·rerun 안전."""
    return geocode_suggestions(query, 5)


def _sidebar_destination(favorites: list) -> None:
    """출발지(기본 현재 위치·변경 가능) + 목적지 입력 + 경로 탐색 전 후보 미리보기 + 즐겨찾기/히스토리."""
    # ── 출발지 (도착지 위) — 비우면 현재 위치, 입력하면 목적지와 동일한 후보 미리보기 ──
    origin_now = st.session_state.get("nav_origin")
    origin_addr = st.session_state.get("nav_origin_address")
    if origin_addr:
        cur_hint = origin_addr
    elif origin_now is not None:
        cur_hint = f"{origin_now.latitude:.5f}, {origin_now.longitude:.5f}"
    else:
        cur_hint = "현재 위치 취득 중…"

    st.header("출발지")
    st.text_input(
        "출발지 (비우면 현재 위치 사용)",
        placeholder=f"📍 {cur_hint}",
        key="nav_start_input",
    )
    start_q = (st.session_state.get("nav_start_input") or "").strip()
    if start_q:
        try:
            s_sugg = _suggest_destinations(start_q)
        except Exception:
            s_sugg = []
        if s_sugg:
            st.success(f"✅ 출발지 '{start_q}' 검색됨 — 후보 {len(s_sugg)}곳. 출발지를 고르세요.")
            s_labels = [disp for _, disp in s_sugg]
            s_choice = st.selectbox("검색 결과에서 출발지 선택", s_labels, key="nav_start_pick")
            st.session_state["nav_start_picked"] = s_sugg[s_labels.index(s_choice)]
        else:
            st.warning(f"❌ 출발지 '{start_q}' — 찾지 못했습니다. 비우면 현재 위치가 출발지로 쓰입니다.")
            st.session_state["nav_start_picked"] = None
    else:
        st.session_state["nav_start_picked"] = None
        st.caption(f"📍 현재 위치를 출발지로 사용: {cur_hint}")

    st.divider()
    st.header("목적지")
    st.text_input(
        "주소 또는 장소명",
        placeholder="예) 경복궁, 강남역 10번출구",
        key="nav_dest_input",
    )

    # 경로 탐색 전 미리보기: 입력한 장소가 검색되는지 + 후보를 즉시 보여준다.
    dest_q = (st.session_state.get("nav_dest_input") or "").strip()
    if dest_q:
        try:
            suggestions = _suggest_destinations(dest_q)
        except Exception:
            suggestions = []
        if suggestions:
            st.success(f"✅ '{dest_q}' 검색됨 — 후보 {len(suggestions)}곳. 목적지를 고르세요.")
            labels = [disp for _, disp in suggestions]
            choice = st.selectbox("검색 결과에서 목적지 선택", labels, key="nav_dest_pick")
            st.session_state["nav_dest_picked"] = suggestions[labels.index(choice)]
        else:
            st.warning(f"❌ '{dest_q}' — 일치하는 장소를 찾지 못했습니다. 다른 주소·장소명으로 입력해 보세요.")
            st.session_state["nav_dest_picked"] = None
    else:
        st.session_state["nav_dest_picked"] = None

    history = st.session_state["nav_search_history"]
    if favorites or history:
        with st.expander("⭐ 즐겨찾기 · 최근 검색", expanded=False):
            if favorites:
                fav_opts = ["선택 안 함"] + [f"{f['name']} · {f['address']}" for f in favorites]
                sel = st.selectbox("즐겨찾기에서 선택", fav_opts, key="fav_dest_sel")
                if sel != "선택 안 함":
                    addr = favorites[fav_opts.index(sel) - 1]["address"]
                    if st.button("목적지에 입력", key="fav_to_dest", use_container_width=True):
                        st.session_state["nav_dest_input"] = addr
                        st.rerun()
            if history:
                st.caption("최근 검색")
                for i, h in enumerate(history[:5]):
                    label = f"🕐 {h['query']}{_exit_tag(h['query'])}"
                    if st.button(label, key=f"hist_{i}", use_container_width=True):
                        st.session_state["nav_pending_hist"] = h
                        st.rerun()


def _sidebar_favorites(favorites: list) -> None:
    """즐겨찾기 추가·삭제 관리 패널."""
    with st.expander("즐겨찾기 관리", expanded=False):
        fav_name = st.text_input("명칭", placeholder="예) 회사, 집, 학교", key="fav_name_in")
        fav_addr = st.text_input("주소", placeholder="예) 서울역 1번출구",  key="fav_addr_in")
        if st.button("즐겨찾기 추가", disabled=(not fav_name or not fav_addr), use_container_width=True):
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
                    if st.button("출발지에 입력", key="fav_to_bk_start", use_container_width=True):
                        st.session_state["booking_start_input"] = sel_addr
                        st.rerun()
                with col_d:
                    if st.button("목적지에 입력", key="fav_to_bk_dest", use_container_width=True):
                        st.session_state["booking_dest_input"] = sel_addr
                        st.rerun()

        # 예약 히스토리 버튼 → 입력칸 자동 채움
        booking_history = st.session_state["nav_booking_history"]
        if booking_history:
            st.caption("예약 히스토리")
            for i, item in enumerate(booking_history[:5]):
                if st.button(f"🕘 {item['label']}", key=f"bkhist_{i}", use_container_width=True):
                    st.session_state["booking_start_input"] = item["start_query"]
                    st.session_state["booking_dest_input"]  = item["dest_query"]
                    st.rerun()

        booking_start  = st.text_input("예약 출발지", placeholder="예) 서울역 1번출구", key="booking_start_input")
        booking_dest   = st.text_input("예약 목적지", placeholder="예) 경복궁",         key="booking_dest_input")
        booking_radius = st.slider("출발지 도착 판정 반경 (m)", 30, 300, 80, step=10)

        if st.button("예약 추가", disabled=(not booking_start or not booking_dest), use_container_width=True):
            _add_single_booking(booking_start, booking_dest, booking_radius)

        bulk_text = st.text_area(
            "여러 개 한 번에 추가",
            placeholder="예)\n서울역 1번출구 -> 경복궁\n강남역 10번출구 -> 코엑스",
            key="booking_bulk_input",
            height=90,
        )
        if st.button("일괄 예약 추가", disabled=not bulk_text.strip(), use_container_width=True):
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

def _render_action_buttons() -> None:
    """경로 탐색·시작·초기화 버튼 (도착지 입력 직후 표시).

    origin/dest_text/nav_config 는 세션에서 읽어 위젯 위치와 독립적으로 동작한다.
    슬라이더(고급설정)가 이 버튼보다 아래에 있어도, 버튼 클릭은 별도 rerun이라
    직전 확정된 nav_config 가 쓰여 stale 이 발생하지 않는다.
    """
    origin: Optional[Coordinate] = st.session_state["nav_origin"]
    dest_text: str = st.session_state.get("nav_dest_input", "")

    c1, c2, c3 = st.columns([2, 1, 1])

    with c1:
        if st.button("🔍 경로 탐색", disabled=(not dest_text or origin is None)):
            with st.spinner("경로 탐색 중..."):
                try:
                    # 미리보기에서 고른 후보가 있으면 그 좌표로 바로 경로 생성(재지오코딩 생략).
                    picked = st.session_state.get("nav_dest_picked")
                    result = picked if picked is not None else geocode_address(dest_text)
                    if result is None:
                        st.error("목적지를 찾을 수 없습니다. 다른 주소나 장소명으로 다시 시도해 주세요.")
                    else:
                        dest, display_name = result
                        # 출발지: 입력+선택 후보가 있으면 그 좌표, 없으면 현재 위치(GPS).
                        start_picked = st.session_state.get("nav_start_picked")
                        start_input = (st.session_state.get("nav_start_input") or "").strip()
                        start_coord = start_picked[0] if (start_input and start_picked) else origin
                        route = _fetch_route(start_coord, dest)
                        confirmed = _exit_label(dest_text, display_name)
                        st.session_state.update({
                            "nav_dest":         dest,
                            "nav_dest_display": confirmed,
                            "nav_route":        route,
                            "nav_engine":       RouteDeviationEngine(route, st.session_state["nav_config"]),
                        })
                        _reset()
                        hist = [h for h in st.session_state["nav_search_history"] if h["query"] != dest_text]
                        hist.insert(0, {"query": dest_text, "display_name": confirmed,
                                        "lat": dest.latitude, "lon": dest.longitude})
                        st.session_state["nav_search_history"] = hist[:10]
                        _save_list_to_ls(_LS_KEY, hist[:10])
                        st.success(
                            f"경로 생성 완료 — 좌표 {len(route.polyline)}개 / "
                            f"회전 지점 {len(route.turn_points)}개"
                        )
                except requests.exceptions.Timeout:
                    st.error("네트워크 시간 초과. 인터넷 연결을 확인하고 다시 시도해 주세요.")
                except requests.exceptions.ConnectionError:
                    st.error("네트워크에 연결할 수 없습니다.")
                except Exception as e:
                    st.error(f"경로 탐색 실패: {e}")

        if st.session_state.get("nav_dest_display"):
            st.info(f"📌 {st.session_state['nav_dest_display']}")
            summary = _route_summary_text()
            if summary:
                st.caption(f"🚶 {summary}")
        st.caption(f"경로 엔진: {st.session_state.get('nav_route_engine') or route_engine_label()}")

    with c2:
        route: Optional[RouteModel] = st.session_state["nav_route"]
        if route is not None:
            if st.session_state["nav_running"]:
                if st.button("⏹ 중지"):
                    st.session_state["nav_running"] = False
                    st.rerun()
            else:
                if st.button("▶ 시작", disabled=(origin is None)):
                    st.session_state.update({
                        "nav_running":  True,
                        "nav_engine":   RouteDeviationEngine(route, st.session_state["nav_config"]),
                        "nav_results":  [],
                        "nav_samples":  [],
                        "nav_arrival_summary": None,
                        "nav_start_ts_ms": None,
                    })
                    st.rerun()

    with c3:
        if st.button("↺ 초기화"):
            for k in ("nav_route", "nav_dest", "nav_engine", "nav_results",
                      "nav_samples", "nav_prev_coord", "nav_prev_ts_ms", "nav_route_info"):
                st.session_state[k] = [] if "results" in k or "samples" in k else None
            st.session_state["nav_running"] = False
            st.session_state["nav_arrival_summary"] = None
            st.rerun()


def main() -> None:
    st.set_page_config(page_title="Walk 내비게이션", page_icon="🗺️", layout="wide",
                       initial_sidebar_state="collapsed")
    if _MISSING_DEPENDENCIES:
        render_dependency_error()
        st.stop()

    _init()
    _load_history_from_ls()

    if st.session_state["nav_running"] and _HAS_REFRESH:
        st_autorefresh(interval=3000, key="nav_refresh")

    # 검색 히스토리 버튼 클릭 처리 — 저장된 좌표로 바로 경로 탐색
    pending_hist = st.session_state.get("nav_pending_hist")
    if pending_hist is not None:
        st.session_state["nav_pending_hist"] = None
        hist_origin: Optional[Coordinate] = st.session_state["nav_origin"]
        if hist_origin is not None:
            with st.spinner(f"'{pending_hist['query']}' 경로 탐색 중..."):
                try:
                    hist_dest = Coordinate(latitude=pending_hist["lat"], longitude=pending_hist["lon"])
                    new_route = _fetch_route(hist_origin, hist_dest)
                    st.session_state.update({
                        "nav_dest":         hist_dest,
                        "nav_dest_display": pending_hist["display_name"],
                        "nav_route":        new_route,
                        "nav_engine":       RouteDeviationEngine(new_route, st.session_state["nav_config"]),
                    })
                    _reset()
                    st.success(f"'{pending_hist['query']}' 경로 생성 완료")
                except Exception as e:
                    st.error(f"경로 탐색 실패: {e}")

    st.markdown("## 🗺️ Walk — 실시간 내비게이션")
    st.caption("목적지를 입력하고 경로를 생성하면 이탈 감지 엔진이 자동으로 연결됩니다.")

    # 모바일: 사이드바·햄버거 제거 → 컨트롤을 본문에 표시, 컨트롤 행은 가로 스크롤.
    st.markdown(
        """
        <style>
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
        </style>
        """,
        unsafe_allow_html=True,
    )

    # ── 컨트롤 (사이드바 제거 → 본문 표시) ──────────────────────────────────────
    with st.container():
        favorites = st.session_state["nav_favorites"]

        _sidebar_destination(favorites)
        # 핵심 동선: 도착지 입력 바로 아래에 경로 탐색/시작 버튼 (GPS·알림설정은 그 아래로).
        _render_action_buttons()

        st.divider()
        st.header("현재 위치")
        if _HAS_GEO:
            # nav 실행 중이거나 아직 위치 미취득 때만 watchPosition 활성화
            need_gps_poll = st.session_state["nav_running"] or st.session_state["nav_origin"] is None
            if need_gps_poll:
                # 최초 취득 시에만 다중 샘플로 best fix 선택(첫 fix 부정확 완화), 라이브는 단일.
                geo = _get_geolocation_high_accuracy(multi=(st.session_state["nav_origin"] is None))
                if geo and geo.get("coords"):
                    c = geo["coords"]
                    acc = c.get("accuracy")
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
                        plausible = prev is None or gps_filter.is_plausible_step(
                            prev.latitude, prev.longitude,
                            new_origin.latitude, new_origin.longitude,
                            elapsed_ms, acc, prev_acc,
                            reject_streak=st.session_state["nav_jump_reject_streak"],
                        )
                        if plausible:
                            # 위치 스무딩: raw_gps는 raw 보존(accuracy 게이팅 일관성), nav_origin만 안정화.
                            #  큰 이동→raw(코너링/급이동 지연 방지) / 정지→median(이상치 억제) / 보통→accuracy 가중 blend.
                            #  recent 버퍼=raw fix(median 대표점용), 이동거리(moved) 판정=smoothed prev 기준(의도).
                            recent = st.session_state["nav_recent_fixes"]
                            recent.append((new_origin.latitude, new_origin.longitude))
                            if len(recent) > gps_filter.SMOOTH_RECENT_WINDOW:
                                del recent[:-gps_filter.SMOOTH_RECENT_WINDOW]
                            if prev is None:
                                smoothed = new_origin
                            else:
                                moved = distance_meters(prev, new_origin)
                                if moved >= gps_filter.SMOOTH_SKIP_MOVE_M:
                                    smoothed = new_origin
                                elif (moved < gps_filter.SMOOTH_STATIONARY_MOVE_M
                                      and len(recent) >= gps_filter.SMOOTH_MEDIAN_MIN_FIXES):
                                    mlat, mlon = gps_filter.median_position(recent)
                                    smoothed = Coordinate(latitude=mlat, longitude=mlon)
                                else:
                                    blat, blon = gps_filter.accuracy_weighted_blend(
                                        prev.latitude, prev.longitude, prev_acc,
                                        new_origin.latitude, new_origin.longitude, acc)
                                    smoothed = Coordinate(latitude=blat, longitude=blon)
                            st.session_state["nav_origin"] = smoothed
                            st.session_state["nav_raw_gps"] = geo
                            st.session_state["nav_jump_reject_streak"] = 0
                        else:
                            st.session_state["nav_jump_reject_streak"] += 1
                            st.caption("⚠️ 이번 측정 위치가 비현실적으로 튀어 무시했습니다 — 이전 위치 유지")
                    elif st.session_state["nav_origin"] is None:
                        st.warning(
                            f"GPS 정확도 낮음 (±{acc:.0f}m > {gps_filter.USABLE_ACCURACY_M:.0f}m) — "
                            "더 정확한 위치를 기다리는 중…"
                        )
                    else:
                        st.caption(
                            f"⚠️ 이번 측정 ±{acc:.0f}m (>{gps_filter.USABLE_ACCURACY_M:.0f}m) — "
                            "무시하고 이전 위치 유지"
                        )
                elif st.session_state["nav_origin"] is None:
                    st.warning("브라우저에서 위치 권한을 허용해 주세요.")
            else:
                if st.button("📍 위치 새로고침", use_container_width=True):
                    st.session_state["nav_origin"] = None
                    st.rerun()
        else:
            st.caption("GPS 패키지 미설치 — 수동 입력")
            lat_in = st.number_input("위도", value=37.5665, format="%.6f", step=0.0001)
            lon_in = st.number_input("경도", value=126.9780, format="%.6f", step=0.0001)
            if st.button("위치 설정"):
                st.session_state.update({
                    "nav_origin":              Coordinate(latitude=lat_in, longitude=lon_in),
                    "nav_raw_gps":             None,
                    "nav_origin_address":      None,
                    "nav_origin_address_coord": None,
                })

        origin: Optional[Coordinate] = st.session_state["nav_origin"]
        if origin:
            cached_coord: Optional[Coordinate] = st.session_state["nav_origin_address_coord"]
            if cached_coord is None or distance_meters(cached_coord, origin) > 100:
                try:
                    addr = _reverse_geocode_cached(round(origin.latitude, 5), round(origin.longitude, 5))
                    st.session_state["nav_origin_address"]       = addr
                    st.session_state["nav_origin_address_coord"] = origin
                except Exception:
                    pass
            addr = st.session_state["nav_origin_address"]
            if addr:
                st.success(f"📍 {addr}")
            else:
                st.caption(f"📍 {origin.latitude:.5f}, {origin.longitude:.5f}")
            acc = (st.session_state["nav_raw_gps"] or {}).get("coords", {}).get("accuracy")
            q = gps_filter.accuracy_quality(acc)
            if q == "good":
                st.caption(f"🟢 정확도 좋음 (±{acc:.0f}m) — 알림 정상")
            elif q == "fair":
                st.caption(f"🟡 정확도 보통 (±{acc:.0f}m) — 알림 신뢰도 낮음")
            elif q == "poor":
                st.caption(f"🔴 정확도 낮음 (±{acc:.0f}m) — 약한 경고만")
            else:
                st.caption("⚪ 수동 입력")

        st.divider()
        st.markdown("**⚙️ 알림 설정**")
        # 자주 쓰는 토글은 본문에, 민감도 슬라이더는 '고급 설정'으로 접어 화면을 단순화.
        with st.container():
            reroute_on = st.toggle(
                "길 벗어나면 자동 재탐색", value=st.session_state["nav_reroute_enabled"],
                help="경로 이탈·회전 미이행 감지 시 현재 위치 기준으로 재탐색 (15초 쿨다운)")
            alert_on = st.toggle(
                "이탈 시 소리·진동 경고", value=st.session_state["nav_alert_enabled"],
                help="소리+진동 · 이탈 시작 1회 비프 / 경로 이탈 2회 / 회전 미이행 3회 연속")
            tts_on = st.toggle(
                "음성 안내", value=st.session_state["nav_tts_enabled"],
                help="이탈 상태를 한국어 음성(TTS)으로 안내 (브라우저 음성 합성)")
            with st.expander("🔧 고급 설정 (이탈 감지 민감도)", expanded=False):
                st.caption("GPS가 얼마나 벗어나야 경고할지 — 보통은 기본값 그대로 두세요")
                drift_t = st.slider("이탈 시작(m)", 5, 20, 10)
                # 확정 거리는 시작 거리 이상·강한 이탈 거리(기본 25m) 이하(drift<=deviation<=strong).
                dev_t = st.slider("이탈 확정(m)", drift_t, 25, max(15, drift_t))
                min_consec = st.slider("연속 샘플", 1, 5, 3)
        st.session_state["nav_reroute_enabled"] = reroute_on
        st.session_state["nav_alert_enabled"] = alert_on
        st.session_state["nav_tts_enabled"] = tts_on
        st.session_state["nav_config"] = EngineConfig(
            route_drift_distance_threshold_meters=float(drift_t),
            route_deviation_distance_threshold_meters=float(dev_t),
            minimum_consecutive_samples_for_deviation=min_consec,
        )

    # ── 자주 가는 길·관리 (핵심 동선 아래로 배치) ─────────────────────────────
    st.divider()
    _sidebar_favorites(favorites)
    _sidebar_bookings(favorites, origin)

    # ── 도착 판정 (이탈 판정보다 우선) ────────────────────────────────────────
    arrived_now = False
    if st.session_state["nav_running"] and origin is not None:
        arrived_now = _maybe_finish_arrival(origin)

    # ── GPS 샘플 처리 ─────────────────────────────────────────────────────────
    if not arrived_now and st.session_state["nav_running"] and origin is not None:
        engine: Optional[RouteDeviationEngine] = st.session_state["nav_engine"]
        prev_coord: Optional[Coordinate] = st.session_state["nav_prev_coord"]
        if engine is not None and (prev_coord is None or distance_meters(prev_coord, origin) > 1.0):
            sample = _make_sample(origin, st.session_state["nav_raw_gps"], prev_coord,
                                  st.session_state["nav_prev_ts_ms"])
            result = engine.process_sample(sample)
            st.session_state["nav_results"].append(result)
            st.session_state["nav_samples"].append(sample)
            st.session_state["nav_prev_coord"]   = origin
            st.session_state["nav_prev_ts_ms"]   = sample.timestamp_ms
            if st.session_state["nav_start_ts_ms"] is None:
                st.session_state["nav_start_ts_ms"] = sample.timestamp_ms  # 여정 시작(전체 소요시간 기준)
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
                    now_ms - nav_samples[0].timestamp_ms if nav_samples else 0,
                )
                if not warmup and (last_reroute is None or (now_ms - last_reroute) > 15_000):
                    try:
                        new_route  = _fetch_route(origin, dest_coord)
                        new_count  = st.session_state["nav_reroute_count"] + 1
                        st.session_state.update({
                            "nav_route":               new_route,
                            "nav_engine":              RouteDeviationEngine(new_route, st.session_state["nav_config"]),
                            "nav_results":             [],
                            "nav_samples":             [],
                            "nav_prev_coord":          None,
                            "nav_last_reroute_ts_ms":  now_ms,
                            "nav_reroute_count":       new_count,
                            "nav_last_alerted_state":  "on_route",
                            "nav_last_weak_toast_ts_ms": None,
                        })
                        st.toast(f"🔄 재경로 완료 ({new_count}회차) — 새 경로로 안내합니다")
                    except Exception as e:
                        st.warning(f"재경로 탐색 실패: {e}")

    # ── 지도 + 판정 패널 ──────────────────────────────────────────────────────
    route = st.session_state["nav_route"]
    dest  = st.session_state["nav_dest"]

    if route is None or dest is None:
        st.info("목적지를 입력하고 '경로 탐색' 버튼을 누르세요. 지도는 현재 위치 기준으로 표시됩니다.")
        st.plotly_chart(_build_placeholder_map(origin), use_container_width=True)
        return

    if st.session_state["nav_running"]:
        _render_status_badge(st.session_state["nav_results"])
    elif st.session_state.get("nav_arrival_summary"):
        st.success(st.session_state["nav_arrival_summary"])

    map_col, metric_col = st.columns([3, 1], gap="large")
    with map_col:
        st.plotly_chart(
            _build_map(route, dest, st.session_state["nav_results"], st.session_state["nav_samples"]),
            use_container_width=True,
        )
    with metric_col:
        st.markdown("### 현재 판정")
        _render_metrics(st.session_state["nav_results"])


import requests  # noqa: E402 — exception types used in _add_single_booking
main()
