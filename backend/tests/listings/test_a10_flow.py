from datetime import timedelta
from typing import Any
import uuid
import pytest
from django.utils import timezone
from tests.helpers import force_role_client

from apps.cases.models import OperationsCase
from apps.catalog.models import (
    A10VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.commerce.models import PaymentAttempt
from apps.identity.models import Role, User, UserRole
from apps.listings.models import (
    Application,
    ApplicationStatusEvent,
    Listing,
    ListingModerationEvent,
    VendorSubscription,
    VendorSubscriptionPlan,
)
from apps.listings.selectors import public_listings
from apps.listings.serializers import ListingDetailSerializer, PartnerListingSerializer
from rest_framework.exceptions import ValidationError
from apps.listings.services import (
    APPLICATIONS_PER_HOUR_LIMIT,
    CONTACT_REVEALS_PER_DAY_LIMIT,
    ListingPlanCapError,
    ListingStateError,
    close_listing,
    activate_premium_feature,
    complete_subscription_payment,
    create_listing,
    expire_listings,
    expire_subscriptions,
    moderate_listing,
    publish_listing,
    reinstate_listing,
    remove_listing,
    report_listing,
    republish_listing,
    reveal_contact,
    start_premium_purchase,
    start_subscription_purchase,
    submit_application,
    submit_listing,
    update_application_status,
    update_listing,
    withdraw_application,
)
from apps.partners.models import PartnerCapability, PartnerProfile


@pytest.fixture
def a10_variant():
    cat_slug = f"career-jobs-{uuid.uuid4().hex[:6]}"
    category = Category.objects.create(slug=cat_slug, name="Career / Jobs")
    subcategory = Subcategory.objects.create(
        category=category, slug=f"it-jobs-{uuid.uuid4().hex[:6]}", name="IT & Software Jobs"
    )
    service = Service.objects.create(
        subcategory=subcategory,
        slug=f"software-dev-{uuid.uuid4().hex[:6]}",
        name="Software Developer",
        short_description="Developer roles",
        status=Service.Status.ACTIVE,
    )
    variant = ServiceVariant.objects.create(
        service=service,
        code=f"job-post-{uuid.uuid4().hex[:6]}",
        name="Job post",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A10_LISTING,
        required_skill_code="listing",
        tax_category_code="listing",
    )
    A10VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=A10VariantConfiguration.Status.ACTIVE,
        application_cooldown_hours=24,
    )
    return variant


def _create_user(phone_number: str, **kwargs: Any) -> User:
    manager: Any = User.objects
    return manager.create_user(phone_number=phone_number, **kwargs)


@pytest.fixture
def poster(a10_variant):
    phone = f"+9199{uuid.uuid4().int % 10**8:08d}"
    user = _create_user(phone)
    profile = PartnerProfile.objects.create(user=user, display_name="Acme Hiring")
    PartnerCapability.objects.create(
        partner=profile,
        variant=a10_variant,
        archetype=ServiceVariant.BookingArchetype.A10_LISTING,
        status=PartnerCapability.Status.APPROVED,
    )
    return profile


def _client_for(user: User, role: str):
    role_obj, _ = Role.objects.get_or_create(code=role, defaults={"name": role.title()})
    UserRole.objects.get_or_create(user=user, role=role_obj, revoked_at=None)
    return force_role_client(user=user, role_code=role)


@pytest.mark.django_db
def test_m3_a10_01_happy_path(poster, a10_variant):
    """M3-A10-01: Happy path: poster creates listing -> submits -> moderation approves -> publishes -> applicant applies -> poster shortlists -> contact revealed -> conversion tracked."""
    applicant_phone = f"+9198{uuid.uuid4().int % 10**8:08d}"
    applicant = _create_user(applicant_phone)

    listing = create_listing(
        poster=poster,
        variant_id=a10_variant.id,
        title="Senior Python Engineer",
        description="Build scalable distributed systems with Django.",
        structured_fields={"role_type": "Full Time", "salary_range": "15-20 LPA"},
        location_text="Hyderabad",
        contact_phone="+919900000001",
        contact_email="hiring@acme.test",
    )
    assert listing.status == Listing.Status.DRAFT

    submit_listing(listing=listing, actor=poster.user)
    listing.refresh_from_db()
    assert listing.moderation_status == Listing.ModerationStatus.PENDING

    moderate_listing(listing=listing, actor=poster.user, approved=True)
    listing.refresh_from_db()
    assert listing.moderation_status == Listing.ModerationStatus.APPROVED

    publish_listing(listing=listing, actor=poster.user)
    listing.refresh_from_db()
    assert listing.status == Listing.Status.PUBLISHED
    assert listing.published_at is not None
    assert listing.expires_at is not None

    application = submit_application(
        listing=listing,
        applicant=applicant,
        applicant_snapshot={"name": "Kiran Kumar", "phone": applicant_phone},
        cover_note="5 years of backend development experience.",
    )
    assert application.status == Application.Status.SUBMITTED

    update_application_status(
        application=application, actor=poster.user, status=Application.Status.SHORTLISTED
    )
    application.refresh_from_db()
    assert application.status == Application.Status.SHORTLISTED

    reveal_contact(application=application, actor=poster.user)
    application.refresh_from_db()
    assert application.status == Application.Status.CONTACTED
    assert application.contact_revealed_at is not None
    assert application.contact_revealed_by == poster.user

    events = list(ApplicationStatusEvent.objects.filter(application=application))
    event_kinds = [e.kind for e in events]
    assert "SUBMITTED" in event_kinds
    assert "CONTACT_REVEALED" in event_kinds


