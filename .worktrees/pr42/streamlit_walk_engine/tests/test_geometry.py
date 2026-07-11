"""Unit tests for geometry functions in engine.py — mirrors geometry.test.ts."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from engine import (
    Coordinate,
    LocalPoint,
    angular_difference,
    bearing_degrees,
    distance_meters,
    normalize_heading,
    point_to_segment_distance_meters,
    project_from_local_meters,
    project_point_to_polyline_meters,
)

ORIGIN = Coordinate(latitude=37.5665, longitude=126.978)


def move(origin: Coordinate, east_meters: float, north_meters: float) -> Coordinate:
    """Test helper: shift origin by east/north offsets in meters."""
    return project_from_local_meters(origin, LocalPoint(east_meters=east_meters, north_meters=north_meters))


class TestDistanceMeters:
    def test_100m_north_within_1m(self):
        north = move(ORIGIN, 0, 100)
        result = distance_meters(ORIGIN, north)
        assert 99 < result < 101

    def test_same_point_is_zero(self):
        assert distance_meters(ORIGIN, ORIGIN) == pytest.approx(0.0, abs=1e-6)

    def test_symmetry(self):
        other = move(ORIGIN, 50, 50)
        assert distance_meters(ORIGIN, other) == pytest.approx(distance_meters(other, ORIGIN), abs=1e-6)


class TestBearingDegrees:
    def test_east_is_90(self):
        east = move(ORIGIN, 40, 0)
        assert bearing_degrees(ORIGIN, east) == pytest.approx(90, abs=1)

    def test_north_is_0(self):
        north = move(ORIGIN, 0, 40)
        assert bearing_degrees(ORIGIN, north) == pytest.approx(0, abs=1)

    def test_south_is_180(self):
        south = move(ORIGIN, 0, -40)
        assert bearing_degrees(ORIGIN, south) == pytest.approx(180, abs=1)

    def test_west_is_270(self):
        west = move(ORIGIN, -40, 0)
        assert bearing_degrees(ORIGIN, west) == pytest.approx(270, abs=1)


class TestNormalizeHeading:
    def test_negative_becomes_positive(self):
        assert normalize_heading(-30) == pytest.approx(330)

    def test_over_360_wraps(self):
        assert normalize_heading(725) == pytest.approx(5)

    def test_zero_stays_zero(self):
        assert normalize_heading(0) == pytest.approx(0)

    def test_360_becomes_0(self):
        assert normalize_heading(360) == pytest.approx(0)


class TestAngularDifference:
    def test_wraps_across_0_360_boundary(self):
        assert angular_difference(10, 350) == pytest.approx(20)

    def test_opposite_headings_are_180(self):
        assert angular_difference(90, 270) == pytest.approx(180)

    def test_negative_input_normalizes(self):
        assert angular_difference(-30, 30) == pytest.approx(60)

    def test_same_heading_is_zero(self):
        assert angular_difference(45, 45) == pytest.approx(0)

    def test_result_always_in_0_to_180(self):
        pairs = [(0, 90), (180, 359), (270, 1), (45, 225), (0, 180)]
        for a, b in pairs:
            diff = angular_difference(a, b)
            assert 0 <= diff <= 180, f"angular_difference({a}, {b}) = {diff} is out of range"


class TestPointToSegmentDistance:
    def test_perpendicular_point_midway(self):
        start = ORIGIN
        end = move(ORIGIN, 50, 0)
        point = move(ORIGIN, 25, 12)
        dist, _ = point_to_segment_distance_meters(point, start, end)
        assert dist == pytest.approx(12, abs=1)

    def test_point_beyond_end_clamps_to_endpoint(self):
        start = ORIGIN
        end = move(ORIGIN, 50, 0)
        point = move(ORIGIN, 80, 0)
        dist, _ = point_to_segment_distance_meters(point, start, end)
        assert dist == pytest.approx(30, abs=1)

    def test_degenerate_segment_returns_distance_to_point(self):
        dist, _ = point_to_segment_distance_meters(move(ORIGIN, 10, 0), ORIGIN, ORIGIN)
        assert dist == pytest.approx(10, abs=1)


class TestPointToPolylineDistance:
    def test_minimum_across_two_segments(self):
        # L-shaped route: east 50m, then north 50m
        route = (
            ORIGIN,
            move(ORIGIN, 50, 0),
            move(ORIGIN, 50, 50),
        )
        # Point is 10m east of the second waypoint
        sample = move(ORIGIN, 60, 25)
        result = project_point_to_polyline_meters(sample, route)
        assert result.distance_meters == pytest.approx(10, abs=1)

    def test_point_on_route_is_near_zero(self):
        route = (ORIGIN, move(ORIGIN, 100, 0))
        on_route = move(ORIGIN, 50, 0)
        result = project_point_to_polyline_meters(on_route, route)
        assert result.distance_meters == pytest.approx(0, abs=1)

    def test_picks_nearest_segment_index(self):
        route = (ORIGIN, move(ORIGIN, 50, 0), move(ORIGIN, 100, 0))
        near_second_segment = move(ORIGIN, 75, 5)
        result = project_point_to_polyline_meters(near_second_segment, route)
        assert result.segment_index == 1

    def test_single_coordinate_raises(self):
        with pytest.raises(ValueError):
            project_point_to_polyline_meters(ORIGIN, (ORIGIN,))
