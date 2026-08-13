"""Scope amendments on a live M2 engagement, through the **M1 amendment engine** (`M2-BE-505`).

`02-backend-tasks.md` calls this the single largest duplication risk in M2, and the risk is real:
"a vendor proposes extra work, the Customer accepts, money moves, the scope changes" is a
subsystem `apps.fulfilment.amendments` already owns, and rebuilding it beside itself would give
this platform two amendment lifecycles, two expiry rules and two definitions of "authorized".

So there is one. `fulfilment.ScopeAmendment` carries the status machine, the response deadline,
the reason and the version; `fulfilment.ScopeAmendmentLine` carries the priced lines;
`fulfilment.amendments.guard_amendment_not_expired` is the shared expiry rule, made public in this
wave so both entry points call the same function rather than each holding a copy.

**What could not be reused, and why.** The four command functions in that module resolve their
aggregate through `locked_booking_context(booking_id)` and price every line through
`pricing.selectors.current_task_rate` — the documented M1 boundary at the top of that file: *only
catalog `TASK` lines are supported here.* An M2 engagement has no `Booking`, no `FulfilmentUnit`
and no catalog task, so those four functions cannot be called; calling them would be calling a
lookup that cannot succeed. `M2-BE-505` anticipates exactly this and names the remedy: "M2's
non-catalog lines are the extension you design." They are `ScopeAmendmentLine.Kind.LABOUR_DAY` and
`PROJECT_WORK`, and the commands below are their entry point.

The result is one engine with two front doors, not two engines. Every row an M2 amendment writes
lands in the M1 tables, moves through the M1 statuses, and is readable by anything that already
reads an amendment.

**Pricing, by archetype, and the server always decides.**

* **A3 time extension.** More worker-days at the rate frozen on the engagement — the rate the
  Customer already agreed to and the statutory wage-floor guard already passed at quoting time.
  The vendor names a number of days; the server names the money. A vendor who could name the money
  could re-price a job the Customer has already committed to.
* **A5 change order.** The vendor prices each line, because an A5 outcome is bespoke and the
  vendor is the price authority in that archetype exactly as they are on the original estimate.
  The server still sums the lines and **rejects any client-supplied total**, so the number the
  Customer is asked to accept is always the number the lines add up to.

**`M2-BE-506`: money before scope.** An accepted amendment does not change funded scope until the
money has actually moved. A positive delta on a managed (A5) engagement goes to `PAYMENT_PENDING`
and is applied only from a **verified provider callback**; a negative delta refunds first and
applies second. An A3 amendment moves no platform money at all — `LEAD_ONLY` means the Customer
pays the vendor directly — so it authorizes on acceptance, which is the honest representation of
a mode where Vsolve holds nothing.
"""

import uuid
from dataclasses import dataclass
from typing import Any, Final

from django.db import transaction
from django.utils import timezone

from apps.commerce.models import PaymentAttempt
from apps.commerce.services import initiate_standalone_payment_attempt
from apps.foundation.services import enqueue_outbox_event
from apps.fulfilment.amendments import AmendmentExpiredError, guard_amendment_not_expired
from apps.fulfilment.models import ScopeAmendment, ScopeAmendmentLine
from apps.identity.models import User
from apps.requirements import pricing, stages
from apps.requirements.exceptions import (
    AmendmentNotActionableError,
    AmendmentRequiredError,
    StageTransitionError,
)
from apps.requirements.models import (
    Engagement,
    EngagementAmendment,
    EngagementStage,
)

#: How many lines one amendment may carry. Bounded like `MAX_AMENDMENT_TASK_QUANTITY` in the M1
#: module and for the same reason: an amendment a Customer cannot read in one screen is an
#: amendment they accept without reading.
MAXIMUM_AMENDMENT_LINES: Final = 10

#: The most extra worker-days one A3 time extension may add. A vendor who needs more than a
#: fortnight of extra time is renegotiating the job, not extending it.
MAXIMUM_EXTENSION_DAYS: Final = 14