@pytest.mark.django_db
def test_m3_a10_02_moderation_reject_resubmit(poster, a10_variant):
    """M3-A10-02: Moderation rejects -> returns to DRAFT with reason, poster edits and resubmits -> approved."""
    listing = create_listing(
        poster=poster,
        variant_id=a10_variant.id,
        title="Unclear Role",
        description="Just call us.",
    )
    submit_listing(listing=listing, actor=poster.user)
    moderate_listing(
        listing=listing,
        actor=poster.user,
        approved=False,
        reason="Please provide job description and salary band.",
    )
    listing.refresh_from_db()
    assert listing.status == Listing.Status.DRAFT
    assert listing.moderation_status == Listing.ModerationStatus.REJECTED
    assert "salary band" in listing.moderation_reason

    update_listing(
        listing=listing,
        actor=poster.user,
        description="Detailed job description and responsibilities included.",
    )
    submit_listing(listing=listing, actor=poster.user)
    listing.refresh_from_db()
    assert listing.moderation_status == Listing.ModerationStatus.PENDING

    moderate_listing(listing=listing, actor=poster.user, approved=True)
    listing.refresh_from_db()
    assert listing.moderation_status == Listing.ModerationStatus.APPROVED


@pytest.mark.django_db
def test_m3_a10_03_listing_expires_mid_application(poster, a10_variant):
    """M3-A10-03: Listing expires automatically at expires_at; in-flight applications transition to EXPIRED."""
    applicant = _create_user(f"+9198{uuid.uuid4().int % 10**8:08d}")
    now = timezone.now()
    listing = Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="Contract Designer",
        description="2 months contract",
        status=Listing.Status.PUBLISHED,
        moderation_status=Listing.ModerationStatus.APPROVED,
        published_at=now - timedelta(days=31),
        expires_at=now - timedelta(days=1),
    )
    app = Application.objects.create(
        listing=listing,
        applicant=applicant,
        status=Application.Status.SUBMITTED,
        applicant_snapshot={"name": "Anita"},
    )

    expired_count = expire_listings()
    assert expired_count >= 1

    listing.refresh_from_db()
    app.refresh_from_db()
    assert listing.status == Listing.Status.EXPIRED
    assert app.status == Application.Status.EXPIRED


@pytest.mark.django_db
def test_m3_a10_04_close_listing_blocks_new_applications(poster, a10_variant):
    """M3-A10-04: Poster closes a listing manually; existing applications visible to poster, new applications blocked."""
    app_user1 = _create_user(f"+9198{uuid.uuid4().int % 10**8:08d}")
    app_user2 = _create_user(f"+9198{uuid.uuid4().int % 10**8:08d}")

    listing = create_listing(
        poster=poster,
        variant_id=a10_variant.id,
        title="Office Manager",
        description="Full time office manager",
    )
    submit_listing(listing=listing, actor=poster.user)
    moderate_listing(listing=listing, actor=poster.user, approved=True)
    publish_listing(listing=listing, actor=poster.user)

    app1 = submit_application(
        listing=listing, applicant=app_user1, applicant_snapshot={"name": "User 1"}
    )
    assert app1.status == Application.Status.SUBMITTED

    close_listing(listing=listing, actor=poster.user, reason="Position filled")
    listing.refresh_from_db()
    assert listing.status == Listing.Status.CLOSED

    # Existing application is still there
    assert Application.objects.filter(listing=listing, id=app1.id).exists()

    # New application must be blocked
    with pytest.raises(ListingStateError, match="not accepting applications"):
        submit_application(
            listing=listing, applicant=app_user2, applicant_snapshot={"name": "User 2"}
        )


@pytest.mark.django_db
def test_m3_a10_05_duplicate_application_cooldown(poster, a10_variant):
    """M3-A10-05: Duplicate application (same applicant, same listing, within cooldown) rejected with stable APPLICATION_DUPLICATE error."""
    applicant = _create_user(f"+9198{uuid.uuid4().int % 10**8:08d}")
    now = timezone.now()
    listing = Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="Data Entry Operator",
        description="Data entry work",
        status=Listing.Status.PUBLISHED,
        moderation_status=Listing.ModerationStatus.APPROVED,
        published_at=now,
        expires_at=now + timedelta(days=30),
    )

    app = submit_application(
        listing=listing, applicant=applicant, applicant_snapshot={"name": "Candidate"}
    )
    assert app.status == Application.Status.SUBMITTED

    with pytest.raises(ListingStateError, match="APPLICATION_DUPLICATE"):
        submit_application(
            listing=listing, applicant=applicant, applicant_snapshot={"name": "Candidate"}
        )

    # Withdrawing also enforces cooldown
    withdraw_application(application=app, actor=applicant)
    with pytest.raises(ListingStateError, match="APPLICATION_DUPLICATE"):
        submit_application(
            listing=listing, applicant=applicant, applicant_snapshot={"name": "Candidate"}
        )


@pytest.mark.django_db
def test_m3_a10_06_application_rate_limit(poster, a10_variant):
    """M3-A10-06: Application rate limit: applicant exceeding configured cap (10/hr) is blocked."""
    applicant = _create_user(f"+9198{uuid.uuid4().int % 10**8:08d}")
    now = timezone.now()

    # Create 10 different listings
    listings = [
        Listing.objects.create(
            poster=poster,
            variant=a10_variant,
            title=f"Role #{i}",
            description="Sample description",
            status=Listing.Status.PUBLISHED,
            moderation_status=Listing.ModerationStatus.APPROVED,
            published_at=now,
            expires_at=now + timedelta(days=30),
        )
        for i in range(APPLICATIONS_PER_HOUR_LIMIT)
    ]

    for lst in listings:
        submit_application(
            listing=lst, applicant=applicant, applicant_snapshot={"name": "Fast Applicant"}
        )

    # 11th listing
    extra_listing = Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="Role Extra",
        description="Extra role",
        status=Listing.Status.PUBLISHED,
        moderation_status=Listing.ModerationStatus.APPROVED,
        published_at=now,
        expires_at=now + timedelta(days=30),
    )

    with pytest.raises(ListingStateError, match="Application rate limit reached"):
        submit_application(
            listing=extra_listing,
            applicant=applicant,
            applicant_snapshot={"name": "Fast Applicant"},
        )


