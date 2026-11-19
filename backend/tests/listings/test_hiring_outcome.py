"""The end of a hire: allowed stage moves only, Hired, and closing a job as filled.

Applicants move only along `ALLOWED_APPLICATION_MOVES` (each move audited, a repeat is a no-op),
the employer can mark someone hired, and "fill" closes the job and tells everyone still waiting.
The employer hears about every application, however it was sent.
"""

import uuid
from datetime import time, timedelta
from typing import Any

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.identity.models import Role, UserRole
from apps.listings.interviews import propose_interview
from apps.listings.models import Application, ApplicationStatusEvent, Interview, Listing
from apps.listings.serializers import ListingSummarySerializer
from apps.listings.seekers import quick_apply, save_profile
from apps.listings.services import (
    ListingStateError,
    fill_listing,
    post_job,
    reveal_contact,
    submit_application,
    update_application_status,
)
from apps.notifications.models import NotificationIntent
from apps.partners.capabilities.registration import upsert_business_profile
from apps.partners.models import PartnerBusinessProfile
from tests.helpers import force_role_client
from tests.listings.jobs_helpers import _sales_job

User = get_user_model()
S = Application.Status


def _seeker(name: str = "Priya Sharma") -> Any:
    manager: Any = User.objects
    seeker = manager.create_user(
        phone_number=f"+9196{uuid.uuid4().int % 10**8:08d}", full_name=name
    )
    save_profile(
        user=seeker, data={"full_name": name, "roles": ["Sales Executive"], "city": "Hyderabad"}
    )
    return seeker


@pytest.fixture
def job(employer):
    return post_job(poster=employer, actor=employer.user, data=_sales_job())


@pytest.fixture
def application(job):
    return quick_apply(listing=job, user=_seeker())


def _move(application: Application, employer: Any, status: str) -> Application:
    return update_application_status(application=application, actor=employer.user, status=status)


def _owner_client(employer: Any) -> Any:
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=employer.user, role=role, revoked_at=None)
    return force_role_client(user=employer.user, role_code="partner")


# --- allowed moves -----------------------------------------------------------------------


@pytest.mark.django_db
def test_an_applicant_walks_the_normal_path_to_hired(application, employer):
    for status in (S.SHORTLISTED, S.INTERVIEW, S.CONNECTED, S.HIRED):
        application = _move(application, employer, status)
    application.refresh_from_db()

    assert application.status == S.HIRED
    moves = ApplicationStatusEvent.objects.filter(application=application, kind="STATUS_UPDATE")
    assert [(m.from_status, m.to_status) for m in moves.order_by("created_at")] == [
        (S.SUBMITTED, S.SHORTLISTED),
        (S.SHORTLISTED, S.INTERVIEW),
        (S.INTERVIEW, S.CONNECTED),
        (S.CONNECTED, S.HIRED),
    ]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("path", "refused"),
    [
        ((), S.HIRED),  # straight from applied to hired skips the interview
        ((S.REJECTED,), S.SHORTLISTED),  # a rejection is reopened only by booking an interview
        ((S.SHORTLISTED, S.INTERVIEW, S.HIRED), S.REJECTED),  # hired is final
    ],
)
def test_moves_outside_the_rules_are_refused_and_change_nothing(
    application, employer, path, refused
):
    for status in path:
        application = _move(application, employer, status)
    before = application.status

    with pytest.raises(ListingStateError):
        _move(application, employer, refused)

    application.refresh_from_db()
    assert application.status == before


@pytest.mark.django_db
def test_asking_for_the_current_stage_again_is_a_harmless_retry(application, employer):
    _move(application, employer, S.SHORTLISTED)
    _move(application, employer, S.SHORTLISTED)

    assert (
        ApplicationStatusEvent.objects.filter(
            application=application, kind="STATUS_UPDATE", to_status=S.SHORTLISTED
        ).count()
        == 1
    )


@pytest.mark.django_db
def test_hiring_tells_the_candidate(application, employer):
    for status in (S.SHORTLISTED, S.INTERVIEW, S.HIRED):
        _move(application, employer, status)

    intent = NotificationIntent.objects.get(
        template_code="job_application_update",
        recipient_id=application.applicant_id,
        purpose="jobs.application.hired",
    )
    assert "hired you" in intent.context["message"]


@pytest.mark.django_db
def test_revealing_a_contact_never_moves_an_interviewee_backwards(application, employer):
    _move(application, employer, S.INTERVIEW)

    reveal_contact(application=application, actor=employer.user)
    application.refresh_from_db()

    assert application.contact_revealed_at is not None
    assert application.status == S.INTERVIEW


# --- closing a job as filled -------------------------------------------------------------


