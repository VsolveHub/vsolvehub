from datetime import timedelta
from typing import Any
from uuid import UUID

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.cases.models import OperationsCase
from apps.catalog.models import A10VariantConfiguration
from apps.commerce.models import PaymentAttempt
from apps.commerce.services.payments import initiate_standalone_payment_attempt
from apps.foundation.services import enqueue_outbox_event, request_fingerprint
from apps.listings.models import (
    Application,
    ApplicationReport,
    ApplicationStatusEvent,
    Listing,
    ListingModerationEvent,
    ListingReport,
    VendorSubscription,
    VendorSubscriptionPlan,
)
from apps.partners.models import PartnerProfile


def _as_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


APPLICATIONS_PER_HOUR_LIMIT = 10
CONTACT_REVEALS_PER_DAY_LIMIT = 25
APPLICATION_COOLDOWN_HOURS_DEFAULT = 24


class ListingStateError(ValueError):
    pass


def _event(listing: Listing, action: str, *, actor: Any | None = None, reason: str = "") -> None:
    ListingModerationEvent.objects.create(
        listing=listing,
        actor=actor,
        action=action,
        reason=reason,
    )
    enqueue_outbox_event(
        aggregate_type="listing",
        aggregate_id=listing.id,
        event_type=f"listing.{action.lower()}",
        idempotency_key=f"listing:{listing.id}:{action}:{request_fingerprint(reason)[:16]}",
        payload={"listing_id": str(listing.id), "action": action, "reason": reason},
    )


def _active_subscription(poster: PartnerProfile) -> VendorSubscription | None:
    now = timezone.now()
    return (
        VendorSubscription.objects.select_related("plan")
        .filter(
            poster=poster,
            status=VendorSubscription.Status.ACTIVE,
            starts_at__lte=now,
            ends_at__gt=now,
        )
        .order_by("-ends_at")
        .first()
    )


def _require_listing_capability(poster: PartnerProfile) -> None:
    if not poster.capabilities.filter(archetype="A10_LISTING", status="APPROVED").exists():
        raise PermissionError("Poster does not have an active A10 listing capability.")


def _require_active_a10_configuration(variant_id: UUID | str) -> A10VariantConfiguration:
    config = A10VariantConfiguration.objects.filter(
        variant_id=_as_uuid(variant_id),
        status=A10VariantConfiguration.Status.ACTIVE,
    ).first()
    if config is None:
        raise ListingStateError("This category is not open yet.")
    return config


def _require_poster(listing: Listing, actor: Any) -> None:
    if actor and hasattr(actor, "id") and listing.poster.user_id != actor.id:
        raise PermissionError("Actor is not authorized to manage this listing.")


@transaction.atomic
def create_listing(
    *,
    poster: PartnerProfile,
    variant_id: UUID | str,
    title: str,
    description: str,
    structured_fields: dict[str, Any] | None = None,
    location_text: str = "",
    contact_phone: str = "",
    contact_email: str = "",
) -> Listing:
    _require_listing_capability(poster)
    _require_active_a10_configuration(variant_id)
    listing = Listing.objects.create(
        poster=poster,
        variant_id=variant_id,
        title=title.strip(),
        description=description.strip(),
        structured_fields=structured_fields or {},
        location_text=location_text.strip(),
        contact_phone=contact_phone.strip(),
        contact_email=contact_email.strip(),
    )
    _event(listing, ListingModerationEvent.Action.EDITED)
    return listing


@transaction.atomic
def update_listing(*, listing: Listing, actor: Any, **changes: Any) -> Listing:
    _require_poster(listing, actor)
    if listing.status not in (Listing.Status.DRAFT, Listing.Status.PUBLISHED):
        raise ListingStateError("Only draft or published listings can be edited.")
    for field in (
        "title",
        "description",
        "structured_fields",
        "location_text",
        "contact_phone",
        "contact_email",
    ):
        if field in changes:
            setattr(listing, field, changes[field])
    if listing.status == Listing.Status.PUBLISHED:
        listing.status = Listing.Status.DRAFT
        listing.moderation_status = Listing.ModerationStatus.PENDING
        listing.published_at = None
        listing.moderation_reason = ""
    listing.version += 1
    listing.save()
    _event(listing, ListingModerationEvent.Action.EDITED, actor=actor)
    return listing


