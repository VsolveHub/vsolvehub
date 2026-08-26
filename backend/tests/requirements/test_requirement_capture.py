"""P2: free requirement capture, lifecycle inference, duplicates, SLA clock and expiry."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from apps.catalog.models import (
    Category,
    M2VariantConfiguration,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.foundation.models import OutboxEvent
from apps.identity.models import User
from apps.locations.models import (
    Address,
    ServiceArea,
    ServiceAreaOperatingException,
    ServiceAreaOperatingWindow,
)
from apps.requirements import services, sla
from apps.requirements.exceptions import (
    LifecycleNotSupportedError,
    RequirementDuplicateError,
    RequirementIncompleteError,
    RequirementLockedError,
    RequirementTransitionError,
)
from apps.requirements.models import CustomerRequirement, RequirementTransition

pytestmark = pytest.mark.django_db

IST = ZoneInfo("Asia/Kolkata")

QUESTION_SCHEMA = {
    "questions": [
        {"code": "worker_count", "kind": "INTEGER", "minimum": 1, "required": False},
        {"code": "duration_days", "kind": "INTEGER", "minimum": 1, "required": False},
        {"code": "deliverable", "kind": "TEXT", "required": False},
        {"code": "site_access", "kind": "TEXT", "required": False},
    ]
}


def _variant(archetype: str, *, code: str = "helpers") -> ServiceVariant:
    category = Category.objects.create(slug=f"cat-{code}", name=f"Cat {code}")
    subcategory = Subcategory.objects.create(
        category=category, slug=f"sub-{code}", name=f"Sub {code}"
    )
    service = Service.objects.create(
        subcategory=subcategory,
        slug=f"svc-{code}",
        name=f"Service {code}",
        short_description="Test service.",
        status=Service.Status.ACTIVE,
    )
    return ServiceVariant.objects.create(
        service=service,
        code=code,
        name=f"Variant {code}",
        pricing_strategy=ServiceVariant.PricingStrategy.DURATION,
        booking_archetype=archetype,
        required_skill_code="helper",
        tax_category_code="labour",
    )


def _configuration(
    variant: ServiceVariant,
    *,
    first_quote_sla_hours: int | None = 8,
    quote_delivery_sla_hours: int | None = 24,
) -> M2VariantConfiguration:
    return M2VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=M2VariantConfiguration.Status.ACTIVE,
        question_schema=QUESTION_SCHEMA,
        first_quote_sla_hours=first_quote_sla_hours,
        quote_delivery_sla_hours=quote_delivery_sla_hours,
    )


def _area(*, open_daily: bool = True) -> ServiceArea:
    area = ServiceArea.objects.create(slug="kukatpally", name="Kukatpally")
    if open_daily:
        for weekday in range(7):
            ServiceAreaOperatingWindow.objects.create(
                service_area=area,
                weekday=weekday,
                opens_at=time(9, 0),
                closes_at=time(18, 0),
            )
    return area


def _customer(phone: str = "+919812345670") -> User:
    return User.objects.create_user(phone_number=phone, full_name="Priya S")


def _address(customer: User) -> Address:
    return Address.objects.create(
        customer=customer,
        label="Warehouse",
        line1="Plot 14, Industrial Estate",
        locality="Kukatpally",
        city="Hyderabad",
        state="Telangana",
        postal_code="500072",
        latitude=Decimal("17.494500"),
        longitude=Decimal("78.399200"),
        confirmed_at=timezone.now(),
    )


def _ready_draft(
    *,
    archetype: str = ServiceVariant.BookingArchetype.A3_TIME_BLOCK,
    answers: dict | None = None,
    service_by: date | None = None,
) -> CustomerRequirement:
    variant = _variant(archetype)
    _configuration(variant)
    customer = _customer()
    area = _area()
    requirement = services.create_draft(
        customer=customer,
        variant=variant,
        answers=answers if answers is not None else {"worker_count": 4, "duration_days": 3},
    )
    return services.update_draft(
        requirement=requirement,
        address=_address(customer),
        service_area=area,
        requested_start=timezone.now() + timedelta(days=10),
        service_by=service_by or (timezone.localdate() + timedelta(days=20)),
    )


# ---------------------------------------------------------------------------
# Free capture and submission (M2-BE-201, M2-BE-208, M2-BE-211)
# ---------------------------------------------------------------------------


def test_a_submitted_requirement_charges_nothing_and_enters_matching() -> None:
    requirement = _ready_draft()

    submitted = services.submit_requirement(requirement=requirement, actor=requirement.customer)

    assert submitted.status == CustomerRequirement.Status.MATCHING
    assert submitted.submitted_at is not None
    # Nothing in P2 may create a money record.
    assert not hasattr(submitted, "amount_paise")


def test_submission_emits_exactly_one_matching_event_keyed_on_the_requirement() -> None:
    requirement = _ready_draft()
    services.submit_requirement(requirement=requirement, actor=requirement.customer)

    events = OutboxEvent.objects.filter(event_type="m2.requirement.submitted")
    assert events.count() == 1
    assert events.first().idempotency_key == f"requirement-submitted:{requirement.id}"


def test_resubmitting_an_already_submitted_requirement_is_refused() -> None:
    requirement = _ready_draft()
    services.submit_requirement(requirement=requirement, actor=requirement.customer)

    with pytest.raises(RequirementTransitionError):
        services.submit_requirement(requirement=requirement, actor=requirement.customer)


def test_incomplete_requirement_names_what_is_missing() -> None:
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)
    _configuration(variant)
    customer = _customer()
    requirement = services.create_draft(
        customer=customer, variant=variant, answers={"worker_count": 4, "duration_days": 3}
    )

    with pytest.raises(RequirementIncompleteError) as excinfo:
        services.submit_requirement(requirement=requirement, actor=customer)
    assert "where the work is" in str(excinfo.value)


def test_a_past_needed_by_date_cannot_be_submitted() -> None:
    requirement = _ready_draft(service_by=timezone.localdate() - timedelta(days=1))

    with pytest.raises(RequirementIncompleteError) as excinfo:
        services.submit_requirement(requirement=requirement, actor=requirement.customer)
    assert "already passed" in str(excinfo.value)


def test_an_unknown_answer_is_rejected_as_incomplete_not_as_a_server_error() -> None:
    requirement = _ready_draft(answers={"worker_count": 4, "duration_days": 3})
    requirement.answers = {"not_a_question": "x"}
    requirement.save(update_fields=("answers",))

    # The shared validator raises ValueError; the domain must translate it.
    with pytest.raises(RequirementIncompleteError):
        services.submit_requirement(requirement=requirement, actor=requirement.customer)


def test_a_draft_discards_an_answer_carried_over_from_another_service() -> None:
    """A crew form route change must not poison the new service's saved answer set."""
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)
    _configuration(variant)
    customer = _customer()

    requirement = services.create_draft(
        customer=customer,
        variant=variant,
        answers={
            "work_type": "masonry-helper",
            "worker_count": 4,
            "duration_days": 2,
        },
    )
    services.update_draft(
        requirement=requirement,
        answers={
            "work_type": "masonry-helper",
            "worker_count": 5,
            "duration_days": 3,
        },
    )

    requirement.refresh_from_db()
    assert requirement.answers == {"worker_count": 5, "duration_days": 3}


