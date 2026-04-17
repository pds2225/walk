"""Export payload schema."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ExportPayload:
    clipboard_text: str
    txt_text: str
    json_text: str
    csv_text: str