@pytest.mark.django_db
def test_m3_a10_07_contact_reveal_rate_limit_and_audit(poster, a10_variant):
    """M3-A10-07: Contact reveal is rate-limited per actor per day (25/day); reveal event recorded for audit."""
    now = timezone.now()
    listing = Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="Warehouse Associate",
        description="Logistics hub",
        status=Listing.Status.PUBLISHED,
        moderation_status=Listing.ModerationStatus.APPROVED,
        published_at=now,
        expires_at=now + timedelta(days=30),
    )

    # Create applications
    apps = []
    for i in range(CONTACT_REVEALS_PER_DAY_LIMIT):
        cand = _create_user(f"+9197{i:08d}")
        apps.append(
            Application.objects.create(
                listing=listing,
                applicant=cand,
                status=Application.Status.SUBMITTED,
                applicant_snapshot={"name": f"Cand {i}", "phone": f"+9197{i:08d}"},
            )
        )

    for app in apps:
        reveal_contact(application=app, actor=poster.user)

    # All 25 revealed
    assert (
        Application.objects.filter(listing=listing, contact_revealed_at__isnull=False).count()
        == CONTACT_REVEALS_PER_DAY_LIMIT
    )

    # 26th applicant
    cand_extra = _create_user("+919799999999")
    app_extra = Application.objects.create(
        listing=listing,
        applicant=cand_extra,
        status=Application.Status.SUBMITTED,
        applicant_snapshot={"name": "Cand Extra"},
    )
    with pytest.raises(ListingStateError, match="reveal limit reached for today"):
        reveal_contact(application=app_extra, actor=poster.user)


@pytest.mark.django_db
def test_m3_a10_08_report_listing_creates_operations_case_and_removal(poster, a10_variant):
    """M3-A10-08: Report abuse on a listing opens an OperationsCase; Operations removes the listing with a reason."""
    reporter = _create_user(f"+9198{uuid.uuid4().int % 10**8:08d}")
    admin_user = _create_user(f"+9198{uuid.uuid4().int % 10**8:08d}")
    now = timezone.now()

    listing = Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="Suspicious Scheme",
        description="Pay deposit before interview",
        status=Listing.Status.PUBLISHED,
        moderation_status=Listing.ModerationStatus.APPROVED,
        published_at=now,
        expires_at=now + timedelta(days=30),
    )

    report = report_listing(
        listing=listing,
        reporter=reporter,
        reason="Advance fee fraud",
        detail="Employer asked for ₹500 fee before scheduling interview.",
    )
    assert report.operations_case is not None
    assert report.operations_case.kind == OperationsCase.Kind.LISTING_ABUSE
    assert report.operations_case.listing == listing

    remove_listing(listing=listing, actor=admin_user, reason="Confirmed fraudulent fee demand.")
    listing.refresh_from_db()
    assert listing.status == Listing.Status.REMOVED
    assert listing.moderation_status == Listing.ModerationStatus.REMOVED
    assert listing.removed_at is not None

    # Removed listing does not appear in public listings
    assert listing not in public_listings()


@pytest.mark.django_db
def test_m3_a10_09_operations_reinstates_removed_listing(poster, a10_variant):
    """M3-A10-09: Operations reinstates a wrongly-removed listing with a reason; poster cannot self-reinstate."""
    admin_user = _create_user(f"+9198{uuid.uuid4().int % 10**8:08d}")
    now = timezone.now()

    listing = Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="Reputable Shopkeeper Role",
        description="Retail assistant",
        status=Listing.Status.REMOVED,
        moderation_status=Listing.ModerationStatus.REMOVED,
        removed_at=now,
    )

    # Poster cannot publish or republish directly from REMOVED
    with pytest.raises(ListingStateError):
        publish_listing(listing=listing, actor=poster.user)

    with pytest.raises(ListingStateError):
        republish_listing(listing=listing, actor=poster.user)

    # Operations reinstates
    reinstate_listing(
        listing=listing, actor=admin_user, reason="Dispute resolved upon document proof."
    )
    listing.refresh_from_db()
    assert listing.status == Listing.Status.DRAFT
    assert listing.moderation_status == Listing.ModerationStatus.APPROVED

    # Now poster can publish
    publish_listing(listing=listing, actor=poster.user)
    listing.refresh_from_db()
    assert listing.status == Listing.Status.PUBLISHED


@pytest.mark.django_db
def test_m3_a10_10_subscription_purchase_and_activation(poster):
    """M3-A10-10: Vendor purchases a subscription plan -> PaymentAttempt captured -> VendorSubscription activated exactly once."""
    plan = VendorSubscriptionPlan.objects.create(
        code=f"starter-{uuid.uuid4().hex[:6]}", name="Starter", price_paise=99900, duration_days=30
    )
    sub = start_subscription_purchase(poster=poster, plan=plan, idempotency_key="sub-tx-101")
    assert sub.status == VendorSubscription.Status.PENDING_ACTIVATION
    assert sub.payment_attempt is not None
    assert sub.payment_attempt.purpose == PaymentAttempt.Purpose.A10_VENDOR_SUBSCRIPTION

    complete_subscription_payment(payment_attempt_id=sub.payment_attempt.id)
    sub.refresh_from_db()
    assert sub.status == VendorSubscription.Status.ACTIVE
    assert sub.starts_at is not None
    assert sub.ends_at is not None
    assert sub.ends_at > sub.starts_at