def test_a_variant_without_an_active_configuration_cannot_take_requests() -> None:
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)

    with pytest.raises(LifecycleNotSupportedError):
        services.create_draft(customer=_customer(), variant=variant, answers={})


def test_an_a1_variant_is_not_a_workforce_request() -> None:
    variant = _variant(ServiceVariant.BookingArchetype.A1_TASK_VISIT, code="a1")
    M2VariantConfiguration.objects.create(
        variant=variant,
        version=1,
        status=M2VariantConfiguration.Status.ACTIVE,
        question_schema=QUESTION_SCHEMA,
    )

    with pytest.raises(LifecycleNotSupportedError):
        services.create_draft(customer=_customer(), variant=variant, answers={})


def test_get_or_create_draft_reopens_the_existing_service_draft() -> None:
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)
    _configuration(variant)
    customer = _customer()
    first, first_created = services.get_or_create_draft(
        customer=customer,
        variant=variant,
        answers={"worker_count": 3, "duration_days": 2},
    )

    reopened, reopened_created = services.get_or_create_draft(
        customer=customer,
        variant=variant,
        answers={"worker_count": 9, "duration_days": 9},
    )

    assert first_created is True
    assert reopened_created is False
    assert reopened.id == first.id
    assert reopened.answers == {"worker_count": 3, "duration_days": 2}
    assert (
        CustomerRequirement.objects.filter(
            customer=customer,
            variant=variant,
            status=CustomerRequirement.Status.DRAFT,
        ).count()
        == 1
    )


