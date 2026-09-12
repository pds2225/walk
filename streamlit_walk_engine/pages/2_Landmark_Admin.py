"""현장 검수용 로컬 랜드마크 관리 화면."""

from __future__ import annotations

import mimetypes
import sys
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).parent.parent))

from landmark_store import (  # noqa: E402
    LandmarkRepository,
    default_photo_dir,
    normalize_landmark_id,
)
from landmark_photo import strip_image_location_metadata  # noqa: E402
from landmarks import (  # noqa: E402
    LANDMARK_CATEGORIES,
    LANDMARK_STATUSES,
    Landmark,
    landmark_completeness,
)

_MAX_PHOTO_BYTES = 5 * 1024 * 1024
_PHOTO_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
_ACCESSIBILITY_OPTIONS = (
    "step_free",
    "elevator",
    "tactile_paving",
    "accessible_toilet",
    "low_slope",
    "stairs",
    "steep_slope",
    "construction",
    "unknown",
)


def _parse_directions(raw: str) -> tuple[float, ...]:
    if not raw.strip():
        return ()
    values = tuple(float(item.strip()) % 360 for item in raw.split(",") if item.strip())
    if len(values) > 8:
        raise ValueError("가시 방향은 최대 8개까지 입력하세요.")
    return values


def _save_photo(uploaded, landmark_id: str) -> str:
    suffix = Path(uploaded.name).suffix.lower()
    if suffix not in _PHOTO_SUFFIXES:
        raise ValueError("사진은 JPG, PNG, WEBP만 지원합니다.")
    data = uploaded.getvalue()
    if len(data) > _MAX_PHOTO_BYTES:
        raise ValueError("사진은 5MB 이하여야 합니다.")
    expected_mime, _ = mimetypes.guess_type(f"photo{suffix}")
    if uploaded.type and expected_mime and not uploaded.type.startswith("image/"):
        raise ValueError("이미지 파일 형식이 아닙니다.")
    cleaned, stripped = strip_image_location_metadata(data, suffix)
    if stripped:
        data = cleaned
    directory = default_photo_dir()
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"{normalize_landmark_id(landmark_id)}{suffix}"
    target = directory / filename
    target.write_bytes(data)
    return f"data/landmark_photos/{filename}"


def _empty_values() -> dict:
    return {
        "id": "",
        "name": "",
        "category": "building",
        "latitude": 37.5665,
        "longitude": 126.9780,
        "entrance_description": "",
        "photo_url": "",
        "photo_alt": "",
        "visible_from_degrees": (),
        "visibility_score": 0.5,
        "permanence_score": 0.5,
        "distinctiveness_score": 0.5,
        "accessibility_tags": (),
        "source": "field_manual",
        "verified_at": "",
        "status": "draft",
        "condition_notes": "",
        "updated_at": "",
    }


