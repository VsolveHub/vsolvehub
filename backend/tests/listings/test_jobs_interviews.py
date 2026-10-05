"""Week 3 of Jobs: Applied -> Shortlisted -> Interview -> Connected, with the interview invite.

The employer proposes day, time and mode; the candidate accepts, asks for another time, or
declines. Accepting shares phone numbers both ways. Connected ends V Solve Hub's part.
"""

import uuid
from datetime import time, timedelta
from typing import Any

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.identity.models import Role, UserRole
from apps.listings.interviews import employer_contact, propose_interview, respond_to_interview
from apps.listings.models import Application, Interview
from apps.listings.seekers import quick_apply, save_profile
from apps.listings.services import ListingStateError, post_job, update_application_status
from apps.notifications.models import NotificationIntent
from tests.helpers import force_role_client
from tests.listings.jobs_helpers import _sales_job

User = get_user_model()


@pytest.fixture
def application(employer):
    job = post_job(poster=employer, actor=employer.user, data=_sales_job())
    manager: Any = User.objects
    seeker = manager.create_user(
        phone_number=f"+9196{uuid.uuid4().int % 10**8:08d}", full_name="Priya Sharma"
    )
    save_profile(
        user=seeker,
        data={"full_name": "Priya Sharma", "roles": ["Sales Executive"], "city": "Hyderabad"},
    )
    return quick_apply(listing=job, user=seeker)


def _tomorrow():
    return timezone.localdate() + timedelta(days=1)


def _invite(application, employer, **kw: Any) -> Interview:
    return propose_interview(
        application=application,
        actor=employer.user,
        scheduled_date=kw.get("day", _tomorrow()),
        start_time=time(11),
        mode=kw.get("mode", "IN_PERSON"),
        location_text="Kukatpally showroom",
    )


@pytest.mark.django_db
def test_inviting_moves_the_application_to_interview_and_tells_the_candidate(application, employer):
    interview = _invite(application, employer)
    application.refresh_from_db()

    assert application.status == Application.Status.INTERVIEW
    assert interview.status == Interview.Status.PROPOSED
    assert NotificationIntent.objects.filter(
        template_code="job_interview_invite", recipient_id=application.applicant_id
    ).exists()


@pytest.mark.django_db
def test_accepting_shares_numbers_both_ways(application, employer):
    interview = _invite(application, employer)
    assert employer_contact(application) == ""

    respond_to_interview(interview=interview, user=application.applicant, action="accept")
    application.refresh_from_db()

    assert application.contact_revealed_at is not None
    assert employer_contact(application) == employer.user.phone_number
    assert NotificationIntent.objects.filter(
        template_code="job_interview_accepted", recipient_id=employer.user_id
    ).exists()


@pytest.mark.django_db
def test_asking_for_another_time_lets_the_employer_propose_again(application, employer):
    first = _invite(application, employer)
    respond_to_interview(
        interview=first, user=application.applicant, action="reschedule", note="After 4 PM"
    )

    second = _invite(application, employer, day=_tomorrow() + timedelta(days=1))
    first.refresh_from_db()

    assert first.status == Interview.Status.CANCELLED
    assert first.candidate_note == "After 4 PM"
    assert second.status == Interview.Status.PROPOSED


@pytest.mark.django_db
def test_only_the_candidate_answers_and_only_once(application, employer):
    interview = _invite(application, employer)
    with pytest.raises(PermissionError):
        respond_to_interview(interview=interview, user=employer.user, action="accept")
    respond_to_interview(interview=interview, user=application.applicant, action="decline")
    with pytest.raises(ListingStateError):
        respond_to_interview(interview=interview, user=application.applicant, action="accept")


@pytest.mark.django_db
def test_interviews_need_a_day_from_today_and_a_listed_mode(application, employer):
    with pytest.raises(ListingStateError):
        _invite(application, employer, day=timezone.localdate() - timedelta(days=1))
    with pytest.raises(ListingStateError):
        _invite(application, employer, mode="CARRIER_PIGEON")


@pytest.mark.django_db
def test_connected_tells_the_candidate_and_shows_the_employer_number(application, employer):
    update_application_status(
        application=application, actor=employer.user, status=Application.Status.CONNECTED
    )

    intent = NotificationIntent.objects.get(
        template_code="job_application_update", recipient_id=application.applicant_id
    )
    assert "completed the connection" in intent.context["message"]
    assert employer_contact(application) == employer.user.phone_number


@pytest.mark.django_db
def test_api_invite_answer_and_job_card_counts(application, employer, client):
    role, _ = Role.objects.get_or_create(code="partner", defaults={"name": "Partner"})
    UserRole.objects.get_or_create(user=employer.user, role=role, revoked_at=None)
    owner = force_role_client(user=employer.user, role_code="partner")
    created = owner.post(
        f"/api/v1/partner/listing-applications/{application.id}/interview",
        {"scheduled_date": str(_tomorrow()), "start_time": "11:00", "mode": "PHONE"},
        format="json",
    )
    assert created.status_code == 201
    assert created.data["interview"]["mode"] == "PHONE"

    role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
    UserRole.objects.get_or_create(user=application.applicant, role=role, revoked_at=None)
    seeker = force_role_client(user=application.applicant, role_code="customer")
    interview_id = created.data["interview"]["id"]
    answered = seeker.post(f"/api/v1/my/interviews/{interview_id}/accept", {}, format="json")
    assert answered.data["interview"]["status"] == "ACCEPTED"
    assert answered.data["employer_phone"] == employer.user.phone_number

    client.get(f"/api/v1/listings/{application.listing.slug}")
    card = owner.get("/api/v1/partner/listings").data[0]
    assert card["counts"] == {
        "views": 1,
        "applied": 1,
        "shortlisted": 0,
        "interviews": 1,
        "connected": 0,
    }
