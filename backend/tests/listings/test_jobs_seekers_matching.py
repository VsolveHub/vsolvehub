"""Week 2 of Jobs: job seeker profile, one-tap apply, saved jobs, and matching both ways.

The match score is simple points (role, must-have skills, experience, city/area, salary,
languages), grouped Strong / Good / Others, with the reasons shown. Nobody is ruled out for
one missing item.
"""

import uuid
from typing import Any

import pytest
from django.contrib.auth import get_user_model

from apps.identity.models import Role, UserRole
from apps.listings.matching import GOOD, OTHER, STRONG, score_match
from apps.listings.models import Application, JobSeekerProfile
from apps.listings.seekers import (
    invite_to_apply,
    jobs_for,
    matches_for_job,
    notify_new_job_matches,
    quick_apply,
    save_profile,
    send_candidate_digests,
)
from apps.listings.services import ListingStateError, post_job
from apps.notifications.models import NotificationIntent
from tests.helpers import force_role_client
from tests.listings.jobs_helpers import _sales_job

User = get_user_model()


def _seeker(name: str = "Priya Sharma", **profile: Any) -> Any:
    manager: Any = User.objects
    user = manager.create_user(phone_number=f"+9197{uuid.uuid4().int % 10**8:08d}", full_name=name)
    data: dict[str, Any] = {
        "full_name": name,
        "roles": ["Sales Executive"],
        "skills": ["Sales", "Customer handling", "Jewellery sales"],
        "experience_band": "5_PLUS",
        "languages": ["TELUGU", "HINDI"],
        "city": "Hyderabad",
        "area": "Kukatpally",
        "expected_salary_rupees": 25000,
        "available_from": "IMMEDIATE",
    }
    data.update(profile)
    save_profile(user=user, data=data)
    return user


@pytest.fixture
def job(employer):
    return post_job(poster=employer, actor=employer.user, data=_sales_job())


# --- matching -------------------------------------------------------------------------------


@pytest.mark.django_db
def test_a_close_fit_is_a_strong_match_with_reasons(job):
    profile = _seeker().job_profile

    match = score_match(job, profile)

    assert match.level == STRONG
    assert match.score >= 90
    assert "Has 2 of 2 must-have skills" in match.matched
    assert "Lives in Kukatpally" in match.matched
    assert match.missing == []


@pytest.mark.django_db
def test_one_missing_skill_lowers_the_score_but_does_not_rule_out(job):
    profile = _seeker(skills=["Sales"], area="Ameerpet").job_profile

    match = score_match(job, profile)

    assert match.level in (STRONG, GOOD)
    assert "No Customer handling" in match.missing


@pytest.mark.django_db
def test_wrong_city_and_little_experience_is_other(job):
    profile = _seeker(
        city="Warangal", experience_band="FRESHER", skills=["Driving"], roles=["Driver"]
    ).job_profile

    assert score_match(job, profile).level == OTHER


# --- profile and apply ----------------------------------------------------------------------


@pytest.mark.django_db
def test_profile_options_are_checked(employer):  # noqa: ARG001
    manager: Any = User.objects
    user = manager.create_user(phone_number="+919700000001")
    with pytest.raises(ListingStateError):
        save_profile(user=user, data={"experience_band": "TEN_YEARS"})
    with pytest.raises(ListingStateError):
        save_profile(user=user, data={"roles": ["A", "B", "C", "D"]})


@pytest.mark.django_db
def test_one_tap_apply_sends_the_profile_and_tells_the_employer(job, employer):
    seeker = _seeker()

    application = quick_apply(listing=job, user=seeker, note="Can join tomorrow.")

    assert application.status == Application.Status.SUBMITTED
    assert application.applicant_snapshot["name"] == "Priya Sharma"
    assert application.applicant_snapshot["phone"] == seeker.phone_number
    assert application.applicant_snapshot["location"] == "Kukatpally, Hyderabad"
    assert NotificationIntent.objects.filter(
        template_code="job_application_received", recipient_id=employer.user_id
    ).exists()


@pytest.mark.django_db
def test_one_tap_apply_needs_a_profile(job):
    manager: Any = User.objects
    user = manager.create_user(phone_number="+919700000002")
    with pytest.raises(ListingStateError):
        quick_apply(listing=job, user=user)


