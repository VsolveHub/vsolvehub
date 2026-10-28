"""Celery maintenance tasks for Partner presence and private uploads."""

from celery import shared_task

from apps.partners.services import (
    cleanup_stale_partner_document_uploads,
    expire_missing_presence_sessions,
)
from apps.partners.storage import DocumentStorageError


@shared_task(
    autoretry_for=(RuntimeError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def reconcile_partner_presence_sessions() -> int:
    return expire_missing_presence_sessions()


@shared_task(
    autoretry_for=(DocumentStorageError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
)
def cleanup_partner_document_uploads() -> int:
    return cleanup_stale_partner_document_uploads()


@shared_task(
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def reconcile_partner_shifts() -> int:
    """Periodic Celery Beat sweep: expire finished shifts and handle missed offer thresholds."""
    from django.conf import settings
    from django.utils import timezone
    from apps.partners.models import PartnerShift
    from apps.partners.services import expire_expired_shifts
    from apps.assignments.models import DispatchOffer

    reconciled = expire_expired_shifts()

    max_missed = getattr(settings, "MAX_CONSECUTIVE_MISSED_OFFERS", 3)
    active_shifts = list(PartnerShift.objects.filter(ended_at__isnull=True).select_related("partner"))

    for shift in active_shifts:
        recent_offers = list(
            DispatchOffer.objects.filter(partner=shift.partner)
            .order_by("-created_at")
            .values_list("status", flat=True)[:max_missed]
        )
        if (
            len(recent_offers) >= max_missed
            and all(s in (DispatchOffer.Status.EXPIRED, DispatchOffer.Status.DECLINED) for s in recent_offers)
        ):
            shift.ended_at = timezone.now()
            shift.end_reason = PartnerShift.EndReason.MISSED_OFFERS
            shift.save(update_fields=("ended_at", "end_reason", "updated_at"))
            reconciled += 1

    return reconciled
