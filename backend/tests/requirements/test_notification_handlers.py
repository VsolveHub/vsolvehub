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
from string import Formatter
from typing import Any

import pytest

from apps.catalog.models import ServiceVariant
from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import _handlers
from apps.notifications.models import NotificationIntent
from apps.notifications.templates_registry import (
    _TEMPLATES,
    registered_template_codes,
    render_notification,
)
from apps.requirements.handlers import (
    _ROUTED_BY_A_DEDICATED_HANDLER,
    handle_requirement_submitted,
)
from apps.requirements.notifications import (
    _DETAIL_FALLBACKS,
    NOTIFICATION_ROUTES,
    Audience,
    _rupees,
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


def test_the_exhausted_notice_asks_rather_than_announces(world: M2World) -> None:
    """The one A3 notice that needs an answer, so the one that must arrive intact.

    `m2.rate_card.fell_back` reports a decision the platform already took. This reports a **pause**
    and three choices, and it is the only thing telling the Customer their request is waiting on
    them — a request parked at `EXHAUSTED` moves again for no other reason.
    """
    requirement = submitted_requirement(world=world)
    event = _event(
        event_type="m2.rate_card.exhausted",
        payload={
            "requirement_id": str(requirement.id),
            "rate_card_booking_id": str(uuid.uuid4()),
            "reason_code": "no_eligible_leads",
        },
    )

    intent = notify_for_outbox_event(event)[0]
    rendered = render_notification(template_code=intent.template_code, context=intent.context)

    assert intent.template_code == "m2_rate_card_exhausted"
    assert "{" not in rendered.body, "A placeholder reached the reader."
    # The three ways out are the content. A notice that only said "nobody accepted" would leave
    # the Customer watching a request that has stopped moving with nothing to do about it.
    assert "cancel" in rendered.body.lower()
    assert "quotes" in rendered.body.lower()
    # And it must not repeat the old promise that we have already moved them.
    assert "moving you to quotes" not in rendered.title.lower()


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


def test_an_invitation_event_notifies_the_invited_partner(world: M2World) -> None:
    """A project arriving in matching is the Partner's news, not a hidden row."""

    requirement = submitted_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    event = _event(
        event_type="m2.invitation.received",
        payload={
            "requirement_id": str(requirement.id),
            "vendor_invitation_id": str(invitation.id),
            "archetype": requirement.archetype,
        },
    )

    intents = notify_for_outbox_event(event)

    assert len(intents) == 1
    intent = intents[0]
    assert intent.recipient_id == world.vendor.user_id
    assert intent.channel == NotificationIntent.Channel.IN_APP
    assert intent.template_code == "m2_invitation_received"
    assert intent.status == NotificationIntent.Status.SENT
    assert intent.context["target_kind"] == "PROJECT_INVITATION"
    assert intent.context["target_id"] == str(invitation.id)


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


# --------------------------------------------------------------------------------------------
# The customer spine: the stretch of the journey that used to announce nothing
# --------------------------------------------------------------------------------------------


def test_a_vendor_accepting_tells_the_customer_who_said_yes(world: M2World) -> None:
    """The notice this whole audit was opened for.

    Three vendors accepted a live A5 request and the Customer's feed stayed empty, because
    `matching.accept_invitation` emitted no event at all. Nothing failed to deliver; the notice
    was never requested. This asserts the chain now exists end to end: the event is routed, the
    Customer is the recipient, and the vendor is named in the title.
    """

    requirement = submitted_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    event = _event(
        event_type="m2.invitation.accepted",
        payload={
            "requirement_id": str(requirement.id),
            "vendor_invitation_id": str(invitation.id),
            "archetype": requirement.archetype,
        },
    )

    intents = notify_for_outbox_event(event)

    assert len(intents) == 1
    intent = intents[0]
    assert intent.recipient_id == world.customer.id
    assert intent.status == NotificationIntent.Status.SENT
    rendered = render_notification(template_code=intent.template_code, context=intent.context)
    assert world.vendor.display_name in rendered.title


def test_each_vendor_acceptance_is_its_own_notice(world: M2World) -> None:
    """Keyed on the invitation, not the requirement.

    A requirement-keyed event would announce whoever accepted first and swallow the rest, which
    reads to the Customer exactly like the silence this replaced.
    """

    requirement = submitted_requirement(
        world=world,
        archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
    )
    for partner in (world.vendor, world.other_vendor):
        invitation = invitation_for(requirement=requirement, partner=partner)
        notify_for_outbox_event(
            _event(
                event_type="m2.invitation.accepted",
                payload={
                    "requirement_id": str(requirement.id),
                    "vendor_invitation_id": str(invitation.id),
                },
                idempotency_key=f"invitation-accepted:{invitation.id}",
            )
        )

    notices = NotificationIntent.objects.filter(
        recipient=world.customer,
        purpose="m2.invitation.accepted",
    )
    assert notices.count() == len({world.vendor.id, world.other_vendor.id})


def test_a_quote_points_the_customer_at_the_quotes_screen(world: M2World) -> None:
    """Unlock-to-read has to open the quotes, not the request page it hangs under."""

    requirement = submitted_requirement(world=world)
    invitation = invitation_for(requirement=requirement, partner=world.vendor)
    event = _event(
        event_type="m2.proposal.submitted",
        payload={
            "requirement_id": str(requirement.id),
            "vendor_invitation_id": str(invitation.id),
            "proposal_id": str(uuid.uuid4()),
            "usability": "USABLE",
            "revision": 1,
        },
    )

    intents = notify_for_outbox_event(event)

    assert len(intents) == 1
    assert intents[0].recipient_id == world.customer.id
    assert intents[0].context["target_kind"] == "REQUIREMENT_QUOTES"
    assert intents[0].context["target_id"] == str(requirement.id)


def test_an_unlock_receipt_also_opens_the_quotes(world: M2World) -> None:
    """The money was spent to read them, so the notice about it opens them."""

    requirement = submitted_requirement(world=world)
    event = _event(
        event_type="m2.unlock.activated",
        payload={"requirement_id": str(requirement.id), "quote_unlock_id": str(uuid.uuid4())},
    )

    intents = notify_for_outbox_event(event)

    assert intents[0].context["target_kind"] == "REQUIREMENT_QUOTES"


# --------------------------------------------------------------------------------------------
# Context: a thin payload must not turn a notice into an exception
# --------------------------------------------------------------------------------------------


def test_money_is_written_the_way_a_person_in_india_reads_it() -> None:
    """Indian grouping, whole rupees. Western grouping is the tell that nobody looked."""

    assert _rupees(1234500) == "₹12,345"
    assert _rupees(100) == "₹1"
    assert _rupees(12345678900) == "₹12,34,56,789"
    # Not a number, or a bool masquerading as one, means there is nothing honest to say.
    assert _rupees(None) is None
    assert _rupees(True) is None


def test_every_template_only_names_context_the_resolver_guarantees() -> None:
    """The consistency check that catches a whole class of failure at once.

    `render_notification` raises on a missing key — deliberately, so a broken template fails at
    the write rather than in front of a reader. That makes any template naming a key the resolver
    does not always set a live exception for one event shape, months later, in the surface whose
    only job is to be trusted. Enumerating the guaranteed keys is cheaper than driving every
    event twice, and it fails the moment somebody adds copy with a placeholder nothing fills.
    """

    guaranteed = {"partner_name", "headcount", "visit_count", *_DETAIL_FALLBACKS}
    for code, (title, body) in _TEMPLATES.items():
        used = {field for _, field, _, _ in Formatter().parse(f"{title} {body}") if field}
        assert used <= guaranteed, f"{code} names context nothing guarantees: {used - guaranteed}"


def test_a_payload_with_no_details_still_produces_a_sentence(world: M2World) -> None:
    """The fallbacks are what stop one thin payload from raising into the retry budget."""

    requirement = submitted_requirement(world=world)
    event = _event(
        event_type="m2.requirement.reclassified",
        payload={"requirement_id": str(requirement.id)},
    )

    intents = notify_for_outbox_event(event)

    rendered = render_notification(
        template_code=intents[0].template_code,
        context=intents[0].context,
    )
    assert rendered.body
    assert "{" not in rendered.body


# --------------------------------------------------------------------------------------------
# The one route whose consumer is written by hand
# --------------------------------------------------------------------------------------------


def test_the_dedicated_handler_set_names_only_routed_events() -> None:
    """An entry left behind after a route was removed would quietly disable nothing.

    The set exists so the skip in `_register_notification_consumers` is declared rather than
    inferred; this keeps it from drifting into a lie.
    """

    assert set(notified_event_types()) >= _ROUTED_BY_A_DEDICATED_HANDLER


def test_a_submitted_requirement_tells_its_customer(world: M2World) -> None:
    """`m2.requirement.submitted` is routed, but its consumer is `handle_requirement_submitted`.

    The outbox permits one consumer per event type and this event already had one, so the notice
    is sent from inside that handler. If somebody removes the `notify_for_outbox_event` call, the
    route stays in the table, every consistency check above still passes, and the Customer
    silently stops being told their request went out. This is the test that catches it.
    """

    requirement = submitted_requirement(world=world)
    event = _event(
        event_type="m2.requirement.submitted",
        payload={"requirement_id": str(requirement.id), "archetype": requirement.archetype},
    )

    handle_requirement_submitted(event)

    assert NotificationIntent.objects.filter(
        recipient=world.customer,
        purpose="m2.requirement.submitted",
    ).exists()
