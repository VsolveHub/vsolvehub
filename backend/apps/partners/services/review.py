"""Operations decisions on the Partner application row itself.

The reviewer wave: claiming an application for review, releasing a claim so someone else can take
it, and the status transition that approves, sends it back for changes, declines, suspends or
offboards it — including the presence teardown and future
work release a suspension or offboarding must drag behind it. Reviewer decisions on the *documents*
attached to the application live in `documents`.
"""

import datetime
import logging
import uuid

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.assignments.suspension import release_future_work
from apps.identity.models import User
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.partners.exceptions import (
    PartnerApplicationIncompleteError,
    PartnerApplicationNotFoundError,
    PartnerReviewOwnershipError,
    PartnerSelfReviewError,
    PartnerTransitionError,
)
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerOnlineSession,
    PartnerProfile,
)
from apps.partners.selectors import presence_cache_key

from .base import (
    _assert_version,
    _base_application_is_complete,
    _latest_required_documents_are_approved,
    _record_transition,
)

logger = logging.getLogger(__name__)

#: The in-app notice each decision sends the Partner, by the status it moves to.
_DECISION_TEMPLATES = {
    PartnerApplication.Status.APPROVED: "partner_application_approved",
    PartnerApplication.Status.CHANGES_REQUIRED: "partner_application_changes_required",
    PartnerApplication.Status.DECLINED: "partner_application_declined",
    PartnerApplication.Status.SUSPENDED: "partner_account_suspended",
    PartnerApplication.Status.OFFBOARDED: "partner_account_offboarded",
}


def _notify_decision(*, application: PartnerApplication, previous_status: str, reason: str) -> None:
    """Tell the Partner what was decided. In-app, once per version; never blocks the decision.

    Only the change request carries Operations' words — the Partner needs them to fix anything.
    A decline or suspension reason stays on the transition for the audit trail.
    """
    template = _DECISION_TEMPLATES.get(PartnerApplication.Status(application.status))
    if template is None:
        return
    if (
        application.status == PartnerApplication.Status.APPROVED
        and previous_status == PartnerApplication.Status.SUSPENDED
    ):
        template = "partner_account_reinstated"
    context = (
        {"reason": reason.strip()}
        if application.status == PartnerApplication.Status.CHANGES_REQUIRED
        else {}
    )
    try:
        with transaction.atomic():
            request_notification(
                recipient_id=application.partner.user_id,
                purpose="partner_application_decision",
                channel=NotificationIntent.Channel.IN_APP,
                template_code=template,
                context=context,
                idempotency_key=f"partner-application:{application.id}:v{application.version}",
            )
    except Exception:
        # The decision is already made and recorded; a notice that cannot be written is logged
        # for follow-up rather than undoing it. Ids only — never the reason or the partner.
        logger.exception(
            "partner_application_decision_notice_failed",
            extra={"application_id": str(application.id), "template": template},
        )


@transaction.atomic
def release_partner_application_review(
    *,
    actor: User,
    application_id: uuid.UUID,
    expected_version: int,
) -> PartnerApplication:
    """Hand a claimed application back to the queue, so any reviewer can claim it.

    Any Operations user may release, not only the holder: the case this exists for is a reviewer
    who is away, and an application nobody else could touch until they came back. An application
    under review returns to `SUBMITTED`; a resubmitted one that still names its old reviewer just
    loses the name. The release is recorded, with who did it.
    """
    application = (
        PartnerApplication.objects.select_for_update(of=("self",))
        .select_related("partner")
        .filter(id=application_id)
        .first()
    )
    if application is None:
        raise PartnerApplicationNotFoundError
    if application.partner.user_id == actor.id:
        raise PartnerSelfReviewError(
            object_type="partner_application",
            object_id=application.id,
        )
    _assert_version(application, expected_version)
    if application.status not in {
        PartnerApplication.Status.SUBMITTED,
        PartnerApplication.Status.UNDER_REVIEW,
    }:
        raise PartnerTransitionError("Only an application waiting for review can be released.")
    if application.review_assigned_to_id is None:
        raise PartnerTransitionError("Nobody holds this application.")

    previous_status = application.status
    application.status = PartnerApplication.Status.SUBMITTED
    application.review_assigned_to = None
    application.review_assigned_at = None
    application.version += 1
    application.save(
        update_fields=(
            "status",
            "review_assigned_to",
            "review_assigned_at",
            "version",
            "updated_at",
        ),
    )
    _record_transition(
        application=application,
        from_status=previous_status,
        actor=actor,
        reason_code="application_review_released",
    )
    return application


