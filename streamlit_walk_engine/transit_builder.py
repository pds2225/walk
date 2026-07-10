"""Transit + walking journey builder for the Streamlit walk app.

The deviation engine is intentionally bound only to hydrated walking legs.
Transit legs are display-only cards because underground or in-vehicle GPS is
not reliable enough for route-deviation alerts.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Literal

import requests

sys.path.insert(0, str(Path(__file__).parent))

import gps_filter
import route_builder
from engine import Coordinate, RouteModel, distance_meters
from route_builder import RouteInfo, fetch_walking_route_with_engine

LegMode = Literal["walk", "subway", "bus", "transfer"]

_TMAP_TRANSIT = "https://apis.openapi.sk.com/transit/routes"
_ODSAY_TRANSIT = "https://api.odsay.com/v1/api/searchPubTransPathT"
_ENV_SHARED = Path(r"D:\_secure\.env.shared")
_TIMEOUT = 8


@dataclass(frozen=True)
class TransitInfo:
    mode: Literal["subway", "bus"]
    line_name: str
    board_station: str
    alight_station: str
    station_count: int
    distance_meters: int | None
    time_seconds: int | None
    display_polyline: tuple[Coordinate, ...] = ()


@dataclass(frozen=True)
class JourneyLeg:
    mode: LegMode
    start: Coordinate
    end: Coordinate
    start_label: str
    end_label: str
    tracked: bool = False
    route: RouteModel | None = None
    route_info: RouteInfo | None = None
    walk_engine_label: str | None = None
    transit: TransitInfo | None = None


@dataclass(frozen=True)
class Journey:
    legs: tuple[JourneyLeg, ...]
    source: str
    total_distance_meters: int | None = None
    total_time_seconds: int | None = None


def _as_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _minutes_to_seconds(value: Any) -> int | None:
    minutes = _as_int(value)
    return None if minutes is None else minutes * 60


def _seconds(value: Any) -> int | None:
    return _as_int(value)


def _label(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    return text or fallback


def _coord_from_mapping(data: dict[str, Any]) -> Coordinate | None:
    lat = (
        data.get("lat")
        if data.get("lat") is not None else
        data.get("latitude")
        if data.get("latitude") is not None else
        data.get("y")
    )
    lon = (
        data.get("lon")
        if data.get("lon") is not None else
        data.get("lng")
        if data.get("lng") is not None else
        data.get("longitude")
        if data.get("longitude") is not None else
        data.get("x")
    )
    if lat is None or lon is None:
        return None
    try:
        return Coordinate(latitude=float(lat), longitude=float(lon))
    except (TypeError, ValueError):
        return None


def _coord_from_prefixed(data: dict[str, Any], prefix: str) -> Coordinate | None:
    return _coord_from_mapping({
        "x": data.get(f"{prefix}X") or data.get(f"{prefix}_x") or data.get(f"{prefix}Lon"),
        "y": data.get(f"{prefix}Y") or data.get(f"{prefix}_y") or data.get(f"{prefix}Lat"),
    })


def _polyline_from_any(value: Any) -> tuple[Coordinate, ...]:
    if not isinstance(value, list):
        return ()
    out: list[Coordinate] = []
    for item in value:
        coord: Coordinate | None = None
        if isinstance(item, dict):
            coord = _coord_from_mapping(item)
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            try:
                coord = Coordinate(latitude=float(item[1]), longitude=float(item[0]))
            except (TypeError, ValueError):
                coord = None
        if coord is not None:
            out.append(coord)
    return tuple(out)


def _station_count(value: Any) -> int:
    explicit = _as_int(value)
    return explicit if explicit is not None else 0


def _line_name_from_lane(value: Any) -> str:
    if isinstance(value, list) and value:
        first = value[0]
        if isinstance(first, dict):
            return _label(first.get("name") or first.get("busNo"), "대중교통")
        return _label(first, "대중교통")
    if isinstance(value, dict):
        return _label(value.get("name") or value.get("busNo"), "대중교통")
    return "대중교통"


def _journey_with_default_labels(journey: Journey) -> Journey:
    if not journey.legs:
        return journey
    legs = list(journey.legs)
    first = legs[0]
    last = legs[-1]
    if first.start_label == "":
        legs[0] = replace(first, start_label="출발")
    if last.end_label == "":
        legs[-1] = replace(last, end_label="도착")
    return replace(journey, legs=tuple(legs))


def parse_tmap_transit(payload: dict[str, Any]) -> Journey:
    """Parse a provisional TMAP transit payload into a display journey.

    PROVISIONAL CONTRACT: this parser is intentionally tolerant and uses mock
    payloads until one real TMAP transit response is captured for this app.
    """
    plan = payload.get("metaData", {}).get("plan", {})
    itineraries = plan.get("itineraries") or payload.get("itineraries") or payload.get("routes") or []
    if not itineraries:
        raise ValueError("TMAP 대중교통 경로가 없습니다.")
    itinerary = itineraries[0]
    raw_legs = itinerary.get("legs") or []
    if not raw_legs:
        raise ValueError("TMAP 대중교통 구간이 없습니다.")

    legs: list[JourneyLeg] = []
    for index, raw_leg in enumerate(raw_legs):
        mode_text = str(raw_leg.get("mode") or raw_leg.get("type") or "").lower()
        mode: LegMode
        if "walk" in mode_text:
            mode = "walk"
        elif "subway" in mode_text or "rail" in mode_text:
            mode = "subway"
        elif "bus" in mode_text:
            mode = "bus"
        else:
            mode = "transfer"

        start_data = raw_leg.get("start") or {}
        end_data = raw_leg.get("end") or {}
        start = _coord_from_mapping(start_data) or _coord_from_prefixed(raw_leg, "start")
        end = _coord_from_mapping(end_data) or _coord_from_prefixed(raw_leg, "end")
        if start is None or end is None:
            raise ValueError("TMAP 대중교통 좌표가 없습니다.")

        start_label = _label(start_data.get("name") or raw_leg.get("startName"), "출발" if index == 0 else "")
        end_label = _label(end_data.get("name") or raw_leg.get("endName"), "도착")
        distance = _as_int(raw_leg.get("distance") or raw_leg.get("sectionDistance"))
        time_seconds = _seconds(raw_leg.get("time") or raw_leg.get("sectionTime") or raw_leg.get("duration"))

        if mode in ("subway", "bus"):
            stop_list = raw_leg.get("passStopList") or {}
            stations = stop_list.get("stationList") if isinstance(stop_list, dict) else None
            station_count = _station_count(raw_leg.get("stationCount"))
            if station_count == 0 and isinstance(stations, list):
                station_count = len(stations)
            transit = TransitInfo(
                mode=mode,
                line_name=_label(
                    raw_leg.get("route")
                    or raw_leg.get("routeName")
                    or raw_leg.get("lineName")
                    or raw_leg.get("laneName"),
                    "지하철" if mode == "subway" else "버스",
                ),
                board_station=start_label,
                alight_station=end_label,
                station_count=station_count,
                distance_meters=distance,
                time_seconds=time_seconds,
                display_polyline=_polyline_from_any(raw_leg.get("points") or raw_leg.get("passShape")),
            )
        else:
            transit = None

        legs.append(JourneyLeg(
            mode=mode,
            start=start,
            end=end,
            start_label=start_label,
            end_label=end_label,
            transit=transit,
        ))

    return _journey_with_default_labels(Journey(
        legs=tuple(legs),
        source="TMAP 대중교통",
        total_distance_meters=_as_int(itinerary.get("totalDistance") or plan.get("totalDistance")),
        total_time_seconds=_seconds(itinerary.get("totalTime") or plan.get("totalTime")),
    ))


def parse_odsay_transit(
    payload: dict[str, Any],
    origin: Coordinate | None = None,
    dest: Coordinate | None = None,
) -> Journey:
    """Parse an ODsay searchPubTransPathT response.

    실제 ODsay 응답은 **도보(trafficType=3) 구간에 좌표를 주지 않는다**(지하철·버스
    구간에만 startX/Y·endX/Y가 있음). 대부분의 여정이 '출발지→첫 역 도보'로 시작하므로,
    도보 구간의 좌표를 인접 대중교통 구간과 여정 양끝(origin/dest)에서 보간하지 않으면
    사실상 모든 실제 응답이 실패한다. origin/dest 는 그 보간용(없으면 기존처럼 엄격).
    """
    result = payload.get("result", payload)
    paths = result.get("path") or []
    if not paths:
        raise ValueError("ODsay 대중교통 경로가 없습니다.")
    path = paths[0]
    raw_legs = path.get("subPath") or []
    if not raw_legs:
        raise ValueError("ODsay 대중교통 구간이 없습니다.")

    # ── 좌표 보간(2-pass) ────────────────────────────────────────────────────
    # 1) end 없으면 다음 구간의 start(없으면 여정 목적지)로, 2) start 없으면 이전
    #    구간의 end(없으면 여정 출발지)로 채운다. 연속 도보 구간까지 커버하도록 3) 보정.
    count = len(raw_legs)
    raw_starts = [_coord_from_prefixed(rl, "start") for rl in raw_legs]
    raw_ends = [_coord_from_prefixed(rl, "end") for rl in raw_legs]
    starts: list[Coordinate | None] = list(raw_starts)
    ends: list[Coordinate | None] = list(raw_ends)
    for i in range(count):
        if ends[i] is None:
            ends[i] = raw_starts[i + 1] if i + 1 < count else dest
    for i in range(count):
        if starts[i] is None:
            starts[i] = ends[i - 1] if i > 0 else origin
    for i in range(count):
        if ends[i] is None and i + 1 < count:
            ends[i] = starts[i + 1]

    legs: list[JourneyLeg] = []
    for index, raw_leg in enumerate(raw_legs):
        traffic_type = _as_int(raw_leg.get("trafficType"))
        mode: LegMode = "walk"
        if traffic_type == 1:
            mode = "subway"
        elif traffic_type == 2:
            mode = "bus"
        elif traffic_type == 3:
            mode = "walk"
        elif traffic_type is not None:
            mode = "transfer"

        start, end = starts[index], ends[index]
        if start is None or end is None:
            raise ValueError("ODsay 대중교통 좌표가 없습니다.")

        start_label = _label(raw_leg.get("startName"), "출발" if index == 0 else "")
        end_label = _label(raw_leg.get("endName"), "도착")
        distance = _as_int(raw_leg.get("distance"))
        time_seconds = _minutes_to_seconds(raw_leg.get("sectionTime"))

        transit: TransitInfo | None = None
        if mode in ("subway", "bus"):
            transit = TransitInfo(
                mode=mode,
                line_name=_line_name_from_lane(raw_leg.get("lane")),
                board_station=start_label,
                alight_station=end_label,
                station_count=_station_count(raw_leg.get("stationCount")),
                distance_meters=distance,
                time_seconds=time_seconds,
                display_polyline=_polyline_from_any(raw_leg.get("points") or raw_leg.get("passShape")),
            )

        legs.append(JourneyLeg(
            mode=mode,
            start=start,
            end=end,
            start_label=start_label,
            end_label=end_label,
            transit=transit,
        ))

    info = path.get("info") or {}
    return _journey_with_default_labels(Journey(
        legs=tuple(legs),
        source="ODsay",
        total_distance_meters=_as_int(info.get("totalDistance")),
        total_time_seconds=_minutes_to_seconds(info.get("totalTime")),
    ))


def _fetch_tmap_transit_raw(origin: Coordinate, dest: Coordinate, app_key: str) -> dict[str, Any]:
    resp = requests.post(
        _TMAP_TRANSIT,
        headers={"appKey": app_key, "Content-Type": "application/json", "Accept": "application/json"},
        json={
            # TMAP 문서는 좌표를 문자열로 명세 — 운영 검증된 보행자 API와 동일 포맷 사용
            "startX": f"{origin.longitude:.8f}",
            "startY": f"{origin.latitude:.8f}",
            "endX": f"{dest.longitude:.8f}",
            "endY": f"{dest.latitude:.8f}",
            "format": "json",
        },
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def _fetch_odsay_transit_raw(origin: Coordinate, dest: Coordinate, api_key: str) -> dict[str, Any]:
    resp = requests.get(
        _ODSAY_TRANSIT,
        params={
            "SX": origin.longitude,
            "SY": origin.latitude,
            "EX": dest.longitude,
            "EY": dest.latitude,
            "apiKey": api_key,
        },
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def _read_shared_key(name: str) -> str | None:
    if not _ENV_SHARED.is_file():
        return None
    try:
        for line in _ENV_SHARED.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped.startswith(f"{name}="):
                value = stripped.partition("=")[2].strip()
                return value or None
    except OSError:
        return None
    return None


def _odsay_api_key() -> str | None:
    key = os.environ.get("ODSAY_API_KEY", "").strip()
    if key:
        return key
    try:
        import streamlit as st
        key = str(st.secrets.get("ODSAY_API_KEY", "") or "").strip()
        if key:
            return key
    except Exception:
        pass
    return _read_shared_key("ODSAY_API_KEY")


DOWNGRADE_NO_KEY = "도보 강등(키 없음)"
DOWNGRADE_FAILED = "도보 강등(대중교통 경로 실패)"


def build_walking_only_journey(
    origin: Coordinate, dest: Coordinate, source: str = DOWNGRADE_NO_KEY,
) -> Journey:
    return Journey(
        legs=(JourneyLeg(
            mode="walk",
            start=origin,
            end=dest,
            start_label="출발",
            end_label="도착",
        ),),
        source=source,
    )


def _hydrate_walk_legs(journey: Journey) -> Journey:
    hydrated: list[JourneyLeg] = []
    total_distance = journey.total_distance_meters
    total_time = journey.total_time_seconds
    for leg in journey.legs:
        if leg.mode != "walk":
            hydrated.append(leg)
            continue
        try:
            route, label, info = fetch_walking_route_with_engine(leg.start, leg.end)
            hydrated.append(replace(
                leg,
                tracked=True,
                route=route,
                route_info=info,
                walk_engine_label=label,
            ))
            if len(journey.legs) == 1:
                total_distance = info.total_distance_meters
                total_time = info.total_time_seconds
        except Exception:
            hydrated.append(replace(
                leg,
                tracked=False,
                route=None,
                route_info=None,
                walk_engine_label=None,
            ))
    return replace(journey, legs=tuple(hydrated), total_distance_meters=total_distance, total_time_seconds=total_time)


def fetch_transit_journey(origin: Coordinate, dest: Coordinate) -> Journey:
    """Fetch transit journey with TMAP → ODsay → walking-only fallback.

    Network/API/key errors never propagate to the UI. The app always receives a
    Journey object and can render a safe fallback.
    """
    app_key_getter = getattr(route_builder, "_tmap_app_key", lambda: None)
    app_key = app_key_getter()

    if app_key:
        try:
            return _hydrate_walk_legs(parse_tmap_transit(_fetch_tmap_transit_raw(origin, dest, app_key)))
        except Exception:
            pass

    # TMAP 성공 시엔 여기 오지 않으므로, 키 조회를 미뤄 불필요한 .env/secrets 읽기를 피한다.
    odsay_key = _odsay_api_key()
    if odsay_key:
        try:
            # origin/dest 를 넘겨 좌표 없는 도보 구간을 보간한다(ODsay 실제 응답 대응).
            raw = _fetch_odsay_transit_raw(origin, dest, odsay_key)
            return _hydrate_walk_legs(parse_odsay_transit(raw, origin=origin, dest=dest))
        except Exception:
            pass

    # 키가 아예 없어서 강등된 것과, 키는 있는데 호출·파싱이 실패해 강등된 것을 구분한다
    # (UI가 '키 없음'이라고 잘못 안내하지 않도록).
    source = DOWNGRADE_FAILED if (app_key or odsay_key) else DOWNGRADE_NO_KEY
    return _hydrate_walk_legs(build_walking_only_journey(origin, dest, source=source))


def is_last_leg(journey: Journey, active_index: int) -> bool:
    return active_index >= len(journey.legs) - 1


def advance_leg(
    journey: Journey,
    active_index: int,
    origin: Coordinate,
    accuracy_m: float | None,
) -> int:
    """Advance after tracked walking legs only; never auto-advance transit legs."""
    if active_index < 0 or active_index >= len(journey.legs):
        return active_index
    if is_last_leg(journey, active_index):
        return active_index
    leg = journey.legs[active_index]
    if leg.mode != "walk" or not leg.tracked:
        return active_index
    if gps_filter.is_arrival(distance_meters(origin, leg.end), accuracy_m):
        return active_index + 1
    return active_index
