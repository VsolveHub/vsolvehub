"""Safety Stories — short-lived safety/awareness media shown on the customer home feed.

Instagram-shaped on purpose: an admin (Operations) publishes a photo or short video, it is visible
to every customer for 24 hours from publish, and then it stops appearing on its own. Nothing here
touches booking, payment, or any other domain table — a story is pure marketing/safety content.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

#: Keeps an accidental 400MB "safety video" from filling the bucket. Generous for a phone clip.
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_VIDEO_BYTES = 100 * 1024 * 1024

ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_CONTENT_TYPES = {"video/mp4", "video/webm", "video/quicktime"}

#: How long a published story stays visible. Not configurable per-story — the 24h window is the
#: whole point of the feature, not a per-post setting an admin could quietly change.
STORY_LIFETIME = timedelta(hours=24)


def safety_story_upload_to(_instance: SafetyStory, filename: str) -> str:
    ext = Path(filename).suffix.lower() or ".bin"
    return f"safety-stories/{uuid.uuid4().hex}{ext}"


class SafetyStory(models.Model):
    class MediaType(models.TextChoices):
        IMAGE = "IMAGE", "Image"
        VIDEO = "VIDEO", "Video"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=120, blank=True)
    caption = models.CharField(max_length=280, blank=True)
    media_type = models.CharField(max_length=10, choices=MediaType.choices)
    #: Public storage (the "default" alias) — a story is public safety content, same as a stay
    #: photo, never the private KYC/document bucket.
    stored_file = models.FileField(upload_to=safety_story_upload_to)
    original_name = models.CharField(max_length=180, blank=True)
    content_type = models.CharField(max_length=80, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)
    display_order = models.PositiveSmallIntegerField(default=0)
    #: An admin can unpublish before the 24h window ends; this does not extend it.
    is_published = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="safety_stories_created",
    )
    published_at = models.DateTimeField(default=timezone.now)
    #: Set once at creation from `published_at` + `STORY_LIFETIME`. Not recomputed on edit, so
    #: editing a caption never quietly resets the clock.
    expires_at = models.DateTimeField(editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_order", "-published_at")
        indexes = [
            models.Index(fields=["is_published", "expires_at"]),
        ]

    def __str__(self) -> str:
        return self.title or str(self.id)

    def save(self, *args: Any, **kwargs: Any) -> None:
        if self.expires_at is None:
            self.expires_at = (self.published_at or timezone.now()) + STORY_LIFETIME
        super().save(*args, **kwargs)

    @property
    def is_active(self) -> bool:
        return self.is_published and self.expires_at > timezone.now()

    @property
    def time_remaining_seconds(self) -> int:
        diff = (self.expires_at - timezone.now()).total_seconds()
        return max(0, int(diff))

    def delete(self, *args: Any, **kwargs: Any) -> tuple[int, dict[str, int]]:
        if self.stored_file:
            self.stored_file.delete(save=False)
        return super().delete(*args, **kwargs)