@transaction.atomic
def submit_listing(*, listing: Listing, actor: Any) -> Listing:
    _require_poster(listing, actor)
    _require_listing_capability(listing.poster)
    _require_active_a10_configuration(listing.variant_id)
    if listing.status != Listing.Status.DRAFT:
        raise ListingStateError("Only draft listings can be submitted.")
    listing.moderation_status = Listing.ModerationStatus.PENDING
    listing.moderation_reason = ""
    listing.version += 1
    listing.save(update_fields=("moderation_status", "moderation_reason", "version", "updated_at"))
    _event(listing, ListingModerationEvent.Action.SUBMITTED, actor=actor)
    return listing


@transaction.atomic
def moderate_listing(*, listing: Listing, actor: Any, approved: bool, reason: str = "") -> Listing:
    if listing.moderation_status != Listing.ModerationStatus.PENDING:
        raise ListingStateError("Only pending listings can be moderated.")
    if approved:
        listing.moderation_status = Listing.ModerationStatus.APPROVED
        action = ListingModerationEvent.Action.APPROVED
    else:
        listing.status = Listing.Status.DRAFT
        listing.moderation_status = Listing.ModerationStatus.REJECTED
        action = ListingModerationEvent.Action.REJECTED
    listing.moderation_reason = reason.strip()
    listing.version += 1
    listing.save()
    _event(listing, action, actor=actor, reason=reason)
    return listing


@transaction.atomic
def publish_listing(*, listing: Listing, actor: Any) -> Listing:
    _require_poster(listing, actor)
    _require_listing_capability(listing.poster)
    _require_active_a10_configuration(listing.variant_id)
    if listing.moderation_status != Listing.ModerationStatus.APPROVED:
        raise ListingStateError("A listing must be moderation approved before publish.")
    if listing.status not in (Listing.Status.DRAFT, Listing.Status.CLOSED, Listing.Status.EXPIRED):
        raise ListingStateError("This listing cannot be published from its current state.")
    subscription = _active_subscription(listing.poster)
    # No active subscription: publish is still allowed when capability + ACTIVE config
    # hold (explicit free tier). Plan max_active_listings applies only with an ACTIVE
    # VendorSubscription — not a hidden default plan that auto-publishes.
    if subscription is not None:
        active_count = (
            Listing.objects.filter(
                poster=listing.poster,
                status=Listing.Status.PUBLISHED,
                expires_at__gt=timezone.now(),
            )
            .exclude(id=listing.id)
            .count()
        )
        if active_count >= subscription.plan.max_active_listings:
            raise ListingStateError("Active listing limit reached for the current plan.")
    listing.status = Listing.Status.PUBLISHED
    listing.published_at = timezone.now()
    listing.expires_at = listing.published_at + timedelta(days=30)
    listing.closed_at = None
    listing.version += 1
    listing.save()
    _event(listing, ListingModerationEvent.Action.PUBLISHED, actor=actor)
    return listing


@transaction.atomic
def close_listing(*, listing: Listing, actor: Any, reason: str = "") -> Listing:
    _require_poster(listing, actor)
    if listing.status != Listing.Status.PUBLISHED:
        raise ListingStateError("Only published listings can be closed.")
    listing.status = Listing.Status.CLOSED
    listing.closed_at = timezone.now()
    listing.version += 1
    listing.save(update_fields=("status", "closed_at", "version", "updated_at"))
    _event(listing, ListingModerationEvent.Action.CLOSED, actor=actor, reason=reason)
    return listing


@transaction.atomic
def republish_listing(*, listing: Listing, actor: Any) -> Listing:
    _require_poster(listing, actor)
    _require_listing_capability(listing.poster)
    _require_active_a10_configuration(listing.variant_id)
    if listing.status not in (Listing.Status.CLOSED, Listing.Status.EXPIRED):
        raise ListingStateError("Only closed or expired listings can be republished.")
    listing.status = Listing.Status.DRAFT
    listing.moderation_status = Listing.ModerationStatus.PENDING
    listing.moderation_reason = ""
    listing.published_at = None
    listing.closed_at = None
    listing.version += 1
    listing.save(
        update_fields=(
            "status",
            "moderation_status",
            "moderation_reason",
            "published_at",
            "closed_at",
            "version",
            "updated_at",
        )
    )
    _event(listing, ListingModerationEvent.Action.SUBMITTED, actor=actor, reason="Republished")
    return listing