@transaction.atomic
def claim_partner_application(
    *,
    reviewer: User,
    application_id: uuid.UUID,
    expected_version: int,
) -> PartnerApplication:
    application = (
        PartnerApplication.objects.select_for_update(of=("self",))
        .select_related("partner", "review_assigned_to")
        .filter(id=application_id)
        .first()
    )
    if application is None:
        raise PartnerApplicationNotFoundError
    if application.partner.user_id == reviewer.id:
        raise PartnerSelfReviewError(
            object_type="partner_application",
            object_id=application.id,
        )
    _assert_version(application, expected_version)
    if application.status not in {
        PartnerApplication.Status.SUBMITTED,
        PartnerApplication.Status.UNDER_REVIEW,
    }:
        raise PartnerTransitionError("This application is not available for review.")
    if application.review_assigned_to_id not in {None, reviewer.id}:
        raise PartnerReviewOwnershipError(
            "This application is already assigned to another reviewer.",
        )
    if (
        application.review_assigned_to_id == reviewer.id
        and application.status == PartnerApplication.Status.UNDER_REVIEW
    ):
        return application

    previous_status = application.status
    application.review_assigned_to = reviewer
    application.review_assigned_at = timezone.now()
    application.status = PartnerApplication.Status.UNDER_REVIEW
    application.version += 1
    application.save(
        update_fields=(
            "review_assigned_to",
            "review_assigned_at",
            "status",
            "version",
            "updated_at",
        ),
    )
    _record_transition(
        application=application,
        from_status=previous_status,
        actor=reviewer,
        reason_code="application_review_claimed",
    )
    return application


DEFAULT_AVAILABILITY_START = datetime.time(9, 0)
DEFAULT_AVAILABILITY_END = datetime.time(19, 0)


def _seed_default_availability_if_missing(
    *, partner: PartnerProfile
) -> list[PartnerAvailabilityRule]:
    """Ensure every active service area has at least one active availability rule.

    If an active service area has zero active rules, seed default Mon-Sun 09:00-19:00
    using get_or_create to guarantee safety-net availability without overwriting
    any existing custom rules.
    """
    seeded: list[PartnerAvailabilityRule] = []
    active_areas = [
        link.service_area
        for link in partner.service_area_links.filter(is_active=True).select_related("service_area")
    ]
    for area in active_areas:
        has_active_rules = PartnerAvailabilityRule.objects.filter(
            partner=partner,
            service_area=area,
            is_active=True,
        ).exists()
        if not has_active_rules:
            for weekday in range(7):
                rule, _ = PartnerAvailabilityRule.objects.get_or_create(
                    partner=partner,
                    service_area=area,
                    weekday=weekday,
                    starts_at=DEFAULT_AVAILABILITY_START,
                    defaults={
                        "ends_at": DEFAULT_AVAILABILITY_END,
                        "ends_next_day": False,
                        "is_active": True,
                    },
                )
                seeded.append(rule)
    return seeded


#: Decisions the Partner is told about with a reason, and the refusal when it is missing.
_REASON_REQUIRED: dict[str, str] = {
    PartnerApplication.Status.CHANGES_REQUIRED: "Explain which changes the Partner must make.",
    PartnerApplication.Status.SUSPENDED: "A reason is required for this action.",
    PartnerApplication.Status.OFFBOARDED: "A reason is required for this action.",
    PartnerApplication.Status.DECLINED: "A reason is required for this action.",
}


def _assert_transition_reason(*, target_status: str, reason: str) -> None:
    message = _REASON_REQUIRED.get(target_status)
    if message is not None and not reason.strip():
        raise PartnerTransitionError(message)


