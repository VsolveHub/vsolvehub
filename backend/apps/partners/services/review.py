"""Operations decisions on the Partner application row itself.

The reviewer wave: claiming an application for review, and the status transition that approves,
sends it back for changes, suspends or offboards it — including the presence teardown and future
work release a suspension or offboarding must drag behind it. Reviewer decisions on the *documents*
attached to the application live in `documents`.
"""

import uuid

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.assignments.suspension import release_future_work
from apps.identity.models import User
from apps.partners.exceptions import (
    PartnerApplicationIncompleteError,
    PartnerApplicationNotFoundError,
    PartnerReviewOwnershipError,
    PartnerSelfReviewError,
    PartnerTransitionError,
)
from apps.partners.models import PartnerApplication, PartnerOnlineSession
from apps.partners.selectors import presence_cache_key

from .base import (
    _assert_version,
    _base_application_is_complete,
    _latest_required_documents_are_approved,
    _record_transition,
)


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
    if target_status == PartnerApplication.Status.CHANGES_REQUIRED and not reason.strip():
        raise PartnerTransitionError("Explain which changes the Partner must make.")
    if (
        target_status
        in {
            PartnerApplication.Status.SUSPENDED,
            PartnerApplication.Status.OFFBOARDED,
        }
        and not reason.strip()
    ):
        raise PartnerTransitionError("A reason is required for this action.")
    if target_status == PartnerApplication.Status.APPROVED:
        if not _base_application_is_complete(application):
            raise PartnerApplicationIncompleteError("The application is not complete.")
        if not _latest_required_documents_are_approved(application):
            raise PartnerApplicationIncompleteError(
                "Approve the latest required documents before approving this application.",
            )

    previous_status = application.status
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
    if target_status == PartnerApplication.Status.APPROVED:
        from apps.catalog.models import ServiceVariant
        from apps.partners.models import PartnerCapability, PartnerService

        rental_services = PartnerService.objects.filter(
            partner=application.partner,
            is_active=True,
            variant__booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        ).select_related("variant")
        for ps in rental_services:
            PartnerCapability.objects.update_or_create(
                partner=application.partner,
                variant=ps.variant,
                defaults={
                    "archetype": ServiceVariant.BookingArchetype.A7_RENTAL,
                    "status": PartnerCapability.Status.APPROVED,
                },
            )
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
