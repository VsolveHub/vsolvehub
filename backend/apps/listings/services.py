import logging
from datetime import timedelta
from typing import Any
from uuid import UUID

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.cases.models import OperationsCase
from apps.catalog.models import A10VariantConfiguration, ServiceVariant
from apps.commerce.models import PaymentAttempt
from apps.commerce.services.payments import initiate_standalone_payment_attempt
from apps.foundation.services import enqueue_outbox_event, request_fingerprint
from apps.listings import jobs
from apps.listings.models import (
    Application,
    ApplicationReport,
    ApplicationStatusEvent,
    JobRoleTemplate,
    Listing,
    ListingModerationEvent,
    ListingReport,
    VendorSubscription,
    VendorSubscriptionPlan,
)
from apps.partners.capabilities import is_approved_employer
from apps.partners.models import PartnerProfile


def _as_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


APPLICATIONS_PER_HOUR_LIMIT = 10
CONTACT_REVEALS_PER_DAY_LIMIT = 25
APPLICATION_COOLDOWN_HOURS_DEFAULT = 24
FREE_TIER_MAX_ACTIVE_LISTINGS = 1


class ListingStateError(ValueError):
    pass


class ListingPlanCapError(ListingStateError):
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
    # An approved "Hire staff" sign-up is the job-posting permission on its own.
    if is_approved_employer(poster):
        return
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
    salary_min_paise: int = 0,
    salary_max_paise: int = 0,
    salary_period: str = "",
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
        salary_min_paise=salary_min_paise,
        salary_max_paise=salary_max_paise,
        salary_period=salary_period.strip(),
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
        "salary_min_paise",
        "salary_max_paise",
        "salary_period",
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
    # Explicit free tier allows max 1 active listing, not unlimited.
    # Plan max_active_listings applies when an active VendorSubscription exists.
    active_count = (
        Listing.objects.filter(
            poster=listing.poster,
            status=Listing.Status.PUBLISHED,
            expires_at__gt=timezone.now(),
        )
        .exclude(id=listing.id)
        .count()
    )
    if subscription is not None:
        if active_count >= subscription.plan.max_active_listings:
            raise ListingPlanCapError("Active listing limit reached for the current plan.")
    elif active_count >= FREE_TIER_MAX_ACTIVE_LISTINGS:
        raise ListingPlanCapError("Active listing limit reached for the free tier.")
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
    _tell_candidate(application, status)
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
        "plan_limit": active_subscription.plan.max_active_listings if active_subscription else 1,
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


# --- jobs: the quick, tap-to-pick post ------------------------------------------------------

_JOB_LIST_FIELDS = ("required_skills", "preferred_skills", "responsibilities", "benefits")
_JOB_CHOICE_FIELDS: dict[str, tuple[tuple[str, str], ...]] = {
    "job_type": jobs.JOB_TYPES,
    "experience_band": jobs.EXPERIENCE_BANDS,
    "min_qualification": jobs.QUALIFICATIONS,
    "shift": jobs.SHIFTS,
    "work_mode": jobs.WORK_MODES,
    "weekly_off": jobs.WEEKLY_OFFS,
    "urgency": jobs.URGENCIES,
    "salary_period": jobs.SALARY_PERIODS,
}
_JOB_TEXT_FIELDS = ("title", "job_category", "city", "area", "contact_phone", "contact_email")
_JOB_PLAIN_FIELDS = (
    "vacancies",
    "salary_min_paise",
    "salary_max_paise",
    "timing_start",
    "timing_end",
)


