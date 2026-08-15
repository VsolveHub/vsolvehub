"""Turning M2 domain events into notices the people involved actually receive.

## Why this exists at all

Thirty-nine M2 events are emitted to the outbox and three had consumers. The other thirty-six
exhausted their nine attempts against `No handler registered.` and stopped — a failure visible only
to somebody reading the outbox table, which is exactly what `handlers.handle_requirement_submitted`
already documents for the one case that had been caught before. Every deadline in A3 and A5 —
the booking-fee hold, the visit-plan hold, the estimate window, the stage review that auto-approves
and releases money — was written assuming the other party finds out. Nothing told them.

## Why a table rather than fourteen hand-written functions

Each route is the same three decisions: whose event is this, who needs to know, and what does it
say. Writing that fourteen times would make the differences hard to see and the omissions
impossible to spot. The table is readable top to bottom as "what the platform tells people", which
is a thing the owner should be able to review without reading Python.

Behaviour that is genuinely per-event — resolving a partner through an invitation rather than an
engagement — lives in the resolver, not in a copy of the loop.

## Why this module and not `apps.notifications`

The dependency runs `requirements` → `notifications`, the same direction as `partners`. Knowing
that a `m2.stage.awaiting_review` concerns a Customer requires the requirement aggregate, and
teaching the notifications app about M2 aggregates would invert that arrow and close a cycle.

## Idempotency

The outbox re-drives an event after a transient failure, so a handler that notified twice would
show a person the same notice twice. Each intent is keyed on the outbox event's own idempotency
key plus the recipient, and `request_notification` returns the existing row for a key it has seen.
A re-drive therefore writes nothing.
"""

import uuid
from dataclasses import dataclass
from enum import Enum
from typing import Any

from apps.foundation.models import OutboxEvent
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.requirements.models import CustomerRequirement, Engagement, VendorInvitation

__all__ = [
    "NOTIFICATION_ROUTES",
    "Audience",
    "NotificationRoute",
    "notified_event_types",
    "notify_for_outbox_event",
]


class Audience(Enum):
    """Who a notice is for."""

    CUSTOMER = "CUSTOMER"
    PARTNER = "PARTNER"
    BOTH = "BOTH"


@dataclass(frozen=True, slots=True)
class NotificationRoute:
    """One outbox event, and what the platform tells people about it."""

    event_type: str
    purpose: str
    audience: Audience
    #: Template per side. A Customer and a vendor are told different things about the same fact —
    #: "your crew is confirmed" and "the customer paid, this job is yours" — so a single template
    #: with a pronoun swap would be a worse lie than two honest sentences.
    customer_template: str = ""
    partner_template: str = ""


#: Read this as the list of moments the platform breaks its silence.
#:
#: Chosen because each one is a point where money or a clock moves and the affected party
#: currently learns nothing. The events left out are not forgotten — they are listed in the plan
#: at `docs/superpowers/plans/2026-08-15-in-app-notifications.md` as remaining gaps, along with
#: the two moments that emit no event at all and therefore cannot be routed from here: the A5
#: visit-slot confirmation that starts the plan-payment hold, and the A3 day start.
NOTIFICATION_ROUTES: tuple[NotificationRoute, ...] = (
    # ---- A3: rate-card crews -------------------------------------------------------------
    NotificationRoute(
        event_type="m2.crew_offer.accepted",
        purpose="m2.crew_offer.accepted",
        audience=Audience.CUSTOMER,
        customer_template="m2_crew_offer_accepted",
    ),
    NotificationRoute(
        event_type="m2.booking_fee.charged",
        purpose="m2.booking_fee.charged",
        audience=Audience.BOTH,
        customer_template="m2_booking_fee_charged_customer",
        partner_template="m2_booking_fee_charged_partner",
    ),
    NotificationRoute(
        event_type="m2.crew.vendor_no_show",
        purpose="m2.crew.vendor_no_show",
        audience=Audience.CUSTOMER,
        customer_template="m2_crew_vendor_no_show",
    ),
    NotificationRoute(
        event_type="m2.rate_card.fell_back",
        purpose="m2.rate_card.fell_back",
        audience=Audience.CUSTOMER,
        customer_template="m2_rate_card_fell_back",
    ),
    # ---- A5: visit-first projects --------------------------------------------------------
    NotificationRoute(
        event_type="m2.visit_plan.charged",
        purpose="m2.visit_plan.charged",
        audience=Audience.CUSTOMER,
        customer_template="m2_visit_plan_charged",
    ),
    NotificationRoute(
        event_type="m2.proposal.selected",
        purpose="m2.selection.reconfirm_required",
        audience=Audience.PARTNER,
        partner_template="m2_proposal_selected",
    ),
    NotificationRoute(
        event_type="m2.proposal.rejected",
        purpose="m2.proposal.rejected",
        audience=Audience.PARTNER,
        partner_template="m2_proposal_rejected",
    ),
    # ---- The shared engagement spine -----------------------------------------------------
    NotificationRoute(
        event_type="m2.engagement.opened",
        purpose="m2.engagement.opened",
        audience=Audience.BOTH,
        customer_template="m2_engagement_opened_customer",
        partner_template="m2_engagement_opened_partner",
    ),
    NotificationRoute(
        event_type="m2.stage.awaiting_review",
        purpose="m2.stage.review_required",
        audience=Audience.CUSTOMER,
        customer_template="m2_stage_awaiting_review",
    ),
    NotificationRoute(
        event_type="m2.stage.disputed",
        purpose="m2.stage.disputed",
        audience=Audience.PARTNER,
        partner_template="m2_stage_disputed",
    ),
    NotificationRoute(
        event_type="m2.amendment.authorized",
        purpose="m2.amendment.authorized",
        audience=Audience.BOTH,
        customer_template="m2_amendment_authorized",
        partner_template="m2_amendment_authorized",
    ),
    NotificationRoute(
        event_type="m2.cancellation.evaluated",
        purpose="m2.cancellation.evaluated",
        audience=Audience.BOTH,
        customer_template="m2_cancellation_evaluated",
        partner_template="m2_cancellation_evaluated",
    ),
    NotificationRoute(
        event_type="m2.requirement.closed",
        purpose="m2.requirement.closed",
        audience=Audience.CUSTOMER,
        customer_template="m2_requirement_closed",
    ),
)