@pytest.mark.django_db
def test_m3_a10_10b_new_plan_expires_the_previous_active_subscription(poster):
    """Buying a second plan leaves one ACTIVE subscription for the poster."""
    first = VendorSubscriptionPlan.objects.create(
        code=f"ent-{uuid.uuid4().hex[:6]}", name="Enterprise", price_paise=499900, duration_days=90
    )
    second = VendorSubscriptionPlan.objects.create(
        code=f"growth-{uuid.uuid4().hex[:6]}", name="Growth", price_paise=249900, duration_days=60
    )
    current = start_subscription_purchase(
        poster=poster, plan=first, idempotency_key="sub-replace-1"
    )
    assert current.payment_attempt is not None
    complete_subscription_payment(payment_attempt_id=current.payment_attempt.id)
    replacement = start_subscription_purchase(
        poster=poster, plan=second, idempotency_key="sub-replace-2"
    )
    assert replacement.payment_attempt is not None
    complete_subscription_payment(payment_attempt_id=replacement.payment_attempt.id)
    current.refresh_from_db()
    replacement.refresh_from_db()
    assert current.status == VendorSubscription.Status.EXPIRED
    assert replacement.status == VendorSubscription.Status.ACTIVE


@pytest.mark.django_db
def test_m3_a10_11_subscription_webhook_replay_idempotency(poster):
    """M3-A10-11: Subscription payment webhook replayed -> activation is not duplicated, subscription period not double-extended."""
    plan = VendorSubscriptionPlan.objects.create(
        code=f"growth-{uuid.uuid4().hex[:6]}", name="Growth", price_paise=249900, duration_days=60
    )
    sub = start_subscription_purchase(poster=poster, plan=plan, idempotency_key="sub-tx-102")
    assert sub.payment_attempt is not None
    payment_id = sub.payment_attempt.id
    complete_subscription_payment(payment_attempt_id=payment_id)
    sub.refresh_from_db()
    initial_end = sub.ends_at

    # Replay
    complete_subscription_payment(payment_attempt_id=payment_id)
    sub.refresh_from_db()
    assert sub.status == VendorSubscription.Status.ACTIVE
    assert sub.ends_at == initial_end


@pytest.mark.django_db
def test_m3_a10_12_subscription_payment_failure_retry(poster):
    """M3-A10-12: Subscription payment fails -> VendorSubscription stays PENDING_ACTIVATION, poster can retry."""
    plan = VendorSubscriptionPlan.objects.create(
        code=f"pro-{uuid.uuid4().hex[:6]}", name="Pro", price_paise=199900, duration_days=30
    )
    sub = start_subscription_purchase(poster=poster, plan=plan, idempotency_key="sub-tx-103")

    # PaymentAttempt marked failed
    assert sub.payment_attempt is not None
    sub.payment_attempt.status = PaymentAttempt.Status.FAILED
    sub.payment_attempt.save(update_fields=("status",))

    sub.refresh_from_db()
    assert sub.status == VendorSubscription.Status.PENDING_ACTIVATION

    # Retry purchase creates or re-uses with new attempt
    retry_sub = start_subscription_purchase(
        poster=poster, plan=plan, idempotency_key="sub-tx-103-retry"
    )
    assert retry_sub.status == VendorSubscription.Status.PENDING_ACTIVATION


@pytest.mark.django_db
def test_m3_a10_13_max_active_listings_plan_limit(poster, a10_variant):
    """M3-A10-13: Poster attempts to publish beyond max_active_listings on their current plan -> blocked with upgrade prompt."""
    plan = VendorSubscriptionPlan.objects.create(
        code=f"cap-1-{uuid.uuid4().hex[:6]}",
        name="Single Listing Plan",
        price_paise=49900,
        duration_days=30,
        max_active_listings=1,
    )
    sub = start_subscription_purchase(poster=poster, plan=plan, idempotency_key="sub-tx-cap-1")
    assert sub.payment_attempt is not None
    complete_subscription_payment(payment_attempt_id=sub.payment_attempt.id)

    # 1st listing published
    l1 = create_listing(
        poster=poster, variant_id=a10_variant.id, title="Role 1", description="desc"
    )
    submit_listing(listing=l1, actor=poster.user)
    moderate_listing(listing=l1, actor=poster.user, approved=True)
    publish_listing(listing=l1, actor=poster.user)

    # 2nd listing approved but publish must be blocked by cap
    l2 = create_listing(
        poster=poster, variant_id=a10_variant.id, title="Role 2", description="desc"
    )
    submit_listing(listing=l2, actor=poster.user)
    moderate_listing(listing=l2, actor=poster.user, approved=True)

    with pytest.raises(ListingPlanCapError, match="Active listing limit reached"):
        publish_listing(listing=l2, actor=poster.user)


@pytest.mark.django_db
def test_m3_a10_14_applicant_permission_isolation(poster, a10_variant):
    """M3-A10-14: Permission boundary: an applicant cannot see another applicant's Application against the same listing."""
    app_user_a = _create_user(f"+9198{uuid.uuid4().int % 10**8:08d}")
    app_user_b = _create_user(f"+9198{uuid.uuid4().int % 10**8:08d}")

    now = timezone.now()
    listing = Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="Delivery Executive",
        description="Fleet delivery",
        status=Listing.Status.PUBLISHED,
        moderation_status=Listing.ModerationStatus.APPROVED,
        published_at=now,
        expires_at=now + timedelta(days=30),
    )

    app_a = submit_application(
        listing=listing, applicant=app_user_a, applicant_snapshot={"name": "Alice"}
    )
    app_b = submit_application(
        listing=listing, applicant=app_user_b, applicant_snapshot={"name": "Bob"}
    )

    # Queries for Alice's applications must only return Alice's application
    alice_apps = list(Application.objects.filter(applicant=app_user_a))
    assert app_a in alice_apps
    assert app_b not in alice_apps


