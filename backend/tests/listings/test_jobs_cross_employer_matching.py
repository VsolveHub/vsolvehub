"""Applicants become findable by other employers with matching jobs.

Someone who applies to Company A with the regular form gets a job profile built from what
they entered. When Company B posts a similar job, that person shows under B's "Matching
candidates" without applying, unless they unticked "Let other employers find my profile".
Their phone stays private until they apply to B.
"""

import uuid
from typing import Any

import pytest
from django.contrib.auth import get_user_model

from apps.identity.models import Role, UserRole
from apps.listings.models import JobSeekerProfile
from apps.listings.seekers import _experience_band, invitable_matches, matches_for_job
from apps.listings.services import post_job
from apps.partners.models import PartnerApplication, PartnerProfile
from tests.helpers import force_role_client
from apps.listings.seekers import invite_to_apply, send_candidate_digests
from apps.listings.services import ListingStateError, partner_summary
from apps.notifications.models import NotificationIntent
from tests.listings.jobs_helpers import _sales_job, give_matching_plan

User = get_user_model()


def _client(user: Any, role: str) -> Any:
    role_obj, _ = Role.objects.get_or_create(code=role, defaults={"name": role.title()})
    UserRole.objects.get_or_create(user=user, role=role_obj, revoked_at=None)
    return force_role_client(user=user, role_code=role)


def _second_employer(*, paid: bool = True) -> PartnerProfile:
    manager: Any = User.objects
    user = manager.create_user(phone_number=f"+9198{uuid.uuid4().int % 10**8:08d}")
    profile = PartnerProfile.objects.create(user=user, display_name="Kalyan Jewellers")
    PartnerApplication.objects.create(
        partner=profile,
        status=PartnerApplication.Status.APPROVED,
        track=PartnerApplication.Track.EMPLOYER,
    )
    if paid:
        give_matching_plan(profile)
    return profile


