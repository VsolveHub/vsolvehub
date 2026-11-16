"""The WhatsApp and SMS routing table (`notifications.channel_plan`).

The property this file protects: **a route can only ask for values its notice already carries,
and its text is something Meta and DLT will accept.** A route that names a value the notice does
not have would skip every message it was meant to send, silently, in production.
"""

import re

import pytest

from apps.mobile.push_templates import registered_push_template_codes
from apps.notifications.channel_plan import PLAN, Route
from apps.notifications.management.commands.channel_templates import (
    dlt_text,
    msg91_text,
    whatsapp_body,
)
from apps.notifications.models import NotificationIntent
from apps.notifications.templates_registry import _TEMPLATES, registered_template_codes

_PLACEHOLDER = re.compile(r"\{([a-z0-9_]+)\}")
_ENDS_WITH_A_VALUE = re.compile(r"\}[\s.!?,;:)\"']*$")

#: The split agreed in the notification channel plan, less `job_invite`, which Meta classed as
#: marketing (14 Nov 2026) and now stays in-app and push only.
WHATSAPP_ROUTES = 71
SMS_ROUTES = 7


def _source_values(code: str) -> set[str]:
    """Every value the source notice is written with: its in-app copy's placeholders."""

    if code in registered_template_codes():
        title, body = _TEMPLATES[code]
        return set(_PLACEHOLDER.findall(f"{title} {body}"))
    return set()  # A push-only notice: its copy has no values.


def test_the_plan_has_the_agreed_split() -> None:
    channels = [route.channel for route in PLAN.values()]

    assert channels.count(NotificationIntent.Channel.WHATSAPP) == WHATSAPP_ROUTES
    assert channels.count(NotificationIntent.Channel.SMS) == SMS_ROUTES


@pytest.mark.parametrize("code", sorted(PLAN))
def test_every_route_is_a_notice_that_exists(code: str) -> None:
    assert code in registered_template_codes() or code in registered_push_template_codes()


@pytest.mark.parametrize("code", sorted(PLAN))
def test_every_route_asks_only_for_values_its_notice_carries(code: str) -> None:
    missing = set(PLAN[code].variables) - _source_values(code)

    assert not missing, f"{code} needs {sorted(missing)}, which its notice is never written with"


@pytest.mark.parametrize("code", sorted(PLAN))
def test_every_text_starts_with_the_brand_and_not_a_value(code: str) -> None:
    # Meta refuses a template whose body starts with a variable.
    assert PLAN[code].text.startswith("V Solve Hub: ")


@pytest.mark.parametrize("code", sorted(PLAN))
def test_no_text_ends_with_a_value(code: str) -> None:
    # Meta refuses a template whose body ends with a variable, and a value followed only by
    # punctuation ("... on {when}.") counts as ending with it: eight templates were refused so.
    assert not _ENDS_WITH_A_VALUE.search(PLAN[code].text)


@pytest.mark.parametrize(
    "code",
    sorted(code for code, r in PLAN.items() if r.channel == NotificationIntent.Channel.SMS),
)
def test_sms_texts_fit_one_dlt_template(code: str) -> None:
    text = PLAN[code].text

    assert "\n" not in text
    # Plain GSM text: a curly quote or a dash would make it a Unicode SMS at twice the cost.
    assert text.isascii()


def test_whatsapp_numbers_values_in_order_and_repeats_take_their_own_number() -> None:
    route = Route(NotificationIntent.Channel.WHATSAPP, "V Solve Hub: {a} and {b}, then {a}.")

    assert route.variables == ("a", "b", "a")
    assert whatsapp_body(route) == "V Solve Hub: {{1}} and {{2}}, then {{3}}."


def test_sms_text_converts_to_dlt_and_msg91_forms() -> None:
    route = Route(NotificationIntent.Channel.SMS, "V Solve Hub: {partner_name} has arrived.")

    assert dlt_text(route) == "V Solve Hub: {#var#} has arrived."
    assert msg91_text(route) == "V Solve Hub: ##partner_name## has arrived."
