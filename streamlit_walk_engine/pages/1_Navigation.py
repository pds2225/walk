"""Walk — 실시간 내비게이션 (목적지 입력 → 경로 생성 → 이탈 감지)."""

from __future__ import annotations

import json
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
from route_builder import fetch_walking_route, geocode_address, reverse_geocode

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
        "nav_alert_enabled": True,
        "nav_origin_address": None,
        "nav_origin_address_coord": None,
        "nav_dest_display": None,
        "nav_reroute_enabled": True,
        "nav_last_reroute_ts_ms": None,
        "nav_reroute_count": 0,
        "nav_search_history": [],
        "nav_pending_hist": None,
    }.items():
        if k not in st.session_state:
            st.session_state[k] = v


def _reset() -> None:
    for k in ("nav_engine", "nav_results", "nav_samples",
               "nav_running", "nav_prev_coord", "nav_prev_ts_ms"):
        st.session_state[k] = [] if "results" in k or "samples" in k else None if k != "nav_running" else False
    st.session_state["nav_last_alerted_state"] = "on_route"
    st.session_state["nav_last_reroute_ts_ms"] = None
    st.session_state["nav_reroute_count"] = 0

# ── localStorage 히스토리 영속화 ─────────────────────────────────────────────

_LS_KEY = "walk_navi_history"


def _save_history_to_ls(history: list) -> None:
    """히스토리 리스트를 브라우저 localStorage에 저장합니다 (탭 닫아도 유지)."""
    payload = json.dumps(history, ensure_ascii=False)   # Python list → JSON 문자열
    js_payload = json.dumps(payload)                    # JSON 문자열 → JS 문자열 리터럴
    components.html(
        f"<script>try{{localStorage.setItem('{_LS_KEY}',{js_payload})}}catch(e){{}}</script>",
        height=0,
    )


def _load_history_from_ls() -> None:
    """localStorage에서 히스토리를 읽어 세션 상태에 복원합니다.

    streamlit-js-eval은 첫 렌더에서 None을 반환하고
    두 번째 렌더에서 실제 값을 반환합니다.
    """
    if not _HAS_GEO or _js_eval is None:
        return
    if st.session_state["nav_search_history"]:
        return  # 이미 세션에 히스토리가 있으면 스킵
    raw = _js_eval(js_expressions=f"localStorage.getItem('{_LS_KEY}')", key="ls_load_history")
    if raw:
        try:
            loaded = json.loads(raw)
            if isinstance(loaded, list):
                st.session_state["nav_search_history"] = loaded[:10]
        except Exception:
            pass


# ── 출구 태그 헬퍼 ───────────────────────────────────────────────────────────

def _exit_tag(query: str) -> str:
    """쿼리에 지하철 출구 번호가 있으면 ' (N번출구)' 문자열 반환, 없으면 빈 문자열."""
    import re
    m = re.search(r"(.+?역)\s*(\d+)\s*번?\s*출구", query)
    return f" ({m.group(2)}번출구)" if m else ""


def _exit_label(query: str, display_name: str) -> str:
    """목적지 확인 표시용: 출구 번호가 있으면 한국어 레이블 생성."""
    import re
    m = re.search(r"(.+?역)\s*(\d+)\s*번?\s*출구", query)
    if not m:
        return display_name
    station, num = m.group(1), m.group(2)
    # display_name에 이미 출구 정보가 있으면 그대로, 없으면 suffix 추가
    if f"Exit {num}" in display_name or f"{num}번출구" in display_name:
        return display_name
    return f"{display_name}  🚇 {station} {num}번출구 기준"


# ── 알림 ─────────────────────────────────────────────────────────────────────

_ALERT = {
    "drifting": {
        "freqs": [660], "durs": [320],
        "vibrate": [150],
        "toast": "⚠️ 이탈 시작 — 경로를 확인하세요",
    },
    "deviated": {
        "freqs": [880, 660], "durs": [250, 380],
        "vibrate": [200, 100, 300],
        "toast": "🚨 경로 이탈 — 재탐색이 필요합니다",
    },
    "passed_turn": {
        "freqs": [880, 880, 880], "durs": [140, 140, 220],
        "vibrate": [100, 60, 100, 60, 200],
        "toast": "↩️ 회전 미이행 — 되돌아가야 합니다",
    },
}