def _apply_with_form(job: Any, *, findable: bool = True) -> Any:
    manager: Any = User.objects
    seeker = manager.create_user(phone_number=f"+9197{uuid.uuid4().int % 10**8:08d}")
    res = _client(seeker, "customer").post(
        f"/api/v1/listings/{job.id}/applications",
        {
            "name": "Anitha Rao",
            "phone": str(seeker.phone_number),
            "experience": "4 years",
            "skills": ["Sales", "Customer handling", "Jewellery sales"],
            "findable": findable,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert res.status_code == 201, res.content
    return seeker


@pytest.mark.django_db
def test_form_applicant_is_findable_by_another_employer(employer):
    job_a = post_job(poster=employer, actor=employer.user, data=_sales_job())
    seeker = _apply_with_form(job_a)

    profile = JobSeekerProfile.objects.get(user=seeker)
    assert profile.visibility == JobSeekerProfile.Visibility.OPEN
    assert profile.roles == ["Sales Executive"]
    assert profile.city == "Hyderabad"
    assert profile.experience_band == "3_5"
    assert "Sales" in profile.skills

    other = _second_employer()
    job_b = post_job(poster=other, actor=other.user, data=_sales_job())
    rows = {p.user_id: (match, app) for p, match, app in matches_for_job(job_b)}
    assert seeker.id in rows
    match, application = rows[seeker.id]
    assert application is None
    assert match.level in ("STRONG", "GOOD")
    assert any(p.user_id == seeker.id for p, _m in invitable_matches(job_b))

    # Employer B sees the candidate but not their phone, and the job card counts them.
    api = _client(other.user, "partner")
    listed = api.get(f"/api/v1/partner/jobs/{job_b.id}/matches").json()
    mine = next(row for row in listed if row["display_name"] == "Anitha R.")
    assert mine["contact_phone"] == ""
    assert mine["applied"] is False


@pytest.mark.django_db
def test_unticked_applicant_is_not_findable(employer):
    job_a = post_job(poster=employer, actor=employer.user, data=_sales_job())
    seeker = _apply_with_form(job_a, findable=False)

    assert JobSeekerProfile.objects.get(user=seeker).visibility == "APPLIED_ONLY"
    other = _second_employer()
    job_b = post_job(poster=other, actor=other.user, data=_sales_job())
    assert seeker.id not in {p.user_id for p, _m, _a in matches_for_job(job_b)}


@pytest.mark.django_db
def test_existing_profile_is_not_overwritten(employer):
    manager: Any = User.objects
    seeker = manager.create_user(phone_number=f"+9197{uuid.uuid4().int % 10**8:08d}")
    JobSeekerProfile.objects.create(user=seeker, full_name="Kept", city="Vizag", roles=["Cashier"])
    job = post_job(poster=employer, actor=employer.user, data=_sales_job())
    res = _client(seeker, "customer").post(
        f"/api/v1/listings/{job.id}/applications",
        {"name": "New Name", "phone": str(seeker.phone_number), "findable": True},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert res.status_code == 201, res.content
    profile = JobSeekerProfile.objects.get(user=seeker)
    assert (profile.full_name, profile.city) == ("Kept", "Vizag")


@pytest.mark.django_db
def test_work_from_home_job_matches_other_cities(employer):
    manager: Any = User.objects
    seeker = manager.create_user(phone_number=f"+9197{uuid.uuid4().int % 10**8:08d}")
    JobSeekerProfile.objects.create(
        user=seeker,
        full_name="Remote Ravi",
        city="Vijayawada",
        roles=["Sales Executive"],
        skills=["Sales", "Customer handling"],
    )
    office = post_job(poster=employer, actor=employer.user, data=_sales_job())
    remote = post_job(
        poster=employer, actor=employer.user, data=_sales_job(work_mode="WORK_FROM_HOME")
    )
    assert seeker.id not in {p.user_id for p, _m, _a in matches_for_job(office)}
    assert seeker.id in {p.user_id for p, _m, _a in matches_for_job(remote)}


@pytest.mark.parametrize(
    ("text", "band"),
    [
        ("Fresher", "FRESHER"),
        ("6 months", "0_1"),
        ("2 years", "1_3"),
        ("4 yrs", "3_5"),
        ("8 years", "5_PLUS"),
        ("", ""),
        ("lots", ""),
    ],
)
def test_experience_text_to_band(text, band):
    assert _experience_band(text) == band


# --- free employers see only applicants ------------------------------------------------------


@pytest.mark.django_db
def test_free_employer_sees_only_applicants_but_gets_the_count(employer):
    job_a = post_job(poster=employer, actor=employer.user, data=_sales_job())
    _apply_with_form(job_a)  # findable seeker, applied to A only

    free = _second_employer(paid=False)
    job_b = post_job(poster=free, actor=free.user, data=_sales_job())
    applicant_of_b = _apply_with_form(job_b)

    api = _client(free.user, "partner")
    rows = api.get(f"/api/v1/partner/jobs/{job_b.id}/matches").json()
    assert [row["applied"] for row in rows] == [True]
    assert len(rows) == 1
    # The job card still tells them how many matching people they are missing.
    card = api.get(f"/api/v1/partner/listings/{job_b.id}").json()
    assert card["counts"]["matches"] >= 1
    assert partner_summary(free)["can_see_matches"] is False
    assert applicant_of_b is not None


@pytest.mark.django_db
def test_free_employer_cannot_invite_and_gets_no_digest(employer):
    job_a = post_job(poster=employer, actor=employer.user, data=_sales_job())
    seeker = _apply_with_form(job_a)
    free = _second_employer(paid=False)
    job_b = post_job(poster=free, actor=free.user, data=_sales_job())

    with pytest.raises(ListingStateError, match="Upgrade"):
        invite_to_apply(listing=job_b, profile=JobSeekerProfile.objects.get(user=seeker))
    send_candidate_digests()
    assert not NotificationIntent.objects.filter(
        template_code="job_candidates_digest", recipient_id=free.user_id
    ).exists()