@dataclass(frozen=True, slots=True)
class AmendmentLineInput:
    """One line a vendor proposed, before the server has decided what it costs."""

    label: str
    #: Worker-days for a time extension; a count of the described work for a change order.
    quantity: int
    #: A5 only, and signed: a negative amount removes scope. Ignored on A3, where the rate is
    #: frozen on the engagement and the vendor does not get to restate it.
    amount_paise: int | None = None


# ---------------------------------------------------------------------------
# Pricing the two shapes
# ---------------------------------------------------------------------------


def _frozen_day_rate_paise(engagement: Engagement) -> int:
    """The agreed cost of one worker-day, out of the terms frozen at reconfirmation.

    Read from `terms_snapshot` rather than from the live `Proposal` on purpose. The proposal is
    append-only and a vendor may have superseded it since; the snapshot is what both parties
    actually agreed to, which is the only rate an extension may be priced at.
    """
    terms: dict[str, Any] = engagement.terms_snapshot or {}
    rate = terms.get("rate_paise_per_worker_day")
    workers = terms.get("worker_count") or 1
    if not rate:
        raise AmendmentRequiredError(
            "This engagement has no agreed daily rate, so extra time cannot be priced from it.",
        )
    return int(rate) * int(workers)


def _price_time_extension(
    *, engagement: Engagement, lines: list[AmendmentLineInput]
) -> list[tuple[AmendmentLineInput, int]]:
    day_rate = _frozen_day_rate_paise(engagement)
    total_days = sum(line.quantity for line in lines)
    if total_days <= 0:
        raise StageTransitionError("A time extension needs at least one extra day.")
    if total_days > MAXIMUM_EXTENSION_DAYS:
        raise StageTransitionError(
            f"A time extension can add at most {MAXIMUM_EXTENSION_DAYS} days.",
        )
    return [(line, day_rate * line.quantity) for line in lines]


def _price_change_order(*, lines: list[AmendmentLineInput]) -> list[tuple[AmendmentLineInput, int]]:
    priced: list[tuple[AmendmentLineInput, int]] = []
    for line in lines:
        if line.amount_paise is None or line.amount_paise == 0:
            raise StageTransitionError("Every change-order line needs an amount.")
        priced.append((line, int(line.amount_paise)))
    return priced


# ---------------------------------------------------------------------------
# Propose
# ---------------------------------------------------------------------------


def live_amendment(engagement: Engagement) -> EngagementAmendment | None:
    """The amendment this engagement is still waiting on a decision or a payment for."""
    return (
        EngagementAmendment.objects.select_related("amendment")
        .filter(engagement=engagement, amendment__status__in=ScopeAmendment.LIVE_STATUSES)
        .first()
    )


