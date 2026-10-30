"""A job seeker's skills accumulate across applications; they are never replaced.

Someone who applies for an Accounts job and later a Sales job keeps both sets of skills, so
"Matching candidates" on an Accounts job and on a Sales job both find them.
"""

import uuid
from typing import Any

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status

from apps.listings.matching import score_match
from apps.listings.models import JobRoleTemplate, JobSeekerProfile
from apps.listings.seekers import (
    MAX_SKILLS,
    ensure_profile_from_application,
    matches_for_job,
    merge_into_profile,
    quick_apply,
    save_profile,
)
from apps.listings.services import post_job
from tests.helpers import force_role_client
from tests.listings.jobs_helpers import _sales_job, give_matching_plan

User = get_user_model()


def _user(name: str = "Asha Rao") -> Any:
    manager: Any = User.objects
    return manager.create_user(phone_number=f"+9196{uuid.uuid4().int % 10**8:08d}", full_name=name)


@pytest.fixture
def sales_job(employer):
    return post_job(poster=employer, actor=employer.user, data=_sales_job())


@pytest.fixture
def accounts_job(employer):
    template = JobRoleTemplate.objects.get(category="Accounts & Finance", name="Accountant")
    return post_job(
        poster=employer,
        actor=employer.user,
        data=_sales_job(
            role_template_id=template.id,
            title="Accountant",
            required_skills=["Tally", "GST"],
            preferred_skills=["Excel"],
        ),
    )


def _apply_by_form(user: Any, listing: Any, skills: list[str]) -> None:
    ensure_profile_from_application(
        user=user,
        listing=listing,
        name="Asha Rao",
        experience="3 years",
        skills=skills,
        findable=True,
    )


@pytest.mark.django_db
def test_second_application_adds_skills_and_keeps_the_first(accounts_job, sales_job):
    user = _user()
    _apply_by_form(user, accounts_job, ["Tally", "GST"])
    _apply_by_form(user, sales_job, ["Sales", "Customer handling"])

    profile = JobSeekerProfile.objects.get(user=user)
    assert profile.skills == ["Tally", "GST", "Sales", "Customer handling"]
    assert profile.roles == ["Accountant", "Sales Executive"]


@pytest.mark.django_db
def test_skills_are_grouped_by_job_category(accounts_job, sales_job):
    user = _user()
    _apply_by_form(user, accounts_job, ["Tally", "GST"])
    _apply_by_form(user, sales_job, ["Sales"])

    groups = JobSeekerProfile.objects.get(user=user).skill_groups
    assert [(g["category"], g["skills"]) for g in groups] == [
        ("Accounts & Finance", ["Tally", "GST"]),
        ("Retail & Sales", ["Sales"]),
    ]


@pytest.mark.django_db
def test_duplicates_ignore_case_and_spacing(accounts_job, sales_job):
    user = _user()
    _apply_by_form(user, accounts_job, ["MS Excel"])
    _apply_by_form(user, sales_job, ["ms  excel", "Sales"])

    assert JobSeekerProfile.objects.get(user=user).skills == ["MS Excel", "Sales"]


@pytest.mark.django_db
def test_applying_never_changes_the_seekers_own_details(accounts_job, sales_job):
    user = _user()
    _apply_by_form(user, accounts_job, ["Tally"])
    save_profile(user=user, data={"city": "Secunderabad", "expected_salary_rupees": 30000})
    _apply_by_form(user, sales_job, ["Sales"])

    profile = JobSeekerProfile.objects.get(user=user)
    assert profile.city == "Secunderabad"
    assert profile.expected_salary_rupees == 30000


@pytest.mark.django_db
def test_quick_apply_adds_the_ticked_skills(accounts_job, sales_job):
    user = _user()
    _apply_by_form(user, accounts_job, ["Tally"])

    quick_apply(listing=sales_job, user=user, skills=["Sales", "Customer handling"])

    profile = JobSeekerProfile.objects.get(user=user)
    assert profile.skills == ["Tally", "Sales", "Customer handling"]
    assert "Sales Executive" in profile.roles


@pytest.mark.django_db
def test_quick_apply_without_skills_changes_nothing(accounts_job, sales_job):
    user = _user()
    _apply_by_form(user, accounts_job, ["Tally"])
    quick_apply(listing=sales_job, user=user)

    assert JobSeekerProfile.objects.get(user=user).skills == ["Tally"]


@pytest.mark.django_db
def test_a_full_profile_drops_nothing(accounts_job):
    user = _user()
    save_profile(
        user=user, data={"full_name": "Asha", "skills": [f"Skill {n}" for n in range(MAX_SKILLS)]}
    )
    profile = JobSeekerProfile.objects.get(user=user)

    result = merge_into_profile(profile=profile, listing=accounts_job, skills=["Tally"])

    profile.refresh_from_db()
    assert len(profile.skills) == MAX_SKILLS
    assert "Tally" not in profile.skills
    assert result.skipped_skills == ["Tally"]
    assert result.added_skills == []


@pytest.mark.django_db
def test_removing_a_skill_also_removes_it_from_its_group(accounts_job):
    user = _user()
    _apply_by_form(user, accounts_job, ["Tally", "GST"])

    save_profile(user=user, data={"skills": ["Tally"]})

    profile = JobSeekerProfile.objects.get(user=user)
    assert profile.skills == ["Tally"]
    assert profile.skill_groups[0]["skills"] == ["Tally"]


@pytest.mark.django_db
def test_extra_skills_do_not_lower_the_accounts_match(accounts_job, sales_job):
    user = _user()
    _apply_by_form(user, accounts_job, ["Tally", "GST"])
    before = score_match(accounts_job, JobSeekerProfile.objects.get(user=user)).score

    _apply_by_form(user, sales_job, ["Sales", "Customer handling", "Negotiation"])
    after = score_match(accounts_job, JobSeekerProfile.objects.get(user=user)).score

    assert after >= before


@pytest.mark.django_db
def test_the_same_person_matches_both_kinds_of_job(employer, accounts_job, sales_job):
    give_matching_plan(employer)
    user = _user()
    _apply_by_form(user, accounts_job, ["Tally", "GST"])
    _apply_by_form(user, sales_job, ["Sales", "Customer handling"])
    profile = JobSeekerProfile.objects.get(user=user)

    def found(job: Any) -> Any:
        return next(match for prof, match, _app in matches_for_job(job) if prof.id == profile.id)

    assert "Has 2 of 2 must-have skills" in found(accounts_job).matched
    assert "Has 2 of 2 must-have skills" in found(sales_job).matched


@pytest.mark.django_db
def test_profile_api_shows_skill_groups_to_the_seeker(accounts_job):
    user = _user()
    _apply_by_form(user, accounts_job, ["Tally"])
    client = force_role_client(user=user, role_code="customer")

    response = client.get("/api/v1/me/job-profile")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["skill_groups"][0]["category"] == "Accounts & Finance"