def _trigger_alert(state: str) -> None:
    """상태 변화 시 토스트 + 소리(Web Audio) + 진동(모바일)을 발생시킵니다."""
    cfg = _ALERT.get(state)
    if cfg is None:
        return

    st.toast(cfg["toast"])

    # 각 음을 순서대로 재생하는 JS 조각 생성
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

    vibrate_js = str(cfg["vibrate"])
    js = f"""
    <script>
    (function(){{
        {''.join(tone_calls)}
        try{{if(navigator.vibrate)navigator.vibrate({vibrate_js});}}catch(e){{}}
    }})();
    </script>
    """
    components.html(js, height=0)


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
    gps_speed = gps_c.get("speed")

    if gps_heading is not None and gps_speed is not None and float(gps_speed) > 0.2:
        heading = float(gps_heading)
        speed = float(gps_speed)
    elif prev_coord is not None and distance_meters(prev_coord, coord) > 0.5:
        heading = bearing_degrees(prev_coord, coord)
        elapsed = (ts_ms - prev_ts_ms) / 1000.0 if prev_ts_ms and ts_ms > prev_ts_ms else 1.0
        speed = distance_meters(prev_coord, coord) / elapsed
    else:
        heading = 0.0
        speed = 1.4

    return PositionSample(
        latitude=coord.latitude,
        longitude=coord.longitude,
        heading_degrees=heading,
        speed_meters_per_second=min(max(speed, 0.0), 15.0),
        timestamp_ms=ts_ms,
    )

# ── 지도 ─────────────────────────────────────────────────────────────────────

def _build_map(
    route: RouteModel,
    dest: Coordinate,
    results: list[EngineResult],
    samples: list[PositionSample],
) -> go.Figure:
    fig = go.Figure()
    lats = [c.latitude for c in route.polyline]
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
        text=["출발"], textposition="top right",
        name="출발", showlegend=False,
    ))
    fig.add_trace(go.Scattermap(
        lat=[dest.latitude], lon=[dest.longitude], mode="markers+text",
        marker=dict(size=16, color="#e74c3c"),
        text=["목적지"], textposition="top right",
        name="목적지", showlegend=False,
    ))

    for i, (r, s) in enumerate(zip(results[:-1], samples[:-1])):
        fig.add_trace(go.Scattermap(
            lat=[s.latitude], lon=[s.longitude], mode="markers",
            marker=dict(size=9, color=STATE_COLOR[r.state], opacity=0.55),
            showlegend=False,
            hovertemplate=f"샘플 {i+1} | {STATE_LABEL[r.state]} | {r.metrics.distance_from_route_meters:.1f}m<extra></extra>",
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
        height=520,
        margin=dict(l=0, r=0, t=0, b=0),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1,
                    bgcolor="rgba(255,255,255,0.85)", bordercolor="#ddd", borderwidth=1),
    )
    return fig

# ── 판정 패널 ─────────────────────────────────────────────────────────────────

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
    st.metric("이탈 점수", f"{last.score:.3f}")
    st.metric("경로까지 거리", f"{last.metrics.distance_from_route_meters:.1f} m")
    st.metric("헤딩 차이", f"{last.metrics.heading_difference_degrees:.0f}°")
    st.metric("샘플 수", len(results))
    if last.metrics.distance_to_next_turn_point_meters is not None:
        st.metric("다음 회전", f"{last.metrics.distance_to_next_turn_point_meters:.0f} m")
    if last.metrics.drift_duration_ms > 0:
        st.metric("이탈 지속", f"{last.metrics.drift_duration_ms / 1000:.1f}s")
    reroute_count = st.session_state.get("nav_reroute_count", 0)
    if reroute_count > 0:
        st.metric("재경로 횟수", f"{reroute_count}회")

# ── 메인 ─────────────────────────────────────────────────────────────────────

