"""Capability suspension (`M2-BE-509`, and the unblock for `M2-BE-113`).

What happens to money already committed against a capability the moment that capability stops
authorizing the work. Called from `handlers` on the suspension signal, it decides an outcome **per
stage** — settled, refunded, or flagged for a human — and never cancels the engagement itself.

The boundary: this module reads and unwinds stages that `opening` or `rate_card` laid out and
`funding` collected against. It opens nothing and it collects nothing.
"""

import uuid
from dataclasses import dataclass

from django.db import transaction

from apps.foundation.services import enqueue_outbox_event
from apps.requirements import stages
from apps.requirements.models import Engagement, EngagementStage

# ---------------------------------------------------------------------------
# Capability suspension (`M2-BE-509`, and the unblock for `M2-BE-113`)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SuspensionRouting:
    """What a suspension actually did to the money already committed against a capability."""

    #: Every live engagement the suspension touched.
    engagement_ids: tuple[uuid.UUID, ...]
    #: Engagements whose remaining work is now blocked and needs a replacement vendor.
    replacement_engagement_ids: tuple[uuid.UUID, ...]
    #: Stages whose funding was returned because no work had started against it.
    refunded_stage_ids: tuple[uuid.UUID, ...]


def capability_engagements(
    *, partner_id: uuid.UUID, variant_ids: list[uuid.UUID]
) -> list[Engagement]:
    """Live engagements a suspended capability was authorizing.

    Scoped by the variants the capability covers rather than by the Partner alone: a vendor
    suspended for workforce supply may hold perfectly valid project engagements, and sweeping
    those into a replacement queue would punish work the suspension says nothing about.
    """
    return list(
        Engagement.objects.select_for_update()
        .select_related("requirement")
        .filter(
            partner_id=partner_id,
            requirement__variant_id__in=variant_ids,
            status__in=(
                Engagement.Status.PENDING_START,
                Engagement.Status.ACTIVE,
                Engagement.Status.DISPUTED,
            ),
        )
    )


@transaction.atomic
def route_suspended_capability_engagements(
    *, partner_id: uuid.UUID, variant_ids: list[uuid.UUID], reason_code: str
) -> SuspensionRouting:
    """Send funded or committed work somewhere safe when a capability is suspended.

    **This is `M2-BE-113`, blocked since 10 August on the aggregate that did not exist until Wave
    C2 and the stage money that did not exist until this one.** `README.md` states the rule it
    implements: a capability suspended after selection is not only a Partner problem, because the
    platform is otherwise left holding authorized money against unauthorized work.

    Three outcomes, and which one applies is decided per stage rather than per engagement, because
    a half-finished project is exactly the case where one answer for the whole agreement is wrong:

    * **Work already approved or released stays settled.** It happened, the vendor did it, and a
      suspension is not a reason to claw back money for work a Customer accepted.
    * **A funded *work* stage nobody has started is refunded.** Vsolve is holding money for work
      this vendor is no longer permitted to do.
    * **A funded *material advance* is never swept back.** `README.md`: material money is spent,
      not earned. The vendor has bought the cement, so the money is gone in the physical world and
      refunding it automatically would be Vsolve deciding a goods dispute with a cron job. It is
      flagged for replacement instead, which is where a human decides whether the materials exist
      and who they belong to (`M2-BE-543`).
    * **Everything else is flagged for replacement.** A stage in progress or awaiting review is a
      judgement call — did the work happen? — and `README.md` is explicit that Operations makes it
      through a case rather than a sweep guessing.

    The engagement is not cancelled. Cancelling it would take the Customer's dispute rights and
    their evidence with it, and the Customer's problem is an unfinished building rather than a
    ledger entry.
    """
    touched: list[uuid.UUID] = []
    replacements: list[uuid.UUID] = []
    refunded: list[uuid.UUID] = []
    for engagement in capability_engagements(partner_id=partner_id, variant_ids=variant_ids):
        touched.append(engagement.id)
        needs_replacement = False
        for stage in EngagementStage.objects.select_for_update().filter(
            engagement=engagement,
            status__in=EngagementStage.OPEN_STATUSES,
        ):
            unstarted = stage.status == EngagementStage.Status.PENDING
            is_material = stage.kind == EngagementStage.Kind.MATERIAL_ADVANCE
            if unstarted and not is_material and stage.funded_paise > stage.refunded_amount_paise:
                refundable = stage.funded_paise - stage.refunded_amount_paise
                if (
                    stages.refund_stage_amount(
                        stage_id=stage.id,
                        amount_paise=refundable,
                        reason_code=f"m2_capability_suspended:{reason_code}"[:80],
                    )
                    is not None
                ):
                    refunded.append(stage.id)
            if not unstarted or (is_material and stage.funded_paise > 0):
                needs_replacement = True
        if needs_replacement:
            replacements.append(engagement.id)
        stages.record_event(
            engagement=engagement,
            stage=None,
            from_status=engagement.status,
            to_status=engagement.status,
            actor=None,
            reason_code="capability_suspended",
            reason=reason_code,
        )
        enqueue_outbox_event(
            aggregate_type="engagement",
            aggregate_id=engagement.id,
            event_type="m2.engagement.capability_suspended",
            idempotency_key=f"engagement-capability-suspended:{engagement.id}:{reason_code}",
            payload={
                "engagement_id": str(engagement.id),
                "partner_id": str(partner_id),
                "reason_code": reason_code,
                "needs_replacement": needs_replacement,
            },
        )
    return SuspensionRouting(
        engagement_ids=tuple(touched),
        replacement_engagement_ids=tuple(replacements),
        refunded_stage_ids=tuple(refunded),
    )
