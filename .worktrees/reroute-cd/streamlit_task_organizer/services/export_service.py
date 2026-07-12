"""Export helpers for TXT, JSON, CSV, and copy-friendly text."""

from __future__ import annotations

import csv
import json
from io import StringIO

from streamlit_task_organizer.schemas.export_schema import ExportPayload
from streamlit_task_organizer.schemas.result_schema import ParsedTaskResult


def build_export_payload(result: ParsedTaskResult) -> ExportPayload:
    due_date = result.due_date or "미추출"
    checklist_lines = [f"- {item}" for item in result.checklist] or ["- 항목 없음"]
    txt_text = "\n".join(
        [
            f"제목: {result.title or '미입력'}",
            f"기한: {due_date}",
            f"할일: {result.task_summary or '미입력'}",
            f"카테고리: {result.category}",
            f"기관명: {result.organization or '미추출'}",
            f"메모: {result.memo or '없음'}",
            "",
            "체크리스트",
            *checklist_lines,
        ]
    )

    json_text = json.dumps(result.to_dict(), ensure_ascii=False, indent=2)

    csv_buffer = StringIO()
    fieldnames = [
        "title",
        "due_date",
        "task_summary",
        "category",
        "organization",
        "submit_method",
        "emails",
        "phones",
        "memo",
        "checklist_joined",
        "conditions_joined",
    ]
    writer = csv.DictWriter(csv_buffer, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerow(
        {
            "title": result.title,
            "due_date": result.due_date or "",
            "task_summary": result.task_summary,
            "category": result.category,
            "organization": result.organization or "",
            "submit_method": result.submit_method,
            "emails": " | ".join(result.contacts.emails),
            "phones": " | ".join(result.contacts.phones),
            "memo": result.memo,
            "checklist_joined": " | ".join(result.checklist),
            "conditions_joined": " | ".join(result.conditions),
        }
    )

    return ExportPayload(
        clipboard_text=txt_text,
        txt_text=txt_text,
        json_text=json_text,
        csv_text=csv_buffer.getvalue(),
    )
