"""Week 1 of Jobs: post a job by tapping, in about two minutes, and it goes live at once.

- "Hire staff" sign-up: an approved employer application is the job-posting permission.
- Templates (category -> role) bring skills, duties and a typical pay range.
- The job writes its own description from what was picked; the employer may edit it.
- Posting goes live straight away (no review queue). Older long-form listings keep review.
- Duplicate an old job; close and reopen; edits keep a live job live.
"""

import pytest

from apps.catalog.models import ServiceVariant
from apps.identity.models import Role, UserRole
from apps.listings.jobs import describe_job
from apps.listings.models import Listing
from apps.listings.selectors import public_listings
from apps.listings.services import (
    ListingStateError,
    close_listing,
    duplicate_listing,
    job_options,
    post_job,
    publish_job_now,
    update_job,
)
from apps.partners.capabilities import is_approved_employer, workspace_grants
from apps.partners.models import PartnerApplication
from tests.helpers import force_role_client
from tests.listings.jobs_helpers import SALES_PAY_MAX, SALES_PAY_MIN, VACANCIES, _sales_job


# --- sign-up --------------------------------------------------------------------------------


@pytest.mark.django_db
def test_approved_hire_staff_signup_can_post_jobs(employer):
    assert is_approved_employer(employer)
    keys = {grant.workspace_key for grant in workspace_grants(employer)}
    assert ServiceVariant.BookingArchetype.A10_LISTING in keys


@pytest.mark.django_db
def test_a_pending_employer_cannot_post(employer):
    PartnerApplication.objects.filter(partner=employer).update(
        status=PartnerApplication.Status.SUBMITTED
    )
    with pytest.raises(PermissionError):
        post_job(poster=employer, actor=employer.user, data=_sales_job())


# --- templates and options ------------------------------------------------------------------


@pytest.mark.django_db
def test_templates_are_seeded_by_category_with_skills_and_pay(jobs_variant):  # noqa: ARG001
    options = job_options()
    names = {cat["name"] for cat in options["categories"]}
    assert {"Retail & Sales", "Healthcare", "Driver & Delivery"} <= names
    retail = next(cat for cat in options["categories"] if cat["name"] == "Retail & Sales")
    sales = next(role for role in retail["roles"] if role["name"] == "Sales Executive")
    assert "Customer handling" in sales["skills"]
    assert sales["salary_min_rupees"] > 0
    assert {o["value"] for o in options["job_types"]} >= {"FULL_TIME", "PART_TIME"}


# --- posting --------------------------------------------------------------------------------


@pytest.mark.django_db
def test_posting_goes_live_at_once_with_a_written_description(employer):
    job = post_job(poster=employer, actor=employer.user, data=_sales_job())

    assert job.status == Listing.Status.PUBLISHED
    assert job.moderation_status == Listing.ModerationStatus.APPROVED
    assert job.location_text == "Kukatpally, Hyderabad"
    assert job.job_category == "Retail & Sales"
    assert "Sri Lakshmi Jewellers is hiring 5 Sales Executives in Kukatpally" in job.description
    assert "₹20,000 to ₹35,000 per month" in job.description
    assert public_listings().filter(id=job.id).exists()


@pytest.mark.django_db
def test_an_own_description_is_kept(employer):
    job = post_job(
        poster=employer,
        actor=employer.user,
        data=_sales_job(description="Join our showroom team in Kukatpally."),
    )
    assert job.description == "Join our showroom team in Kukatpally."


@pytest.mark.django_db
def test_draft_can_be_saved_without_the_basics(employer):
    draft = post_job(
        poster=employer,
        actor=employer.user,
        data={"title": "Cashier", "job_type": ""},
        publish=False,
    )
    assert draft.status == Listing.Status.DRAFT

    with pytest.raises(ListingStateError) as exc:
        publish_job_now(listing=draft, actor=employer.user)
    assert "city" in str(exc.value)


