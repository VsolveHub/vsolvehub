"""An employer's account status decides whether their job posts exist for seekers.

Suspending an employer used to leave every post live until it expired, still taking
applications. The application's status is now required for browse, for applying and for posting.
"""

from typing import Any

import pytest
from django.contrib.auth import get_user_model

from apps.listings.selectors import public_listings
from apps.listings.services import ListingStateError, post_job, submit_application
from apps.partners.models import PartnerApplication
from tests.listings.jobs_helpers import _sales_job

User = get_user_model()
pytestmark = pytest.mark.django_db


def _set_status(employer: Any, status: str) -> None:
    PartnerApplication.objects.filter(partner=employer).update(status=status)


@pytest.mark.parametrize(
    "status",
    [PartnerApplication.Status.SUSPENDED, PartnerApplication.Status.OFFBOARDED],
)
def test_a_suspended_employers_jobs_disappear_and_take_no_applications(employer, status):
    job = post_job(poster=employer, actor=employer.user, data=_sales_job())
    assert public_listings().filter(id=job.id).exists()
    seeker = User.objects.create(phone_number="+919811120077", full_name="Kiran")

    _set_status(employer, status)

    assert not public_listings().filter(id=job.id).exists()
    job.refresh_from_db()
    with pytest.raises(ListingStateError):
        submit_application(
            listing=job,
            applicant=seeker,
            applicant_snapshot={"name": "Kiran", "phone": seeker.phone_number},
        )


def test_a_suspended_employer_cannot_post(employer):
    _set_status(employer, PartnerApplication.Status.SUSPENDED)

    with pytest.raises((PermissionError, ListingStateError)):
        post_job(poster=employer, actor=employer.user, data=_sales_job())


def test_reinstating_brings_the_jobs_back(employer):
    job = post_job(poster=employer, actor=employer.user, data=_sales_job())
    _set_status(employer, PartnerApplication.Status.SUSPENDED)

    _set_status(employer, PartnerApplication.Status.APPROVED)

    assert public_listings().filter(id=job.id).exists()
