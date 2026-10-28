"""Online sessions and Redis-first presence coordination.

Going online, heartbeating, going offline, and the reconciliation sweep that ends sessions whose
Redis key has disappeared. The eligibility gate that only an approved, fully documented Partner may
pass lives here too, as does the coarse location capture that instant matching reads.
"""

import logging
import uuid
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import cast

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

from apps.identity.models import User
from apps.partners.exceptions import PartnerEligibilityError, PartnerPresenceError
from apps.partners.models import (
    PartnerApplication,
    PartnerLocation,
    PartnerOnlineSession,
    PartnerPushSubscription,
    PartnerServiceArea,
    PartnerShift,
)
from apps.partners.selectors import presence_cache_key

from .base import (
    COORDINATE_QUANTUM,
    _application_for_update,
    _base_application_is_complete,
    _latest_required_documents_are_approved,
)


def _assert_operational_eligibility(application: PartnerApplication) -> None:
    if application.status != PartnerApplication.Status.APPROVED:
        raise PartnerEligibilityError("Only an approved Partner can go online.")
    if not _base_application_is_complete(application):
        raise PartnerEligibilityError("Your Partner eligibility configuration is incomplete.")
    if not _latest_required_documents_are_approved(application):
        raise PartnerEligibilityError("Your required identity documents are not approved.")


def _presence_payload(session: PartnerOnlineSession) -> dict[str, str]:
    return {
        "session_id": str(session.id),
        "partner_id": str(session.partner_id),
        "service_area_id": str(session.service_area_id),
        "heartbeat_at": timezone.now().isoformat(),
    }


def _publish_presence(session: PartnerOnlineSession) -> None:
    try:
        cache.set(
            presence_cache_key(session.partner_id),
            _presence_payload(session),
            timeout=settings.PARTNER_PRESENCE_TTL_SECONDS,
        )
    except Exception as exc:
        raise PartnerPresenceError(
            "Instant availability is temporarily unavailable. Try again.",
            retryable=True,
        ) from exc


def go_online(
    *,
    user: User,
    service_area_id: uuid.UUID,
    latitude: Decimal,
    longitude: Decimal,
    accuracy_m: int,
    consent_version: str,
) -> PartnerOnlineSession:
    if accuracy_m > settings.PARTNER_LOCATION_MAX_ACCURACY_METERS:
        raise PartnerPresenceError("Location accuracy is too low. Move outside and try again.")
    now = timezone.now()
    with transaction.atomic():
        application = _application_for_update(user)
        _assert_operational_eligibility(application)
        area_link = (
            PartnerServiceArea.objects.select_related("service_area")
            .filter(
                partner=application.partner,
                service_area_id=service_area_id,
                is_active=True,
                service_area__is_active=True,
            )
            .first()
        )
        if area_link is None:
            raise PartnerPresenceError("Select one of your approved service areas.")

        if getattr(settings, "FEATURE_PUSH_GATED_INSTANT", False):
            active_shift = (
                PartnerShift.objects.select_for_update()
                .filter(partner=application.partner, ended_at__isnull=True)
                .first()
            )
            duration_hours = getattr(settings, "PARTNER_SHIFT_DEFAULT_DURATION_HOURS", 8)
            if active_shift is None:
                PartnerShift.objects.create(
                    partner=application.partner,
                    service_area=area_link.service_area,
                    started_at=now,
                    scheduled_end_at=now + timedelta(hours=duration_hours),
                    last_active_at=now,
                )
            else:
                if active_shift.service_area_id != area_link.service_area_id:
                    active_shift.service_area = area_link.service_area
                active_shift.last_active_at = now
                active_shift.save(update_fields=("service_area", "last_active_at", "updated_at"))

        current = (
            PartnerOnlineSession.objects.select_for_update()
            .filter(partner=application.partner, ended_at__isnull=True)
            .first()
        )
        if current is not None:
            current.ended_at = now
            current.end_reason = PartnerOnlineSession.EndReason.REPLACED
            current.save(update_fields=("ended_at", "end_reason"))

        PartnerLocation.objects.update_or_create(
            partner=application.partner,
            defaults={
                "service_area": area_link.service_area,
                "latitude": latitude.quantize(COORDINATE_QUANTUM, rounding=ROUND_HALF_UP),
                "longitude": longitude.quantize(COORDINATE_QUANTUM, rounding=ROUND_HALF_UP),
                "accuracy_m": accuracy_m,
                "purpose": PartnerLocation.Purpose.INSTANT_MATCHING,
                "consent_version": consent_version,
                "captured_at": now,
            },
        )
        session = PartnerOnlineSession.objects.create(
            partner=application.partner,
            service_area=area_link.service_area,
            started_at=now,
            last_persisted_heartbeat_at=now,
        )

    try:
        _publish_presence(session)
    except PartnerPresenceError:
        PartnerOnlineSession.objects.filter(pk=session.pk, ended_at__isnull=True).update(
            ended_at=timezone.now(),
            end_reason=PartnerOnlineSession.EndReason.PRESENCE_EXPIRED,
        )
        raise
    return session