def _clean_list(name: str, items: list[Any]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in items:
        text = " ".join(str(raw or "").split())
        if not text or text.lower() in seen:
            continue
        if len(text) > jobs.MAX_ITEM_LENGTH:
            raise ListingStateError(f"Keep each entry under {jobs.MAX_ITEM_LENGTH} characters.")
        seen.add(text.lower())
        cleaned.append(text)
    if len(cleaned) > jobs.MAX_LIST_ITEMS:
        raise ListingStateError(f"Pick at most {jobs.MAX_LIST_ITEMS} {name.replace('_', ' ')}.")
    return cleaned


def _clean_job(data: dict[str, Any]) -> dict[str, Any]:  # noqa: PLR0912
    """Check a job's picked values against the option lists; trim and bound the free ones."""
    out: dict[str, Any] = {}
    for field, options in _JOB_CHOICE_FIELDS.items():
        if field in data:
            value = str(data[field] or "").strip()
            if value and value not in jobs.values(options):
                raise ListingStateError(f"Choose a listed option for {field.replace('_', ' ')}.")
            out[field] = value
    for field in _JOB_LIST_FIELDS:
        if field in data:
            out[field] = _clean_list(field, list(data[field] or []))
    if "languages" in data:
        langs = [str(v).strip() for v in data["languages"] or []]
        unknown = [v for v in langs if v not in jobs.values(jobs.LANGUAGES)]
        if unknown:
            raise ListingStateError("Choose languages from the list.")
        out["languages"] = list(dict.fromkeys(langs))
    for field in _JOB_TEXT_FIELDS:
        if field in data:
            out[field] = " ".join(str(data[field] or "").split())
    for field in _JOB_PLAIN_FIELDS:
        if field in data:
            out[field] = data[field]
    if "description" in data:
        out["description"] = str(data["description"] or "").strip()
    if "vacancies" in out and not 1 <= int(out["vacancies"] or 0) <= jobs.MAX_VACANCIES:
        raise ListingStateError(f"Vacancies must be between 1 and {jobs.MAX_VACANCIES}.")
    low, high = out.get("salary_min_paise"), out.get("salary_max_paise")
    if low is not None and high and int(high) < int(low):
        raise ListingStateError("Maximum salary must be at least the minimum.")
    start, end = out.get("timing_start"), out.get("timing_end")
    if (start is None) != (end is None) and ("timing_start" in data or "timing_end" in data):
        raise ListingStateError("Give both a start and an end time, or neither.")
    return out


def _jobs_variant() -> ServiceVariant:
    variant = ServiceVariant.objects.filter(code=jobs.JOBS_VARIANT_CODE).first()
    if variant is None or not variant.a10_configurations.filter(status="ACTIVE").exists():
        raise ListingStateError(
            "Job posting is not set up yet. Run the jobs catalogue seed (seed_listing_catalog)."
        )
    return variant


def _job_location_text(listing: Listing) -> str:
    return ", ".join(part for part in (listing.area, listing.city) if part)


def _apply_job(listing: Listing, data: dict[str, Any]) -> None:
    for field, value in data.items():
        if field != "role_template_id":
            setattr(listing, field, value)
    if "city" in data or "area" in data:
        listing.location_text = _job_location_text(listing)
    # Keep the legacy keys filled so existing filters and cards keep working.
    fields = dict(listing.structured_fields or {})
    if listing.job_type:
        fields["role_type"] = jobs.label(jobs.JOB_TYPES, listing.job_type)
    if listing.shift:
        fields["shift"] = jobs.label(jobs.SHIFTS, listing.shift)
    if listing.experience_band:
        fields["experience_years"] = jobs.label(jobs.EXPERIENCE_BANDS, listing.experience_band)
    listing.structured_fields = fields


def _job_description(listing: Listing) -> str:
    return jobs.describe_job(
        {
            "title": listing.title,
            "vacancies": listing.vacancies,
            "city": listing.city,
            "area": listing.area,
            "job_type": listing.job_type,
            "shift": listing.shift,
            "timing_start": listing.timing_start,
            "timing_end": listing.timing_end,
            "weekly_off": listing.weekly_off,
            "experience_band": listing.experience_band,
            "required_skills": listing.required_skills,
            "preferred_skills": listing.preferred_skills,
            "responsibilities": listing.responsibilities,
            "salary_min_paise": listing.salary_min_paise,
            "salary_max_paise": listing.salary_max_paise,
            "salary_period": listing.salary_period,
            "benefits": listing.benefits,
        },
        business_name=str(getattr(listing.poster, "display_name", "") or ""),
    )


def _require_job_basics(listing: Listing) -> None:
    missing = [
        label
        for label, ok in (
            ("job title", bool(listing.title.strip())),
            ("city", bool(listing.city)),
            ("job type", bool(listing.job_type)),
            ("salary", listing.salary_min_paise > 0),
        )
        if not ok
    ]
    if missing:
        raise ListingStateError(f"Add the {', '.join(missing)} before publishing.")


@transaction.atomic
def post_job(
    *, poster: PartnerProfile, actor: Any, data: dict[str, Any], publish: bool = True
) -> Listing:
    """Create a job from picked options, write its description if none was given, and (by
    default) put it live at once."""
    _require_listing_capability(poster)
    variant = _jobs_variant()
    cleaned = _clean_job(data)
    template = None
    if data.get("role_template_id"):
        template = JobRoleTemplate.objects.filter(
            id=_as_uuid(data["role_template_id"]), is_active=True
        ).first()
    listing = Listing(
        poster=poster,
        variant=variant,
        role_template=template,
        title=cleaned.get("title") or (template.name if template else ""),
        job_category=cleaned.get("job_category") or (template.category if template else ""),
        description="",
        salary_period=cleaned.get("salary_period") or "MONTHLY",
    )
    _apply_job(listing, {k: v for k, v in cleaned.items() if k not in ("title", "job_category")})
    if len(listing.title) < 3:  # noqa: PLR2004
        raise ListingStateError("Give the job a title.")
    listing.description = cleaned.get("description") or _job_description(listing)
    listing.save()
    _event(listing, ListingModerationEvent.Action.EDITED)
    if publish:
        listing = publish_job_now(listing=listing, actor=actor)
    return listing


@transaction.atomic
def publish_job_now(*, listing: Listing, actor: Any) -> Listing:
    """Put a job live at once, no review queue: the employer is already approved, and a
    reported job is removed by Operations. Plan limits still apply. Also reopens a closed or
    expired job. Older listings made with the long form keep the review step."""
    _require_poster(listing, actor)
    if listing.moderation_status == Listing.ModerationStatus.REMOVED or listing.removed_at:
        raise ListingStateError("Operations removed this job. It cannot be published again.")
    _require_job_basics(listing)
    if listing.moderation_status != Listing.ModerationStatus.APPROVED:
        listing.moderation_status = Listing.ModerationStatus.APPROVED
        listing.moderation_reason = ""
        listing.save(update_fields=("moderation_status", "moderation_reason", "updated_at"))
        _event(listing, ListingModerationEvent.Action.APPROVED, actor=actor, reason="Instant")
    listing = publish_listing(listing=listing, actor=actor)
    # Strong matches hear about it once the job is safely live.
    transaction.on_commit(lambda: _notify_matches(listing.id))
    return listing


def _notify_matches(listing_id: UUID) -> None:
    from apps.listings.seekers import notify_new_job_matches  # noqa: PLC0415

    try:
        notify_new_job_matches(Listing.objects.select_related("poster").get(id=listing_id))
    except Exception:  # pragma: no cover - a notice must never undo a publish
        logging.getLogger(__name__).exception("Job match notices failed for %s", listing_id)


@transaction.atomic
def update_job(*, listing: Listing, actor: Any, data: dict[str, Any]) -> Listing:
    """Edit a job. A live job stays live. ``regenerate_description`` rewrites the text."""
    _require_poster(listing, actor)
    if listing.status not in (Listing.Status.DRAFT, Listing.Status.PUBLISHED):
        raise ListingStateError("Reopen this job before editing it.")
    cleaned = _clean_job(data)
    _apply_job(listing, cleaned)
    if data.get("regenerate_description") or (
        "description" in cleaned and not cleaned["description"]
    ):
        listing.description = _job_description(listing)
    if listing.status == Listing.Status.PUBLISHED:
        _require_job_basics(listing)
    listing.version += 1
    listing.save()
    _event(listing, ListingModerationEvent.Action.EDITED, actor=actor)
    return listing


@transaction.atomic
def duplicate_listing(*, listing: Listing, actor: Any) -> Listing:
    """A draft copy of a job, to post the same role again without retyping it."""
    _require_poster(listing, actor)
    _require_listing_capability(listing.poster)
    copy = Listing(
        poster=listing.poster,
        variant=listing.variant,
        title=listing.title,
        description=listing.description,
        structured_fields=dict(listing.structured_fields or {}),
        salary_min_paise=listing.salary_min_paise,
        salary_max_paise=listing.salary_max_paise,
        salary_period=listing.salary_period,
        location_text=listing.location_text,
        contact_phone=listing.contact_phone,
        contact_email=listing.contact_email,
        role_template=listing.role_template,
        job_category=listing.job_category,
        vacancies=listing.vacancies,
        job_type=listing.job_type,
        experience_band=listing.experience_band,
        required_skills=list(listing.required_skills or []),
        preferred_skills=list(listing.preferred_skills or []),
        responsibilities=list(listing.responsibilities or []),
        benefits=list(listing.benefits or []),
        languages=list(listing.languages or []),
        min_qualification=listing.min_qualification,
        shift=listing.shift,
        work_mode=listing.work_mode,
        timing_start=listing.timing_start,
        timing_end=listing.timing_end,
        weekly_off=listing.weekly_off,
        urgency=listing.urgency,
        city=listing.city,
        area=listing.area,
    )
    copy.save()
    _event(copy, ListingModerationEvent.Action.EDITED, actor=actor, reason="Duplicated")
    return copy


def job_options() -> dict[str, Any]:
    """Everything the job forms tap from, including templates grouped by category."""
    categories: dict[str, list[dict[str, Any]]] = {}
    for template in JobRoleTemplate.objects.filter(is_active=True):
        categories.setdefault(template.category, []).append(
            {
                "id": template.id,
                "name": template.name,
                "skills": template.skills,
                "responsibilities": template.responsibilities,
                "job_type": template.job_type,
                "shift": template.shift,
                "work_mode": template.work_mode,
                "salary_min_rupees": template.salary_min_rupees,
                "salary_max_rupees": template.salary_max_rupees,
            }
        )
    return {
        "categories": [{"name": name, "roles": roles} for name, roles in categories.items()],
        "job_types": jobs.as_options(jobs.JOB_TYPES),
        "experience_bands": jobs.as_options(jobs.EXPERIENCE_BANDS),
        "qualifications": jobs.as_options(jobs.QUALIFICATIONS),
        "languages": jobs.as_options(jobs.LANGUAGES),
        "benefits": list(jobs.BENEFITS),
        "shifts": jobs.as_options(jobs.SHIFTS),
        "work_modes": jobs.as_options(jobs.WORK_MODES),
        "weekly_offs": jobs.as_options(jobs.WEEKLY_OFFS),
        "urgencies": jobs.as_options(jobs.URGENCIES),
        "salary_periods": jobs.as_options(jobs.SALARY_PERIODS),
        "salary_bands": [
            {"min_rupees": low, "max_rupees": high} for low, high in jobs.SALARY_BANDS
        ],
        "cities": list(jobs.CITIES),
    }


#: What the candidate is told when the employer moves their application on.
_CANDIDATE_UPDATES: dict[str, str] = {
    Application.Status.SHORTLISTED: "You have been shortlisted.",
    Application.Status.CONNECTED: (
        "V Solve Hub has completed the connection. You can continue directly with the employer."
    ),
    Application.Status.REJECTED: "The employer has moved ahead with other candidates.",
}


def _tell_candidate(application: Application, status: str) -> None:
    message = _CANDIDATE_UPDATES.get(status)
    if not message:
        return
    from apps.listings.seekers import _notify  # noqa: PLC0415

    _notify(
        recipient_id=application.applicant_id,
        template_code="job_application_update",
        purpose=f"jobs.application.{status.lower()}",
        key=f"job-app-status:{application.id}:{status}",
        context={"job_title": application.listing.title, "message": message},
    )