@transaction.atomic
def submit_application(
    *,
    listing: Listing,
    applicant: Any,
    applicant_snapshot: dict[str, Any],
    cover_note: str = "",
    resume_url: str = "",
) -> Application:
    now = timezone.now()
    _require_active_a10_configuration(listing.variant_id)
    if (
        listing.status != Listing.Status.PUBLISHED
        or listing.expires_at is None
        or listing.expires_at <= now
    ):
        raise ListingStateError("This listing is not accepting applications.")
    cutoff = now - timedelta(hours=1)
    recent_count = Application.objects.filter(applicant=applicant, created_at__gte=cutoff).count()
    if recent_count >= APPLICATIONS_PER_HOUR_LIMIT:
        raise ListingStateError("Application rate limit reached. Try again later.")

    existing_app = Application.objects.filter(listing=listing, applicant=applicant).first()
    if existing_app is not None:
        if existing_app.status not in (Application.Status.WITHDRAWN, Application.Status.EXPIRED):
            raise ListingStateError("APPLICATION_DUPLICATE")
        cooldown_hours = APPLICATION_COOLDOWN_HOURS_DEFAULT
        config = listing.variant.a10_configurations.filter(status="ACTIVE").first()
        if config and config.application_cooldown_hours:
            cooldown_hours = config.application_cooldown_hours
        reference_time = existing_app.withdrawn_at or existing_app.created_at
        if reference_time and (now - reference_time) < timedelta(hours=cooldown_hours):
            raise ListingStateError("APPLICATION_DUPLICATE")

    try:
        application, created = Application.objects.get_or_create(
            listing=listing,
            applicant=applicant,
            defaults={
                "applicant_snapshot": applicant_snapshot,
                "cover_note": cover_note.strip(),
                "resume_url": resume_url.strip(),
            },
        )
    except IntegrityError:
        application = Application.objects.get(listing=listing, applicant=applicant)
        created = False
    if not created and application.status not in (
        Application.Status.WITHDRAWN,
        Application.Status.EXPIRED,
    ):
        raise ListingStateError("APPLICATION_DUPLICATE")
    if not created:
        application.status = Application.Status.SUBMITTED
        application.applicant_snapshot = applicant_snapshot
        application.cover_note = cover_note.strip()
        application.resume_url = resume_url.strip()
        application.withdrawn_at = None
        application.save()

    ApplicationStatusEvent.objects.create(
        application=application,
        actor=applicant if getattr(applicant, "is_authenticated", True) else None,
        from_status="",
        to_status=Application.Status.SUBMITTED,
        kind="SUBMITTED",
        note="Application submitted.",
    )
    enqueue_outbox_event(
        aggregate_type="application",
        aggregate_id=application.id,
        event_type="application.submitted",
        idempotency_key=f"application:{application.id}:submitted",
        payload={"application_id": str(application.id), "listing_id": str(listing.id)},
    )
    return application


@transaction.atomic
def update_application_status(*, application: Application, actor: Any, status: str) -> Application:
    if status not in Application.Status.values:
        raise ListingStateError("Unsupported application status.")
    if application.status in (Application.Status.WITHDRAWN, Application.Status.EXPIRED):
        raise ListingStateError("Terminal applications cannot be updated.")
    old_status = application.status
    application.status = status
    application.save(update_fields=("status", "updated_at"))
    ApplicationStatusEvent.objects.create(
        application=application,
        actor=actor if getattr(actor, "is_authenticated", True) else None,
        from_status=old_status,
        to_status=status,
        kind="STATUS_UPDATE",
    )
    enqueue_outbox_event(
        aggregate_type="application",
        aggregate_id=application.id,
        event_type="application.status_changed",
        idempotency_key=f"application:{application.id}:{status}",
        payload={
            "application_id": str(application.id),
            "status": status,
            "actor_id": str(actor.id),
        },
    )
    return application


@transaction.atomic
def reveal_contact(*, application: Application, actor: Any) -> Application:
    cutoff = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    reveals_today = Application.objects.filter(
        listing__poster=application.listing.poster,
        contact_revealed_by=actor,
        contact_revealed_at__gte=cutoff,
    ).count()
    if reveals_today >= CONTACT_REVEALS_PER_DAY_LIMIT and application.contact_revealed_at is None:
        raise ListingStateError("Contact reveal limit reached for today.")
    if application.contact_revealed_at is None:
        old_status = application.status
        application.contact_revealed_at = timezone.now()
        application.contact_revealed_by = actor
        application.status = Application.Status.CONTACTED
        application.save(
            update_fields=("contact_revealed_at", "contact_revealed_by", "status", "updated_at")
        )
        ApplicationStatusEvent.objects.create(
            application=application,
            actor=actor if getattr(actor, "is_authenticated", True) else None,
            from_status=old_status,
            to_status=Application.Status.CONTACTED,
            kind="CONTACT_REVEALED",
            note="Contact details revealed by poster.",
        )
    return application


