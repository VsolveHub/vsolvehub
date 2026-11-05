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

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image, ImageOps

from apps.stories.models import SafetyStory

User = get_user_model()

TILES_DIR = (
    Path(__file__).resolve().parent.parent.parent
    / "frontend"
    / "apps"
    / "customer"
    / "public"
    / "catalog"
    / "tiles"
)
IMAGES_DIR = Path(__file__).resolve().parent.parent.parent / "images"


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
        "title": "Certified Technicians",
        "caption": "Specialized diagnostic equipment, manufacturer-approved replacement parts, and fixed upfront service rate cards.",
        "image_name": "story-technician.png",
        "display_order": 3,
    },
    {
        "title": "Licensed Electricians",
        "caption": "1000V insulated safety toolkits, load testing, short-circuit diagnostics, and certified wiring standards for your home.",
        "image_name": "story-electrician.png",
        "display_order": 4,
    },
    {
        "title": "Master Plumber Precision",
        "caption": "Non-invasive acoustic leak detection, sanitized plumbing toolkits, and transparent piping replacement guarantees.",
        "image_name": "story-plumber.png",
        "display_order": 5,
    },
    {
        "title": "Hospital-Grade AC Care",
        "caption": "High-pressure jet foam coil wash, 99.9% antibacterial disinfection, and certified refrigerant leak inspections.",
        "image_name": "story-ac-services.png",
        "display_order": 6,
    },
    {
        "title": "Single-Use Salon Hygiene",
        "caption": "Individually sealed single-use kits, UV-sterilized implements, and dermatologically tested premium beauty cosmetics.",
        "image_name": "story-beautician.png",
        "display_order": 7,
    },
    {
        "title": "Deep Sanitized Homes",
        "caption": "Hospital-grade disinfectant solutions, HEPA filtration deep vacuums, and multi-point post-cleaning checklist verification.",
        "image_name": "story-home-services.png",
        "display_order": 8,
    },
    {
        "title": "Certified Gentle Pet Care",
        "caption": "Certified fear-free pet handlers, sanitized grooming tools, and organic hypoallergenic shampoos for your furry companions.",
        "image_name": "story-pet-services.png",
        "display_order": 9,
    },
    {
        "title": "Structural Quality Safety",
        "caption": "Licensed structural supervisors, ISI-grade material compliance, and mandatory PPE safety protocols on every site.",
        "image_name": "story-construction.png",
        "display_order": 10,
    },
    {
        "title": "Safe & Flawless Events",
        "caption": "Fire-retardant decor drapery, weight-certified lighting trusses, and background-verified banquet and catering staff.",
        "image_name": "story-events.png",
        "display_order": 11,
    },
    {
        "title": "Inspected & Sanitized Rentals",
        "caption": "Tools and equipment undergo quality checks, sanitization, and working verification before every handover.",
        "image_name": "camera-media-equipment.png",
        "display_order": 12,
    },
    {
        "title": "Verified Stays & Inspection",
        "caption": "All properties and hostels are physically verified with transparent pricing and no hidden deposit terms.",
        "image_name": "apartments.png",
        "display_order": 13,
    },
    {
        "title": "Verified Job Opportunities",
        "caption": "Direct employer connections with verified compensation, transparent role requirements, and zero recruitment agent fees.",
        "image_name": "career-jobs.png",
        "display_order": 14,
    },
]


def ensure_story_images() -> None:
    """Ensure high-resolution category images are generated and present in customer tiles folder."""
    if not TILES_DIR.exists():
        TILES_DIR.mkdir(parents=True, exist_ok=True)

    generation_map = [
        ("story-technician.png", IMAGES_DIR / "Technition" / "Technician_assembling_a_table_202608261547.jpeg"),
        ("story-electrician.png", next((IMAGES_DIR / "Electrition").glob("Electrician_connecting_backup_ge*.jpeg"), None)),
        ("story-plumber.png", IMAGES_DIR / "PlumberServices" / "Man_repairing_leaking_tap_202608261714.jpeg"),
        ("story-ac-services.png", IMAGES_DIR / "AC Services" / "Technician_cleaning_split_AC_202608261913.jpeg"),
        ("story-beautician.png", IMAGES_DIR / "Beautician" / "Artist_applying_airbrush_makeup_202608261908.jpeg"),
        ("story-home-services.png", IMAGES_DIR / "Home Services" / "Cleaners_cleaning_modern_villa_202608261908.jpeg"),
        ("story-pet-services.png", IMAGES_DIR / "Pet Services" / "Groomer_brushing_dog_202608262024.jpeg"),
        ("story-construction.png", IMAGES_DIR / "Construction" / "Specialist_installing_floor_tiles_202608262159.jpeg"),
        ("story-events.png", IMAGES_DIR / "Events" / "Team_preparing_wedding_venue_tables_202608262024.jpeg"),
    ]

    for out_name, src_path in generation_map:
        dest_path = TILES_DIR / out_name
        if not dest_path.exists() and src_path and src_path.exists():
            im = Image.open(src_path).convert("RGB")
            fitted = ImageOps.fit(im, (1024, 1024), method=Image.Resampling.LANCZOS)
            fitted.save(dest_path, "PNG", optimize=True)
            print(f"Generated {out_name} from {src_path.name}")


def seed_stories() -> None:
    ensure_story_images()

    admin_user = (
        User.objects.filter(userrole__role__code="operations").first()
        or User.objects.filter(is_staff=True).first()
        or User.objects.first()
    )

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
            created_by=admin_user,
            published_at=now,
        )
        story.expires_at = now + timedelta(hours=24)
        story.save()
        created += 1
        print(f"Created story [{item['display_order']}]: '{story.title}' (expires: {story.expires_at})")

    print(f"Successfully seeded {created} active safety stories.")


if __name__ == "__main__":
    seed_stories()
