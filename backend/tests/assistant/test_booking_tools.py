"""The tools against the real booking engine: catalogue → cart → slots → quote → checkout.

Every tool wraps a command the website already uses, so these drive the same seeded catalogue and
Partner the cart and checkout suites use.
"""

from typing import Any
from uuid import uuid4

import pytest

from apps.assistant.llm import ToolCall
from apps.assistant.models import AssistantBooking, AssistantSession
from apps.assistant.tools import ToolContext, execute_tool
from apps.carts.models import CheckoutSession
from apps.catalog.models import Service, ServiceVariant
from apps.identity.models import User
from tests.carts.test_checkout import seed_available_partner
from tests.carts.test_fulfilment_planning import _customer_context

pytestmark = pytest.mark.django_db(transaction=True)

SLUG = "switch-socket-repair"


def _context(user: User | None, *, turn: int = 1) -> ToolContext:
    session = AssistantSession.objects.create(token_hash=uuid4().hex, customer=user)
    return ToolContext(session=session, user=user, cart_session_key="assistant-test", turn=turn)


def _call(ctx: ToolContext, name: str, **arguments: Any) -> dict[str, Any]:
    return execute_tool(ToolCall(id=f"call_{name}", name=name, arguments=arguments), ctx).content


def _quoted(ctx: ToolContext) -> dict[str, Any]:
    """Search → details → add → address → first slot → price, as the model would."""

    found = _call(ctx, "search_services", query="switch socket")
    service = next(result for result in found["results"] if result["bookable_in_chat"])
    details = _call(ctx, "get_service_details", service_ref=service["service_ref"])
    added = _call(
        ctx, "add_service_to_booking", variant_ref=details["options"][0]["variant_ref"], quantity=1
    )
    assert added["ok"], added
    address_ref = _call(ctx, "list_my_addresses")["addresses"][0]["address_ref"]
    slots = _call(ctx, "find_slots", address_ref=address_ref)
    assert slots["ok"], slots
    slot_ref = slots["visits"][0]["slots"][0]["slot_ref"]
    quote = _call(ctx, "prepare_booking", address_ref=address_ref, slot_refs=[slot_ref])
    assert quote["ok"], quote
    return quote


def test_search_finds_the_service_and_hides_database_ids() -> None:
    _client, customer, _address_id, _version = _customer_context()
    ctx = _context(customer)

    found = _call(ctx, "search_services", query="Switch sockets")

    assert found["ok"] is True
    names = [result["name"] for result in found["results"]]
    assert Service.objects.get(slug=SLUG).name in names
    serialized = str(found)
    for variant_id in ServiceVariant.objects.values_list("id", flat=True):
        assert str(variant_id) not in serialized
    assert ctx.actions and ctx.actions[0]["type"] == "QUICK_REPLY"


def test_booking_steps_need_login_and_offer_the_login_button() -> None:
    _customer_context()
    ctx = _context(None)

    result = _call(ctx, "list_my_addresses")

    assert result == {
        "ok": False,
        "error": "login_required",
        "message": "The customer must log in before this step.",
    }
    assert ctx.actions[0]["type"] == "LOGIN"


def test_an_unknown_reference_is_refused_not_guessed() -> None:
    _client, customer, _address_id, _version = _customer_context()
    ctx = _context(customer)

    result = _call(ctx, "get_service_details", service_ref="S42")

    assert result["ok"] is False
    assert result["error"] == "unknown_reference"


def test_the_price_must_be_seen_before_the_booking_is_confirmed() -> None:
    _client, customer, _address_id, _version = _customer_context()
    seed_available_partner()
    ctx = _context(customer, turn=1)
    quote = _quoted(ctx)
    assert ctx.actions[0]["type"] == "QUOTE"
    assert quote["total"].startswith("₹")

    same_turn = _call(ctx, "confirm_booking", quote_ref=quote["quote_ref"])

    assert same_turn["error"] == "confirmation_required"
    assert not CheckoutSession.objects.filter(customer=customer).exists()


def test_confirming_in_a_later_turn_starts_one_checkout_and_links_it() -> None:
    _client, customer, _address_id, _version = _customer_context()
    seed_available_partner()
    ctx = _context(customer, turn=1)
    quote = _quoted(ctx)
    ctx.turn = 2

    confirmed = _call(ctx, "confirm_booking", quote_ref=quote["quote_ref"])

    assert confirmed["ok"] is True, confirmed
    assert confirmed["status"] in {"finding_professional", "awaiting_payment"}
    link = AssistantBooking.objects.get(session=ctx.session)
    assert link.checkout.customer_id == customer.id
    assert link.booking_group.customer_id == customer.id
    assert {action["type"] for action in ctx.actions} & {"VIEW_BOOKING", "PAY"}

    again = _call(ctx, "confirm_booking", quote_ref=quote["quote_ref"])

    assert again["error"] == "booking_already_open"
    assert CheckoutSession.objects.filter(customer=customer).count() == 1


def test_booking_status_reports_nothing_before_a_booking() -> None:
    _client, customer, _address_id, _version = _customer_context()
    ctx = _context(customer)

    assert _call(ctx, "booking_status") == {
        "ok": True,
        "status": "none",
        "summary": "No booking has been made in this chat yet.",
    }


def test_a_tool_the_model_invents_is_refused() -> None:
    ctx = _context(None)

    result = _call(ctx, "apply_discount", percent=50)

    assert result == {
        "ok": False,
        "error": "unknown_tool",
        "message": "No tool named apply_discount.",
    }