@transaction.atomic
def withdraw_application(*, application: Application, actor: Any) -> Application:
    if application.applicant_id != actor.id:
        raise PermissionError("Only the applicant can withdraw this application.")
    old_status = application.status
    application.status = Application.Status.WITHDRAWN
    application.withdrawn_at = timezone.now()
    application.save(update_fields=("status", "withdrawn_at", "updated_at"))
    ApplicationStatusEvent.objects.create(
        application=application,
        actor=actor if getattr(actor, "is_authenticated", True) else None,
        from_status=old_status,
        to_status=Application.Status.WITHDRAWN,
        kind="WITHDRAWN",
        note="Application withdrawn by applicant.",
    )
    return application


@transaction.atomic
def report_listing(
    *, listing: Listing, reporter: Any, reason: str, detail: str = ""
) -> ListingReport:
    report = ListingReport.objects.create(
        listing=listing, reporter=reporter, reason=reason, detail=detail
    )
    case = OperationsCase.objects.create(
        kind="LISTING_ABUSE",
        severity=OperationsCase.Severity.NORMAL,
        owner_team=OperationsCase.Team.SAFETY,
        listing=listing,
        summary=f"Listing abuse report: {listing.title[:120]}",
        detail=detail or reason,
        due_at=timezone.now() + timedelta(hours=24),
    )
    report.operations_case = case
    report.save(update_fields=("operations_case",))
    return report


@transaction.atomic
def report_application(
    *, application: Application, reporter: Any, reason: str, detail: str = ""
) -> ApplicationReport:
    report = ApplicationReport.objects.create(
        application=application, reporter=reporter, reason=reason, detail=detail
    )
    case = OperationsCase.objects.create(
        kind="APPLICATION_ABUSE",
        severity=OperationsCase.Severity.NORMAL,
        owner_team=OperationsCase.Team.SAFETY,
        application=application,
        summary=f"Application abuse report: {application.listing.title[:120]}",
        detail=detail or reason,
        due_at=timezone.now() + timedelta(hours=24),
    )
    report.operations_case = case
    report.save(update_fields=("operations_case",))
    return report


@transaction.atomic
def remove_listing(*, listing: Listing, actor: Any, reason: str) -> Listing:
    if not reason.strip():
        raise ListingStateError("A removal reason is required.")
    listing.status = Listing.Status.REMOVED
    listing.moderation_status = Listing.ModerationStatus.REMOVED
    listing.moderation_reason = reason.strip()
    listing.removed_at = timezone.now()
    listing.version += 1
    listing.save()
    _event(listing, ListingModerationEvent.Action.REMOVED, actor=actor, reason=reason)
    return listing


@transaction.atomic
def reinstate_listing(*, listing: Listing, actor: Any, reason: str) -> Listing:
    if listing.status != Listing.Status.REMOVED:
        raise ListingStateError("Only removed listings can be reinstated.")
    listing.status = Listing.Status.DRAFT
    listing.moderation_status = Listing.ModerationStatus.APPROVED
    listing.moderation_reason = reason.strip()
    listing.removed_at = None
    listing.version += 1
    listing.save()
    _event(listing, ListingModerationEvent.Action.REINSTATED, actor=actor, reason=reason)
    return listing


@transaction.atomic
def expire_listings() -> int:
    now = timezone.now()
    expired = list(
        Listing.objects.select_for_update().filter(
            status=Listing.Status.PUBLISHED,
            expires_at__lte=now,
        )
    )
    for listing in expired:
        listing.status = Listing.Status.EXPIRED
        listing.version += 1
        listing.save(update_fields=("status", "version", "updated_at"))
        Application.objects.filter(
            listing=listing,
            status__in=(Application.Status.SUBMITTED, Application.Status.UNDER_REVIEW),
        ).update(status=Application.Status.EXPIRED)
        _event(listing, "EXPIRED")
    return len(expired)


@transaction.atomic
def expire_subscriptions() -> int:
    now = timezone.now()
    expired = list(
        VendorSubscription.objects.select_for_update().filter(
            status=VendorSubscription.Status.ACTIVE,
            ends_at__lte=now,
        )
    )
    for sub in expired:
        sub.status = VendorSubscription.Status.EXPIRED
        sub.save(update_fields=("status", "updated_at"))
    return len(expired)