def test_get_or_create_draft_starts_fresh_after_the_previous_request_is_live() -> None:
    first = _ready_draft()
    services.submit_requirement(requirement=first, actor=first.customer)

    draft, created = services.get_or_create_draft(
        customer=first.customer,
        variant=first.variant,
        answers={"worker_count": 2, "duration_days": 1},
    )

    assert created is True
    assert draft.id != first.id
    assert draft.status == CustomerRequirement.Status.DRAFT


# ---------------------------------------------------------------------------
# Editing rules (M2-BE-209)
# ---------------------------------------------------------------------------


def test_a_draft_edits_freely_and_creates_no_version() -> None:
    requirement = _ready_draft()

    services.update_draft(requirement=requirement, additional_details="Two floors, no lift")

    requirement.refresh_from_db()
    assert requirement.additional_details == "Two floors, no lift"
    assert requirement.supersedes is None


def test_editing_after_submission_is_refused_by_the_free_edit_path() -> None:
    requirement = _ready_draft()
    submitted = services.submit_requirement(requirement=requirement, actor=requirement.customer)

    with pytest.raises(RequirementLockedError):
        services.update_draft(requirement=submitted, additional_details="changed my mind")


# ---------------------------------------------------------------------------
# Lifecycle inference and reclassification (M2-BE-204, M2-BE-205)
# ---------------------------------------------------------------------------


def test_headcount_and_duration_infer_a_time_block() -> None:
    variant = _variant(ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT, code="mixed")

    inferred = services.infer_archetype(
        variant=variant, answers={"worker_count": 4, "duration_days": 3}
    )

    assert inferred == ServiceVariant.BookingArchetype.A3_TIME_BLOCK


def test_a_named_outcome_infers_a_project() -> None:
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK, code="mixed")

    inferred = services.infer_archetype(
        variant=variant, answers={"deliverable": "Renovate the bathroom"}
    )

    assert inferred == ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT


def test_an_answer_set_that_says_both_stays_ambiguous_for_operations() -> None:
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK, code="mixed")

    inferred = services.infer_archetype(
        variant=variant,
        answers={"worker_count": 4, "duration_days": 3, "deliverable": "Renovate the bathroom"},
    )

    # Falls back to the variant's own declaration rather than guessing.
    assert inferred == ServiceVariant.BookingArchetype.A3_TIME_BLOCK


def test_reclassification_records_the_move_and_emits_a_rematch_event() -> None:
    requirement = _ready_draft()
    services.submit_requirement(requirement=requirement, actor=requirement.customer)
    operations = User.objects.create_user(phone_number="+919900000009", full_name="Ops")

    reclassified = services.reclassify_requirement(
        requirement_id=requirement.id,
        to_archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
        actor=operations,
        reason="Customer described a finished outcome",
    )

    assert reclassified.archetype == ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT
    assert reclassified.status == CustomerRequirement.Status.MATCHING
    assert RequirementTransition.objects.filter(
        requirement=requirement, reason_code="reclassified"
    ).exists()
    assert OutboxEvent.objects.filter(event_type="m2.requirement.reclassified").exists()


def test_a_closed_requirement_cannot_be_reclassified() -> None:
    requirement = _ready_draft()
    services.submit_requirement(requirement=requirement, actor=requirement.customer)
    services.close_requirement(
        requirement_id=requirement.id,
        status=CustomerRequirement.Status.CLOSED_EXPIRED,
        reason_code="needed_by_passed",
    )

    with pytest.raises(RequirementTransitionError):
        services.reclassify_requirement(
            requirement_id=requirement.id,
            to_archetype=ServiceVariant.BookingArchetype.A5_CUSTOM_PROJECT,
            actor=None,
            reason="too late",
        )


# ---------------------------------------------------------------------------
# Duplicate detection (M2-BE-206)
# ---------------------------------------------------------------------------