@transaction.atomic
def propose_engagement_amendment(
    *,
    engagement_id: uuid.UUID,
    actor: User,
    kind: str,
    reason: str,
    lines: list[AmendmentLineInput],
    stage_id: uuid.UUID | None = None,
) -> EngagementAmendment:
    """The vendor asks to change the agreed work (`M2-BE-505`).

    One live amendment per engagement, held by locking the engagement row rather than by a
    constraint — the status that decides "live" lives on the M1 table, and a partial unique index
    across two tables is not a thing. The lock is what makes two vendors' tabs produce one
    proposal.

    The archetype decides the shape and the shape is not negotiable: an A3 engagement takes a time
    extension, an A5 engagement takes a change order. Allowing either on either would let an A3
    vendor name their own price for extra days, which is exactly what the frozen rate exists to
    stop.
    """
    engagement = (
        Engagement.objects.select_for_update(of=("self",))
        .select_related("requirement__configuration", "partner")
        .get(pk=engagement_id)
    )
    if engagement.status not in (Engagement.Status.ACTIVE, Engagement.Status.DISPUTED):
        raise StageTransitionError("This engagement is not open to changes.")
    if not reason.strip():
        raise StageTransitionError("Say why this change is needed.")
    if not lines or len(lines) > MAXIMUM_AMENDMENT_LINES:
        raise StageTransitionError(
            f"A change request needs between 1 and {MAXIMUM_AMENDMENT_LINES} lines.",
        )
    expected_kind = (
        EngagementAmendment.Kind.TIME_EXTENSION
        if engagement.commercial_mode == Engagement.CommercialMode.LEAD_ONLY
        else EngagementAmendment.Kind.CHANGE_ORDER
    )
    if kind != expected_kind:
        raise StageTransitionError("That is not the kind of change this engagement takes.")
    if live_amendment(engagement) is not None:
        raise AmendmentNotActionableError(
            "A change request is already waiting for a decision on this engagement.",
        )

    stage: EngagementStage | None = None
    if stage_id is not None:
        stage = EngagementStage.objects.filter(pk=stage_id, engagement=engagement).first()
        if stage is None:
            raise StageTransitionError("That stage does not belong to this engagement.")

    priced = (
        _price_time_extension(engagement=engagement, lines=lines)
        if kind == EngagementAmendment.Kind.TIME_EXTENSION
        else _price_change_order(lines=lines)
    )
    delta_paise = sum(amount for _line, amount in priced)
    if delta_paise == 0:
        raise StageTransitionError("A change request has to change something.")
    if delta_paise < 0:
        _assert_reduction_is_possible(stage=stage, delta_paise=delta_paise)

    amendment = ScopeAmendment.objects.create(
        booking=None,
        proposed_by=engagement.partner,
        reason=reason.strip()[:240],
        total_paise=abs(delta_paise),
        # Raises `m2_policy_unavailable` when the owner has set no response window.
        # `ScopeAmendment.expires_at` is not nullable and an amendment with no deadline is an
        # open-ended claim on a Customer's money, so refusing to propose one is the fail-closed
        # answer and inventing a window is not.
        expires_at=pricing.amendment_response_deadline(engagement.requirement),
    )
    line_kind = (
        ScopeAmendmentLine.Kind.LABOUR_DAY
        if kind == EngagementAmendment.Kind.TIME_EXTENSION
        else ScopeAmendmentLine.Kind.PROJECT_WORK
    )
    ScopeAmendmentLine.objects.bulk_create(
        [
            ScopeAmendmentLine(
                amendment=amendment,
                position=position,
                kind=line_kind,
                code=line_kind.lower(),
                label=line.label[:240],
                quantity=abs(line.quantity) or 1,
                amount_paise=abs(amount),
                snapshot={
                    "engagement_id": str(engagement.id),
                    "signed_amount_paise": amount,
                    "priced_by": (
                        "server_frozen_rate"
                        if kind == EngagementAmendment.Kind.TIME_EXTENSION
                        else "vendor"
                    ),
                },
            )
            for position, (line, amount) in enumerate(priced, start=1)
        ]
    )
    link = EngagementAmendment.objects.create(
        engagement=engagement,
        stage=stage,
        amendment=amendment,
        kind=kind,
        delta_paise=delta_paise,
    )
    stages.record_event(
        engagement=engagement,
        stage=stage,
        from_status=engagement.status,
        to_status=engagement.status,
        actor=actor,
        reason_code="amendment_proposed",
        reason=f"{kind} {delta_paise} paise: {amendment.reason}",
    )
    return link