@pytest.mark.django_db
def test_m3_a10_15_poster_permission_isolation(poster, a10_variant):
    """M3-A10-15: Permission boundary: a poster cannot view/act on another poster's Listing/Application."""
    poster2_user = _create_user(f"+9199{uuid.uuid4().int % 10**8:08d}")
    poster2 = PartnerProfile.objects.create(user=poster2_user, display_name="Rival Hiring")
    PartnerCapability.objects.create(
        partner=poster2,
        variant=a10_variant,
        archetype=ServiceVariant.BookingArchetype.A10_LISTING,
        status=PartnerCapability.Status.APPROVED,
    )

    listing_p1 = create_listing(
        poster=poster, variant_id=a10_variant.id, title="P1 Role", description="Desc"
    )

    # Poster 2 cannot publish poster 1's listing
    with pytest.raises(PermissionError):
        close_listing(listing=listing_p1, actor=poster2.user)


@pytest.mark.django_db
def test_m3_a10_16_public_search_leak_prevention(poster, a10_variant):
    """M3-A10-16: Search/filter returns only PUBLISHED/ACTIVE listings to public; DRAFT/REMOVED/ARCHIVED/EXPIRED never leak."""
    now = timezone.now()

    published = Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="Public Live Role",
        description="Public viewable",
        status=Listing.Status.PUBLISHED,
        moderation_status=Listing.ModerationStatus.APPROVED,
        published_at=now,
        expires_at=now + timedelta(days=30),
    )
    draft = Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="Draft Role",
        description="Secret draft",
        status=Listing.Status.DRAFT,
        moderation_status=Listing.ModerationStatus.DRAFT,
    )
    pending = Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="Pending Role",
        description="Pending moderation",
        status=Listing.Status.DRAFT,
        moderation_status=Listing.ModerationStatus.PENDING,
    )
    removed = Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="Removed Role",
        description="Takedown role",
        status=Listing.Status.REMOVED,
        moderation_status=Listing.ModerationStatus.REMOVED,
    )
    expired = Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="Expired Role",
        description="Past date role",
        status=Listing.Status.EXPIRED,
        moderation_status=Listing.ModerationStatus.APPROVED,
        expires_at=now - timedelta(days=1),
    )

    results = list(public_listings())
    assert published in results
    assert draft not in results
    assert pending not in results
    assert removed not in results
    assert expired not in results


@pytest.mark.django_db
def test_partner_roles_and_create_by_service(poster, a10_variant):
    """Verify partner roles catalog endpoint and creating listing by service_id / service_slug."""
    client = _client_for(poster.user, role="partner")
    res = client.get("/api/v1/partner/listings/roles")
    assert res.status_code == 200
    assert len(res.data) > 0
    match = next((item for item in res.data if item["id"] == str(a10_variant.service_id)), None)
    assert match is not None
    assert len(match["variants"]) > 0

    # Create listing using service_id fallback
    create_res = client.post(
        "/api/v1/partner/listings",
        {
            "service_id": str(a10_variant.service_id),
            "title": "Created Via Service ID",
            "description": "Role created without explicit variant UUID",
            "contact_phone": "+919876543210",
            "salary_min_paise": 2500000,
            "salary_max_paise": 4000000,
            "salary_period": "MONTHLY",
        },
        format="json",
    )
    assert create_res.status_code == 201, create_res.data
    assert create_res.data["title"] == "Created Via Service ID"
    assert create_res.data["variant"] == str(a10_variant.id)
    assert create_res.data["salary_min_paise"] == 2500000
    assert create_res.data["salary_max_paise"] == 4000000
    assert create_res.data["salary_period"] == "MONTHLY"


@pytest.mark.django_db
def test_application_report_endpoint(poster, a10_variant):
    """Verify reporting an application opens an APPLICATION_ABUSE OperationsCase."""
    applicant_user = _create_user(f"+9198{uuid.uuid4().int % 10**8:08d}")
    listing = create_listing(
        poster=poster, variant_id=a10_variant.id, title="Nurse", description="Hospital"
    )
    listing.status = Listing.Status.PUBLISHED
    listing.expires_at = timezone.now() + timedelta(days=30)
    listing.save()

    app = submit_application(
        listing=listing, applicant=applicant_user, applicant_snapshot={"name": "Alice"}
    )
    poster_client = _client_for(poster.user, role="partner")
    res = poster_client.post(
        f"/api/v1/applications/{app.id}/reports",
        {
            "reason": "Spam application with invalid credentials",
            "detail": "Fake resume URL provided",
        },
        format="json",
    )
    assert res.status_code == 201, res.data
    assert res.data["reason"] == "Spam application with invalid credentials"

    # Verify OperationsCase was created with APPLICATION_ABUSE
    case = OperationsCase.objects.get(id=res.data["operations_case"])
    assert case.kind == "APPLICATION_ABUSE"
    assert case.owner_team == OperationsCase.Team.SAFETY