@transaction.atomic
def heartbeat_presence(
    *,
    user: User,
    session_id: uuid.UUID,
    latitude: Decimal | None = None,
    longitude: Decimal | None = None,
    accuracy_m: int | None = None,
    consent_version: str | None = None,
) -> PartnerOnlineSession:
    # Atomic because `_application_for_update` takes a row lock, and Django
    # refuses `select_for_update` in autocommit. Its absence here made every
    # heartbeat a 500 while `go_online` and `go_offline`, which open one,
    # worked — so presence could be entered and never held.
    application = _application_for_update(user)
    _assert_operational_eligibility(application)
    session = (
        PartnerOnlineSession.objects.filter(
            id=session_id,
            partner=application.partner,
            ended_at__isnull=True,
        )
        .select_related("partner", "service_area")
        .first()
    )
    if session is None:
        raise PartnerPresenceError("This online session has expired. Go online again.")
    location_values = (latitude, longitude, accuracy_m, consent_version)
    if any(value is not None for value in location_values):
        if any(value is None for value in location_values):
            raise PartnerPresenceError("A location refresh is incomplete.")
        current_latitude = cast(Decimal, latitude)
        current_longitude = cast(Decimal, longitude)
        current_accuracy_m = cast(int, accuracy_m)
        current_consent_version = cast(str, consent_version)
        if current_accuracy_m > settings.PARTNER_LOCATION_MAX_ACCURACY_METERS:
            raise PartnerPresenceError("Location accuracy is too low. Move outside and try again.")
        now = timezone.now()
        PartnerLocation.objects.update_or_create(
            partner=application.partner,
            defaults={
                "service_area": session.service_area,
                "latitude": current_latitude.quantize(
                    COORDINATE_QUANTUM,
                    rounding=ROUND_HALF_UP,
                ),
                "longitude": current_longitude.quantize(
                    COORDINATE_QUANTUM,
                    rounding=ROUND_HALF_UP,
                ),
                "accuracy_m": current_accuracy_m,
                "purpose": PartnerLocation.Purpose.INSTANT_MATCHING,
                "consent_version": current_consent_version,
                "captured_at": now,
            },
        )
    _publish_presence(session)

    if getattr(settings, "FEATURE_PUSH_GATED_INSTANT", False):
        PartnerShift.objects.filter(
            partner=application.partner,
            ended_at__isnull=True,
        ).update(last_active_at=timezone.now())

    persistence_cutoff = timezone.now() - timedelta(
        seconds=settings.PARTNER_PRESENCE_DB_TOUCH_SECONDS,
    )
    if session.last_persisted_heartbeat_at <= persistence_cutoff:
        now = timezone.now()
        PartnerOnlineSession.objects.filter(
            pk=session.pk,
            ended_at__isnull=True,
            last_persisted_heartbeat_at__lte=persistence_cutoff,
        ).update(last_persisted_heartbeat_at=now)
        session.last_persisted_heartbeat_at = now
    return session


@transaction.atomic
def go_offline(*, user: User, session_id: uuid.UUID) -> None:
    application = _application_for_update(user)
    now = timezone.now()
    session = (
        PartnerOnlineSession.objects.select_for_update()
        .filter(id=session_id, partner=application.partner)
        .first()
    )
    if session is not None and session.ended_at is None:
        session.ended_at = now
        session.end_reason = PartnerOnlineSession.EndReason.PARTNER_OFFLINE
        session.save(update_fields=("ended_at", "end_reason"))

    if getattr(settings, "FEATURE_PUSH_GATED_INSTANT", False):
        PartnerShift.objects.filter(
            partner=application.partner,
            ended_at__isnull=True,
        ).update(
            ended_at=now,
            end_reason=PartnerShift.EndReason.PARTNER_LOGOUT,
        )

    try:
        cache.delete(presence_cache_key(application.partner_id))
    except Exception as exc:
        raise PartnerPresenceError(
            "Offline status is saved, but presence cleanup is still retrying.",
            retryable=True,
        ) from exc


def expire_missing_presence_sessions(*, batch_size: int = 500) -> int:
    sessions = list(
        PartnerOnlineSession.objects.filter(ended_at__isnull=True)
        .order_by("started_at")
        .only("id", "partner_id")[:batch_size],
    )
    expired_ids: list[uuid.UUID] = []
    try:
        for session in sessions:
            payload = cache.get(presence_cache_key(session.partner_id))
            if not isinstance(payload, dict) or str(payload.get("session_id")) != str(session.id):
                expired_ids.append(session.id)
    except Exception as exc:
        raise PartnerPresenceError(
            "Presence reconciliation is temporarily unavailable.",
            retryable=True,
        ) from exc
    if not expired_ids:
        return 0
    return PartnerOnlineSession.objects.filter(
        id__in=expired_ids,
        ended_at__isnull=True,
    ).update(
        ended_at=timezone.now(),
        end_reason=PartnerOnlineSession.EndReason.PRESENCE_EXPIRED,
    )


