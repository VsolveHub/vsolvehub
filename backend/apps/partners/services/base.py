"""Shared vocabulary for the Partner service commands.

This module holds the pieces more than one slice needs: the module-level constants, the TypedDict
input shapes the view layer builds, the upload grant record, and the small helpers that lock or
inspect a Partner application row. It is the bottom of the dependency arrow — it must never import
from a sibling submodule of this package.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import date, time
from decimal import Decimal
from typing import NotRequired, TypedDict

from django.conf import settings
from django.utils import timezone

from apps.identity.models import User
from apps.partners.exceptions import (
    PartnerApplicationNotFoundError,
    PartnerVersionConflictError,
)
from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerConsent,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerDocumentUpload,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
)
from apps.partners.storage import SignedUpload

SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
COORDINATE_QUANTUM = Decimal("0.001")
MINUTES_PER_DAY = 24 * 60
MAX_PARTNER_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024
DOCUMENT_CONTENT_TYPE_SUFFIXES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}


class ScheduleRuleInput(TypedDict):
    service_area_id: uuid.UUID
    weekday: int
    starts_at: time
    ends_at: time
    ends_next_day: NotRequired[bool]


class ScheduleExceptionInput(TypedDict):
    service_area_id: uuid.UUID
    date: date
    is_available: bool
    starts_at: NotRequired[time | None]
    ends_at: NotRequired[time | None]
    ends_next_day: NotRequired[bool]
    reason: NotRequired[str]


@dataclass(frozen=True, slots=True)
class PartnerDocumentUploadGrant:
    upload: PartnerDocumentUpload
    signed: SignedUpload


def _application_for_update(user: User) -> PartnerApplication:
    application = (
        PartnerApplication.objects.select_for_update()
        .select_related("partner")
        .filter(partner__user=user)
        .first()
    )
    if application is None:
        raise PartnerApplicationNotFoundError
    return application


def _assert_version(application: PartnerApplication, expected_version: int) -> None:
    if application.version != expected_version:
        raise PartnerVersionConflictError


def _record_transition(
    *,
    application: PartnerApplication,
    from_status: str,
    actor: User,
    reason_code: str,
    reason: str = "",
) -> None:
    PartnerApplicationTransition.objects.create(
        application=application,
        from_status=from_status,
        to_status=application.status,
        actor=actor,
        reason_code=reason_code,
        reason=reason,
        application_version=application.version,
    )


def _latest_required_documents_are_approved(application: PartnerApplication) -> bool:
    required_kinds = tuple(settings.PARTNER_REQUIRED_DOCUMENT_KINDS)
    for kind in required_kinds:
        latest = (
            PartnerDocument.objects.filter(application=application, kind=kind)
            .order_by("-version")
            .first()
        )
        if latest is None or latest.status != PartnerDocument.Status.APPROVED:
            return False
    return True


def _required_consents_exist(partner: PartnerProfile) -> bool:
    required_document_ids = set(
        PartnerConsentDocument.objects.filter(
            is_current=True,
            is_required_for_submission=True,
            published_at__lte=timezone.now(),
            retired_at__isnull=True,
        ).values_list("id", flat=True),
    )
    if not required_document_ids:
        return False
    accepted_document_ids = set(
        PartnerConsent.objects.filter(
            partner=partner,
            document_id__in=required_document_ids,
            withdrawn_at__isnull=True,
        ).values_list("document_id", flat=True),
    )
    return required_document_ids.issubset(accepted_document_ids)


def _base_application_is_complete(application: PartnerApplication) -> bool:
    partner = application.partner
    if application.track in (
        PartnerApplication.Track.STAY_HOST,
        PartnerApplication.Track.RENTAL_OWNER,
        PartnerApplication.Track.EMPLOYER,
    ):
        # A stay host or rental owner: who they are and the agreements are enough.
        # Trades, services and areas describe travelling to a customer and are not asked.
        return bool(partner.display_name.strip()) and _required_consents_exist(partner)
    return all(
        (
            bool(partner.display_name.strip()),
            PartnerSkill.objects.filter(partner=partner, is_active=True).exists(),
            PartnerService.objects.filter(partner=partner, is_active=True).exists(),
            PartnerServiceArea.objects.filter(partner=partner, is_active=True).exists(),
            _required_consents_exist(partner),
        ),
    )
