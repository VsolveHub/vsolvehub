"""Tests for Safety Stories APIs (Customer and Operations/Admin)."""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.identity.models import Role, UserRole
from apps.stories.models import SafetyStory
from tests.helpers import force_role_client

User = get_user_model()
pytestmark = pytest.mark.django_db

# Valid 1x1 GIF / JPEG / PNG / MP4 minimal headers for tests
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\x00" * 20
PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 20
MP4_BYTES = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00" + b"\x00" * 40


def _ops_client():
    ops_user = User.objects.create(phone_number="+919988770001", full_name="Stories Operator")
    role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
    UserRole.objects.get_or_create(user=ops_user, role=role, revoked_at=None)
    return force_role_client(user=ops_user, role_code="operations")


def _customer_client():
    user = User.objects.create(phone_number="+919988770002", full_name="Regular Customer")
    role, _ = Role.objects.get_or_create(code="customer", defaults={"name": "Customer"})
    UserRole.objects.get_or_create(user=user, role=role, revoked_at=None)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _create_story(
    *,
    title="Safety Protocol",
    caption="Always wear safety gear",
    media_type=SafetyStory.MediaType.IMAGE,
    is_published=True,
    hours_ago=0,
    display_order=0,
):
    published_at = timezone.now() - timedelta(hours=hours_ago)
    file_content = JPEG_BYTES if media_type == SafetyStory.MediaType.IMAGE else MP4_BYTES
    ext = "jpg" if media_type == SafetyStory.MediaType.IMAGE else "mp4"
    content_type = "image/jpeg" if media_type == SafetyStory.MediaType.IMAGE else "video/mp4"

    story = SafetyStory(
        title=title,
        caption=caption,
        media_type=media_type,
        stored_file=SimpleUploadedFile(f"test.{ext}", file_content, content_type=content_type),
        original_name=f"test.{ext}",
        content_type=content_type,
        size_bytes=len(file_content),
        display_order=display_order,
        is_published=is_published,
        published_at=published_at,
    )
    story.expires_at = published_at + timedelta(hours=24)
    story.save()
    return story


def test_public_stories_list_returns_only_active_unexpired_stories():
    client = APIClient()

    # Active story (published 2 hours ago)
    active_story = _create_story(title="Active Safety Story", hours_ago=2, display_order=1)
    # Another active story with lower display order
    active_first = _create_story(title="First Priority Story", hours_ago=1, display_order=0)
    # Expired story (published 25 hours ago)
    _create_story(title="Expired Story", hours_ago=25)
    # Draft story (unpublished)
    _create_story(title="Draft Story", is_published=False, hours_ago=1)

    response = client.get("/api/v1/safety-stories/")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert len(data) == 2
    # Verify ordering by display_order
    assert data[0]["id"] == str(active_first.id)
    assert data[0]["title"] == "First Priority Story"
    assert data[1]["id"] == str(active_story.id)
    assert data[1]["title"] == "Active Safety Story"
    assert data[0]["time_remaining_seconds"] > 0
    assert "media_url" in data[0]
    assert data[0]["media_type"] == "IMAGE"


def test_ops_stories_permissions():
    anonymous = APIClient()
    assert anonymous.get("/api/v1/ops/stories/").status_code == status.HTTP_403_FORBIDDEN

    customer = _customer_client()
    assert customer.get("/api/v1/ops/stories/").status_code == status.HTTP_403_FORBIDDEN

    ops = _ops_client()
    assert ops.get("/api/v1/ops/stories/").status_code == status.HTTP_200_OK


def test_ops_stories_filtering():
    _create_story(title="Active 1", hours_ago=5, is_published=True)
    _create_story(title="Expired 1", hours_ago=26, is_published=True)
    _create_story(title="Draft 1", hours_ago=2, is_published=False)

    ops = _ops_client()

    all_resp = ops.get("/api/v1/ops/stories/")
    assert all_resp.status_code == status.HTTP_200_OK
    assert len(all_resp.json()) == 3

    active_resp = ops.get("/api/v1/ops/stories/?status=active")
    assert len(active_resp.json()) == 1
    assert active_resp.json()[0]["title"] == "Active 1"

    expired_resp = ops.get("/api/v1/ops/stories/?status=expired")
    assert len(expired_resp.json()) == 1
    assert expired_resp.json()[0]["title"] == "Expired 1"

    draft_resp = ops.get("/api/v1/ops/stories/?status=draft")
    assert len(draft_resp.json()) == 1
    assert draft_resp.json()[0]["title"] == "Draft 1"