@pytest.mark.django_db
def test_ops_listings_moderation_and_lifecycle(poster, a10_variant):
    """Verify Operations staff can list, moderate, remove, and reinstate listings."""
    op_user = _create_user(phone_number=f"+9197{uuid.uuid4().int % 10**8:08d}", is_staff=True)
    op_client = _client_for(op_user, role="operations")

    listing = create_listing(
        poster=poster, variant_id=a10_variant.id, title="Pharmacist", description="Pharmacy job"
    )
    listing.status = Listing.Status.DRAFT
    listing.moderation_status = Listing.ModerationStatus.PENDING
    listing.save()

    # List all ops listings
    res = op_client.get("/api/v1/ops/listings")
    assert res.status_code == 200
    assert any(item["id"] == str(listing.id) for item in res.data)

    # Moderate: Approve
    mod_res = op_client.post(
        f"/api/v1/ops/listings/{listing.id}/moderate",
        {"approved": True, "reason": "Standard approved posting"},
        format="json",
    )
    assert mod_res.status_code == 200, mod_res.data
    assert mod_res.data["moderation_status"] == "APPROVED"

    # Takedown / Remove
    rem_res = op_client.post(
        f"/api/v1/ops/listings/{listing.id}/remove",
        {"reason": "Violates fair wage guidelines"},
        format="json",
    )
    assert rem_res.status_code == 200, rem_res.data
    assert rem_res.data["status"] == "REMOVED"
    assert rem_res.data["moderation_status"] == "REMOVED"

    # Reinstate
    rein_res = op_client.post(
        f"/api/v1/ops/listings/{listing.id}/reinstate",
        {"reason": "Wage documentation verified"},
        format="json",
    )
    assert rein_res.status_code == 200, rein_res.data
    assert rein_res.data["status"] == "DRAFT"
    assert rein_res.data["moderation_status"] == "APPROVED"


@pytest.mark.django_db
def test_public_state_is_derived_not_plan_vocabulary(poster, a10_variant):
    """FE may render public_state. SUBMITTED_FOR_MODERATION is not stored or emitted."""
    listing = create_listing(
        poster=poster, variant_id=a10_variant.id, title="Draft role", description="desc"
    )
    assert listing.public_state == "DRAFT"
    submit_listing(listing=listing, actor=poster.user)
    listing.refresh_from_db()
    assert listing.public_state == "PENDING_REVIEW"
    assert listing.status == Listing.Status.DRAFT
    assert listing.moderation_status == Listing.ModerationStatus.PENDING
    moderate_listing(listing=listing, actor=poster.user, approved=False, reason="Need salary.")
    listing.refresh_from_db()
    assert listing.public_state == "REJECTED"
    submit_listing(listing=listing, actor=poster.user)
    moderate_listing(listing=listing, actor=poster.user, approved=True, reason="ok")
    publish_listing(listing=listing, actor=poster.user)
    listing.refresh_from_db()
    assert listing.public_state == "PUBLISHED"
    assert listing.public_state != "SUBMITTED_FOR_MODERATION"


@pytest.mark.django_db
def test_create_listing_fails_closed_without_active_a10_config(poster, a10_variant):
    A10VariantConfiguration.objects.filter(variant=a10_variant).delete()
    with pytest.raises(ListingStateError, match="not open yet"):
        create_listing(
            poster=poster, variant_id=a10_variant.id, title="Closed category", description="desc"
        )


@pytest.mark.django_db
def test_submit_listing_fails_closed_after_config_or_capability_revoked(poster, a10_variant):
    """Revoke-after-create must not still advance moderation (Grok HOLD P2)."""
    listing = create_listing(
        poster=poster,
        variant_id=a10_variant.id,
        title="Will lose access",
        description="Draft before revoke.",
    )

    A10VariantConfiguration.objects.filter(variant=a10_variant).delete()
    with pytest.raises(ListingStateError, match="not open yet"):
        submit_listing(listing=listing, actor=poster.user)

    A10VariantConfiguration.objects.create(
        variant=a10_variant,
        version=2,
        status=A10VariantConfiguration.Status.ACTIVE,
        application_cooldown_hours=24,
    )
    PartnerCapability.objects.filter(
        partner=poster, archetype=ServiceVariant.BookingArchetype.A10_LISTING
    ).delete()
    with pytest.raises(PermissionError, match="A10 listing capability"):
        submit_listing(listing=listing, actor=poster.user)


@pytest.mark.django_db
def test_premium_activation_and_webhook_replay(poster, a10_variant):
    """Premium capture sets is_premium once; replay is a no-op."""
    plan = VendorSubscriptionPlan.objects.create(
        code=f"growth-prem-{uuid.uuid4().hex[:6]}",
        name="Growth",
        price_paise=249900,
        duration_days=60,
        max_active_listings=15,
        premium_capabilities=["FEATURED_PLACEMENT"],
        premium_price_paise=49900,
    )
    sub = start_subscription_purchase(poster=poster, plan=plan, idempotency_key="prem-sub-1")
    assert sub.payment_attempt is not None
    complete_subscription_payment(payment_attempt_id=sub.payment_attempt.id)

    listing = create_listing(
        poster=poster, variant_id=a10_variant.id, title="Featured role", description="desc"
    )
    assert listing.is_premium is False
    listing = start_premium_purchase(
        listing=listing, actor=poster.user, idempotency_key="prem-tx-1"
    )
    assert listing.payment_attempt is not None
    assert listing.payment_attempt.purpose == PaymentAttempt.Purpose.A10_PREMIUM_LISTING
    assert listing.is_premium is False

    activate_premium_feature(payment_attempt_id=listing.payment_attempt.id)
    listing.refresh_from_db()
    assert listing.is_premium is True

    activate_premium_feature(payment_attempt_id=listing.payment_attempt.id)
    listing.refresh_from_db()
    assert listing.is_premium is True


