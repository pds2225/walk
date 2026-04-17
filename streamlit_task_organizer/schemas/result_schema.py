"""Core result schema used across UI, parser, and export layers."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class ContactInfo:
    emails: list[str] = field(default_factory=list)
    phones: list[str] = field(default_factory=list)


@dataclass
class ConfidenceScores:
    title: float = 0.0
    due_date: float = 0.0
    checklist: float = 0.0
    contacts: float = 0.0
    organization: float = 0.0
    category: float = 0.0


@dataclass
class ParsedTaskResult:
    title: str
    due_date: str | None
    task_summary: str
    category: str
    organization: str | None
    memo: str
    contacts: ContactInfo = field(default_factory=ContactInfo)
    checklist: list[str] = field(default_factory=list)
    conditions: list[str] = field(default_factory=list)
    submit_method: str = "미추출"
    raw_text: str = ""
    confidence: ConfidenceScores = field(default_factory=ConfidenceScores)
    parse_logs: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ParsedTaskResult":
        contacts = ContactInfo(**data.get("contacts", {}))
        confidence = ConfidenceScores(**data.get("confidence", {}))
        return cls(
            title=data.get("title", ""),
            due_date=data.get("due_date"),
            task_summary=data.get("task_summary", ""),
            category=data.get("category", "일반안내"),
            organization=data.get("organization"),
            memo=data.get("memo", ""),
            contacts=contacts,
            checklist=list(data.get("checklist", [])),
            conditions=list(data.get("conditions", [])),
            submit_method=data.get("submit_method", "미추출"),
            raw_text=data.get("raw_text", ""),
            confidence=confidence,
            parse_logs=list(data.get("parse_logs", [])),
        )
