"""Customer-held completion codes for A5 projects.

Sharing the code is the Customer's explicit acceptance of all funded work; entering it is the
Partner's auditable close-out action. There is no Partner-readable code endpoint and no tap-only
completion fallback.
"""

import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import ServiceVariant
from apps.identity.models import User
from apps.requirements import stages
from apps.requirements.exceptions import (
    RequirementDomainError,
    RequirementNotFoundError,
    StageDisputedError,
    StageNotFundedError,
    StageTransitionError,
)
from apps.requirements.models import Engagement, EngagementStage, ProjectCompletionOtp


class ProjectCompletionCodeRateLimitError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_project_completion_code_too_soon",
            message="A completion code was issued a moment ago. Use the code already on screen.",
            status_code=429,
            retryable=True,
        )


class ProjectCompletionCodeInvalidError(RequirementDomainError):
    def __init__(self) -> None:
        super().__init__(
            code="m2_project_completion_code_invalid",
            message="That completion code is not right. Ask the customer for the current code.",
            status_code=422,
        )


@dataclass(frozen=True, slots=True)
class ProjectCompletionCode:
    digits: str | None
    expires_at: datetime


def _cache_key(engagement_id: uuid.UUID) -> str:
    return f"m2:project-completion-code:{engagement_id}"


def _cooldown_key(engagement_id: uuid.UUID) -> str:
    return f"m2:project-completion-code:cooldown:{engagement_id}"


def _assert_completion_code_available(engagement: Engagement) -> None:
    if engagement.archetype != ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT:
        raise StageTransitionError("A completion code is only used for a custom project.")
    if engagement.status in (
        Engagement.Status.COMPLETED,
        Engagement.Status.WARRANTY,
        Engagement.Status.CLOSED,
    ):
        raise StageTransitionError("This project is already complete.")
    if engagement.status in (Engagement.Status.CANCELLED, Engagement.Status.DISPUTED):
        raise StageTransitionError("Resolve the open project issue before completing it.")

    live_stages = EngagementStage.objects.filter(engagement=engagement).exclude(
        status=EngagementStage.Status.CANCELLED
    )
    if live_stages.filter(status=EngagementStage.Status.DISPUTED).exists():
        raise StageDisputedError("Resolve the disputed stage before completing this project.")
    if live_stages.exclude(funding_state=EngagementStage.FundingState.FUNDED).exists():
        raise StageNotFundedError("Fund every agreed stage before completing this project.")


def project_completion_code_can_issue(engagement: Engagement) -> bool:
    try:
        _assert_completion_code_available(engagement)
    except RequirementDomainError:
        return False
    return True


@transaction.atomic
def issue_project_completion_code(
    *, engagement_id: uuid.UUID, customer: User
) -> ProjectCompletionCode:
    engagement = (
        Engagement.objects.select_for_update().filter(pk=engagement_id, customer=customer).first()
    )
    if engagement is None:
        raise RequirementNotFoundError()
    _assert_completion_code_available(engagement)

    cooldown = int(settings.OTP_RESEND_COOLDOWN_SECONDS)
    if not cache.add(_cooldown_key(engagement.id), "1", timeout=cooldown):
        raise ProjectCompletionCodeRateLimitError()

    now = timezone.now()
    ProjectCompletionOtp.objects.filter(engagement=engagement, consumed_at__isnull=True).update(
        expires_at=now
    )
    length = int(settings.OTP_CODE_LENGTH)
    digits = f"{secrets.randbelow(10**length):0{length}d}"
    ttl = int(settings.M2_PROJECT_COMPLETION_CODE_TTL_SECONDS)
    expires_at = now + timedelta(seconds=ttl)
    ProjectCompletionOtp.objects.create(
        engagement=engagement,
        code_hash=make_password(digits),
        expires_at=expires_at,
        max_attempts=settings.M2_PROJECT_COMPLETION_CODE_MAX_ATTEMPTS,
    )
    cache.set(_cache_key(engagement.id), digits, timeout=ttl)
    return ProjectCompletionCode(digits=digits, expires_at=expires_at)


def live_project_completion_code(engagement: Engagement) -> ProjectCompletionCode | None:
    challenge = (
        ProjectCompletionOtp.objects.filter(engagement=engagement, consumed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if challenge is None or not challenge.is_live:
        return None
    cached = cache.get(_cache_key(engagement.id))
    return ProjectCompletionCode(
        digits=cached if isinstance(cached, str) else None,
        expires_at=challenge.expires_at,
    )


def confirm_project_completion_with_code(
    *, engagement_id: uuid.UUID, partner_user: User, code: str
) -> Engagement:
    """Settle every funded stage and close the project after the Customer shares the code."""

    rejected = False
    completed: Engagement | None = None

    with transaction.atomic():
        engagement = (
            Engagement.objects.select_for_update()
            .select_related("customer", "partner")
            .filter(pk=engagement_id, partner__user=partner_user)
            .first()
        )
        if engagement is None:
            raise RequirementNotFoundError()
        if engagement.status in (
            Engagement.Status.COMPLETED,
            Engagement.Status.WARRANTY,
            Engagement.Status.CLOSED,
        ):
            return engagement
        _assert_completion_code_available(engagement)

        challenge = (
            ProjectCompletionOtp.objects.select_for_update()
            .filter(engagement=engagement, consumed_at__isnull=True)
            .order_by("-created_at")
            .first()
        )
        if challenge is None or not challenge.is_live:
            rejected = True
        elif not check_password(code, challenge.code_hash):
            challenge.failed_attempts += 1
            challenge.save(update_fields=("failed_attempts",))
            rejected = True
        else:
            challenge.consumed_at = timezone.now()
            challenge.consumed_by = partner_user
            challenge.save(update_fields=("consumed_at", "consumed_by"))
            cache.delete(_cache_key(engagement.id))

            stage_ids = list(
                EngagementStage.objects.filter(engagement=engagement)
                .exclude(status=EngagementStage.Status.CANCELLED)
                .order_by("position")
                .values_list("id", flat=True)
            )
            for stage_id in stage_ids:
                stages.settle_stage_with_project_completion_code(
                    stage_id=stage_id,
                    customer=engagement.customer,
                )

            completed = stages.accept_engagement_completion(
                engagement_id=engagement.id,
                actor=engagement.customer,
                completion_code_verified=True,
            )

    if rejected:
        raise ProjectCompletionCodeInvalidError()
    if completed is None:  # pragma: no cover - every accepted path assigns it.
        raise StageTransitionError("This project could not be completed.")
    return completed