def test_a_second_identical_request_is_flagged_as_a_probable_duplicate() -> None:
    first = _ready_draft()
    services.submit_requirement(requirement=first, actor=first.customer)

    second = services.create_draft(
        customer=first.customer,
        variant=first.variant,
        answers={"worker_count": 4, "duration_days": 3},
    )
    services.update_draft(
        requirement=second,
        address=first.address,
        service_area=first.service_area,
        requested_start=first.requested_start,
        service_by=first.service_by,
    )

    with pytest.raises(RequirementDuplicateError) as excinfo:
        services.submit_requirement(requirement=second, actor=first.customer)
    assert excinfo.value.existing_id == first.id


def test_a_duplicate_can_be_submitted_when_the_customer_insists() -> None:
    first = _ready_draft()
    services.submit_requirement(requirement=first, actor=first.customer)
    second = services.create_draft(
        customer=first.customer,
        variant=first.variant,
        answers={"worker_count": 4, "duration_days": 3},
    )
    services.update_draft(
        requirement=second,
        address=first.address,
        service_area=first.service_area,
        requested_start=first.requested_start,
        service_by=first.service_by,
    )

    submitted = services.submit_requirement(
        requirement=second, actor=first.customer, allow_duplicate=True
    )

    assert submitted.status == CustomerRequirement.Status.MATCHING


def test_a_different_date_is_not_a_duplicate() -> None:
    first = _ready_draft()
    services.submit_requirement(requirement=first, actor=first.customer)

    match = services.find_probable_duplicate(
        customer=first.customer,
        variant=first.variant,
        address=first.address,
        requested_start=first.requested_start + timedelta(days=30),
    )

    assert match is None


# ---------------------------------------------------------------------------
# Business-hours SLA clock (M2-BE-212, GAP-014)
# ---------------------------------------------------------------------------


def _windows(area: ServiceArea) -> list[ServiceAreaOperatingWindow]:
    return list(area.operating_windows.all())


def test_hours_do_not_run_overnight() -> None:
    area = _area()
    start = datetime(2026, 8, 24, 16, 0, tzinfo=IST)  # Monday 4pm, closes 6pm

    due = sla.add_business_hours(start=start, hours=4, windows=_windows(area), exceptions=[])

    # Two hours on Monday, two more from Tuesday 9am.
    assert due.astimezone(IST) == datetime(2026, 8, 25, 11, 0, tzinfo=IST)


def test_a_clock_started_before_opening_does_not_get_a_head_start() -> None:
    area = _area()
    start = datetime(2026, 8, 24, 3, 0, tzinfo=IST)

    due = sla.add_business_hours(start=start, hours=2, windows=_windows(area), exceptions=[])

    assert due.astimezone(IST) == datetime(2026, 8, 24, 11, 0, tzinfo=IST)


def test_a_closed_holiday_is_skipped_entirely() -> None:
    area = _area()
    ServiceAreaOperatingException.objects.create(
        service_area=area, date=date(2026, 8, 25), is_closed=True, reason="Festival"
    )
    start = datetime(2026, 8, 24, 17, 0, tzinfo=IST)

    due = sla.add_business_hours(
        start=start,
        hours=3,
        windows=_windows(area),
        exceptions=list(area.operating_exceptions.all()),
    )

    # One hour Monday, Tuesday closed, two hours from Wednesday 9am.
    assert due.astimezone(IST) == datetime(2026, 8, 26, 11, 0, tzinfo=IST)


def test_a_short_day_exception_replaces_the_weekly_hours() -> None:
    area = _area()
    ServiceAreaOperatingException.objects.create(
        service_area=area,
        date=date(2026, 8, 25),
        is_closed=False,
        opens_at=time(10, 0),
        closes_at=time(12, 0),
        reason="Half day",
    )
    start = datetime(2026, 8, 25, 9, 0, tzinfo=IST)

    due = sla.add_business_hours(
        start=start,
        hours=3,
        windows=_windows(area),
        exceptions=list(area.operating_exceptions.all()),
    )

    # Two hours on the short Tuesday, one more from Wednesday 9am.
    assert due.astimezone(IST) == datetime(2026, 8, 26, 10, 0, tzinfo=IST)


def test_an_area_that_never_opens_refuses_rather_than_looping() -> None:
    area = _area(open_daily=False)

    with pytest.raises(sla.ServiceAreaNeverOpenError):
        sla.quote_deadlines(
            area=area,
            submitted_at=timezone.now(),
            first_quote_sla_hours=8,
            quote_delivery_sla_hours=24,
        )