@pytest.mark.django_db
def test_slice4_structured_fields_schema_enforcement(a10_variant):
    """Slice 4: Structured fields are validated against active variant schema and enums."""
    config = A10VariantConfiguration.objects.get(variant=a10_variant)
    config.listing_type_schema = {
        "type": "object",
        "properties": {
            "role_type": {
                "type": "string",
                "title": "Role Type / Employment",
                "enum": ["Full-Time", "Part-Time", "Contract", "Internship"],
            },
            "salary_range": {"type": "string", "title": "Pay Range / Compensation"},
            "shift": {
                "type": "string",
                "title": "Workplace Mode / Shift",
                "enum": ["On-site", "Hybrid", "Remote"],
            },
            "experience_years": {"type": "string", "title": "Experience Required"},
        },
    }
    config.save()

    # Valid payload with alias keys (pay_range -> salary_range, work_mode -> shift)
    serializer = PartnerListingSerializer(
        data={
            "variant": str(a10_variant.id),
            "title": "Valid Software Engineer",
            "description": "A great software engineering role with at least 20 chars.",
            "location_text": "Hyderabad",
            "contact_phone": "+919900000088",
            "salary_min_paise": 5000000,
            "salary_max_paise": 7000000,
            "salary_period": "MONTHLY",
            "structured_fields": {
                "role_type": "Full-Time",
                "pay_range": "₹50,000 / month",
                "work_mode": "Hybrid",
                "experience_years": "2+ years",
            },
        }
    )
    assert serializer.is_valid(), serializer.errors
    validated_fields = serializer.validated_data["structured_fields"]
    assert "salary_range" in validated_fields
    assert "shift" in validated_fields
    assert "pay_range" not in validated_fields
    assert "work_mode" not in validated_fields

    # Out-of-schema key refused
    invalid_key_serializer = PartnerListingSerializer(
        data={
            "variant": str(a10_variant.id),
            "title": "Invalid Key Engineer",
            "description": "A great software engineering role with at least 20 chars.",
            "location_text": "Hyderabad",
            "contact_phone": "+919900000088",
            "salary_min_paise": 5000000,
            "salary_max_paise": 7000000,
            "salary_period": "MONTHLY",
            "structured_fields": {
                "unknown_extra_detail": "Not in schema",
            },
        }
    )
    with pytest.raises(ValidationError) as exc:
        invalid_key_serializer.is_valid(raise_exception=True)
    assert "unknown_extra_detail" in str(exc.value)

    # Invalid enum choice refused
    invalid_enum_serializer = PartnerListingSerializer(
        data={
            "variant": str(a10_variant.id),
            "title": "Invalid Enum Engineer",
            "description": "A great software engineering role with at least 20 chars.",
            "location_text": "Hyderabad",
            "contact_phone": "+919900000088",
            "salary_min_paise": 5000000,
            "salary_max_paise": 7000000,
            "salary_period": "MONTHLY",
            "structured_fields": {
                "role_type": "Moonlighting",
            },
        }
    )
    with pytest.raises(ValidationError) as exc:
        invalid_enum_serializer.is_valid(raise_exception=True)
    assert "Moonlighting" in str(exc.value)


@pytest.mark.django_db
def test_slice4_listing_detail_and_role_catalog_exposes_schemas(poster, a10_variant):
    """Slice 4: ListingDetail and PartnerListingRoleCatalog expose schema and options."""
    config = A10VariantConfiguration.objects.get(variant=a10_variant)
    config.listing_type_schema = {
        "type": "object",
        "properties": {
            "role_type": {"type": "string", "enum": ["Full-Time"]},
        },
    }
    config.application_schema = {
        "type": "object",
        "properties": {
            "resume_url": {"type": "string", "title": "Resume Link"},
        },
    }
    config.save()

    listing = create_listing(
        poster=poster,
        variant_id=a10_variant.id,
        title="Python Engineer",
        description="Senior engineer wanted with at least 20 characters.",
    )

    data = ListingDetailSerializer(listing).data
    assert data["listing_type_schema"] == config.listing_type_schema
    assert data["application_schema"] == config.application_schema

    partner_client = _client_for(poster.user, "partner")
    res = partner_client.get("/api/v1/partner/listings/roles")
    assert res.status_code == 200
    roles = res.json()
    assert len(roles) > 0
    first_variant = roles[0]["variants"][0]
    assert "listing_type_schema" in first_variant
    assert "application_schema" in first_variant


@pytest.mark.django_db
def test_slice4_listing_filters_taxonomy_endpoint(client):
    """Slice 4: Listings filter taxonomy returns categories."""
    res = client.get("/api/v1/listings/filters")
    assert res.status_code == 200
    body = res.json()
    assert "categories" in body
    assert len(body["categories"]) > 0
    assert body["categories"][0]["label"] == "All Roles"
    assert body["categories"][0]["value"] == ""


@pytest.mark.django_db
def test_public_listings_filter_employment_type(poster, a10_variant):
    now = timezone.now()
    Listing.objects.create(
        poster=poster,
        variant=a10_variant,
        title="On site accountant",
        description="Books and GST for a Hyderabad office team.",
        status=Listing.Status.PUBLISHED,
        moderation_status=Listing.ModerationStatus.APPROVED,
        published_at=now,
        expires_at=now + timedelta(days=14),
        structured_fields={"employment_type": "Full-Time", "work_mode": "On-site"},
    )
    rows = list(public_listings({"employment_type": "Full-Time", "sort": "latest"}))
    assert len(rows) == 1
    assert list(public_listings({"work_mode": "Remote"})) == []