@pytest.mark.django_db
def test_filling_a_job_closes_it_and_turns_down_everyone_still_waiting(job, employer):
    hired = quick_apply(listing=job, user=_seeker("Hired Person"))
    waiting = quick_apply(listing=job, user=_seeker("Still Waiting"))
    interviewing = quick_apply(listing=job, user=_seeker("In Interview"))
    for status in (S.SHORTLISTED, S.INTERVIEW, S.HIRED):
        _move(hired, employer, status)
    interview = propose_interview(
        application=interviewing,
        actor=employer.user,
        scheduled_date=timezone.localdate() + timedelta(days=1),
        start_time=time(11),
        mode="PHONE",
    )

    fill_listing(listing=job, actor=employer.user)

    job.refresh_from_db()
    assert job.status == Listing.Status.CLOSED
    for app in (waiting, interviewing):
        app.refresh_from_db()
        assert app.status == S.REJECTED
        notice = NotificationIntent.objects.get(
            recipient_id=app.applicant_id, purpose="jobs.application.rejected"
        )
        assert "position has been filled" in notice.context["message"]
    hired.refresh_from_db()
    assert hired.status == S.HIRED
    interview.refresh_from_db()
    assert interview.status == Interview.Status.CANCELLED
    assert ApplicationStatusEvent.objects.filter(
        application=waiting, note="Position filled"
    ).exists()


@pytest.mark.django_db
def test_a_job_cannot_be_closed_as_filled_without_a_hire(job, application, employer):
    with pytest.raises(ListingStateError):
        fill_listing(listing=job, actor=employer.user)

    job.refresh_from_db()
    application.refresh_from_db()
    assert job.status == Listing.Status.PUBLISHED
    assert application.status == S.SUBMITTED


@pytest.mark.django_db
def test_filling_twice_changes_nothing_the_second_time(job, application, employer):
    for status in (S.SHORTLISTED, S.INTERVIEW, S.HIRED):
        _move(application, employer, status)
    fill_listing(listing=job, actor=employer.user)

    fill_listing(listing=job, actor=employer.user)

    job.refresh_from_db()
    assert job.status == Listing.Status.CLOSED


# --- every application tells the employer -------------------------------------------------


@pytest.mark.django_db
def test_the_form_apply_tells_the_employer(job, employer):
    seeker = _seeker()
    submit_application(
        listing=job, applicant=seeker, applicant_snapshot={"name": "Kiran Kumar", "phone": "x"}
    )

    intent = NotificationIntent.objects.get(
        template_code="job_application_received", recipient_id=employer.user_id
    )
    assert intent.context["candidate_name"] == "Kiran Kumar"


@pytest.mark.django_db
def test_quick_apply_tells_the_employer_once(job, employer):
    quick_apply(listing=job, user=_seeker())

    assert (
        NotificationIntent.objects.filter(
            template_code="job_application_received", recipient_id=employer.user_id
        ).count()
        == 1
    )


# --- the API -------------------------------------------------------------------------------


@pytest.mark.django_db
def test_api_wrong_move_is_a_409_and_hired_shows_on_the_job_card(application, employer):
    owner = _owner_client(employer)
    url = f"/api/v1/partner/listing-applications/{application.id}/status"

    refused = owner.post(url, {"status": "HIRED"}, format="json")
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "listing_state_conflict"

    for status in ("SHORTLISTED", "INTERVIEW", "HIRED"):
        assert owner.post(url, {"status": status}, format="json").status_code == 200

    jobs = owner.get("/api/v1/partner/listings").json()
    card = next(row for row in jobs if row["id"] == str(application.listing_id))
    assert card["counts"]["hired"] == 1


@pytest.mark.django_db
def test_api_fill_closes_the_job_and_only_the_owner_can(application, employer, jobs_variant):  # noqa: ARG001
    owner = _owner_client(employer)
    status_url = f"/api/v1/partner/listing-applications/{application.id}/status"
    for status in ("SHORTLISTED", "INTERVIEW", "HIRED"):
        owner.post(status_url, {"status": status}, format="json")
    fill_url = f"/api/v1/partner/listings/{application.listing_id}/fill"

    stranger = _seeker("Not The Owner")
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=stranger, role=role, revoked_at=None)
    other = force_role_client(user=stranger, role_code="partner")
    assert other.post(fill_url, {}, format="json").status_code in (403, 404)

    filled = owner.post(fill_url, {}, format="json")
    assert filled.status_code == 200
    assert filled.json()["status"] == "CLOSED"


# --- the business name ---------------------------------------------------------------------


@pytest.mark.django_db
def test_jobs_show_the_business_name_once_the_employer_gives_one(job, employer):
    assert ListingSummarySerializer(job).data["poster_name"] == employer.display_name

    upsert_business_profile(
        partner=employer,
        business_type=PartnerBusinessProfile.BusinessType.EMPLOYER,
        legal_name="Sri Sai Mobiles",
        business_category="SHOP",
        city="Hyderabad",
    )
    job.refresh_from_db()

    assert ListingSummarySerializer(job).data["poster_name"] == "Sri Sai Mobiles"