def main() -> None:
    st.set_page_config(page_title="Walk 내비게이션", page_icon="🗺️", layout="wide")
    if _MISSING_DEPENDENCIES:
        render_dependency_error()
        st.stop()

    _init()

    _load_history_from_ls()  # localStorage → 세션 복원 (첫 렌더 후 자동 적용)

    if st.session_state["nav_running"] and _HAS_REFRESH:
        st_autorefresh(interval=3000, key="nav_refresh")

    # 히스토리 버튼 클릭 처리 — 저장된 좌표로 바로 경로 탐색
    pending_hist = st.session_state.get("nav_pending_hist")
    if pending_hist is not None:
        st.session_state["nav_pending_hist"] = None
        hist_origin: Optional[Coordinate] = st.session_state["nav_origin"]
        if hist_origin is not None:
            with st.spinner(f"'{pending_hist['query']}' 경로 탐색 중..."):
                try:
                    hist_dest = Coordinate(latitude=pending_hist["lat"], longitude=pending_hist["lon"])
                    new_route = fetch_walking_route(hist_origin, hist_dest)
                    st.session_state.update({
                        "nav_dest": hist_dest,
                        "nav_dest_display": pending_hist["display_name"],
                        "nav_route": new_route,
                        "nav_engine": RouteDeviationEngine(new_route, st.session_state["nav_config"]),
                    })
                    _reset()
                    st.success(f"'{pending_hist['query']}' 경로 생성 완료")
                except Exception as e:
                    st.error(f"경로 탐색 실패: {e}")

    st.markdown("## 🗺️ Walk — 실시간 내비게이션")
    st.caption("목적지를 입력하고 경로를 생성하면 이탈 감지 엔진이 자동으로 연결됩니다.")

    # ── 사이드바 ──────────────────────────────────────────────────────────────
    with st.sidebar:
        st.header("목적지")
        dest_text = st.text_input("주소 또는 장소명", placeholder="예) 경복궁, 강남역 10번출구")

        history = st.session_state["nav_search_history"]
        if history:
            st.caption("최근 검색")
            for i, h in enumerate(history[:5]):
                exit_tag = _exit_tag(h["query"])
                label = f"🕐 {h['query']}{exit_tag}"
                if st.button(label, key=f"hist_{i}", use_container_width=True):
                    st.session_state["nav_pending_hist"] = h
                    st.rerun()

        st.divider()
        st.header("현재 위치")
        if _HAS_GEO:
            geo = get_geolocation()
            if geo and geo.get("coords"):
                c = geo["coords"]
                origin = Coordinate(latitude=float(c["latitude"]), longitude=float(c["longitude"]))
                st.session_state["nav_origin"] = origin
                st.session_state["nav_raw_gps"] = geo
            elif st.session_state["nav_origin"] is None:
                st.warning("브라우저에서 위치 권한을 허용해 주세요.")
        else:
            st.caption("GPS 패키지 미설치 — 수동 입력")
            lat_in = st.number_input("위도", value=37.5665, format="%.6f", step=0.0001)
            lon_in = st.number_input("경도", value=126.9780, format="%.6f", step=0.0001)
            if st.button("위치 설정"):
                new_origin = Coordinate(latitude=lat_in, longitude=lon_in)
                st.session_state["nav_origin"] = new_origin
                st.session_state["nav_raw_gps"] = None
                st.session_state["nav_origin_address"] = None
                st.session_state["nav_origin_address_coord"] = None

        origin: Optional[Coordinate] = st.session_state["nav_origin"]
        if origin:
            # 100m 이상 이동했을 때만 역방향 지오코딩 갱신
            cached_coord: Optional[Coordinate] = st.session_state["nav_origin_address_coord"]
            needs_refresh = (
                cached_coord is None
                or distance_meters(cached_coord, origin) > 100
            )
            if needs_refresh:
                try:
                    addr = reverse_geocode(origin)
                    st.session_state["nav_origin_address"] = addr
                    st.session_state["nav_origin_address_coord"] = origin
                except Exception:
                    pass

            addr = st.session_state["nav_origin_address"]
            if addr:
                st.success(f"📍 {addr}")
            else:
                st.caption(f"📍 {origin.latitude:.5f}, {origin.longitude:.5f}")

        st.divider()
        st.header("자동 재경로")
        reroute_on = st.toggle("이탈 시 자동 재탐색", value=st.session_state["nav_reroute_enabled"])
        st.session_state["nav_reroute_enabled"] = reroute_on
        if reroute_on:
            st.caption("경로 이탈·회전 미이행 감지 시 현재 위치 기준으로 재탐색 (15초 쿨다운)")

        st.divider()
        st.header("알림 설정")
        alert_on = st.toggle("경고 알림 (소리 + 진동)", value=st.session_state["nav_alert_enabled"])
        st.session_state["nav_alert_enabled"] = alert_on
        if alert_on:
            st.caption("이탈 시작: 1회 비프 | 경로 이탈: 2회 에스컬레이션 | 회전 미이행: 3회 연속")

        st.divider()
        st.header("엔진 임계값")
        drift_t = st.slider("이탈 시작 거리 (m)", 5, 20, 10)
        dev_t = st.slider("이탈 확정 거리 (m)", 10, 30, 15)
        min_consec = st.slider("최소 연속 샘플", 1, 5, 3)
        st.session_state["nav_config"] = EngineConfig(
            route_drift_distance_threshold_meters=float(drift_t),
            route_deviation_distance_threshold_meters=float(dev_t),
            minimum_consecutive_samples_for_deviation=min_consec,
        )

    # ── 액션 버튼 ─────────────────────────────────────────────────────────────
    c1, c2, c3 = st.columns([2, 1, 1])

    with c1:
        if st.button("🔍 경로 탐색", disabled=(not dest_text or origin is None)):
            with st.spinner("경로 탐색 중..."):
                try:
                    result = geocode_address(dest_text)
                    if result is None:
                        st.error("목적지를 찾을 수 없습니다. 다른 주소나 장소명으로 다시 시도해 주세요.")
                    else:
                        dest, display_name = result
                        route = fetch_walking_route(origin, dest)
                        confirmed = _exit_label(dest_text, display_name)
                        st.session_state.update({
                            "nav_dest": dest,
                            "nav_dest_display": confirmed,
                            "nav_route": route,
                            "nav_engine": RouteDeviationEngine(route, st.session_state["nav_config"]),
                        })
                        _reset()
                        # 검색 히스토리 저장 (중복 제거, 최대 10개)
                        hist = [h for h in st.session_state["nav_search_history"]
                                if h["query"] != dest_text]
                        hist.insert(0, {
                            "query": dest_text,
                            "display_name": confirmed,
                            "lat": dest.latitude,
                            "lon": dest.longitude,
                        })
                        st.session_state["nav_search_history"] = hist[:10]
                        _save_history_to_ls(hist[:10])  # localStorage 동기화
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

        # 목적지 확인 주소 표시
        if st.session_state.get("nav_dest_display"):
            st.info(f"📌 {st.session_state['nav_dest_display']}")
        st.caption("경로 엔진: Valhalla (OpenStreetMap 도보 전용)")

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
                        "nav_running": True,
                        "nav_engine": RouteDeviationEngine(route, st.session_state["nav_config"]),
                        "nav_results": [],
                        "nav_samples": [],
                    })
                    st.rerun()

    with c3:
        if st.button("↺ 초기화"):
            for k in ("nav_route", "nav_dest", "nav_engine", "nav_results",
                      "nav_samples", "nav_prev_coord", "nav_prev_ts_ms"):
                st.session_state[k] = [] if "results" in k or "samples" in k else None
            st.session_state["nav_running"] = False
            st.rerun()

    # ── GPS 샘플 처리 (내비게이션 실행 중) ───────────────────────────────────
    if st.session_state["nav_running"] and origin is not None:
        engine: Optional[RouteDeviationEngine] = st.session_state["nav_engine"]
        prev_coord: Optional[Coordinate] = st.session_state["nav_prev_coord"]

        should_process = (
            engine is not None
            and (prev_coord is None or distance_meters(prev_coord, origin) > 1.0)
        )
        if should_process:
            sample = _make_sample(
                origin,
                st.session_state["nav_raw_gps"],
                prev_coord,
                st.session_state["nav_prev_ts_ms"],
            )
            result = engine.process_sample(sample)
            st.session_state["nav_results"].append(result)
            st.session_state["nav_samples"].append(sample)
            st.session_state["nav_prev_coord"] = origin
            st.session_state["nav_prev_ts_ms"] = sample.timestamp_ms

            # 상태가 바뀌었을 때만 알림 발생
            last_alerted = st.session_state["nav_last_alerted_state"]
            if st.session_state["nav_alert_enabled"] and result.state != last_alerted:
                _trigger_alert(result.state)
                st.session_state["nav_last_alerted_state"] = result.state

            # 자동 재경로 — deviated / passed_turn 에서만, 15초 쿨다운
            dest_coord: Optional[Coordinate] = st.session_state["nav_dest"]
            if (
                st.session_state["nav_reroute_enabled"]
                and result.state in ("deviated", "passed_turn")
                and dest_coord is not None
            ):
                now_ms = int(time.time() * 1000)
                last_reroute = st.session_state["nav_last_reroute_ts_ms"]
                if last_reroute is None or (now_ms - last_reroute) > 15_000:
                    try:
                        new_route = fetch_walking_route(origin, dest_coord)
                        new_count = st.session_state["nav_reroute_count"] + 1
                        st.session_state.update({
                            "nav_route": new_route,
                            "nav_engine": RouteDeviationEngine(new_route, st.session_state["nav_config"]),
                            "nav_results": [],
                            "nav_samples": [],
                            "nav_prev_coord": None,
                            "nav_last_reroute_ts_ms": now_ms,
                            "nav_reroute_count": new_count,
                            "nav_last_alerted_state": "on_route",
                        })
                        st.toast(f"🔄 재경로 완료 ({new_count}회차) — 새 경로로 안내합니다")
                    except Exception as e:
                        st.warning(f"재경로 탐색 실패: {e}")

    # ── 지도 + 판정 패널 ──────────────────────────────────────────────────────
    route = st.session_state["nav_route"]
    dest = st.session_state["nav_dest"]

    if route is None or dest is None:
        st.info("목적지를 입력하고 '경로 탐색' 버튼을 누르세요.")
        return

    map_col, metric_col = st.columns([3, 1], gap="large")
    with map_col:
        st.plotly_chart(
            _build_map(route, dest, st.session_state["nav_results"], st.session_state["nav_samples"]),
            use_container_width=True,
        )
    with metric_col:
        st.markdown("### 현재 판정")
        _render_metrics(st.session_state["nav_results"])


import requests  # noqa: E402 — needed for exception handling above
main()