def test_no_configured_sla_yields_no_deadline_rather_than_an_invented_one() -> None:
    area = _area()

    first_due, all_due = sla.quote_deadlines(
        area=area,
        submitted_at=timezone.now(),
        first_quote_sla_hours=None,
        quote_delivery_sla_hours=None,
    )

    assert first_due is None
    assert all_due is None


def test_submission_without_an_approved_sla_still_succeeds_with_no_promise() -> None:
    variant = _variant(ServiceVariant.BookingArchetype.A3_TIME_BLOCK)
    _configuration(variant, first_quote_sla_hours=None, quote_delivery_sla_hours=None)
    customer = _customer()
    requirement = services.create_draft(
        customer=customer, variant=variant, answers={"worker_count": 4, "duration_days": 3}
    )
    services.update_draft(
        requirement=requirement,
        address=_address(customer),
        service_area=_area(),
        requested_start=timezone.now() + timedelta(days=10),
        service_by=timezone.localdate() + timedelta(days=20),
    )

    submitted = services.submit_requirement(requirement=requirement, actor=customer)

    assert submitted.status == CustomerRequirement.Status.MATCHING
    assert submitted.quotes_due_at is None


def test_deadlines_are_recorded_on_submission_when_an_sla_exists() -> None:
    requirement = _ready_draft()

    submitted = services.submit_requirement(requirement=requirement, actor=requirement.customer)

    assert submitted.first_quote_due_at is not None
    assert submitted.quotes_due_at is not None
    assert submitted.first_quote_due_at < submitted.quotes_due_at


# ---------------------------------------------------------------------------
# Expiry and SLA breach sweeps (M2-BE-210, GAP-001, GAP-002)
# ---------------------------------------------------------------------------


def test_the_needed_by_date_passing_makes_a_requirement_sweepable() -> None:
    requirement = _ready_draft()
    services.submit_requirement(requirement=requirement, actor=requirement.customer)
    requirement.refresh_from_db()
    requirement.service_by = timezone.localdate() - timedelta(days=1)
    requirement.save(update_fields=("service_by",))

    assert requirement.id in services.expired_requirement_ids()


def test_closing_an_expired_requirement_records_the_reason_and_emits_an_event() -> None:
    requirement = _ready_draft()
    services.submit_requirement(requirement=requirement, actor=requirement.customer)

    closed = services.close_requirement(
        requirement_id=requirement.id,
        status=CustomerRequirement.Status.CLOSED_EXPIRED,
        reason_code="needed_by_passed",
    )

    assert closed.status == CustomerRequirement.Status.CLOSED_EXPIRED
    assert closed.closed_at is not None
    assert closed.closed_reason_code == "needed_by_passed"
    assert OutboxEvent.objects.filter(event_type="m2.requirement.closed").count() == 1


def test_closing_twice_is_idempotent() -> None:
    requirement = _ready_draft()
    services.submit_requirement(requirement=requirement, actor=requirement.customer)
    first = services.close_requirement(
        requirement_id=requirement.id,
        status=CustomerRequirement.Status.CLOSED_EXPIRED,
        reason_code="needed_by_passed",
    )
    second = services.close_requirement(
        requirement_id=requirement.id,
        status=CustomerRequirement.Status.CLOSED_NO_SUPPLY,
        reason_code="no_vendors",
    )

    assert second.status == first.status
    assert OutboxEvent.objects.filter(event_type="m2.requirement.closed").count() == 1


def test_a_breached_delivery_promise_is_sweepable_while_still_matching() -> None:
    requirement = _ready_draft()
    services.submit_requirement(requirement=requirement, actor=requirement.customer)
    requirement.refresh_from_db()
    requirement.quotes_due_at = timezone.now() - timedelta(hours=1)
    requirement.save(update_fields=("quotes_due_at",))

    assert requirement.id in services.sla_breached_requirement_ids()


def test_a_requirement_with_quotes_is_not_swept_for_sla_breach() -> None:
    requirement = _ready_draft()
    services.submit_requirement(requirement=requirement, actor=requirement.customer)
    requirement.refresh_from_db()
    requirement.status = CustomerRequirement.Status.QUOTES_READY
    requirement.quotes_due_at = timezone.now() - timedelta(hours=1)
    requirement.save(update_fields=("status", "quotes_due_at"))

    assert requirement.id not in services.sla_breached_requirement_ids()
