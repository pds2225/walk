"""Sample loading helpers."""

from __future__ import annotations

from pathlib import Path

from streamlit_task_organizer.utils.constants import SAMPLE_LABELS

SAMPLES_DIR = Path(__file__).resolve().parent.parent / "samples"


def get_sample_labels() -> list[str]:
    return list(SAMPLE_LABELS.keys())


def load_sample_text(sample_label: str) -> str:
    filename = SAMPLE_LABELS.get(sample_label)
    if not filename:
        return ""
    sample_path = SAMPLES_DIR / filename
    return sample_path.read_text(encoding="utf-8")