def _assert_reduction_is_possible(*, stage: EngagementStage | None, delta_paise: int) -> None:
    """Scope can only be taken out of work that has not been settled.

    A released stage has been approved and paid; removing it afterwards is a clawback, which is a
    dispute or a vendor-abandonment recovery (`M2-BE-545`, Wave C5) rather than an amendment.

    A reduction also cannot empty a stage. Removing a milestone entirely is a cancellation, and
    routing a cancellation through the amendment engine would leave a zero-value stage sitting in
    the agreement pretending to be work.
    """
    if stage is None:
        raise StageTransitionError("Say which stage is being reduced.")
    if stage.status not in (
        EngagementStage.Status.PENDING,
        EngagementStage.Status.IN_PROGRESS,
        EngagementStage.Status.CORRECTION_REQUESTED,
    ):
        raise StageTransitionError("That stage is too far along to be reduced.")
    if abs(delta_paise) >= stage.amount_paise:
        raise StageTransitionError(
            "Removing a stage entirely is a cancellation, not a change request.",
        )


# ---------------------------------------------------------------------------
# Decide (`M2-BE-506`)
# ---------------------------------------------------------------------------


def _locked_link(amendment_id: uuid.UUID) -> EngagementAmendment:
    return (
        EngagementAmendment.objects.select_for_update(of=("self",))
        .select_related("amendment", "engagement__requirement__configuration", "stage")
        .get(pk=amendment_id)
    )


@transaction.atomic
def decline_engagement_amendment(
    *, engagement_amendment_id: uuid.UUID, actor: User
) -> EngagementAmendment:
    """The Customer says no. The agreed work is unchanged and nothing has moved."""
    link = _locked_link(engagement_amendment_id)
    amendment = link.amendment
    if amendment.status == ScopeAmendment.Status.CUSTOMER_DECLINED:
        return link
    if amendment.status != ScopeAmendment.Status.PROPOSED:
        raise AmendmentNotActionableError()
    _guard_not_expired(amendment)

    amendment.status = ScopeAmendment.Status.CUSTOMER_DECLINED
    amendment.responded_at = timezone.now()
    amendment.version += 1
    amendment.save(update_fields=("status", "responded_at", "version"))
    stages.record_event(
        engagement=link.engagement,
        stage=link.stage,
        from_status=ScopeAmendment.Status.PROPOSED,
        to_status=amendment.status,
        actor=actor,
        reason_code="amendment_declined",
    )
    return link


def _guard_not_expired(amendment: ScopeAmendment) -> None:
    """The shared M1 rule, in this surface's error vocabulary."""
    try:
        guard_amendment_not_expired(amendment)
    except AmendmentExpiredError as exc:
        raise AmendmentNotActionableError(
            "This change request expired before it was answered.",
        ) from exc


@transaction.atomic
def accept_engagement_amendment(
    *, engagement_amendment_id: uuid.UUID, actor: User, idempotency_key: str
) -> tuple[EngagementAmendment, PaymentAttempt | None]:
    """The Customer agrees. `M2-BE-506`: money first, scope second.

    Three routes, and which one is taken is decided by the commercial mode and the sign of the
    delta rather than by anything a client sends:

    * **`LEAD_ONLY` (A3).** No platform money exists to move — the Customer pays the vendor
      directly — so the amendment authorizes here and the extra shift-days appear immediately.
    * **Managed, negative delta.** The refund is issued against the stage's own funding payment
      before the scope shrinks, so there is no window in which the Customer owns less work than
      they have paid for.
    * **Managed, positive delta.** `PAYMENT_PENDING` plus a `PaymentAttempt`, and **nothing
      changes until a verified provider callback**. A client redirect claiming success is a claim
      by the party that benefits from it; the scope moves in `complete_engagement_amendment_payment`
      and nowhere else.

    Returns the attempt only on the third route. `None` means the amendment is already authorized
    and applied.
    """
    link = _locked_link(engagement_amendment_id)
    amendment = link.amendment
    engagement = link.engagement
    if amendment.status == ScopeAmendment.Status.AUTHORIZED:
        return link, link.payment_attempt
    if amendment.status == ScopeAmendment.Status.PAYMENT_PENDING:
        if link.payment_attempt is None:  # pragma: no cover - written in the same transaction
            raise AmendmentNotActionableError("This change request has no payment to resume.")
        # Resume rather than start a second charge, exactly as the M1 approval and the M2 unlock
        # checkout both do for a Customer who closed the tab mid-payment.
        return link, link.payment_attempt
    if amendment.status != ScopeAmendment.Status.PROPOSED:
        raise AmendmentNotActionableError()
    _guard_not_expired(amendment)

    now = timezone.now()
    needs_payment = (
        engagement.commercial_mode == Engagement.CommercialMode.MANAGED_PAYMENT_REQUIRED
        and link.delta_paise > 0
    )
    amendment.status = (
        ScopeAmendment.Status.PAYMENT_PENDING if needs_payment else ScopeAmendment.Status.AUTHORIZED
    )
    amendment.responded_at = now
    amendment.version += 1
    amendment.save(update_fields=("status", "responded_at", "version"))
    stages.record_event(
        engagement=engagement,
        stage=link.stage,
        from_status=ScopeAmendment.Status.PROPOSED,
        to_status=amendment.status,
        actor=actor,
        reason_code="amendment_accepted",
        reason=f"{link.delta_paise} paise",
    )

    if not needs_payment:
        _apply(link=link, actor=actor)
        return link, None

    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.M2_SCOPE_AMENDMENT,
        amount_paise=link.delta_paise,
        idempotency_key=idempotency_key,
    )
    link.payment_attempt = attempt
    link.save(update_fields=("payment_attempt", "updated_at"))
    return link, attempt