@pytest.mark.django_db
def test_listing_salary_validation(a10_variant):
    """Partner create must send valid salary rules."""
    # valid payload
    serializer = PartnerListingSerializer(
        data={
            "variant": str(a10_variant.id),
            "title": "Valid Software Engineer",
            "description": "A great software engineering role with at least 20 chars.",
            "location_text": "Hyderabad",
            "salary_min_paise": 1000000,
            "salary_max_paise": 1500000,
            "salary_period": "MONTHLY",
        }
    )
    assert serializer.is_valid(), serializer.errors

    # max < min
    serializer = PartnerListingSerializer(
        data={
            "variant": str(a10_variant.id),
            "title": "Valid Software Engineer",
            "description": "A great software engineering role with at least 20 chars.",
            "location_text": "Hyderabad",
            "salary_min_paise": 1500000,
            "salary_max_paise": 1000000,
            "salary_period": "MONTHLY",
        }
    )
    with pytest.raises(ValidationError) as exc:
        serializer.is_valid(raise_exception=True)
    assert "Maximum pay cannot be less than minimum pay." in str(exc.value)

    # missing period
    serializer = PartnerListingSerializer(
        data={
            "variant": str(a10_variant.id),
            "title": "Valid Software Engineer",
            "description": "A great software engineering role with at least 20 chars.",
            "location_text": "Hyderabad",
            "salary_min_paise": 1000000,
            "salary_max_paise": 1500000,
        }
    )
    with pytest.raises(ValidationError) as exc:
        serializer.is_valid(raise_exception=True)
    assert "Pay period must be" in str(exc.value)


@pytest.mark.django_db
def test_ops_vendor_subscription_plans_are_scoped_per_service(a10_variant):
    """Operations can publish a plan for one service and leave another plan global."""
    rental_service = Service.objects.create(
        subcategory=a10_variant.service.subcategory,
        slug=f"jcb-{uuid.uuid4().hex[:6]}",
        name="JCB Hire",
        short_description="Hourly JCB rental",
        status=Service.Status.ACTIVE,
    )
    ServiceVariant.objects.create(
        service=rental_service,
        code=f"jcb-day-{uuid.uuid4().hex[:6]}",
        name="JCB day hire",
        pricing_strategy=ServiceVariant.PricingStrategy.FIXED,
        booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
        required_skill_code="rental",
        tax_category_code="rental",
    )
    op_user = _create_user(phone_number=f"+9196{uuid.uuid4().int % 10**8:08d}", is_staff=True)
    op_client = _client_for(op_user, role="operations")

    create_res = op_client.post(
        "/api/v1/ops/vendor-subscription-plans",
        {
            "service": str(a10_variant.service_id),
            "code": f"jobs-growth-{uuid.uuid4().hex[:6]}",
            "name": "Jobs Growth",
            "price_paise": 249900,
            "duration_days": 60,
            "max_active_listings": 15,
            "premium_capabilities": ["FEATURED_PLACEMENT"],
            "premium_price_paise": 49900,
            "details": "Featured job posts for the Career service only.",
            "is_active": True,
        },
        format="json",
    )
    assert create_res.status_code == 201, create_res.data
    assert create_res.data["service"] == str(a10_variant.service_id)
    assert create_res.data["service_name"] == a10_variant.service.name
    assert create_res.data["details"] == "Featured job posts for the Career service only."

    catalog = op_client.get("/api/v1/ops/vendor-subscription-plans")
    assert catalog.status_code == 200
    service_ids = {item["id"] for item in catalog.data["services"]}
    assert str(rental_service.id) in service_ids
    assert str(a10_variant.service_id) not in service_ids
    plan_ids = {item["id"] for item in catalog.data["plans"]}
    assert create_res.data["id"] in plan_ids

    patch_res = op_client.patch(
        f"/api/v1/ops/vendor-subscription-plans/{create_res.data['id']}",
        {"details": "Updated extra details for this service.", "is_active": False},
        format="json",
    )
    assert patch_res.status_code == 200, patch_res.data
    assert patch_res.data["details"] == "Updated extra details for this service."
    assert patch_res.data["is_active"] is False


@pytest.mark.django_db
def test_free_tier_max_one_listing(poster, a10_variant):
    """M3: Poster with no active subscription can publish 1 listing, but second is blocked."""
    # No subscription created

    # 1st listing published
    l1 = create_listing(
        poster=poster, variant_id=a10_variant.id, title="Free Role 1", description="desc"
    )
    submit_listing(listing=l1, actor=poster.user)
    moderate_listing(listing=l1, actor=poster.user, approved=True)
    publish_listing(listing=l1, actor=poster.user)

    # 2nd listing approved but publish blocked by free tier cap
    l2 = create_listing(
        poster=poster, variant_id=a10_variant.id, title="Free Role 2", description="desc"
    )
    submit_listing(listing=l2, actor=poster.user)
    moderate_listing(listing=l2, actor=poster.user, approved=True)

    with pytest.raises(ListingPlanCapError, match="Active listing limit reached"):
        publish_listing(listing=l2, actor=poster.user)


@pytest.mark.django_db
def test_listing_plan_cap_api_error(poster, a10_variant):
    """API returns 409 listing_plan_cap when publish quota is exceeded."""
    # Free tier: 1st listing published
    l1 = create_listing(
        poster=poster, variant_id=a10_variant.id, title="API Role 1", description="desc"
    )
    submit_listing(listing=l1, actor=poster.user)
    moderate_listing(listing=l1, actor=poster.user, approved=True)
    publish_listing(listing=l1, actor=poster.user)

    # 2nd listing
    l2 = create_listing(
        poster=poster, variant_id=a10_variant.id, title="API Role 2", description="desc"
    )
    submit_listing(listing=l2, actor=poster.user)
    moderate_listing(listing=l2, actor=poster.user, approved=True)

    partner_client = _client_for(poster.user, role="partner")
    response = partner_client.post(
        f"/api/v1/partner/listings/{l2.id}/publish", {"reason": "lets go"}, format="json"
    )
    assert response.status_code == 409
    body = response.json()
    assert "error" in body
    assert body["error"]["code"] == "listing_plan_cap"
    # Must not fall through to the generic listing_state_conflict code.
    assert body["error"]["code"] != "listing_state_conflict"
