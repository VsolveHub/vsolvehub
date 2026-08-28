"""The Customer's answers reach the lead as labelled lines, in the catalogue's words."""

import pytest

from apps.requirements import crew_brief

from .conftest import M2World, submitted_requirement

pytestmark = pytest.mark.django_db

EVENT_SCHEMA = {
    "questions": [
        {
            "code": "event_type",
            "label": "What's the occasion?",
            "kind": "SELECT",
            "required": True,
            "options": [
                {"code": "wedding", "label": "Wedding", "description": ""},
                {"code": "other", "label": "Something else", "description": ""},
            ],
        },
        {"code": "event_description", "label": "Tell us about the event", "kind": "TEXT"},
        {"code": "waiter_count", "label": "Waiters and serving staff", "kind": "INTEGER"},
        {"code": "bar_staff_count", "label": "Bar and beverage staff", "kind": "INTEGER"},
        {"code": "worker_count", "label": "Staff", "kind": "INTEGER", "required": True},
        {"code": "duration_days", "label": "Days", "kind": "INTEGER", "required": True},
        {"code": "staff_meal_provided", "label": "Meal for the staff?", "kind": "BOOLEAN"},
    ]
}


def _with_answers(world: M2World, answers: dict[str, object]):
    requirement = submitted_requirement(world=world)
    configuration = requirement.configuration
    assert configuration is not None
    configuration.question_schema = EVENT_SCHEMA
    configuration.save(update_fields=("question_schema",))
    requirement.answers = answers
    requirement.save(update_fields=("answers",))
    return requirement


def test_option_codes_become_labels_and_sizing_codes_are_left_out(world: M2World) -> None:
    requirement = _with_answers(
        world,
        {
            "event_type": "wedding",
            "waiter_count": 6,
            "bar_staff_count": 0,
            "worker_count": 6,
            "duration_days": 1,
            "staff_meal_provided": True,
        },
    )

    lines = crew_brief.brief_lines(requirement)

    assert [(line.question, line.value) for line in lines] == [
        ("What's the occasion?", "Wedding"),
        ("Waiters and serving staff", "6"),
        ("Meal for the staff?", "Yes"),
    ]


def test_free_text_travels_trimmed_and_blank_text_is_dropped(world: M2World) -> None:
    requirement = _with_answers(
        world,
        {"event_type": "other", "event_description": "  Retirement send-off  ", "worker_count": 2},
    )

    lines = crew_brief.brief_lines(requirement)

    assert [line.value for line in lines] == ["Something else", "Retirement send-off"]

    requirement.answers = {"event_type": "other", "event_description": "   "}
    requirement.save(update_fields=("answers",))
    assert [line.code for line in crew_brief.brief_lines(requirement)] == ["event_type"]


def test_an_unknown_option_code_is_shown_rather_than_hidden(world: M2World) -> None:
    """A retired option is still what the Customer chose; the lead sees the code, not nothing."""
    requirement = _with_answers(world, {"event_type": "retired-option"})

    assert crew_brief.brief_lines(requirement)[0].value == "retired-option"


def test_a_requirement_without_a_configuration_has_an_empty_brief(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    requirement.configuration = None

    assert crew_brief.brief_lines(requirement) == []
