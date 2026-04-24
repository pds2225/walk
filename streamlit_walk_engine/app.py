"""Walk - 경로이탈 감지 엔진 Streamlit 시뮬레이터."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

if __package__:
    from .engine import EngineConfig, EngineResult, RouteDeviationEngine
    from .scenarios import ORIGIN, Scenario, get_scenarios
else:
    sys.path.insert(0, str(Path(__file__).parent))
    from engine import EngineConfig, EngineResult, RouteDeviationEngine
    from scenarios import ORIGIN, Scenario, get_scenarios

st.set_page_config(
    page_title="Walk 경로이탈 시뮬레이터",
    page_icon="🚶",
    layout="wide",
)

STATE_COLOR = {
    "on_route": "#27ae60",
    "drifting": "#f39c12",
    "deviated": "#e74c3c",
    "passed_turn": "#8e44ad",
}
STATE_LABEL = {
    "on_route": "경로 유지",
    "drifting": "이탈 시작",
    "deviated": "경로 이탈",
    "passed_turn": "회전 미이행",
}
ACTION_LABEL = {
    "none": "정상",
    "monitor": "모니터링 중",
    "warn_user": "경고",
    "reroute_candidate": "재탐색 필요",
}
ACTION_COLOR = {
    "none": "#27ae60",
    "monitor": "#f39c12",
    "warn_user": "#e67e22",
    "reroute_candidate": "#e74c3c",
}
REASON_KO = {
    "within_route_corridor": "경로 내",
    "distance_over_drift_threshold": "이탈 거리 초과",
    "distance_over_deviation_threshold": "이탈 확정 거리 초과",
    "strong_distance_breach": "강한 거리 위반",
    "heading_conflicts_with_route": "방향 불일치",
    "persistent_threshold_breach": "연속 위반",
    "sustained_drift_duration": "지속 이탈",
    "entered_turn_approach_zone": "회전 접근 구역",
    "missed_expected_turn": "회전 미이행",
    "continued_past_turn_in_conflicting_direction": "회전점 이후 역방향 직진",
}


def to_local(lat: float, lng: float) -> tuple[float, float]:
    cos_lat = math.cos(math.radians(ORIGIN.latitude))
    east = (lng - ORIGIN.longitude) * 111_111.0 * cos_lat
    north = (lat - ORIGIN.latitude) * 111_111.0
    return east, north


def apply_styles() -> None:
    st.markdown(
        """
        <style>
        .state-badge {
            display: inline-block;
            padding: 10px 18px;
            border-radius: 10px;
            color: white;
            font-weight: bold;
            font-size: 1.05rem;
            text-align: center;
            width: 100%;
            margin-bottom: 6px;
        }
        .action-badge {
            display: inline-block;
            padding: 7px 14px;
            border-radius: 8px;
            color: white;
            font-size: 0.88rem;
            text-align: center;
            width: 100%;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def build_figure(scenario: Scenario, results: list[EngineResult], step: int) -> go.Figure:
    fig = go.Figure()

    # Route polyline
    re = [to_local(c.latitude, c.longitude)[0] for c in scenario.route.polyline]
    rn = [to_local(c.latitude, c.longitude)[1] for c in scenario.route.polyline]
    fig.add_trace(go.Scatter(
        x=re, y=rn,
        mode="lines",
        line=dict(color="#2980b9", width=5),
        name="경로",
    ))

    # Drift corridor band (10 m rectangle around route — simplified for horizontal segments)
    if len(re) >= 2:
        fig.add_shape(
            type="rect",
            x0=min(re), x1=max(re),
            y0=min(rn) - 10, y1=max(rn) + 10,
            fillcolor="rgba(41,128,185,0.07)",
            line=dict(color="rgba(41,128,185,0.2)", width=1, dash="dot"),
            layer="below",
        )

    # Route start marker
    fig.add_trace(go.Scatter(
        x=[re[0]], y=[rn[0]],
        mode="markers+text",
        marker=dict(symbol="circle", size=12, color="#2980b9"),
        text=["출발"],
        textposition="bottom center",
        name="출발",
        showlegend=False,
    ))
    fig.add_trace(go.Scatter(
        x=[re[-1]], y=[rn[-1]],
        mode="markers+text",
        marker=dict(symbol="square", size=12, color="#2980b9"),
        text=["도착"],
        textposition="top center",
        name="도착",
        showlegend=False,
    ))

    # Turn points
    for tp in scenario.route.turn_points:
        te, tn = to_local(tp.coordinate.latitude, tp.coordinate.longitude)
        fig.add_trace(go.Scatter(
            x=[te], y=[tn],
            mode="markers+text",
            marker=dict(symbol="triangle-up", size=18, color="#e67e22",
                        line=dict(color="white", width=2)),
            text=["↰ 회전"],
            textposition="top center",
            name="회전 지점",
            showlegend=True,
        ))

    # Sample path connecting line
    if len(results) > 1:
        path_e = [to_local(s.latitude, s.longitude)[0] for s in scenario.samples[:step]]
        path_n = [to_local(s.latitude, s.longitude)[1] for s in scenario.samples[:step]]
        fig.add_trace(go.Scatter(
            x=path_e, y=path_n,
            mode="lines",
            line=dict(color="rgba(80,80,80,0.35)", width=1.5, dash="dot"),
            showlegend=False,
        ))

    # Position samples
    for i, (result, sample) in enumerate(zip(results, scenario.samples[:step])):
        se, sn = to_local(sample.latitude, sample.longitude)
        is_last = (i == len(results) - 1)
        fig.add_trace(go.Scatter(
            x=[se], y=[sn],
            mode="markers",
            marker=dict(
                color=STATE_COLOR[result.state],
                size=20 if is_last else 13,
                line=dict(color="white", width=2.5 if is_last else 1.5),
                opacity=1.0 if is_last else 0.75,
            ),
            name=STATE_LABEL[result.state],
            showlegend=False,
            hovertemplate=(
                f"<b>샘플 {i + 1}</b><br>"
                f"상태: <b>{STATE_LABEL[result.state]}</b><br>"
                f"경로 거리: {result.metrics.distance_from_route_meters:.1f} m<br>"
                f"헤딩 차이: {result.metrics.heading_difference_degrees:.0f}°<br>"
                f"이탈 점수: {result.score:.3f}<br>"
                f"권장 조치: {ACTION_LABEL[result.suggested_next_action]}"
                "<extra></extra>"
            ),
        ))

    # Legend entries for states
    for state, color in STATE_COLOR.items():
        fig.add_trace(go.Scatter(
            x=[None], y=[None],
            mode="markers",
            marker=dict(color=color, size=10),
            name=STATE_LABEL[state],
        ))

    fig.update_layout(
        height=460,
        margin=dict(l=0, r=0, t=10, b=0),
        xaxis=dict(
            title="동 방향 (m)",
            gridcolor="#f0f0f0",
            zeroline=True,
            zerolinecolor="#ccc",
        ),
        yaxis=dict(
            title="북 방향 (m)",
            gridcolor="#f0f0f0",
            zeroline=True,
            zerolinecolor="#ccc",
            scaleanchor="x",
            scaleratio=1,
        ),
        plot_bgcolor="white",
        paper_bgcolor="white",
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            bgcolor="rgba(255,255,255,0.85)",
            bordercolor="#ddd",
            borderwidth=1,
        ),
        hovermode="closest",
    )
    return fig


