"""The bridge between the two front doors: money already paid, carried onto the other lifecycle.

The only slice that has to know both doors at once, which is exactly why it is not inside either.
`operations` reclassifies a requirement from A3 to A5 or back; this decides what happens to what
the Customer has already paid, and the whole of `M2-BE-427` is the single rule that it is never
charged twice. Everything it needs from the doors it borrows — `_create_shares` from `visit_plans`
to cut a credited plan, `refund_share` from `settlement` to give back an uncommitted one — so the
dependency arrows all point into this module and none point out of it.
"""

import uuid

from django.db import transaction
from django.utils import timezone

from apps.requirements import pricing
from apps.requirements.models import (
    CustomerRequirement,
    QuoteUnlock,
    VisitPlan,
    VisitPlanShare,
)

from .base import A3, A5
from .settlement import refund_share
from .visit_plans import _create_shares

# ---------------------------------------------------------------------------
# Reclassification money rules (`M2-BE-427`)
# ---------------------------------------------------------------------------


@transaction.atomic
def carry_money_across_reclassification(
    *, requirement_id: uuid.UUID, from_archetype: str, to_archetype: str
) -> None:
    """Move what the Customer already paid for onto the other lifecycle. Never charge twice.

    **A3 → A5.** An active unlock becomes visit-plan credit. The plan is created `CHOSEN` at the
    smallest tier that has a price, carrying the unlock's paise, and its checkout collects only the
    difference — nothing when the credit covers it.

    **A5 → A3.** Shares nobody has consumed are refunded; earned shares stay earned, because those
    visits genuinely happened and those vendors genuinely travelled.

    Deliberately does **not** create an A3 unlock out of an A5 plan. An unlock is a purchase the
    Customer makes when quotes exist, and manufacturing one here would hand out access to quotes
    that have not been delivered yet.
    """
    requirement = CustomerRequirement.objects.select_for_update().get(pk=requirement_id)
    if from_archetype == A3 and to_archetype == A5:
        unlock = (
            QuoteUnlock.objects.select_for_update()
            .filter(requirement=requirement, status=QuoteUnlock.Status.ACTIVE)
            .first()
        )
        if unlock is None:
            return
        tiers = pricing.available_visit_plan_tiers()
        if not tiers:
            # No tier is priced, so there is nothing to carry the credit onto. The unlock stays
            # active and refundable rather than being silently spent.
            return
        tier = tiers[0]
        credited = VisitPlan.objects.filter(requirement=requirement).first() or VisitPlan(
            requirement=requirement
        )
        credited.plan_size = tier.row.plan_size
        credited.price = tier.row
        credited.price_paise = tier.amount_paise
        credited.vendor_payout_basis_points = tier.vendor_payout_basis_points or 0
        credited.credit_paise = min(unlock.price_paise, tier.amount_paise)
        credited.credit_unlock = unlock
        credited.status = VisitPlan.Status.CHOSEN
        credited.save()
        credited.shares.all().delete()
        _create_shares(credited)
        unlock.status = QuoteUnlock.Status.CONSUMED
        unlock.consumed_at = timezone.now()
        unlock.save(update_fields=("status", "consumed_at", "updated_at"))
        return

    if from_archetype == A5 and to_archetype == A3:
        existing = VisitPlan.objects.select_for_update().filter(requirement=requirement).first()
        if existing is None:
            return
        if existing.status == VisitPlan.Status.CHOSEN:
            existing.status = VisitPlan.Status.VOID
            existing.voided_at = timezone.now()
            existing.save(update_fields=("status", "voided_at", "updated_at"))
            return
        for share in existing.shares.filter(status__in=VisitPlanShare.OPEN_STATUSES):
            refund_share(share_id=share.id, reason_code="m2_requirement_reclassified")