@transaction.atomic
def complete_engagement_amendment_payment(
    *, payment_attempt_id: uuid.UUID
) -> EngagementAmendment | None:
    """Verified callback only. The moment an accepted amendment becomes agreed scope.

    Idempotent three ways, because a duplicate webhook, a provider retry and the reconciliation
    sweep all arrive here: the link row is locked, an already-`AUTHORIZED` amendment returns
    untouched, and the stage this creates is keyed on the amendment so a second pass finds it
    rather than creating another one.
    """
    link = (
        EngagementAmendment.objects.select_for_update(of=("self",))
        .select_related("amendment", "engagement__requirement__configuration", "payment_attempt")
        .filter(payment_attempt_id=payment_attempt_id)
        .first()
    )
    if link is None:
        return None
    if link.amendment.status == ScopeAmendment.Status.AUTHORIZED:
        return link
    attempt = link.payment_attempt
    if attempt is None or attempt.status != PaymentAttempt.Status.CAPTURED:
        return link
    if attempt.amount_paise != link.delta_paise:
        # A short payment buys no scope. The amendment stays `PAYMENT_PENDING` and visible in
        # reconciliation rather than quietly authorizing work the money does not cover.
        return link

    amendment = link.amendment
    amendment.status = ScopeAmendment.Status.AUTHORIZED
    amendment.version += 1
    amendment.save(update_fields=("status", "version"))
    stages.record_event(
        engagement=link.engagement,
        stage=link.stage,
        from_status=ScopeAmendment.Status.PAYMENT_PENDING,
        to_status=amendment.status,
        actor=None,
        reason_code="amendment_payment_verified",
    )
    _apply(link=link, actor=None)
    return link


# ---------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------


def _apply(*, link: EngagementAmendment, actor: User | None) -> EngagementAmendment:
    """Turn an authorized amendment into agreed scope.

    Additive amendments **append a stage** rather than growing an existing one. A stage is the
    unit of evidence, approval and money release, so extra work that arrives inside an already
    approved stage would be work nobody reviewed; appending keeps every rupee attached to a stage
    somebody has to accept.

    Reductions shrink the named stage and refund what was funded for the part that is going away.
    """
    if link.applied_at is not None:
        return link
    engagement = link.engagement
    now = timezone.now()

    if link.delta_paise > 0:
        created = _append_stage(link=link, engagement=engagement)
        link.applied_at = now
        link.save(update_fields=("applied_at", "updated_at"))
        stages.record_event(
            engagement=engagement,
            stage=created,
            from_status="",
            to_status=created.status,
            actor=actor,
            reason_code="amendment_stage_added",
            reason=f"{link.delta_paise} paise from amendment {link.id}",
        )
    else:
        _reduce_stage(link=link)
        link.applied_at = now
        link.save(update_fields=("applied_at", "updated_at"))

    engagement.refresh_from_db()
    enqueue_outbox_event(
        aggregate_type="engagement",
        aggregate_id=engagement.id,
        event_type="m2.amendment.authorized",
        idempotency_key=f"amendment-authorized:{link.id}",
        payload={
            "engagement_id": str(engagement.id),
            "engagement_amendment_id": str(link.id),
            "delta_paise": link.delta_paise,
        },
    )
    return link