@pytest.mark.django_db
def test_options_outside_the_lists_are_refused(employer):
    with pytest.raises(ListingStateError):
        post_job(poster=employer, actor=employer.user, data=_sales_job(job_type="SOMETIMES"))
    with pytest.raises(ListingStateError):
        post_job(poster=employer, actor=employer.user, data=_sales_job(languages=["KLINGON"]))
    with pytest.raises(ListingStateError):
        post_job(
            poster=employer,
            actor=employer.user,
            data=_sales_job(salary_min_paise=SALES_PAY_MAX, salary_max_paise=SALES_PAY_MIN),
        )


@pytest.mark.django_db
def test_custom_skills_are_trimmed_and_deduplicated(employer):
    job = post_job(
        poster=employer,
        actor=employer.user,
        data=_sales_job(required_skills=[" Sales ", "sales", "Gold  testing"]),
    )
    assert job.required_skills == ["Sales", "Gold testing"]


# --- managing -------------------------------------------------------------------------------


@pytest.mark.django_db
def test_editing_a_live_job_keeps_it_live(employer):
    job = post_job(poster=employer, actor=employer.user, data=_sales_job())

    job = update_job(listing=job, actor=employer.user, data={"vacancies": 3})

    assert job.status == Listing.Status.PUBLISHED
    assert job.vacancies == 3


@pytest.mark.django_db
def test_regenerate_description_rewrites_it_from_the_options(employer):
    job = post_job(poster=employer, actor=employer.user, data=_sales_job(description="Old text."))
    job = update_job(
        listing=job, actor=employer.user, data={"vacancies": 2, "regenerate_description": True}
    )
    assert "hiring 2 Sales Executives" in job.description


@pytest.mark.django_db
def test_close_and_reopen_without_a_review(employer):
    job = post_job(poster=employer, actor=employer.user, data=_sales_job())
    close_listing(listing=job, actor=employer.user)

    job = publish_job_now(listing=job, actor=employer.user)

    assert job.status == Listing.Status.PUBLISHED


@pytest.mark.django_db
def test_duplicate_copies_every_detail_as_a_draft(employer):
    job = post_job(poster=employer, actor=employer.user, data=_sales_job())

    copy = duplicate_listing(listing=job, actor=employer.user)

    assert copy.id != job.id
    assert copy.status == Listing.Status.DRAFT
    assert copy.required_skills == job.required_skills
    assert copy.timing_start == job.timing_start
    assert copy.vacancies == VACANCIES


@pytest.mark.django_db
def test_free_plan_still_limits_live_jobs(employer):
    post_job(poster=employer, actor=employer.user, data=_sales_job())
    with pytest.raises(ListingStateError):
        post_job(poster=employer, actor=employer.user, data=_sales_job(title="Cashier"))


def test_description_skips_what_was_not_picked():
    text = describe_job({"title": "Cashier", "vacancies": 1, "city": "Warangal"})
    assert text == "We are hiring 1 Cashier in Warangal."


# --- the API --------------------------------------------------------------------------------


def _client(user):
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="partner")


@pytest.mark.django_db
def test_api_post_duplicate_and_filter(employer, client):
    options = client.get("/api/v1/jobs/options").data
    assert options["categories"]

    api = _client(employer.user)
    data = _sales_job()
    data["role_template_id"] = str(data["role_template_id"])
    data["timing_start"], data["timing_end"] = "10:00", "20:00"
    created = api.post("/api/v1/partner/jobs", data, format="json")
    assert created.status_code == 201
    assert created.data["status"] == "PUBLISHED"
    assert created.data["required_skills"] == ["Sales", "Customer handling"]

    copy = api.post(f"/api/v1/partner/jobs/{created.data['id']}/duplicate")
    assert copy.status_code == 201
    assert copy.data["status"] == "DRAFT"

    found = client.get("/api/v1/listings", {"category": "Retail & Sales", "city": "hyderabad"})
    assert [row["id"] for row in found.data] == [created.data["id"]]
