"""Shared vocabulary for the Partner service commands.

This module holds the pieces more than one slice needs: the module-level constants, the TypedDict
input shapes the view layer builds, the upload grant record, and the small helpers that lock or
inspect a Partner application row. It is the bottom of the dependency arrow — it must never import
from a sibling submodule of this package.
"""

import logging
import re
import uuid
from dataclasses import dataclass
from datetime import date, time
from decimal import Decimal
from typing import Any, NotRequired, TypedDict

from django.conf import settings
from django.db import transaction

from apps.identity.models import User
from apps.notifications.models import NotificationIntent
from apps.notifications.services import request_notification
from apps.notifications.tasks import send_partner_push_for_notice
from apps.partners.exceptions import (
    PartnerApplicationNotFoundError,
    PartnerVersionConflictError,
)
from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerDocument,
    PartnerDocumentUpload,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
)
from apps.partners.selectors import partner_has_required_consents, required_document_kinds
from apps.partners.storage import SignedUpload

logger = logging.getLogger(__name__)

#: Notices about the application's progress (sent, review started) and about decisions on it.
#: Both are transactional: a Partner cannot mute being told where their application stands.
PARTNER_APPLICATION_PROGRESS_PURPOSE = "partner_application_progress"
PARTNER_APPLICATION_DECISION_PURPOSE = "partner_application_decision"

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
    required_kinds = required_document_kinds(application.track)
    for kind in required_kinds:
        latest = (
            PartnerDocument.objects.filter(application=application, kind=kind)
            .order_by("-version")
            .first()
        )
        if latest is None or latest.status != PartnerDocument.Status.APPROVED:
            return False
    return True


def _base_application_is_complete(application: PartnerApplication) -> bool:
    partner = application.partner
    if application.track in (
        PartnerApplication.Track.STAY_HOST,
        PartnerApplication.Track.RENTAL_OWNER,
        PartnerApplication.Track.EMPLOYER,
        PartnerApplication.Track.RIDE_CAPTAIN,
    ):
        # A stay host or rental owner: who they are and the agreements are enough.
        # Trades, services and areas describe travelling to a customer and are not asked.
        return bool(partner.display_name.strip()) and partner_has_required_consents(partner)
    return all(
        (
            bool(partner.display_name.strip()),
            PartnerSkill.objects.filter(partner=partner, is_active=True).exists(),
            PartnerService.objects.filter(partner=partner, is_active=True).exists(),
            PartnerServiceArea.objects.filter(partner=partner, is_active=True).exists(),
            partner_has_required_consents(partner),
        ),
    )


def _notify_application_event(
    *,
    application: PartnerApplication,
    template_code: str,
    purpose: str,
    idempotency_key: str,
    context: dict[str, Any] | None = None,
    push: bool = True,
) -> None:
    """Tell the Partner something happened to their application: in the app, then by push.

    The one place every application event notifies from — submitted, review started, a
    document rejected, and every Operations decision — so web and mobile clients read the same
    notice. The in-app row is written inside the caller's transaction; the push is sent only
    after it commits, so a rolled-back decision can never reach a phone.

    Never blocks or undoes the event: a notice that cannot be written or sent is logged with ids
    only, never the reason or the Partner's name.
    """
    try:
        with transaction.atomic():
            intent = request_notification(
                recipient_id=application.partner.user_id,
                purpose=purpose,
                channel=NotificationIntent.Channel.IN_APP,
                audience=NotificationIntent.Audience.PARTNER,
                template_code=template_code,
                context=context or {},
                idempotency_key=idempotency_key,
            )
    except Exception:
        logger.exception(
            "partner_application_notice_failed",
            extra={"application_id": str(application.id), "template": template_code},
        )
        return
    if not push or intent.status != NotificationIntent.Status.SENT:
        return
    # With OneSignal as the phone channel, every in-app notice is already copied to the
    # Partner's devices (website included) by `apps.mobile`; a second send here would be a
    # second banner for the same notice.
    if getattr(settings, "MOBILE_PUSH_PROVIDER", "") == "onesignal":
        return

    intent_id = str(intent.id)
    deep_link = f"{settings.PARTNER_PORTAL_BASE_URL.rstrip('/')}/apply"

    def _queue_push() -> None:
        try:
            send_partner_push_for_notice.delay(intent_id, deep_link)
        except Exception:
            # The notice is already in the app; a broker outage must not fail the request
            # that made the decision.
            logger.exception("partner_application_push_not_queued", extra={"intent_id": intent_id})

    transaction.on_commit(_queue_push)