@transaction.atomic
def transition_partner_application(
    *,
    reviewer: User,
    application_id: uuid.UUID,
    expected_version: int,
    target_status: str,
    reason: str,
) -> PartnerApplication:
    application = (
        PartnerApplication.objects.select_for_update()
        .select_related("partner")
        .filter(id=application_id)
        .first()
    )
    if application is None:
        raise PartnerApplicationNotFoundError
    if application.partner.user_id == reviewer.id:
        raise PartnerSelfReviewError(
            object_type="partner_application",
            object_id=application.id,
        )
    _assert_version(application, expected_version)
    allowed: dict[str, set[str]] = {
        PartnerApplication.Status.SUBMITTED: {PartnerApplication.Status.UNDER_REVIEW},
        PartnerApplication.Status.UNDER_REVIEW: {
            PartnerApplication.Status.CHANGES_REQUIRED,
            PartnerApplication.Status.APPROVED,
            PartnerApplication.Status.DECLINED,
        },
        PartnerApplication.Status.APPROVED: {
            PartnerApplication.Status.SUSPENDED,
            PartnerApplication.Status.OFFBOARDED,
        },
        PartnerApplication.Status.SUSPENDED: {
            PartnerApplication.Status.APPROVED,
            PartnerApplication.Status.OFFBOARDED,
        },
    }
    if target_status not in allowed.get(application.status, set()):
        raise PartnerTransitionError(
            f"Cannot move an application from {application.status} to {target_status}.",
        )
    previous_status = application.status
    if application.status == PartnerApplication.Status.SUBMITTED:
        if application.review_assigned_to_id not in {None, reviewer.id}:
            raise PartnerReviewOwnershipError(
                "This application is already assigned to another reviewer.",
            )
        application.review_assigned_to = reviewer
        application.review_assigned_at = timezone.now()
    elif (
        application.status == PartnerApplication.Status.UNDER_REVIEW
        and application.review_assigned_to_id != reviewer.id
    ):
        raise PartnerReviewOwnershipError(
            "Claim this Partner application before completing its review.",
        )
    _assert_transition_reason(target_status=target_status, reason=reason)
    if target_status == PartnerApplication.Status.APPROVED:
        if not _base_application_is_complete(application):
            raise PartnerApplicationIncompleteError("The application is not complete.")
        if not _latest_required_documents_are_approved(application):
            raise PartnerApplicationIncompleteError(
                "Approve the latest required documents before approving this application.",
            )
        if previous_status != PartnerApplication.Status.APPROVED:
            _seed_default_availability_if_missing(partner=application.partner)

    application.status = target_status
    application.reviewed_by = reviewer
    application.reviewed_at = timezone.now()
    application.change_request_message = (
        reason if target_status == PartnerApplication.Status.CHANGES_REQUIRED else ""
    )
    application.version += 1
    application.save(
        update_fields=(
            "status",
            "reviewed_by",
            "reviewed_at",
            "change_request_message",
            "review_assigned_to",
            "review_assigned_at",
            "version",
            "updated_at",
        ),
    )
    _record_transition(
        application=application,
        from_status=previous_status,
        actor=reviewer,
        reason_code=f"application_{target_status.lower()}",
        reason=reason,
    )
    _notify_decision(application=application, previous_status=previous_status, reason=reason)
    if target_status in {
        PartnerApplication.Status.SUSPENDED,
        PartnerApplication.Status.OFFBOARDED,
    }:
        end_reason = (
            PartnerOnlineSession.EndReason.SUSPENDED
            if target_status == PartnerApplication.Status.SUSPENDED
            else PartnerOnlineSession.EndReason.OFFBOARDED
        )
        PartnerOnlineSession.objects.filter(
            partner=application.partner,
            ended_at__isnull=True,
        ).update(ended_at=timezone.now(), end_reason=end_reason)
        cache.delete(presence_cache_key(application.partner_id))
        # Spec §18: ending presence alone is not enough — release future held work so an
        # offboarded Partner cannot keep a start OTP and a Thursday slot.
        release_future_work(
            partner=application.partner,
            reason=reason or f"application_{target_status.lower()}",
        )
    return application
