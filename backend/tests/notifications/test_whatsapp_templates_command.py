"""The template submission command (`manage.py whatsapp_templates`).

Protects: **every template Meta is asked to approve is exactly the text the code sends, with a
real example for every value.** A missing example is a guaranteed rejection; a body that differs
from `channel_plan` would be approved and then fail at send time.
"""

import pytest

from apps.notifications.management.commands.channel_templates import whatsapp_body
from apps.notifications.management.commands.whatsapp_templates import (
    SAMPLE_VALUES,
    template_request,
    whatsapp_routes,
)

#: Meta's limit on a template body.
META_BODY_MAX = 1024


@pytest.mark.parametrize("code", sorted(whatsapp_routes()))
def test_every_value_has_an_example(code: str) -> None:
    missing = set(whatsapp_routes()[code].variables) - set(SAMPLE_VALUES)

    assert not missing, f"{code} has no example for {sorted(missing)}"


@pytest.mark.parametrize("code", sorted(whatsapp_routes()))
def test_the_request_is_the_text_the_code_sends(code: str) -> None:
    route = whatsapp_routes()[code]

    request = template_request(code, route)

    assert request["name"] == code
    assert request["category"] == "UTILITY"
    [body] = request["components"]
    assert body["text"] == whatsapp_body(route)
    assert len(body["text"]) <= META_BODY_MAX
    if route.variables:
        assert len(body["example"]["body_text"][0]) == len(route.variables)
    else:
        assert "example" not in body