# --- both directions ------------------------------------------------------------------------


@pytest.mark.django_db
def test_jobs_for_you_ranks_matching_jobs(job):
    profile = _seeker().job_profile

    ranked = jobs_for(profile)

    assert [listing.id for listing, _match in ranked] == [job.id]


@pytest.mark.django_db
def test_employer_sees_applicants_and_open_profiles_but_not_private_ones(job):
    open_profile = _seeker("Sneha Rao").job_profile
    private = _seeker("Kavya N", visibility="APPLIED_ONLY")
    applied_private = _seeker("Ravi K", visibility="APPLIED_ONLY")
    quick_apply(listing=job, user=applied_private)

    rows = matches_for_job(job)

    ids = {profile.id for profile, _match, _app in rows}
    assert open_profile.id in ids
    assert applied_private.job_profile.id in ids
    assert private.job_profile.id not in ids


@pytest.mark.django_db
def test_invite_reaches_open_profiles_only(job):
    open_user = _seeker("Sneha Rao")
    private_user = _seeker("Kavya N", visibility="APPLIED_ONLY")

    invite_to_apply(listing=job, profile=open_user.job_profile)

    assert NotificationIntent.objects.filter(
        template_code="job_invite", recipient_id=open_user.id
    ).exists()
    with pytest.raises(ListingStateError):
        invite_to_apply(listing=job, profile=private_user.job_profile)


@pytest.mark.django_db
def test_strong_matches_hear_about_a_new_job_once(job):
    strong = _seeker()
    weak = _seeker("Raju", skills=["Driving"], roles=["Driver"], experience_band="FRESHER")

    notify_new_job_matches(job)
    notify_new_job_matches(job)

    sent = NotificationIntent.objects.filter(template_code="job_match_new")
    assert list(sent.values_list("recipient_id", flat=True)) == [strong.id]
    assert not sent.filter(recipient_id=weak.id).exists()


@pytest.mark.django_db
def test_employers_get_one_daily_digest(job, employer):  # noqa: ARG001
    _seeker("Sneha Rao")
    _seeker("Anjali M")

    assert send_candidate_digests() == 1
    digest = NotificationIntent.objects.get(template_code="job_candidates_digest")
    assert digest.recipient_id == employer.user_id
    assert digest.context["count"] == "2"


# --- the API --------------------------------------------------------------------------------


def _client(user, role: str):
    role_obj, _ = Role.objects.get_or_create(code=role, defaults={"name": role.title()})
    UserRole.objects.get_or_create(user=user, role=role_obj, revoked_at=None)
    return force_role_client(user=user, role_code=role)


@pytest.mark.django_db
def test_api_profile_apply_save_and_matches(job, employer):
    manager: Any = User.objects
    user = manager.create_user(phone_number="+919700000003", full_name="Priya Sharma")
    api = _client(user, "customer")

    assert api.get("/api/v1/me/job-profile").status_code == 204
    saved = api.put(
        "/api/v1/me/job-profile",
        {
            "full_name": "Priya Sharma",
            "roles": ["Sales Executive"],
            "skills": ["Sales", "Customer handling"],
            "experience_band": "3_5",
            "city": "Hyderabad",
            "area": "Kukatpally",
            "languages": ["TELUGU"],
        },
        format="json",
    )
    assert saved.status_code == 200

    for_you = api.get("/api/v1/jobs/for-you").data
    assert for_you[0]["listing"]["id"] == str(job.id)
    assert for_you[0]["match"]["level"] in (STRONG, GOOD)

    assert api.post(f"/api/v1/listings/{job.id}/save").status_code == 204
    assert [row["id"] for row in api.get("/api/v1/me/saved-jobs").data] == [str(job.id)]

    applied = api.post(f"/api/v1/listings/{job.id}/quick-apply", {"note": ""}, format="json")
    assert applied.status_code == 201

    owner = _client(employer.user, "partner")
    matches = owner.get(f"/api/v1/partner/jobs/{job.id}/matches").data
    assert matches[0]["display_name"] == "Priya S."
    assert matches[0]["applied"] is True
    assert "phone" not in matches[0]
