"""`GET /ops/listings/{id}/applications`: nobody but the poster could see who applied before."""

import uuid
from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.identity.models import Role, User, UserRole
from apps.listings.models import Application, Listing
from tests.helpers import force_role_client

pytestmark = pytest.mark.django_db(transaction=True)


def _operations_client() -> APIClient:
    user = User.objects.create_user(phone_number=f"+9197{uuid.uuid4().int % 10**8:08d}")
    role, _created = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    return force_role_client(user=user, role_code="operations")


def _total(body: dict, key: str) -> int:
    return next(row["value"] for row in body["totals"] if row["key"] == key)


# --- Job applications -------------------------------------------------------------------------


def test_operations_reads_who_applied_to_one_job(jobs_variant, employer) -> None:
    listing = Listing.objects.create(
        poster=employer,
        variant=jobs_variant,
        title="Showroom assistant",
        description="Full time",
        status=Listing.Status.PUBLISHED,
        moderation_status=Listing.ModerationStatus.APPROVED,
        published_at=timezone.now() - timedelta(days=1),
        expires_at=timezone.now() + timedelta(days=29),
    )
    applicant = User.objects.create_user(phone_number=f"+9196{uuid.uuid4().int % 10**8:08d}")
    application = Application.objects.create(
        listing=listing,
        applicant=applicant,
        status=Application.Status.SUBMITTED,
        applicant_snapshot={"name": "Anita"},
    )
    client = _operations_client()

    response = client.get(f"/api/v1/ops/listings/{listing.id}/applications")

    assert response.status_code == HTTPStatus.OK
    assert [row["id"] for row in response.json()["results"]] == [str(application.id)]
