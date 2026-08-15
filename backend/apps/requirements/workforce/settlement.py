"""What one shift-day is worth, and the two taps that say it was paid — money we never touch.

`_refresh_settlement` is the arithmetic (present workers at the frozen per-worker rate, plus the
extras both sides accepted), `upi_payment_link` is a convenience deep link into the Customer's own
UPI app, and `confirm_day_settled` records who tapped. There is no `PaymentAttempt`, no ledger
entry and no payout below this line, and there is not supposed to be: ADR-0009 puts the wage
peer-to-peer at day end and the platform's only job is to publish the number and keep the trail.

The boundary: this module computes and records. What *changes* the amount — the attendance count
and the accepted extras — belongs to `attendance` and `extras`, which call in here rather than the
other way round.
"""

import uuid
from datetime import timedelta

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from apps.foundation.services import enqueue_outbox_event
from apps.identity.models import User
from apps.requirements import stages
from apps.requirements.exceptions import (
    RequirementNotFoundError,
    StageTransitionError,
)
from apps.requirements.models import (
    DaySettlement,
    Engagement,
    EngagementAmendment,
    EngagementStage,
    ShiftAttendance,
)

from .base import _assert_workforce_stage, _locked_stage, ensure_attendance, shift_terms

# ---------------------------------------------------------------------------
# The evening settlement (`M2-BE-536`, `537`)
# ---------------------------------------------------------------------------


def _stage_extras_paise(stage: EngagementStage) -> int:
    """Overtime and add-ons both sides accepted against this shift-day, in paise.

    Read from the applied `EngagementAmendment` rows pointing at this stage, so the settlement
    amount can only include an extra that went through the amendment engine and was authorized.
    An extra agreed over the phone contributes nothing here, which is the point of `M2-BE-538`.
    """
    total = EngagementAmendment.objects.filter(
        stage=stage,
        applied_at__isnull=False,
        delta_paise__gt=0,
    ).aggregate(total=Sum("delta_paise"))["total"]
    return int(total or 0)


def _refresh_settlement(
    *,
    stage: EngagementStage,
    engagement: Engagement,
    attendance: ShiftAttendance,
) -> DaySettlement:
    """Compute what this day is worth, and stop computing it once both sides have agreed.

    Recomputed on every attendance move so a corrected count and a late-approved overtime both
    reach the amount before anybody taps. **Frozen at `SETTLED`**: an amount that could still move
    after both parties confirmed it would make the tap trail evidence of nothing.
    """
    terms = shift_terms(engagement)
    present = attendance.present_count or 0
    extras = _stage_extras_paise(stage)
    amount = terms.per_worker_paise * present + extras

    settlement = DaySettlement.objects.select_for_update().filter(stage=stage).first()
    if settlement is None:
        return DaySettlement.objects.create(
            stage=stage,
            engagement=engagement,
            per_worker_paise=terms.per_worker_paise,
            workers_present=present,
            workers_expected=attendance.expected_count,
            extras_paise=extras,
            amount_paise=amount,
        )
    if settlement.status == DaySettlement.Status.SETTLED:
        return settlement
    settlement.per_worker_paise = terms.per_worker_paise
    settlement.workers_present = present
    settlement.workers_expected = attendance.expected_count
    settlement.extras_paise = extras
    settlement.amount_paise = amount
    settlement.save(
        update_fields=(
            "per_worker_paise",
            "workers_present",
            "workers_expected",
            "extras_paise",
            "amount_paise",
            "updated_at",
        )
    )
    return settlement


def upi_payment_link(settlement: DaySettlement) -> str | None:
    """A UPI deep link to the lead's own VPA at the exact published amount — a **convenience**.

    `None` whenever the lead has not published a VPA, and that is an ordinary state rather than an
    error: the amount is still shown, the crew is still paid, and the platform's absence from the
    transaction is the design rather than a gap in it.

    The amount is written in rupees because that is what the UPI specification takes, derived from
    integer paise by a division that is exact by construction — every component of the card is
    stored in paise and no rounding happens anywhere in this file.
    """
    business = getattr(settlement.engagement.partner, "business_profile", None)
    vpa = getattr(business, "upi_vpa", "") if business is not None else ""
    if not vpa:
        return None
    rupees = f"{settlement.amount_paise // 100}.{settlement.amount_paise % 100:02d}"
    payee = settlement.engagement.partner.display_name.replace("&", " ")[:60]
    return (
        f"upi://pay?pa={vpa}&pn={payee}&am={rupees}&cu=INR"
        f"&tn=Vsolve%20day%20settlement%20{settlement.stage.position}"
    )