def render_metrics(results: list[EngineResult]) -> None:
    if not results:
        st.info("슬라이더를 움직여 샘플을 추가하세요.")
        return

    last = results[-1]
    state_color = STATE_COLOR[last.state]
    action_color = ACTION_COLOR[last.suggested_next_action]

    st.markdown(
        f'<div class="state-badge" style="background:{state_color}">'
        f'{STATE_LABEL[last.state]}</div>',
        unsafe_allow_html=True,
    )
    st.markdown(
        f'<div class="action-badge" style="background:{action_color}">'
        f'🔔 {ACTION_LABEL[last.suggested_next_action]}</div>',
        unsafe_allow_html=True,
    )

    st.divider()
    st.metric("이탈 점수", f"{last.score:.3f}")
    st.metric("경로까지 거리", f"{last.metrics.distance_from_route_meters:.1f} m")
    st.metric("헤딩 차이", f"{last.metrics.heading_difference_degrees:.0f}°")
    st.metric("연속 위반 횟수", f"{last.metrics.consecutive_threshold_breaches}")

    if last.metrics.drift_duration_ms > 0:
        st.metric("이탈 지속 시간", f"{last.metrics.drift_duration_ms / 1000:.1f} 초")
    if last.metrics.distance_to_next_turn_point_meters is not None:
        st.metric("다음 회전까지", f"{last.metrics.distance_to_next_turn_point_meters:.1f} m")
    if last.metrics.distance_past_turn_point_meters is not None:
        st.metric("회전점 초과 거리", f"{last.metrics.distance_past_turn_point_meters:.1f} m")

    st.divider()
    st.markdown("**판정 이유**")
    for r in last.reasons:
        st.markdown(f"- {REASON_KO.get(r, r)}")


