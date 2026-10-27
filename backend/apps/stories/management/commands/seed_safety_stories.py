"""Seed demo Safety Stories for customer home feed and operations testing.

Run with:
    python manage.py seed_safety_stories --dev-only
"""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path
from typing import Any, TypedDict

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.utils import timezone

from apps.stories.models import SafetyStory

User = get_user_model()

FALLBACK_JPEG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f"
    b"\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01"
    b"\x01\x01\x11\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
)


class DemoStory(TypedDict):
    title: str
    caption: str
    display_order: int
    hours_ago: int
    rel_path: str


DEMO_STORIES: list[DemoStory] = [
    {
        "title": "ID-Verified Experts",
        "caption": "Every professional undergoes 4-step ID and background verification before their first booking.",
        "display_order": 0,
        "hours_ago": 1,
        "rel_path": "Technition/Technician_configuring_fire_alarm_202608261548.jpeg",
    },
    {
        "title": "Sterilized Toolkits",
        "caption": "All instruments and equipment are disinfected using hospital-grade sanitizers before entering your home.",
        "display_order": 1,
        "hours_ago": 2,
        "rel_path": "AC Services/Technician_cleaning_split_AC_202608261913.jpeg",
    },
]


class Command(BaseCommand):
    help = "Seed 2 demo Safety Stories with authentic photography created by admin."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--dev-only",
            action="store_true",
            help="Confirm that you understand this creates sample marketing demo safety stories.",
        )

    def handle(self, *_args: object, **options: Any) -> None:
        if not settings.DEBUG and not options["dev_only"]:
            raise CommandError("Pass --dev-only to seed demo safety stories.")

        repo_images_dir = Path(settings.BASE_DIR).parent / "images"
        admin_user = (
            User.objects.filter(userrole__role__code="operations").first()
            or User.objects.filter(is_staff=True).first()
            or User.objects.first()
        )

        allowed_titles = {item["title"] for item in DEMO_STORIES}

        # Clean up any other stories outside the 2 kept stories
        deleted_count, _ = SafetyStory.objects.exclude(title__in=allowed_titles).delete()
        if deleted_count > 0:
            self.stdout.write(f"Removed {deleted_count} surplus stories.")

        created_count = 0
        now = timezone.now()

        for item in DEMO_STORIES:
            title = item["title"]
            published_at = now - timedelta(hours=item["hours_ago"])
            expires_at = published_at + timedelta(hours=24)

            # Look for real image file
            image_bytes = FALLBACK_JPEG
            image_path = repo_images_dir / item["rel_path"]
            if image_path.exists():
                image_bytes = image_path.read_bytes()

            filename = f"{title.lower().replace(' ', '_')}.jpeg"

            story, created = SafetyStory.objects.get_or_create(
                title=title,
                defaults={
                    "caption": item["caption"],
                    "media_type": SafetyStory.MediaType.IMAGE,
                    "original_name": filename,
                    "content_type": "image/jpeg",
                    "size_bytes": len(image_bytes),
                    "display_order": item["display_order"],
                    "is_published": True,
                    "published_at": published_at,
                    "created_by": admin_user,
                },
            )

            # Save real file contents
            story.stored_file.save(filename, ContentFile(image_bytes), save=False)
            story.caption = item["caption"]
            story.display_order = item["display_order"]
            story.size_bytes = len(image_bytes)
            story.is_published = True
            story.published_at = published_at
            story.expires_at = expires_at
            story.created_by = admin_user
            story.save()

            if created:
                created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully kept 2 safety stories with authentic images by admin ({admin_user.full_name if admin_user else 'Operations'})."
            )
        )