@transaction.atomic
def confirm_day_settled(*, stage_id: uuid.UUID, actor: User) -> DaySettlement:
    """The "Day settled?" tap — one, from either side, from either side (`M2-BE-536`).

    The command records **who tapped**, and nothing else. It moves no money, because the money is
    peer-to-peer; it does not gate the next day, because a lead who has not been paid still turns
    up or does not on their own terms; and it does not decide anything when only one side taps.

    A one-sided claim is left standing as `SUPERVISOR_CLAIMED` or `CUSTOMER_CLAIMED`, which is what
    Operations reads as **unproven**. That is the honest state: one person says they settled and
    the other has not answered. The alternative — treating the first tap as the fact — would make
    the trail worthless in the one argument it exists for.
    """
    stage = _locked_stage(stage_id)
    engagement = _assert_workforce_stage(stage)
    attendance = ensure_attendance(stage=stage)
    if attendance.present_count is None:
        raise StageTransitionError(
            "The day has not been recorded yet, so there is no amount to settle.",
        )
    settlement = _refresh_settlement(stage=stage, engagement=engagement, attendance=attendance)
    is_customer = engagement.customer_id == actor.id
    is_partner = engagement.partner.user_id == actor.id
    if not (is_customer or is_partner):
        raise RequirementNotFoundError()

    now = timezone.now()
    fields: list[str] = ["status", "updated_at"]
    if is_customer and settlement.customer_confirmed_at is None:
        settlement.customer_confirmed_at = now
        settlement.customer_confirmed_by = actor
        fields += ["customer_confirmed_at", "customer_confirmed_by"]
    if is_partner and settlement.supervisor_confirmed_at is None:
        settlement.supervisor_confirmed_at = now
        settlement.supervisor_confirmed_by = actor
        fields += ["supervisor_confirmed_at", "supervisor_confirmed_by"]

    both = (
        settlement.customer_confirmed_at is not None
        and settlement.supervisor_confirmed_at is not None
    )
    if both:
        settlement.status = DaySettlement.Status.SETTLED
        settlement.settled_at = settlement.settled_at or now
        fields.append("settled_at")
    elif settlement.customer_confirmed_at is not None:
        settlement.status = DaySettlement.Status.CUSTOMER_CLAIMED
    elif settlement.supervisor_confirmed_at is not None:
        settlement.status = DaySettlement.Status.SUPERVISOR_CLAIMED
    settlement.save(update_fields=tuple(dict.fromkeys(fields)))

    stages.record_event(
        engagement=engagement,
        stage=stage,
        from_status=stage.status,
        to_status=stage.status,
        actor=actor,
        reason_code="day_settled_confirmed",
        reason=f"{settlement.amount_paise} paise, {settlement.status}",
    )
    if both:
        enqueue_outbox_event(
            aggregate_type="engagement",
            aggregate_id=engagement.id,
            event_type="m2.shift.day_settled",
            idempotency_key=f"day-settled:{settlement.id}",
            payload={
                "engagement_id": str(engagement.id),
                "stage_id": str(stage.id),
                "amount_paise": settlement.amount_paise,
            },
        )
    return settlement


def unproven_settlement_ids(*, older_than_hours: int = 24) -> list[uuid.UUID]:
    """One-sided settlement claims old enough for Operations to look at.

    A selector, not a sweep that decides anything. There is no command behind it that could settle
    a day on one person's word — the whole point is that nothing can — so this exists to put the
    rows in front of a human, which is the only thing that can resolve them.
    """
    cutoff = timezone.now() - timedelta(hours=older_than_hours)
    return list(
        DaySettlement.objects.filter(
            Q(status=DaySettlement.Status.SUPERVISOR_CLAIMED)
            | Q(status=DaySettlement.Status.CUSTOMER_CLAIMED),
            updated_at__lt=cutoff,
        ).values_list("id", flat=True)
    )