def main() -> None:
    st.set_page_config(page_title="랜드마크 현장 관리", page_icon="📍", layout="wide")
    st.title("📍 랜드마크 현장 관리")
    st.warning(
        "현재 화면은 인증 없는 로컬 MVP입니다. 인터넷에 공개 배포하지 말고 현장 데이터 "
        "구축·선정 엔진 검증에만 사용하세요."
    )

    repository = LandmarkRepository()
    try:
        landmarks = repository.load()
    except (OSError, ValueError) as exc:
        st.error(f"랜드마크 데이터를 읽지 못했습니다: {exc}")
        st.stop()

    approved_count = sum(item.status == "approved" for item in landmarks)
    incomplete = [
        item for item in landmarks
        if item.status != "approved" and not landmark_completeness(item)["complete"]
    ]
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("전체", len(landmarks))
    c2.metric("승인", approved_count)
    c3.metric("검수 필요", len(landmarks) - approved_count)
    c4.metric("필수항목 미완", len(incomplete))
    st.caption(f"운영 데이터: `{repository.path}`")
    st.info(
        "현장 승인 순서: draft 등록 → 사진·출입구·가시방향 채움 → 이중 검수 → approved. "
        "데모/합성 출처는 기본으로 승인할 수 없습니다."
    )

    if landmarks:
        st.dataframe(
            [
                {
                    "ID": item.id,
                    "명칭": item.name,
                    "분류": item.category,
                    "상태": item.status,
                    "사진": "있음" if item.photo_url else "없음",
                    "검증일": item.verified_at or "-",
                    "상태 메모": item.condition_notes,
                }
                for item in landmarks
            ],
            width="stretch",
            hide_index=True,
        )

    by_id = {item.id: item for item in landmarks}
    selected_id = st.selectbox(
        "편집할 랜드마크",
        ["__new__", *sorted(by_id)],
        format_func=lambda value: "➕ 새 랜드마크" if value == "__new__"
        else f"{by_id[value].name} ({value})",
    )
    current = _empty_values() if selected_id == "__new__" else by_id[selected_id].to_dict()
    if selected_id != "__new__":
        report = landmark_completeness(by_id[selected_id])
        if report["complete"]:
            st.success("승인 필수 항목이 채워져 있습니다.")
        else:
            st.warning("미완 항목: " + ", ".join(report["missing"]))

    with st.form("landmark_editor", clear_on_submit=False):
        left, right = st.columns(2)
        with left:
            landmark_id = st.text_input("ID", value=current["id"], disabled=selected_id != "__new__")
            name = st.text_input("명칭", value=current["name"])
            category = st.selectbox(
                "분류",
                LANDMARK_CATEGORIES,
                index=LANDMARK_CATEGORIES.index(current["category"]),
            )
            latitude = st.number_input(
                "위도", value=float(current["latitude"]), format="%.7f"
            )
            longitude = st.number_input(
                "경도", value=float(current["longitude"]), format="%.7f"
            )
            entrance = st.text_input(
                "출입구 설명", value=current["entrance_description"],
                placeholder="예: 파란 간판 오른쪽의 두 번째 출입구",
            )
            visible_directions = st.text_input(
                "보이는 접근 방향(도, 쉼표 구분)",
                value=", ".join(str(value) for value in current["visible_from_degrees"]),
                help="0=북쪽 진행, 90=동쪽 진행, 180=남쪽 진행, 270=서쪽 진행",
            )
        with right:
            visibility = st.slider(
                "가시성", 0.0, 1.0, float(current["visibility_score"]), 0.05
            )
            permanence = st.slider(
                "영속성", 0.0, 1.0, float(current["permanence_score"]), 0.05
            )
            distinctiveness = st.slider(
                "식별 용이성", 0.0, 1.0, float(current["distinctiveness_score"]), 0.05
            )
            accessibility = st.multiselect(
                "접근성 태그",
                _ACCESSIBILITY_OPTIONS,
                default=[
                    item for item in current["accessibility_tags"]
                    if item in _ACCESSIBILITY_OPTIONS
                ],
            )
            source = st.text_input("데이터 출처", value=current["source"])
            status = st.selectbox(
                "검수 상태",
                LANDMARK_STATUSES,
                index=LANDMARK_STATUSES.index(current["status"]),
            )
            condition_notes = st.text_area(
                "폐점·공사·현장 메모", value=current["condition_notes"]
            )
            actor = st.text_input("작업자", value="local_admin")
            allow_incomplete = st.checkbox(
                "필수항목 미완이어도 approved 저장 허용", value=False
            )
            allow_non_field = st.checkbox(
                "데모·합성 출처 approved 저장 허용(테스트 전용)", value=False
            )

        photo = st.file_uploader(
            "사진 등록·교체", type=["jpg", "jpeg", "png", "webp"],
            help="최대 5MB. JPG/PNG는 업로드 시 EXIF 위치 메타데이터를 자동 제거합니다.",
        )
        photo_url = st.text_input(
            "사진 URL 또는 로컬 상대경로", value=current["photo_url"]
        )
        photo_alt = st.text_input(
            "사진 대체 설명", value=current["photo_alt"],
            placeholder="예: 흰색 외벽과 파란색 정문 간판",
        )
        submitted = st.form_submit_button("저장", type="primary", width="stretch")

    if submitted:
        try:
            normalized_id = normalize_landmark_id(landmark_id)
            saved_photo_url = _save_photo(photo, normalized_id) if photo else photo_url.strip()
            saved = repository.upsert(
                Landmark.from_dict({
                    "id": normalized_id,
                    "name": name,
                    "category": category,
                    "latitude": latitude,
                    "longitude": longitude,
                    "entrance_description": entrance,
                    "photo_url": saved_photo_url,
                    "photo_alt": photo_alt,
                    "visible_from_degrees": _parse_directions(visible_directions),
                    "visibility_score": visibility,
                    "permanence_score": permanence,
                    "distinctiveness_score": distinctiveness,
                    "accessibility_tags": accessibility,
                    "source": source,
                    "verified_at": current["verified_at"],
                    "status": status,
                    "condition_notes": condition_notes,
                }),
                actor=actor,
                allow_incomplete_approval=allow_incomplete,
                allow_non_field_approval=allow_non_field,
            )
        except (OSError, ValueError) as exc:
            st.error(f"저장하지 못했습니다: {exc}")
        else:
            st.success(f"{saved.name} 저장 완료 — 상태: {saved.status}")
            st.rerun()

    with st.expander("승인·수정 이력", expanded=False):
        history = repository.load_history()
        if history:
            st.dataframe(list(reversed(history)), width="stretch", hide_index=True)
        else:
            st.caption("아직 로컬 변경 이력이 없습니다.")


main()