@transaction.atomic
def start_subscription_purchase(
    *, poster: PartnerProfile, plan: VendorSubscriptionPlan, idempotency_key: str
) -> VendorSubscription:
    _require_listing_capability(poster)
    existing = VendorSubscription.objects.filter(
        poster=poster,
        plan=plan,
        status=VendorSubscription.Status.PENDING_ACTIVATION,
        payment_attempt__status__in=(
            PaymentAttempt.Status.PROVIDER_PENDING,
            PaymentAttempt.Status.CREATED,
            PaymentAttempt.Status.AUTHORIZED,
        ),
    ).first()
    if existing is not None:
        return existing
    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.A10_VENDOR_SUBSCRIPTION,
        amount_paise=plan.price_paise,
        idempotency_key=idempotency_key,
    )
    return VendorSubscription.objects.create(poster=poster, plan=plan, payment_attempt=attempt)


@transaction.atomic
def complete_subscription_payment(*, payment_attempt_id: UUID | str) -> None:
    subscription = (
        VendorSubscription.objects.select_for_update()
        .select_related("plan")
        .filter(payment_attempt_id=_as_uuid(payment_attempt_id))
        .first()
    )
    if subscription is None or subscription.status != VendorSubscription.Status.PENDING_ACTIVATION:
        return
    now = timezone.now()
    VendorSubscription.objects.filter(
        poster_id=subscription.poster_id,
        status=VendorSubscription.Status.ACTIVE,
    ).exclude(id=subscription.id).update(
        status=VendorSubscription.Status.EXPIRED,
        updated_at=now,
    )
    subscription.status = VendorSubscription.Status.ACTIVE
    subscription.starts_at = now
    subscription.ends_at = now + timedelta(days=subscription.plan.duration_days)
    subscription.save(update_fields=("status", "starts_at", "ends_at", "updated_at"))


@transaction.atomic
def start_premium_purchase(*, listing: Listing, actor: Any, idempotency_key: str) -> Listing:
    """Start a checkout-free A10_PREMIUM_LISTING attempt. Does not set is_premium."""
    _require_poster(listing, actor)
    _require_listing_capability(listing.poster)
    if listing.is_premium:
        return listing
    subscription = _active_subscription(listing.poster)
    if subscription is None or "FEATURED_PLACEMENT" not in (
        subscription.plan.premium_capabilities or []
    ):
        raise ListingStateError(
            "Premium placement requires an active plan that includes FEATURED_PLACEMENT."
        )
    existing_attempt = listing.payment_attempt
    if existing_attempt is not None and existing_attempt.status in (
        PaymentAttempt.Status.PROVIDER_PENDING,
        PaymentAttempt.Status.CREATED,
        PaymentAttempt.Status.AUTHORIZED,
    ):
        return listing
    amount = subscription.plan.premium_price_paise or 49900
    attempt = initiate_standalone_payment_attempt(
        purpose=PaymentAttempt.Purpose.A10_PREMIUM_LISTING,
        amount_paise=amount,
        idempotency_key=idempotency_key,
    )
    listing.payment_attempt = attempt
    listing.save(update_fields=("payment_attempt", "updated_at"))
    return listing


@transaction.atomic
def activate_premium_feature(*, payment_attempt_id: UUID | str) -> None:
    """Set is_premium once. Replay after activation is a no-op."""
    listing = (
        Listing.objects.select_for_update()
        .filter(payment_attempt_id=_as_uuid(payment_attempt_id))
        .first()
    )
    if listing is None or listing.is_premium:
        return
    listing.is_premium = True
    listing.save(update_fields=("is_premium", "updated_at"))


def partner_summary(poster: PartnerProfile) -> dict[str, Any]:
    listings = Listing.objects.filter(poster=poster)
    active_subscription = _active_subscription(poster)
    return {
        "active_listings": listings.filter(status=Listing.Status.PUBLISHED).count(),
        "pending_moderation": listings.filter(
            moderation_status=Listing.ModerationStatus.PENDING
        ).count(),
        "new_applications": Application.objects.filter(
            listing__poster=poster, status=Application.Status.SUBMITTED
        ).count(),
        "plan_limit": active_subscription.plan.max_active_listings if active_subscription else None,
        "subscription": (
            {
                "id": str(active_subscription.id),
                "plan_name": active_subscription.plan.name,
                "status": active_subscription.status,
                "ends_at": active_subscription.ends_at.isoformat()
                if active_subscription.ends_at
                else None,
            }
            if active_subscription
            else None
        ),
    }
