"""Seed new high-quality stay product images for all properties across Web and Expo customer portals."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.foundation.catalog_media import catalog_image_url
from apps.stay.models import Property, PropertyMedia, RoomLook, UnitMedia

_SOURCE_DIR = os.environ.get("VSOLVE_STAYS_IMAGES_DIR")
# Optional folder of raw photos to copy in; the committed catalog images are used when unset.
DOWNLOADS_DIR = Path(_SOURCE_DIR) if _SOURCE_DIR else None
FRONTEND_WEB_STAYS_DIR = (
    Path(settings.BASE_DIR).parent
    / "frontend"
    / "apps"
    / "customer"
    / "public"
    / "catalog"
    / "stays"
)
FRONTEND_EXPO_STAYS_DIR = (
    Path(settings.BASE_DIR).parent
    / "frontend"
    / "mobile"
    / "apps"
    / "customer"
    / "assets"
    / "catalog"
    / "stays"
)
BACKEND_MEDIA_DIR = Path(settings.MEDIA_ROOT) / "stays"

STAY_IMAGE_MAPPINGS: list[dict[str, Any]] = [
    {
        "property_id": "43af0ce0-3a4f-4bd7-8163-554a8b359ce1",
        "slug_keyword": "vv",
        "title": "Apartment Stay (LB Nagar)",
        "raw_pattern": "Compact_apartment_interior_layout",
        "clean_filename": "compact-apartment-interior-layout.jpg",
        "caption": "Compact modern apartment interior layout with complete furnishings",
        "url": "/catalog/stays/compact-apartment-interior-layout.jpg",
    },
    {
        "property_id": "603bcd01-2bdd-4fbc-bd7c-565395b2a3ec",
        "slug_keyword": "hostel",
        "title": "Pending Ops Hostel Bed",
        "raw_pattern": "Clean_hostel_dormitory_room",
        "clean_filename": "clean-hostel-dormitory-room-interior.jpg",
        "caption": "Clean hostel dormitory room interior with bunk beds and lockers",
        "url": "/catalog/stays/clean-hostel-dormitory-room-interior.jpg",
    },
    {
        "property_id": "d12087e8-a826-4f7d-9e58-a1849960e297",
        "slug_keyword": "grand-hyatt",
        "title": "Grand Hyatt Hotel Demo",
        "raw_pattern": "Hotel_suite_bedroom_interior",
        "clean_filename": "hotel-suite-bedroom-interior.jpg",
        "caption": "Luxury hotel suite bedroom interior with king bed and panoramic view",
        "url": "/catalog/stays/hotel-suite-bedroom-interior.jpg",
    },
    {
        "property_id": "129c23a4-f872-4802-bfad-b10051aa0ce6",
        "slug_keyword": "cyber-towers",
        "title": "Cyber Towers Executive Single Room",
        "raw_pattern": "Modern_executive_room_with_works",
        "clean_filename": "modern-executive-room-with-workstation.jpg",
        "caption": "Modern executive single room with dedicated ergonomic workstation",
        "url": "/catalog/stays/modern-executive-room-with-workstation.jpg",
    },
    {
        "property_id": "24722a15-f9d3-4e9d-af61-bf01a796b0cc",
        "slug_keyword": "lakeview",
        "title": "Lakeview Double Sharing — Demo",
        "raw_pattern": "Shared_bedroom_with_two_beds",
        "clean_filename": "shared-bedroom-with-two-beds.jpg",
        "caption": "Spacious double sharing bedroom with two beds and natural lighting",
        "url": "/catalog/stays/shared-bedroom-with-two-beds.jpg",
    },
]


def sync_images_to_destinations() -> dict[str, Path]:
    """Copy images from Downloads/stays to Web, Expo, and Backend media directories.

    Returns a mapping from raw pattern keyword to the copied file.
    """
    copied_files: dict[str, Path] = {}

    if DOWNLOADS_DIR is None or not DOWNLOADS_DIR.exists():
        return copied_files

    FRONTEND_WEB_STAYS_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_EXPO_STAYS_DIR.mkdir(parents=True, exist_ok=True)
    BACKEND_MEDIA_DIR.mkdir(parents=True, exist_ok=True)

    for config in STAY_IMAGE_MAPPINGS:
        raw_pattern = config["raw_pattern"].lower()
        clean_name = config["clean_filename"]

        matched_file: Path | None = None
        for item in DOWNLOADS_DIR.iterdir():
            if item.is_file() and raw_pattern in item.name.lower():
                matched_file = item
                break

        if matched_file:
            for dest_dir in [FRONTEND_WEB_STAYS_DIR, FRONTEND_EXPO_STAYS_DIR, BACKEND_MEDIA_DIR]:
                shutil.copy2(matched_file, dest_dir / clean_name)
                shutil.copy2(matched_file, dest_dir / matched_file.name)

            copied_files[config["raw_pattern"]] = matched_file

    return copied_files


class Command(BaseCommand):
    help = "Seeds new high-quality stay product images from Downloads/stays into PropertyMedia and UnitMedia for Web and Expo portals."

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        copied = sync_images_to_destinations()
        self.stdout.write(
            f"Synced {len(copied)} stays images to Web customer public, Expo customer assets, and Backend media."
        )

        all_properties = {str(p.id): p for p in Property.objects.all()}
        updated_count = 0

        for config in STAY_IMAGE_MAPPINGS:
            prop = all_properties.get(config["property_id"])
            if not prop:
                # Fallback search by slug keyword
                for cand in all_properties.values():
                    if config["slug_keyword"] in (cand.slug or "").lower():
                        prop = cand
                        break

            if not prop:
                self.stdout.write(
                    self.style.WARNING(f"[Skip] Could not find stay property for {config['title']}")
                )
                continue

            image_url = catalog_image_url(config["url"])
            caption = config["caption"]

            # Replace any existing property media with the verified primary image
            PropertyMedia.objects.filter(property=prop).delete()
            PropertyMedia.objects.create(
                property=prop,
                display_order=0,
                url=image_url,
                caption=caption,
            )

            # Also update UnitMedia for all units and looks under this property
            for unit in prop.units.all():
                UnitMedia.objects.filter(unit=unit).delete()
                looks = list(unit.looks.all())
                if not looks:
                    looks = [RoomLook.objects.create(unit=unit, name="", display_order=0)]
                for look in looks:
                    UnitMedia.objects.create(
                        unit=unit,
                        look=look,
                        display_order=0,
                        url=image_url,
                    )

            self.stdout.write(
                self.style.SUCCESS(f"[Seeded] Property '{prop.title}' -> {image_url} ({caption})")
            )
            updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSuccessfully seeded {updated_count}/5 stay property images perfectly across Web Customer and Expo Customer portals."
            )
        )