def test_ops_upload_image_story_success():
    ops = _ops_client()
    image_file = SimpleUploadedFile("technician_check.jpg", JPEG_BYTES, content_type="image/jpeg")

    payload = {
        "file": image_file,
        "title": "ID Verification Standard",
        "caption": "Every technician displays a digital photo ID before entry.",
        "display_order": 1,
        "is_published": "true",
    }

    response = ops.post("/api/v1/ops/stories/", payload, format="multipart")
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()

    assert data["title"] == "ID Verification Standard"
    assert data["caption"] == "Every technician displays a digital photo ID before entry."
    assert data["media_type"] == "IMAGE"
    assert data["is_published"] is True
    assert data["is_active"] is True
    assert data["size_bytes"] == len(JPEG_BYTES)

    story = SafetyStory.objects.get(id=data["id"])
    assert story.is_active is True
    # Verify expiration is approximately 24 hours from publication
    assert story.expires_at > timezone.now() + timedelta(hours=23, minutes=59)


def test_ops_upload_video_story_success():
    ops = _ops_client()
    video_file = SimpleUploadedFile("safety_demonstration.mp4", MP4_BYTES, content_type="video/mp4")

    payload = {
        "file": video_file,
        "title": "Sanitization Walkthrough",
        "caption": "Watch how our crew disinfects all tools prior to repair work.",
        "display_order": 2,
    }

    response = ops.post("/api/v1/ops/stories/", payload, format="multipart")
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()

    assert data["title"] == "Sanitization Walkthrough"
    assert data["media_type"] == "VIDEO"
    assert data["content_type"] == "video/mp4"


def test_ops_upload_validation_failures():
    ops = _ops_client()

    # Empty file
    empty_file = SimpleUploadedFile("empty.jpg", b"", content_type="image/jpeg")
    resp = ops.post("/api/v1/ops/stories/", {"file": empty_file}, format="multipart")
    assert resp.status_code == status.HTTP_400_BAD_REQUEST

    # Disallowed mime type
    pdf_file = SimpleUploadedFile(
        "manual.pdf", b"%PDF-1.4 file content", content_type="application/pdf"
    )
    resp = ops.post("/api/v1/ops/stories/", {"file": pdf_file}, format="multipart")
    assert resp.status_code == status.HTTP_400_BAD_REQUEST

    # Spoofed mime type (claimed JPEG but content is invalid executable text)
    spoofed = SimpleUploadedFile("fake.jpg", b"echo 'malicious'", content_type="image/jpeg")
    resp = ops.post("/api/v1/ops/stories/", {"file": spoofed}, format="multipart")
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


def test_ops_update_story_preserves_expires_at():
    ops = _ops_client()
    story = _create_story(title="Initial Title", caption="Initial Caption", hours_ago=5)
    initial_expires_at = story.expires_at

    patch_payload = {
        "title": "Updated Title",
        "caption": "Updated Caption text",
        "display_order": 5,
    }
    response = ops.patch(f"/api/v1/ops/stories/{story.id}/", patch_payload, format="json")
    assert response.status_code == status.HTTP_200_OK

    story.refresh_from_db()
    assert story.title == "Updated Title"
    assert story.caption == "Updated Caption text"
    assert story.display_order == 5
    # Crucial security & business rule: editing a caption must NOT reset or extend 24h expiration
    assert story.expires_at == initial_expires_at


def test_ops_delete_story():
    ops = _ops_client()
    story = _create_story(title="Story to Delete")
    story_id = story.id

    response = ops.delete(f"/api/v1/ops/stories/{story_id}/")
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not SafetyStory.objects.filter(id=story_id).exists()
