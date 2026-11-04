"""Seed active Safety Stories for customer app."""

from __future__ import annotations

import os
import sys
from datetime import timedelta
from pathlib import Path
from typing import TypedDict

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
import django

django.setup()

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.stories.models import SafetyStory

TILES_DIR = (
    Path(__file__).resolve().parent.parent.parent
    / "frontend"
    / "apps"
    / "customer"
    / "public"
    / "catalog"
    / "tiles"
)


class StorySeedItem(TypedDict):
    title: str
    caption: str
    image_name: str
    display_order: int


STORIES_DATA: list[StorySeedItem] = [
    {
        "title": "Verified Professionals Only",
        "caption": "Every service partner on VSolveHub is identity-verified and background-checked for your safety.",
        "image_name": "cleaning-maintenance-jobs.png",
        "display_order": 1,
    },
    {
        "title": "Zero Advance Payment Risk",
        "caption": "Your funds remain protected in escrow. Payment is released to the partner only after your job is completed.",
        "image_name": "business-services-jobs.png",
        "display_order": 2,
    },
    {
        "title": "Verified Stays & Inspection",
        "caption": "All properties and hostels are physically verified with transparent pricing and no hidden deposit terms.",
        "image_name": "apartments.png",
        "display_order": 3,
    },
    {
        "title": "Inspected & Sanitized Rentals",
        "caption": "Tools and equipment undergo quality checks, sanitization, and working verification before every handover.",
        "image_name": "camera-media-equipment.png",
        "display_order": 4,
    },
]


def seed_stories() -> None:
    now = timezone.now()
    SafetyStory.objects.all().delete()
    print("Cleared existing safety stories.")

    created = 0
    for item in STORIES_DATA:
        img_name: str = item["image_name"]
        img_path = TILES_DIR / img_name
        if img_path.exists():
            with open(img_path, "rb") as f:
                data = f.read()
            file_obj = SimpleUploadedFile(img_name, data, content_type="image/png")
        else:
            print(f"Warning: Image {img_path} not found, generating placeholder.")
            data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 50
            file_obj = SimpleUploadedFile(img_name, data, content_type="image/png")

        story = SafetyStory(
            title=item["title"],
            caption=item["caption"],
            media_type=SafetyStory.MediaType.IMAGE,
            stored_file=file_obj,
            original_name=img_name,
            content_type="image/png",
            size_bytes=len(data),
            display_order=item["display_order"],
            is_published=True,
            published_at=now,
        )
        story.expires_at = now + timedelta(hours=24)
        story.save()
        created += 1
        print(f"Created story: '{story.title}' (expires: {story.expires_at})")

    print(f"Successfully seeded {created} active safety stories.")


if __name__ == "__main__":
    seed_stories()