def expire_expired_shifts() -> int:
    """Reconcile partner shifts: expire shifts past scheduled_end_at or idle beyond threshold."""
    now = timezone.now()

    # 1. Scheduled expiry (shift duration finished)
    scheduled_expired = PartnerShift.objects.filter(
        ended_at__isnull=True,
        scheduled_end_at__lte=now,
    ).update(
        ended_at=now,
        end_reason=PartnerShift.EndReason.SHIFT_EXPIRED,
    )

    # 2. Safety idle check: only expire if partner has been inactive beyond threshold
    # and has NO pending dispatch offers
    idle_minutes = getattr(settings, "PARTNER_SHIFT_MAX_IDLE_MINUTES", 30)
    idle_cutoff = now - timedelta(minutes=idle_minutes)

    from apps.assignments.models import DispatchOffer

    partners_with_pending_offers = set(
        DispatchOffer.objects.filter(
            status=DispatchOffer.Status.PENDING,
        ).values_list("partner_id", flat=True)
    )

    idle_expired = (
        PartnerShift.objects.filter(
            ended_at__isnull=True,
            last_active_at__lte=idle_cutoff,
        )
        .exclude(partner_id__in=partners_with_pending_offers)
        .update(
            ended_at=now,
            end_reason=PartnerShift.EndReason.IDLE_EXPIRED,
        )
    )

    # 3. Consecutive missed offers check
    max_missed = getattr(settings, "MAX_CONSECUTIVE_MISSED_OFFERS", 3)
    missed_expired = 0
    active_shifts = PartnerShift.objects.filter(ended_at__isnull=True).select_related("partner")
    for shift in active_shifts:
        recent_offers = list(
            DispatchOffer.objects.filter(
                partner=shift.partner,
                offered_at__gte=shift.started_at,
            ).order_by("-offered_at")[:max_missed]
        )
        if len(recent_offers) >= max_missed and all(
            offer.status in (DispatchOffer.Status.EXPIRED, DispatchOffer.Status.DECLINED)
            for offer in recent_offers
        ):
            shift.ended_at = now
            shift.end_reason = PartnerShift.EndReason.MISSED_OFFERS
            shift.save(update_fields=("ended_at", "end_reason"))
            missed_expired += 1
            logger.info(
                "shift_ended_missed_offers",
                extra={
                    "partner_id": str(shift.partner_id),
                    "shift_id": str(shift.id),
                    "missed_count": len(recent_offers),
                },
            )

    return scheduled_expired + idle_expired + missed_expired


def sync_partner_push_subscription(
    *,
    user: User,
    onesignal_subscription_id: str,
    platform: str = PartnerPushSubscription.Platform.WEB,
    user_agent: str = "",
    is_active: bool = True,
) -> tuple[PartnerPushSubscription, bool]:
    """Upsert PartnerPushSubscription and evaluate partner instant eligibility."""
    profile = getattr(user, "partner_profile", None)
    if profile is None:
        from apps.partners.selectors import partner_profile_for_user

        profile = partner_profile_for_user(user)
    if profile is None:
        raise PartnerEligibilityError("Partner profile was not found.")

    partner_external_id = str(profile.id)
    now = timezone.now()

    with transaction.atomic():
        if is_active and platform == PartnerPushSubscription.Platform.WEB:
            PartnerPushSubscription.objects.filter(
                partner=profile,
                platform=PartnerPushSubscription.Platform.WEB,
                is_active=True,
            ).exclude(onesignal_subscription_id=onesignal_subscription_id).update(is_active=False)

        subscription, _ = PartnerPushSubscription.objects.update_or_create(
            onesignal_subscription_id=onesignal_subscription_id,
            defaults={
                "partner": profile,
                "user": user,
                "onesignal_external_id": partner_external_id,
                "platform": platform,
                "user_agent": user_agent,
                "is_active": is_active,
                "last_verified_at": now,
            },
        )

    log_event = "push_subscription_registered" if is_active else "push_subscription_deactivated"
    logger.info(
        log_event,
        extra={
            "partner_id": str(profile.id),
            "subscription_id": onesignal_subscription_id,
            "platform": platform,
            "is_active": is_active,
        },
    )

    has_active_shift = PartnerShift.objects.filter(
        partner=profile,
        ended_at__isnull=True,
        scheduled_end_at__gt=now,
    ).exists()
    has_active_sub = PartnerPushSubscription.objects.filter(
        partner=profile,
        is_active=True,
    ).exists()
    max_age = getattr(settings, "PARTNER_LOCATION_MAX_AGE_MINUTES", 30)
    has_fresh_loc = PartnerLocation.objects.filter(
        partner=profile,
        captured_at__gte=now - timedelta(minutes=max_age),
    ).exists()

    instant_eligible = bool(has_active_shift and has_active_sub and has_fresh_loc)
    return subscription, instant_eligible
