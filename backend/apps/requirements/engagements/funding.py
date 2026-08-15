"""A5 stage funding (`M2-BE-412`, `413`): one stage at a time, in order, at face value.

The money half of a managed engagement. A checkout is opened for exactly one stage, and only the
provider's verified callback marks it funded — funding the first stage is what actually starts an
A5 project, which is why the engagement's `work_may_start_at` and `contact_released_at` are
written from here rather than at reconfirmation.

The boundary: laying the stages out is `opening`; unwinding their money when a capability is
suspended is `suspension`. This module only collects.
"""

import uuid

from django.db import transaction
from django.utils import timezone

from apps.commerce.models import PaymentAttempt
from apps.commerce.services import initiate_standalone_payment_attempt
from apps.identity.models import User
from apps.requirements import stages
from apps.requirements.exceptions import StageNotFundedError
from apps.requirements.models import Engagement, EngagementStage
from apps.requirements.services import record_transition

# ---------------------------------------------------------------------------
# A5 stage funding (`M2-BE-412`, `413`)
# ---------------------------------------------------------------------------


@transaction.atomic
def create_stage_funding_checkout(
    *, stage_id: uuid.UUID, actor: User, idempotency_key: str
) -> tuple[EngagementStage, PaymentAttempt]:
    """Fund one stage, at face value.

    **At face value** is the load-bearing phrase. The visit-plan money was spent on the visits and
    settles per share; discounting a stage by it would pay for those visits a second time, out of
    the vendor's work. There is no stage credit in this model.

    Stages fund one at a time and in order. Collecting the whole project because a proposal was
    accepted is the thing `README.md` explicitly forbids.
    """
    stage = (
        EngagementStage.objects.select_for_update()
        .select_related("engagement__requirement")
        .get(pk=stage_id)
    )
    engagement = stage.engagement
    if engagement.commercial_mode != Engagement.CommercialMode.MANAGED_PAYMENT_REQUIRED:
        raise StageNotFundedError("This engagement is paid directly to the vendor.")
    if stage.funding_state == EngagementStage.FundingState.FUNDED:
        raise StageNotFundedError("This stage is already funded.")
    if stage.funding_state == EngagementStage.FundingState.PENDING and (
        stage.payment_attempt is not None
    ):
        return stage, stage.payment_attempt
    unfunded_earlier = (
        EngagementStage.objects.filter(engagement=engagement, position__lt=stage.position)
        .exclude(funding_state=EngagementStage.FundingState.FUNDED)
        .exists()
    )
    if unfunded_earlier:
        raise StageNotFundedError("Fund the earlier stages of this project first.")

    # A material advance is a different money purpose from a work milestone (`M2-BE-543`), and the
    # purpose is what carries that difference into the ledger, the reconciliation report and the
    # refund rules. Same table, same capture path, same face-value rule — a different name for
    # money that is spent rather than earned.
    attempt = initiate_standalone_payment_attempt(
        purpose=(
            PaymentAttempt.Purpose.M2_MATERIAL_ADVANCE
            if stage.kind == EngagementStage.Kind.MATERIAL_ADVANCE
            else PaymentAttempt.Purpose.M2_STAGE_FUNDING
        ),
        amount_paise=stage.amount_paise,
        idempotency_key=idempotency_key,
    )
    stage.funding_state = EngagementStage.FundingState.PENDING
    stage.payment_attempt = attempt
    stage.save(update_fields=("funding_state", "payment_attempt", "updated_at"))
    requirement = engagement.requirement
    record_transition(
        requirement=requirement,
        from_status=requirement.status,
        to_status=requirement.status,
        actor=actor,
        reason_code="stage_funding_started",
        reason=f"stage:{stage.id} position:{stage.position} for {stage.amount_paise} paise",
    )
    return stage, attempt


@transaction.atomic
def complete_stage_funding(*, payment_attempt_id: uuid.UUID) -> EngagementStage | None:
    """Verified callback only. Funding the first stage is what starts an A5 project."""
    stage = (
        EngagementStage.objects.select_for_update(of=("self",))
        .select_related("engagement", "payment_attempt")
        .filter(payment_attempt_id=payment_attempt_id)
        .first()
    )
    if stage is None:
        return None
    if stage.funding_state == EngagementStage.FundingState.FUNDED:
        return stage
    attempt = stage.payment_attempt
    if attempt is None or attempt.status != PaymentAttempt.Status.CAPTURED:
        return stage
    if attempt.amount_paise != stage.amount_paise:
        # A stage funds at face value or it does not fund. A short payment leaves the stage
        # unfunded and visible in reconciliation rather than quietly starting work.
        return stage

    now = timezone.now()
    stage.funding_state = EngagementStage.FundingState.FUNDED
    stage.funded_at = now
    stage.funded_paise = attempt.amount_paise
    stage.status = EngagementStage.Status.IN_PROGRESS
    stage.started_at = stage.started_at or now
    stage.save(
        update_fields=(
            "funding_state",
            "funded_at",
            "funded_paise",
            "status",
            "started_at",
            "updated_at",
        )
    )
    stages.add_engagement_money(stage.engagement_id, funded_total_paise=attempt.amount_paise)
    stages.record_event(
        engagement=stage.engagement,
        stage=stage,
        from_status=EngagementStage.Status.PENDING,
        to_status=stage.status,
        actor=None,
        reason_code="stage_funding_verified",
        reason=f"{attempt.amount_paise} paise",
    )

    engagement = Engagement.objects.select_for_update().get(pk=stage.engagement_id)
    if engagement.work_may_start_at is None:
        engagement.work_may_start_at = now
        engagement.contact_released_at = now
        engagement.status = Engagement.Status.ACTIVE
        engagement.save(
            update_fields=(
                "work_may_start_at",
                "contact_released_at",
                "status",
                "updated_at",
            )
        )
    return stage
