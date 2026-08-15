"""M2 outbox events reaching the people they concern.

The property this file exists to protect: **an event that moves money or starts a clock tells the
party it affects.** Before this, thirty-six of thirty-nine M2 events had no consumer at all — they
spent nine delivery attempts against `No handler registered.` and stopped, which is a failure
visible only to somebody reading the outbox table. Every deadline the product runs on assumed the
other side finds out.

Two of the tests here are consistency checks rather than behaviour tests, and they are the ones
most likely to catch a future mistake: that every route names a template that exists, and that
every routed event actually has a consumer registered. Both failures are invisible at runtime until
somebody is not told something.
"""

import uuid
from typing import Any

import pytest

from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import _handlers
from apps.notifications.models import NotificationIntent
from apps.notifications.templates_registry import registered_template_codes, render_notification
from apps.requirements.notifications import (
    NOTIFICATION_ROUTES,
    Audience,
    notified_event_types,
    notify_for_outbox_event,
)
from tests.requirements.conftest import M2World, invitation_for, submitted_requirement

pytestmark = pytest.mark.django_db(transaction=True)


def _event(
    *,
    event_type: str,
    payload: dict[str, Any],
    idempotency_key: str = "",
) -> OutboxEvent:
    """One outbox row, shaped the way the emitters shape them.

    Every payload value is a JSON scalar, because `payload` is a `JSONField` and a UUID never
    survives the round trip — which is exactly why the handlers narrow with `isinstance` before
    calling `UUID(...)`.
    """

    return OutboxEvent.objects.create(
        aggregate_type="requirement",
        aggregate_id=uuid.uuid4(),
        event_type=event_type,
        idempotency_key=idempotency_key or f"test:{uuid.uuid4()}",
        payload=payload,
    )


# --------------------------------------------------------------------------------------------
# Consistency: the table cannot quietly point at nothing
# --------------------------------------------------------------------------------------------


def test_every_route_names_templates_that_exist() -> None:
    """A route pointing at a missing template is a notice that raises when it is written."""

    known = registered_template_codes()
    for route in NOTIFICATION_ROUTES:
        if route.audience in (Audience.CUSTOMER, Audience.BOTH):
            assert route.customer_template, f"{route.event_type} notifies a Customer with nothing."
            assert route.customer_template in known, (
                f"{route.event_type} names unregistered template {route.customer_template!r}."
            )
        if route.audience in (Audience.PARTNER, Audience.BOTH):
            assert route.partner_template, f"{route.event_type} notifies a vendor with nothing."
            assert route.partner_template in known, (
                f"{route.event_type} names unregistered template {route.partner_template!r}."
            )


def test_every_routed_event_has_a_registered_consumer() -> None:
    """A route with no handler is an event still dead-lettering — the original defect."""

    for event_type in notified_event_types():
        assert event_type in _handlers, (
            f"{event_type} is routed but has no outbox consumer, so it will still exhaust its "
            "attempts against 'No handler registered.'"
        )


def test_no_event_is_routed_twice() -> None:
    """`register_outbox_handler` raises on a duplicate, so a repeat would break startup."""

    event_types = [route.event_type for route in NOTIFICATION_ROUTES]

    assert len(event_types) == len(set(event_types))


# --------------------------------------------------------------------------------------------
# Behaviour
# --------------------------------------------------------------------------------------------


def test_a_requirement_event_notifies_that_requirements_customer(world: M2World) -> None:
    requirement = submitted_requirement(world=world)
    event = _event(
        event_type="m2.requirement.closed",
        payload={
            "requirement_id": str(requirement.id),
            "status": "CLOSED_EXPIRED",
            "reason_code": "service_by_passed",
        },
    )

    intents = notify_for_outbox_event(event)

    assert len(intents) == 1
    intent = intents[0]
    assert intent.recipient_id == world.customer.id
    assert intent.channel == NotificationIntent.Channel.IN_APP
    assert intent.template_code == "m2_requirement_closed"
    assert intent.status == NotificationIntent.Status.SENT
    assert intent.context["requirement_id"] == str(requirement.id)


def test_a_notified_event_renders_into_real_sentences(world: M2World) -> None:
    """The row stores context; the words are produced on the way out. Both must work."""

    requirement = submitted_requirement(world=world)
    event = _event(
        event_type="m2.rate_card.fell_back",
        payload={
            "requirement_id": str(requirement.id),
            "rate_card_booking_id": str(uuid.uuid4()),
            "reason_code": "cascade_exhausted",
        },
    )

    intent = notify_for_outbox_event(event)[0]
    rendered = render_notification(template_code=intent.template_code, context=intent.context)

    assert "{" not in rendered.body, "A placeholder reached the reader."
    assert rendered.title


def test_a_crew_offer_names_the_lead_who_accepted(world: M2World) -> None:
    """ "Your crew is holding your dates" should say whose crew."""

    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor, accepted=True)
    event = _event(
        event_type="m2.crew_offer.accepted",
        payload={
            "requirement_id": str(requirement.id),
            "rate_card_booking_id": str(uuid.uuid4()),
            "vendor_invitation_id": str(invitation.id),
        },
    )

    intent = notify_for_outbox_event(event)[0]

    assert intent.recipient_id == world.customer.id, "A crew offer is the Customer's news."
    assert intent.context["partner_name"] == world.vendor.display_name


def test_a_redriven_event_tells_nobody_twice(world: M2World) -> None:
    """The outbox re-drives after a transient failure; a person should not see a duplicate."""

    requirement = submitted_requirement(world=world)
    event = _event(
        event_type="m2.requirement.closed",
        payload={"requirement_id": str(requirement.id)},
        idempotency_key="requirement-closed:fixed",
    )

    first = notify_for_outbox_event(event)
    second = notify_for_outbox_event(event)

    assert [intent.id for intent in first] == [intent.id for intent in second]
    assert NotificationIntent.objects.filter(recipient=world.customer).count() == 1


def test_an_unresolvable_recipient_produces_no_notice_rather_than_a_crash() -> None:
    """A requirement that is gone should notify nobody, not raise into the outbox's retry budget."""

    event = _event(
        event_type="m2.requirement.closed",
        payload={"requirement_id": str(uuid.uuid4())},
    )

    assert notify_for_outbox_event(event) == []


def test_an_unrouted_event_is_refused_loudly() -> None:
    """Being asked to notify for something the table does not cover is a code defect."""

    event = _event(event_type="m2.nothing.here", payload={})

    with pytest.raises(ValueError, match="No notification route"):
        notify_for_outbox_event(event)
