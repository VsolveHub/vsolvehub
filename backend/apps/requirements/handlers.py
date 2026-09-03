"""Transactional-outbox consumers for M2.

The one consumer here answers the question `M2-BE-113` has been blocked on since 10 August: what
happens to money already committed against a capability that Operations has just suspended.

It runs through the outbox rather than inside `partners.capabilities.transition_capability` for
two reasons, and the second is the one that decides it:

* `apps.requirements` imports `apps.partners`, so a direct call the other way would close an
  import cycle.
* A review decision has to be recorded even if the routing fails. Refunding stages and flagging
  engagements for replacement touches a payment provider; a suspension that could not be saved
  because a refund adapter timed out would be a Partner left approved on a decision an operator
  already made. The outbox keeps the two facts separate and retries the second.
"""

from uuid import UUID

from apps.foundation.models import OutboxEvent
from apps.foundation.tasks import register_outbox_handler
from apps.requirements.crew_dispatch import record_acceptances_for_approved_capability
from apps.requirements.engagements import route_suspended_capability_engagements
from apps.requirements.matching import open_matching_on_submission
from apps.requirements.notifications import notified_event_types, notify_for_outbox_event


@register_outbox_handler(event_type="m2.requirement.submitted")
def handle_requirement_submitted(event: OutboxEvent) -> None:
    """Open matching for a newly submitted requirement.

    `services.submit_requirement` has emitted this event since Wave C0 and **nothing consumed
    it**, so every submitted A5 project and every A3 quote request reached `MATCHING` and stopped
    there: no `VendorInvitation` was ever written, no vendor could see the job, and the outbox row
    exhausted its nine attempts against `No handler registered.` — a failure visible only to
    somebody reading the outbox table. Every static gate passed over it, because an emitter with
    no consumer is not a type error.

    The dispatch decisions live in `matching.open_matching_on_submission`, including why an A3
    rate-card booking is deliberately skipped here.
    """
    requirement_id = event.payload.get("requirement_id")
    if not isinstance(requirement_id, str):
        raise ValueError("m2.requirement.submitted requires requirement_id.")
    open_matching_on_submission(requirement_id=UUID(requirement_id))
    # And tell the Customer their request went out.
    #
    # This is the second effect `_register_notification_consumers` describes and refuses to add
    # as a rival handler: the outbox permits exactly one consumer per event type, so a route in
    # `NOTIFICATION_ROUTES` for an event that already has a dedicated handler has to be honoured
    # *here*. Ordered after matching deliberately — the notice says the request is on its way to
    # professionals, and saying so before the invitations are written would be a promise made
    # ahead of the fact. Both writes share this handler's transaction, so neither lands alone.
    notify_for_outbox_event(event)


@register_outbox_handler(event_type="m2.capability.suspended")
def handle_capability_suspended(event: OutboxEvent) -> None:
    """Route funded or committed engagements belonging to a suspended capability.

    Idempotent by state rather than by key: every action it takes — refunding a stage, recording
    an event — is idempotent on its own, so a re-driven event settles on the same outcome. The
    refund in particular is keyed on the stage and the amount inside
    `commerce.request_standalone_refund`, so a retry returns the refund it already asked for.
    """
    partner_id = event.payload.get("partner_id")
    variant_id = event.payload.get("variant_id")
    if not isinstance(partner_id, str) or not isinstance(variant_id, str):
        raise ValueError("m2.capability.suspended requires partner_id and variant_id.")
    route_suspended_capability_engagements(
        partner_id=UUID(partner_id),
        variant_ids=[UUID(variant_id)],
        reason_code=str(event.payload.get("reason_code") or "capability_suspended"),
    )


@register_outbox_handler(event_type="m2.capability.approved")
def handle_capability_approved(event: OutboxEvent) -> None:
    """Record this lead's acceptance of every live rate card their new capability can serve.

    `M2-BE-435`: accepting the card is part of A3 capability approval, and accepting a job is
    accepting that rate for that job. This is the first half; `crew_dispatch.accept_crew_offer`
    writes the second.

    Idempotent by the unique constraint on `(capability, rate_card)` rather than by key, so a
    re-driven event records nothing twice. A capability approved for a city with no published card
    records nothing at all, which is correct — there is no number to have agreed to yet.
    """
    capability_id = event.payload.get("partner_capability_id")
    if not isinstance(capability_id, str):
        raise ValueError("m2.capability.approved requires partner_capability_id.")
    record_acceptances_for_approved_capability(capability_id=UUID(capability_id))