def _append_stage(*, link: EngagementAmendment, engagement: Engagement) -> EngagementStage:
    """One more stage, at the end, carrying the amendment's whole delta.

    An A5 amendment stage arrives **already funded**: the amendment payment *is* its funding, at
    face value, which is what `M2-BE-506` means by requiring verified payment before scope
    changes. An A3 amendment stage arrives `PENDING` and needs no funding at all, because
    `LEAD_ONLY` collects nothing.
    """
    existing = EngagementStage.objects.filter(source_amendment=link).first()
    if existing is not None:
        return existing

    last_position = (
        EngagementStage.objects.filter(engagement=engagement)
        .order_by("-position")
        .values_list("position", flat=True)
        .first()
        or 0
    )
    is_managed = engagement.commercial_mode == Engagement.CommercialMode.MANAGED_PAYMENT_REQUIRED
    now = timezone.now()
    stage = EngagementStage.objects.create(
        engagement=engagement,
        position=last_position + 1,
        label=link.amendment.reason[:200],
        amount_paise=link.delta_paise,
        source_amendment=link,
        status=EngagementStage.Status.IN_PROGRESS if is_managed else EngagementStage.Status.PENDING,
        funding_state=(
            EngagementStage.FundingState.FUNDED
            if is_managed
            else EngagementStage.FundingState.NOT_REQUIRED
        ),
        payment_attempt=link.payment_attempt if is_managed else None,
        funded_paise=link.delta_paise if is_managed else 0,
        funded_at=now if is_managed else None,
        started_at=now if is_managed else None,
    )
    stages.add_engagement_money(
        engagement.id,
        staged_total_paise=link.delta_paise,
        amendment_delta_paise=link.delta_paise,
        funded_total_paise=link.delta_paise if is_managed else 0,
    )
    return stage


def _reduce_stage(*, link: EngagementAmendment) -> None:
    """Take scope out of a stage that has not been settled, and give back what was funded for it.

    **Refund first, shrink second**, and the order is load-bearing rather than tidy. The exposure
    constraint — never hold more of the Customer's money than there is agreed work — is checked on
    every statement, so shrinking the stage before returning the money would be the one instant in
    which the engagement holds funding for work that no longer exists, and the database would say
    so.
    """
    stage = link.stage
    if stage is None:  # pragma: no cover - `_assert_reduction_is_possible` refuses this earlier
        raise StageTransitionError("A reduction needs a stage.")
    reduction = abs(link.delta_paise)
    refund = stages.refund_stage_amount(
        stage_id=stage.id,
        amount_paise=reduction,
        reason_code="m2_scope_reduced_by_amendment",
    )
    if refund is not None:
        link.refund = refund
        link.save(update_fields=("refund", "updated_at"))

    locked = EngagementStage.objects.select_for_update().get(pk=stage.id)
    # `apply_amendment_amount` is the only door in `EngagementStage` that moves an agreed amount,
    # and this is its only caller — `M2-BE-508` held at the narrowest point rather than by
    # everybody remembering.
    locked.apply_amendment_amount(locked.amount_paise - reduction)
    stages.add_engagement_money(
        link.engagement_id,
        staged_total_paise=-reduction,
        amendment_delta_paise=-reduction,
    )
