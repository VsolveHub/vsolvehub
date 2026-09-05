"""Turning M2 domain events into notices the people involved actually receive.

## Why this exists at all

Thirty-nine M2 events are emitted to the outbox and three had consumers. The other thirty-six
exhausted their nine attempts against `No handler registered.` and stopped — a failure visible only
to somebody reading the outbox table, which is exactly what `handlers.handle_requirement_submitted`
already documents for the one case that had been caught before. Every deadline in A3 and A5 —
the booking-fee hold, the visit-plan hold, the estimate window, the stage review that auto-approves
and releases money — was written assuming the other party finds out. Nothing told them.

## Why a table rather than fifteen hand-written functions

Each route is the same three decisions: whose event is this, who needs to know, and what does it
say. Writing that out once per event would make the differences hard to see and the omissions
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

from apps.catalog.models import ServiceVariant
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
    #: What the vendor is told when the engagement is `LEAD_ONLY`, where the ordinary partner
    #: copy would be a lie — "the customer chose your quote" on a job that never had a quote, or
    #: "its payment is on hold" on money the platform never held. Empty means no distinction.
    lead_only_partner_template: str = ""


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
        event_type="m2.crew_offer.invited",
        purpose="m2.crew_offer.invited",
        audience=Audience.PARTNER,
        partner_template="m2_crew_offer_invited",
    ),
    NotificationRoute(
        event_type="m2.crew_offer.accepted",
        purpose="m2.crew_offer.accepted",
        audience=Audience.CUSTOMER,
        customer_template="m2_crew_offer_accepted",
    ),
    NotificationRoute(
        event_type="m2.booking_fee.forfeited",
        purpose="m2.booking_fee.forfeited",
        audience=Audience.PARTNER,
        partner_template="m2_booking_fee_forfeited_partner",
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
        audience=Audience.BOTH,
        customer_template="m2_crew_vendor_no_show",
        partner_template="m2_crew_vendor_no_show_partner",
    ),
    NotificationRoute(
        event_type="m2.rate_card.fell_back",
        purpose="m2.rate_card.fell_back",
        audience=Audience.CUSTOMER,
        customer_template="m2_rate_card_fell_back",
    ),
    #: The cascade parked and is waiting on the Customer. This is the one A3 notification that
    #: asks for a decision rather than reporting one, so it is the one that must arrive.
    NotificationRoute(
        event_type="m2.rate_card.exhausted",
        purpose="m2.rate_card.exhausted",
        audience=Audience.CUSTOMER,
        customer_template="m2_rate_card_exhausted",
    ),
    # ---- A5: visit-first projects --------------------------------------------------------
    NotificationRoute(
        event_type="m2.invitation.received",
        purpose="m2.invitation.received",
        audience=Audience.PARTNER,
        partner_template="m2_invitation_received",
    ),
    #: The fixed-visit offer — a Customer-chosen time broadcast first-accept-wins. This was the
    #: one offer type with no consumer at all: emitted at `matching.dispatch_customer_visit_share`
    #: and never routed, so the only Partner who saw it was one already staring at the Work list.
    NotificationRoute(
        event_type="m2.fixed_visit_offer.received",
        purpose="m2.fixed_visit_offer.received",
        audience=Audience.PARTNER,
        partner_template="m2_fixed_visit_offer_received",
    ),
    #: The quote wave ran out of vendors below the Customer's promised count. Sent once per
    #: requirement — the top-up sweep keeps retrying quietly, and a second notice would report
    #: the same fact as fresh bad news.
    NotificationRoute(
        event_type="m2.quote_wave.thin_supply",
        purpose="m2.quote_wave.thin_supply",
        audience=Audience.CUSTOMER,
        customer_template="m2_quote_wave_thin_supply",
    ),
    NotificationRoute(
        event_type="m2.visit_plan.charged",
        purpose="m2.visit_plan.charged",
        audience=Audience.CUSTOMER,
        customer_template="m2_visit_plan_charged",
    ),
    #: One per held visit the plan payment confirmed. The Partner accepted a fixed time and was
    #: told not to travel; this is the moment that changes, and the only way they learn it
    #: without a tab open.
    NotificationRoute(
        event_type="m2.visit.booked",
        purpose="m2.visit.booked",
        audience=Audience.PARTNER,
        partner_template="m2_visit_booked_partner",
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
        lead_only_partner_template="m2_engagement_opened_partner_crew",
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
        lead_only_partner_template="m2_shift_attendance_disputed_partner",
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
    # ---- Capture and matching ------------------------------------------------------------
    #
    # The stretch of the journey the Customer used to hear nothing about at all. They sent a
    # request, vendors accepted it, quotes arrived — and their feed stayed empty until money
    # moved. The first three routes below are the fix for that silence, and two of them needed
    # a domain event to be emitted before there was anything to route.
    #
    # `m2.requirement.submitted` is the exception in this table: it already had a dedicated
    # consumer (`handlers.handle_requirement_submitted`, which opens matching), so the
    # registration loop must not claim it a second time. That handler calls the notifier itself.
    NotificationRoute(
        event_type="m2.requirement.submitted",
        purpose="m2.requirement.submitted",
        audience=Audience.CUSTOMER,
        customer_template="m2_requirement_submitted",
    ),
    NotificationRoute(
        event_type="m2.invitation.accepted",
        purpose="m2.invitation.accepted",
        audience=Audience.CUSTOMER,
        customer_template="m2_invitation_accepted",
    ),
    NotificationRoute(
        event_type="m2.proposal.submitted",
        purpose="m2.proposal.submitted",
        audience=Audience.CUSTOMER,
        customer_template="m2_proposal_submitted",
    ),
    NotificationRoute(
        event_type="m2.unlock.activated",
        purpose="m2.unlock.activated",
        audience=Audience.CUSTOMER,
        customer_template="m2_unlock_activated",
    ),
    NotificationRoute(
        event_type="m2.requirement.reclassified",
        purpose="m2.requirement.reclassified",
        audience=Audience.CUSTOMER,
        customer_template="m2_requirement_reclassified",
    ),
    NotificationRoute(
        event_type="m2.booking_fee.waived",
        purpose="m2.booking_fee.waived",
        audience=Audience.BOTH,
        customer_template="m2_booking_fee_waived",
        partner_template="m2_booking_fee_waived_partner",
    ),
    NotificationRoute(
        event_type="m2.proposal.revalidation_requested",
        purpose="m2.proposal.revalidation_requested",
        audience=Audience.PARTNER,
        partner_template="m2_proposal_revalidation_requested",
    ),
    # ---- A3: the working day -------------------------------------------------------------
    NotificationRoute(
        event_type="m2.shift.crew_assigned",
        purpose="m2.shift.crew_assigned",
        audience=Audience.CUSTOMER,
        customer_template="m2_shift_crew_assigned",
    ),
    NotificationRoute(
        event_type="m2.shift.arrival_confirmed",
        purpose="m2.shift.arrival_confirmed",
        audience=Audience.CUSTOMER,
        customer_template="m2_shift_arrival_confirmed",
    ),
    NotificationRoute(
        event_type="m2.shift.shortfall",
        purpose="m2.shift.shortfall",
        audience=Audience.CUSTOMER,
        customer_template="m2_shift_shortfall",
    ),
    NotificationRoute(
        event_type="m2.shift.attendance_confirmed",
        purpose="m2.shift.attendance_confirmed",
        audience=Audience.PARTNER,
        partner_template="m2_shift_attendance_confirmed_partner",
    ),
    NotificationRoute(
        event_type="m2.shift.attendance_disputed",
        purpose="m2.shift.attendance_disputed",
        audience=Audience.PARTNER,
        partner_template="m2_shift_attendance_disputed_partner",
    ),
    NotificationRoute(
        event_type="m2.shift.day_settled",
        purpose="m2.shift.day_settled",
        audience=Audience.BOTH,
        customer_template="m2_shift_day_settled_customer",
        partner_template="m2_shift_day_settled_partner",
    ),
    NotificationRoute(
        event_type="m2.vendor.cash_demand_reported",
        purpose="m2.vendor.cash_demand_reported",
        audience=Audience.PARTNER,
        partner_template="m2_cash_demand_reported_partner",
    ),
    # ---- A5: the project -----------------------------------------------------------------
    NotificationRoute(
        event_type="m2.project.handover_submitted",
        purpose="m2.project.handover_submitted",
        audience=Audience.CUSTOMER,
        customer_template="m2_project_handover_submitted",
    ),
    NotificationRoute(
        event_type="m2.project.delay_claimed",
        purpose="m2.project.delay_claimed",
        audience=Audience.CUSTOMER,
        customer_template="m2_project_delay_claimed",
    ),
    NotificationRoute(
        event_type="m2.project.transfer_proposed",
        purpose="m2.project.transfer_proposed",
        audience=Audience.CUSTOMER,
        customer_template="m2_project_transfer_proposed",
    ),
    NotificationRoute(
        event_type="m2.project.transferred",
        purpose="m2.project.transferred",
        audience=Audience.BOTH,
        customer_template="m2_project_transferred_customer",
        partner_template="m2_project_transferred_partner",
    ),
    NotificationRoute(
        event_type="m2.project.terminated",
        purpose="m2.project.terminated",
        audience=Audience.BOTH,
        customer_template="m2_project_terminated_customer",
        partner_template="m2_project_terminated_partner",
    ),
    # ---- Endings and trouble -------------------------------------------------------------
    NotificationRoute(
        event_type="m2.cancellation.executed",
        purpose="m2.cancellation.executed",
        audience=Audience.BOTH,
        customer_template="m2_cancellation_executed",
        partner_template="m2_cancellation_executed",
    ),
    NotificationRoute(
        event_type="m2.cancellation.disputed",
        purpose="m2.cancellation.disputed",
        audience=Audience.BOTH,
        customer_template="m2_cancellation_disputed",
        partner_template="m2_cancellation_disputed",
    ),
    NotificationRoute(
        event_type="m2.engagement.completing",
        purpose="m2.engagement.completing",
        audience=Audience.BOTH,
        customer_template="m2_engagement_completing_customer",
        partner_template="m2_engagement_completing_partner",
    ),
    NotificationRoute(
        event_type="m2.engagement.redispatched",
        purpose="m2.engagement.redispatched",
        audience=Audience.CUSTOMER,
        customer_template="m2_engagement_redispatched",
    ),
    NotificationRoute(
        event_type="m2.engagement.capability_suspended",
        purpose="m2.engagement.capability_suspended",
        audience=Audience.CUSTOMER,
        customer_template="m2_engagement_capability_suspended",
    ),
    NotificationRoute(
        event_type="m2.safety.incident_reported",
        purpose="m2.safety.incident_reported",
        audience=Audience.BOTH,
        customer_template="m2_safety_incident_reported",
        partner_template="m2_safety_incident_reported",
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
    #: The engagement's `commercial_mode` when the event resolved to one; blank otherwise.
    commercial_mode: str = ""


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

    # `vendor_invitation_id` is the name most emitters use; `proposals.request_revalidation`
    # writes `invitation_id`. Reading both here is one line, where teaching every emitter a
    # shared name would be a migration of live payloads for no behavioural gain.
    invitation_id = _uuid_from(payload, "vendor_invitation_id") or _uuid_from(
        payload, "invitation_id"
    )
    if invitation_id is not None:
        invitation = (
            VendorInvitation.objects.select_related("partner", "requirement")
            .filter(id=invitation_id)
            .first()
        )
        if invitation is not None:
            if partner_user_id is None:
                partner_user_id = invitation.partner.user_id
            context["invitation_id"] = str(invitation.id)
            context.setdefault("requirement_id", str(invitation.requirement_id))
            context.setdefault("archetype", invitation.requirement.archetype)
            context.setdefault("partner_name", invitation.partner.display_name or "Your crew")

    context.setdefault("partner_name", _partner_name(engagement))
    context.setdefault("headcount", payload.get("crew_size") or "your crew")
    context.setdefault("visit_count", payload.get("visit_count") or "the visits you chose")
    _add_payload_details(context, payload)
    return _Recipients(
        customer_id=customer_id,
        partner_user_id=partner_user_id,
        context=context,
        commercial_mode=engagement.commercial_mode if engagement is not None else "",
    )


#: The Indian numbering system groups the last three digits and then every two above them —
#: 12,34,567 rather than 1,234,567.
_LAST_GROUP_DIGITS = 3
_LEADING_GROUP_DIGITS = 2


def _rupees(paise: object) -> str | None:
    """Paise as a sentence would say it, or None when there is no honest number to say.

    Notification copy is prose, so this is the one place money becomes a string rather than the
    structured `{amount_paise, currency}` every API response publishes. Whole rupees only: a
    notice reading "settled at ₹4,000.00" is a receipt, and the receipt is a screen away.
    """

    if not isinstance(paise, int) or isinstance(paise, bool):
        return None
    whole, remainder = divmod(abs(paise), 100)
    # Indian grouping — 12,34,567 rather than 1,234,567 — because the reader is in India and the
    # western grouping is the tell that nobody looked.
    text = str(whole)
    if len(text) > _LAST_GROUP_DIGITS:
        head, tail = text[:-_LAST_GROUP_DIGITS], text[-_LAST_GROUP_DIGITS:]
        groups: list[str] = []
        while len(head) > _LEADING_GROUP_DIGITS:
            head, group = head[:-_LEADING_GROUP_DIGITS], head[-_LEADING_GROUP_DIGITS:]
            groups.insert(0, group)
        if head:
            groups.insert(0, head)
        text = ",".join([*groups, tail])
    sign = "-" if paise < 0 else ""
    suffix = f".{remainder:02d}" if remainder else ""
    return f"{sign}₹{text}{suffix}"


def _plural(count: object, singular: str, plural: str) -> str | None:
    """`3` → "3 deliverables". None when the payload did not carry a usable count."""

    if not isinstance(count, int) or isinstance(count, bool):
        return None
    return f"{count} {singular if count == 1 else plural}"


#: Payload keys a template may name, and the fallback used when the event did not carry one.
#:
#: Every key here is `setdefault` into context unconditionally, because `render_notification`
#: raises `KeyError` on a missing one — deliberately, so a broken template fails at the write
#: rather than in front of the person reading their feed. A fallback is therefore not politeness;
#: it is what stops one thin payload from turning a notice into an exception.
#:
#: The fallbacks are written to read as English in place. "Fewer workers arrived than agreed —
#: some of the agreed number turned up" is clumsy, but it is true, and it is what a reader gets
#: instead of nothing.
_DETAIL_FALLBACKS: dict[str, str] = {
    "amount": "the agreed amount",
    "shift_date": "the scheduled day",
    "crew_size": "the crew",
    "workers_present": "fewer",
    "workers_expected": "the agreed number",
    "extension_days": "more",
    "days": "the agreed number of",
    "deliverables": "their work",
}


def _add_payload_details(context: dict[str, Any], payload: dict[str, Any]) -> None:
    """Copy the scalars templates are allowed to quote, formatted for prose.

    A whitelist rather than `context.update(payload)`. Payloads carry partner ids, reason codes
    and internal aggregate ids, and merging them wholesale would put both a rendering hazard and
    somebody else's identifiers into a row that is read back into a person's feed.
    """

    amount = _rupees(payload.get("amount_paise"))
    if amount is not None:
        context.setdefault("amount", amount)

    shift_date = payload.get("shift_date")
    if isinstance(shift_date, str) and shift_date:
        context.setdefault("shift_date", shift_date)

    crew_size = _plural(payload.get("crew_size"), "worker", "workers")
    if crew_size is not None:
        context.setdefault("crew_size", crew_size)

    deliverables = _plural(payload.get("deliverables"), "deliverable", "deliverables")
    if deliverables is not None:
        context.setdefault("deliverables", deliverables)

    for key in ("workers_present", "workers_expected", "extension_days", "days"):
        value = payload.get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            context.setdefault(key, str(value))

    for key, fallback in _DETAIL_FALLBACKS.items():
        context.setdefault(key, fallback)


#: Routes whose notice is about the Customer's **quotes**, not their request in general.
#:
#: Both of these ask for money or report that money was taken, and the screen that answers them is
#: `/requests/{id}/quotes` rather than the request page. Without an explicit target the serializer
#: falls back to `requirement_id` → `REQUIREMENT`, and "unlock to read the full quote" would open
#: a page with no quotes on it — a notice that is correct and still useless.
_QUOTES_TARGET_EVENTS = frozenset({"m2.proposal.submitted", "m2.unlock.activated"})


def _context_for_route(route: NotificationRoute, context: dict[str, Any]) -> dict[str, Any]:
    """Add route-specific link targets without making every notice prefer invitations.

    A crew-offer notice may carry a `vendor_invitation_id` purely to name the lead in the body; a
    Customer cannot open that Partner invitation. Only the invitation-received route is itself
    about the Partner's enquiry door, so it gets an explicit target.

    The default — no explicit target, and the serializer picking the most specific id in context —
    stays right for most routes. This function exists for the ones where the most specific id and
    the most *useful* destination are different things.
    """

    if route.event_type in _QUOTES_TARGET_EVENTS:
        requirement_id = context.get("requirement_id")
        if isinstance(requirement_id, str) and requirement_id:
            return {
                **context,
                "target_kind": "REQUIREMENT_QUOTES",
                "target_id": requirement_id,
            }
        return context

    if route.event_type not in (
        "m2.invitation.received",
        "m2.crew_offer.invited",
        "m2.fixed_visit_offer.received",
    ):
        return context

    invitation_id = context.get("invitation_id")
    if not isinstance(invitation_id, str) or not invitation_id:
        return context

    if route.event_type == "m2.crew_offer.invited":
        # A crew offer opens on the offer screen, not the enquiry inbox: it has a two-minute
        # clock and one button, and the enquiry page would show it as a quote to write.
        target_kind = "CREW_OFFER"
    elif route.event_type == "m2.fixed_visit_offer.received":
        # A fixed-visit offer is answered on the enquiry screen, whose project branch renders
        # the take-or-pass card. The id is the invitation, which is what that route is keyed by.
        target_kind = "PROJECT_INVITATION"
    else:
        archetype = context.get("archetype")
        target_kind = (
            "PROJECT_INVITATION"
            if archetype == ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT
            else "WORKFORCE_INVITATION"
        )
    return {**context, "target_kind": target_kind, "target_id": invitation_id}


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
                context=_context_for_route(route, recipients.context),
            )
        )

    wants_partner = route.audience in (Audience.PARTNER, Audience.BOTH)
    partner_template = route.partner_template
    if (
        route.lead_only_partner_template
        and recipients.commercial_mode == Engagement.CommercialMode.LEAD_ONLY
    ):
        partner_template = route.lead_only_partner_template
    if wants_partner and recipients.partner_user_id is not None and partner_template:
        intents.append(
            _notify(
                recipient_id=recipients.partner_user_id,
                route=route,
                template_code=partner_template,
                event=event,
                context=_context_for_route(route, recipients.context),
            )
        )

    return intents