_ROUTES_BY_EVENT: dict[str, NotificationRoute] = {
    route.event_type: route for route in NOTIFICATION_ROUTES
}


@dataclass(frozen=True, slots=True)
class _Recipients:
    """The user ids behind an event, and the context its templates need."""

    customer_id: uuid.UUID | None
    partner_user_id: uuid.UUID | None
    context: dict[str, Any]


def notified_event_types() -> tuple[str, ...]:
    """Every event this module routes. `handlers` registers one consumer per entry."""

    return tuple(_ROUTES_BY_EVENT)


def _uuid_from(payload: dict[str, Any], key: str) -> uuid.UUID | None:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def _partner_name(engagement: Engagement | None) -> str:
    """A vendor's display name, or an honest generic.

    Never a blank. A body reading "  is booked" is worse than one reading "Your professional is
    booked", and the notice still has to be sent.
    """

    if engagement is None:
        return "Your professional"
    return engagement.partner.display_name or "Your professional"


def _resolve(event: OutboxEvent) -> _Recipients:
    """Work out who this event concerns.

    An engagement answers both sides at once. A requirement answers only the Customer, because a
    requirement in `MATCHING` has no vendor yet — which is correct for every requirement-scoped
    route in the table. `m2.crew_offer.accepted` is the one event whose vendor is known before an
    engagement exists, and it is a Customer-only notice, so no invitation lookup is needed to
    address it; the invitation is read purely to name the lead in the body.
    """

    payload = event.payload
    context: dict[str, Any] = {}
    engagement: Engagement | None = None
    customer_id: uuid.UUID | None = None
    partner_user_id: uuid.UUID | None = None

    engagement_id = _uuid_from(payload, "engagement_id")
    if engagement_id is not None:
        engagement = (
            Engagement.objects.select_related("partner", "requirement")
            .filter(id=engagement_id)
            .first()
        )
        if engagement is not None:
            customer_id = engagement.customer_id
            partner_user_id = engagement.partner.user_id
            context["engagement_id"] = str(engagement.id)

    requirement_id = _uuid_from(payload, "requirement_id")
    if requirement_id is not None:
        context["requirement_id"] = str(requirement_id)
        if customer_id is None:
            customer_id = (
                CustomerRequirement.objects.filter(id=requirement_id)
                .values_list("customer_id", flat=True)
                .first()
            )

    invitation_id = _uuid_from(payload, "vendor_invitation_id")
    if invitation_id is not None:
        invitation = (
            VendorInvitation.objects.select_related("partner").filter(id=invitation_id).first()
        )
        if invitation is not None:
            if partner_user_id is None:
                partner_user_id = invitation.partner.user_id
            context.setdefault("partner_name", invitation.partner.display_name or "Your crew")

    context.setdefault("partner_name", _partner_name(engagement))
    context.setdefault("headcount", payload.get("crew_size") or "your crew")
    context.setdefault("visit_count", payload.get("visit_count") or "the visits you chose")
    return _Recipients(customer_id=customer_id, partner_user_id=partner_user_id, context=context)


def _notify(
    *,
    recipient_id: uuid.UUID,
    route: NotificationRoute,
    template_code: str,
    event: OutboxEvent,
    context: dict[str, Any],
) -> NotificationIntent:
    return request_notification(
        recipient_id=recipient_id,
        purpose=route.purpose,
        channel=NotificationIntent.Channel.IN_APP,
        template_code=template_code,
        context=context,
        idempotency_key=f"in-app:{event.idempotency_key}:{recipient_id}",
    )


def notify_for_outbox_event(event: OutboxEvent) -> list[NotificationIntent]:
    """Notify everyone this event concerns. Idempotent per recipient.

    A recipient the event cannot resolve is skipped rather than guessed at — an engagement row
    that has since been deleted, or a requirement whose customer is gone, should produce no notice
    rather than one addressed to nobody. Returning the intents rather than a count lets the tests
    assert what was said, not merely how often.
    """

    route = _ROUTES_BY_EVENT.get(event.event_type)
    if route is None:
        raise ValueError(f"No notification route for {event.event_type}.")

    recipients = _resolve(event)
    intents: list[NotificationIntent] = []

    wants_customer = route.audience in (Audience.CUSTOMER, Audience.BOTH)
    if wants_customer and recipients.customer_id is not None and route.customer_template:
        intents.append(
            _notify(
                recipient_id=recipients.customer_id,
                route=route,
                template_code=route.customer_template,
                event=event,
                context=recipients.context,
            )
        )

    wants_partner = route.audience in (Audience.PARTNER, Audience.BOTH)
    if wants_partner and recipients.partner_user_id is not None and route.partner_template:
        intents.append(
            _notify(
                recipient_id=recipients.partner_user_id,
                route=route,
                template_code=route.partner_template,
                event=event,
                context=recipients.context,
            )
        )

    return intents