def render_table(results: list[EngineResult], scenario: Scenario, step: int) -> None:
    if not results:
        return

    rows = []
    for i, (r, s) in enumerate(zip(results, scenario.samples[:step])):
        pos = scenario.positions[i]
        rows.append({
            "샘플": i + 1,
            "위치 (동, 북)": f"({pos[0]:.0f}m, {pos[1]:.0f}m)",
            "상태": STATE_LABEL[r.state],
            "점수": f"{r.score:.3f}",
            "경로 거리": f"{r.metrics.distance_from_route_meters:.1f} m",
            "헤딩 차이": f"{r.metrics.heading_difference_degrees:.0f}°",
            "권장 조치": ACTION_LABEL[r.suggested_next_action],
        })

    df = pd.DataFrame(rows)
    st.dataframe(df, width="stretch", hide_index=True)


def format_expected_states(scenario: Scenario) -> str:
    return " → ".join(STATE_LABEL[state] for state in scenario.expected_states)


def main() -> None:
    apply_styles()

    st.markdown("## 🚶 Walk — 경로이탈 감지 엔진 시뮬레이터")
    st.caption("경로이탈 엔진에 위치 샘플을 순차 입력해 상태 판정을 실시간으로 시각화합니다.")

    scenarios = get_scenarios()

    with st.sidebar:
        st.header("시나리오")
        selected = st.selectbox(
            "시나리오 선택",
            range(len(scenarios)),
            format_func=lambda i: scenarios[i].name,
        )
        scenario = scenarios[selected]
        st.caption(f"시나리오 코드: `{scenario.key}`")
        st.caption(scenario.description)
        st.markdown(f"**예상 상태 흐름:** {format_expected_states(scenario)}")

        st.divider()
        st.header("단계 제어")
        max_step = len(scenario.samples)
        step = st.slider("표시할 샘플 수", 0, max_step, max_step)

        st.divider()
        st.header("엔진 임계값")
        drift_t = st.slider("이탈 시작 거리 (m)", 5, 20, 10)
        dev_t = st.slider("이탈 확정 거리 (m)", 10, 30, 15)
        min_consec = st.slider("최소 연속 샘플", 1, 5, 3)
        min_dur = st.slider("최소 이탈 지속 (ms)", 1000, 8000, 4000, step=500)

    config = EngineConfig(
        route_drift_distance_threshold_meters=float(drift_t),
        route_deviation_distance_threshold_meters=float(dev_t),
        minimum_consecutive_samples_for_deviation=min_consec,
        minimum_drift_duration_ms=min_dur,
    )

    engine = RouteDeviationEngine(scenario.route, config)
    results: list[EngineResult] = [engine.process_sample(s) for s in scenario.samples[:step]]

    plot_col, metric_col = st.columns([3, 1], gap="large")

    with plot_col:
        fig = build_figure(scenario, results, step)
        st.plotly_chart(fig, width="stretch")

    with metric_col:
        st.markdown("### 현재 판정")
        render_metrics(results)

    st.divider()
    st.markdown("### 샘플별 판정 결과")
    render_table(results, scenario, step)


main()