#: Routed events whose consumer is written by hand above, because they already had one.
#:
#: An entry here is a promise that the named handler calls `notify_for_outbox_event` itself —
#: `tests/requirements/test_notification_handlers.py` holds that promise to account, because the
#: failure mode is silent: the event settles, the domain effect happens, and the notice that was
#: added to the routing table is simply never written.
_ROUTED_BY_A_DEDICATED_HANDLER = frozenset({"m2.requirement.submitted"})


def _consume_notification_event(event: OutboxEvent) -> None:
    """Adapt the domain command to the registry's shape.

    `notify_for_outbox_event` returns what it wrote so tests can assert the wording; the outbox
    contract is `(OutboxEvent) -> None`. This is the one line that reconciles them, rather than
    weakening either signature.
    """

    notify_for_outbox_event(event)


def _register_notification_consumers() -> None:
    """Give every routed M2 event a consumer that tells the people it concerns.

    Registered from a loop over `notifications.NOTIFICATION_ROUTES` rather than as fourteen
    near-identical functions: each would differ only in a string, and a wall of copies is where a
    missing recipient hides. The routing decisions stay reviewable in one table.

    Idempotent by key rather than by state — `notify_for_outbox_event` derives each intent's
    idempotency key from this event's own, and `request_notification` returns the existing row for
    a key it has already seen, so a re-driven event shows nobody the same notice twice.

    These consumers are additive: they are the *first* consumer for every event in the table,
    each of which was previously exhausting its nine attempts against `No handler registered.`
    Registering here means those events now settle instead of dead-lettering. If one later needs a
    second effect, it belongs inside that event's own domain command, not in a rival handler —
    `register_outbox_handler` permits exactly one consumer per event type.

    `_ROUTED_BY_A_DEDICATED_HANDLER` is that rule applied to itself. Skipping silently would let a
    genuine double-registration hide as a skip, so the set is named, and the handler each entry
    points at calls `notify_for_outbox_event` itself.
    """

    for event_type in notified_event_types():
        if event_type in _ROUTED_BY_A_DEDICATED_HANDLER:
            continue
        register_outbox_handler(event_type=event_type)(_consume_notification_event)


_register_notification_consumers()


#: Events that are written down and consumed by nobody, on purpose.
#:
#: `dispatch_outbox_event` treats an unregistered event type as a code defect, and rightly:
#: it spends the delivery attempt, marks the event `FAILED` and raises, so an undeployed
#: consumer is loud instead of silent. The cost of that correctness is that an event emitted
#: purely as a record — because the fact belongs in the outbox for replay, audit and future
#: consumers — dead-letters on every single emission, burning nine Celery attempts and filling
#: the worker log with tracebacks that describe no fault. Every entry below was doing exactly
#: that.
#:
#: Registering them here is the difference between "nobody consumes this" and "nobody has
#: written the consumer yet", which is the distinction the raise exists to make and could not
#: make while both looked identical. A new event type still fails loudly until it appears in
#: this set or gets a real handler.
_RECORDED_ONLY = frozenset(
    {
        # Operations approved a pricing policy. The decision is already on the policy row with
        # its approver and timestamp; the event exists so a future consumer can replay it.
        "m2.commercial_policy.activated",
        # An operator corrected or withdrew a crew member's paperwork or recorded gender. The
        # roster screens read the record directly, and the audit trail is the transition log.
        "m2.crew.documents_verified",
        "m2.crew.verification_removed",
        "m2.crew.gender_corrected",
        # A fixed-visit slot reached its terminal matching state. All three are already visible
        # where they matter: `held`/`booked` are the answer the accepting Partner just gave, and
        # `exhausted` sets `NO_PROFESSIONAL_FOUND`, which the Customer's request page renders
        # alongside the button that picks another time.
        "m2.fixed_visit_offer.held",
        "m2.fixed_visit_offer.booked",
        "m2.fixed_visit_offer.exhausted",
        # ---- Recorded only for now, but the emitting code means these to reach a person ----
        #
        # `sweep_unproven_day_settlements` says it is "paging" Operations about a one-sided
        # settlement claim, and `request_proposal_revision`'s own comment says a second tap
        # avoids "sending the vendor a duplicate" — of a notice that is not sent at all,
        # because neither event has a route in `notifications.NOTIFICATION_ROUTES`. Both want a
        # recipient and a template, which is a product decision rather than a defect fix; they
        # are named apart here so that decision is not lost among the ones that never needed one.
        "m2.shift.settlement_unproven",
        "m2.proposal.revision_requested",
    }
)


def _record_only(_event: OutboxEvent) -> None:
    """Settle an event whose only job was to exist. See `_RECORDED_ONLY`."""
    return None


def _register_recorded_only_events() -> None:
    for event_type in _RECORDED_ONLY:
        register_outbox_handler(event_type=event_type)(_record_only)


_register_recorded_only_events()
