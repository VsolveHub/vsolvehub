"""The Customer's answers, as the lead reads them on a crew offer.

A crew offer used to carry a headcount, a day count, the money and an area name — and nothing the
Customer had actually said. A lead accepted "6 people for 1 day, Kondapur" without knowing whether
it was a wedding, a demolition or a corporate lunch, and the questions the booking screen asked
were answered into a column nobody downstream read.

This projects those answers into labelled lines using the **configuration's own question schema**,
so the words on the offer are the words the catalogue published: option codes become option labels,
booleans become Yes/No, and nothing here knows one service's vocabulary. The two sizing codes are
left out because the offer already carries them as `headcount` and `days`, and a zero count is left
out because "0 bartenders" is not a fact a lead needs to plan around.
"""

from dataclasses import dataclass
from typing import Any

from apps.requirements.models import CustomerRequirement

#: The answers the offer already publishes as first-class fields. Repeating them as text would put
#: the same number on the screen twice, once formatted by the client and once by this projection.
SIZE_CODES = frozenset({"worker_count", "duration_days"})


@dataclass(frozen=True, slots=True)
class BriefLine:
    code: str
    #: The question as the catalogue phrased it. Named `question` rather than `label` on the wire
    #: because DRF's `Field` already owns a `label` attribute and a serializer field of that name
    #: shadows it.
    question: str
    value: str


def _option_label(definition: dict[str, Any], value: object) -> str:
    for option in definition.get("options") or ():
        if isinstance(option, dict) and option.get("code") == value:
            label = option.get("label")
            if isinstance(label, str) and label.strip():
                return label.strip()
    return str(value)


def _render_integer(_definition: dict[str, Any], value: object) -> str | None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return str(value)


def _render_boolean(_definition: dict[str, Any], value: object) -> str | None:
    if not isinstance(value, bool):
        return None
    return "Yes" if value else "No"


def _render_select(definition: dict[str, Any], value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return _option_label(definition, value)


def _render_text(_definition: dict[str, Any], value: object) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip() or None


_RENDERERS = {
    "INTEGER": _render_integer,
    "BOOLEAN": _render_boolean,
    "SELECT": _render_select,
    "TEXT": _render_text,
}


def _render(definition: dict[str, Any], value: object) -> str | None:
    renderer = _RENDERERS.get(str(definition.get("kind")), _render_text)
    return renderer(definition, value)


def brief_lines(requirement: CustomerRequirement) -> list[BriefLine]:
    """Every answered, non-sizing question, in the catalogue's own order and words.

    Empty when the requirement carries no configuration or no answers: an older draft, or a
    service whose form asks nothing beyond a size. Empty is honest — the lead sees the headcount
    and the days, which is everything that was said.
    """
    configuration = requirement.configuration
    if configuration is None:
        return []
    schema = configuration.question_schema or {}
    definitions = schema.get("questions") if isinstance(schema, dict) else None
    if not isinstance(definitions, list):
        return []
    answers = requirement.answers if isinstance(requirement.answers, dict) else {}

    lines: list[BriefLine] = []
    for definition in definitions:
        if not isinstance(definition, dict):
            continue
        code = definition.get("code")
        if not isinstance(code, str) or code in SIZE_CODES or code not in answers:
            continue
        rendered = _render(definition, answers[code])
        if rendered is None:
            continue
        label = definition.get("label")
        lines.append(
            BriefLine(
                code=code,
                question=label.strip() if isinstance(label, str) and label.strip() else code,
                value=rendered,
            )
        )
    return lines
