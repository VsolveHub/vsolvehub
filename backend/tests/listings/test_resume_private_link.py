"""Résumés live in private storage and open only through their signed link."""

import uuid

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from apps.listings.models import ListingResumeUpload
from apps.listings.services import create_listing, moderate_listing, publish_listing, submit_listing
from tests.listings.test_a10_flow import (
    _client_for,
    _create_user,
    a10_variant,
    poster,
)

PDF = b"%PDF-1.7 resume"


def _published(poster, a10_variant):  # noqa: F811 — the imported fixtures
    listing = create_listing(
        poster=poster,
        variant_id=a10_variant.id,
        title="Electrician needed",
        description="Wiring work.",
        structured_fields={"role_type": "Full Time", "salary_range": "3-4 LPA"},
        location_text="Hyderabad",
        contact_phone="+919900000001",
        contact_email="hiring@acme.test",
    )
    submit_listing(listing=listing, actor=poster.user)
    moderate_listing(listing=listing, actor=poster.user, approved=True)
    publish_listing(listing=listing, actor=poster.user)
    return listing


@pytest.mark.django_db
def test_resume_opens_through_its_signed_link_only(poster, a10_variant):  # noqa: F811
    listing = _published(poster, a10_variant)
    applicant = _create_user(f"+9197{uuid.uuid4().int % 10**8:08d}")
    client = _client_for(applicant, "customer")

    uploaded = client.post(
        f"/api/v1/listings/{listing.id}/resume-uploads",
        {"file": SimpleUploadedFile("cv.pdf", PDF, content_type="application/pdf")},
        format="multipart",
    )
    assert uploaded.status_code == status.HTTP_201_CREATED
    link = uploaded.data["resume_url"]
    assert "/api/v1/listings/resume-files/" in link
    assert "/media/" not in link  # never a public file address

    row = ListingResumeUpload.objects.get(id=uploaded.data["upload_id"])
    assert not row.stored_file.url.startswith("/media/")

    opened = client.get(link.split("testserver", 1)[-1])
    assert opened.status_code == status.HTTP_200_OK
    assert b"".join(opened.streaming_content) == PDF

    tampered = client.get(link.split("testserver", 1)[-1][:-2] + "xx")
    assert tampered.status_code == status.HTTP_404_NOT_FOUND
