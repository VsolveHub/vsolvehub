"""Seed new high-quality rental product images for all A7 rental assets."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.rental.models import RentalAsset, RentalAssetMedia

# Source and destination directories
DOWNLOADS_DIR = Path(r"C:\Users\nuner\Downloads\New folder")
FRONTEND_RENTAL_DIR = (
    Path(settings.BASE_DIR).parent
    / "frontend"
    / "apps"
    / "customer"
    / "public"
    / "catalog"
    / "rentals"
)
BACKEND_MEDIA_DIR = Path(settings.MEDIA_ROOT) / "rentals"

#: Mapping each RentalAsset product title to its dedicated image and caption
RENTAL_IMAGE_MAPPINGS: list[dict[str, Any]] = [
    {
        "title_keywords": ["Bosch Professional Impact Drill", "GSB 500W"],
        "clean_filename": "bosch-corded-impact-drill.jpg",
        "caption": "Bosch Professional Corded Impact Drill GSB 500W",
        "url": "/catalog/rentals/bosch-corded-impact-drill.jpg",
    },
    {
        "title_keywords": ["Bosch Drill", "Demo"],
        "clean_filename": "bosch-electric-drill-on-display.jpg",
        "caption": "Bosch Electric Drill on Display",
        "url": "/catalog/rentals/bosch-electric-drill-on-display.jpg",
    },
    {
        "title_keywords": ["Stanley Pro Woodworking", "Carpentry Tool Kit"],
        "clean_filename": "carpentry-tool-kit-in-toolbox.jpg",
        "caption": "Stanley Pro Woodworking & Carpentry Tool Kit",
        "url": "/catalog/rentals/carpentry-tool-kit-in-toolbox.jpg",
    },
    {
        "title_keywords": ["Stanley Pro Carpentry Tool Kit"],
        "clean_filename": "toolbox-organized-tools.jpg",
        "caption": "Stanley Pro Organized Tool Box & Hand Tools",
        "url": "/catalog/rentals/toolbox-organized-tools.jpg",
    },
    {
        "title_keywords": ["Dewalt", "Angle Grinder"],
        "clean_filename": "industrial-electric-angle-grinder.jpg",
        "caption": "Dewalt Heavy Duty Industrial Angle Grinder 850W",
        "url": "/catalog/rentals/industrial-electric-angle-grinder.jpg",
    },
    {
        "title_keywords": ["Angle Grinder", "Pending Ops"],
        "clean_filename": "angle-grinder-cutting-disc.jpg",
        "caption": "Angle Grinder with Heavy-Duty Cutting Disc",
        "url": "/catalog/rentals/angle-grinder-cutting-disc.jpg",
    },
    {
        "title_keywords": ["Karcher", "Pressure Washer"],
        "clean_filename": "karcher-k5-high-pressure-washer.jpg",
        "caption": "Kärcher K5 High-Pressure Washer 145 Bar",
        "url": "/catalog/rentals/karcher-k5-high-pressure-washer.jpg",
    },
    {
        "title_keywords": ["Air Compressor", "50 Litre"],
        "clean_filename": "portable-air-compressor-50l.jpg",
        "caption": "Industrial Portable Air Compressor 50L 2.5 HP",
        "url": "/catalog/rentals/portable-air-compressor-50l.jpg",
    },
    {
        "title_keywords": ["PartyBox", "Sound System"],
        "clean_filename": "portable-party-speaker-mic.jpg",
        "caption": "JBL Pro PartyBox 800W High-Power Sound System with Mics",
        "url": "/catalog/rentals/portable-party-speaker-mic.jpg",
    },
    {
        "title_keywords": ["Telescopic", "Ladder"],
        "clean_filename": "telescopic-aluminum-ladder-standing.jpg",
        "caption": "16ft Telescopic Aluminium Step & Extension Ladder",
        "url": "/catalog/rentals/telescopic-aluminum-ladder-standing.jpg",
    },
    {
        "title_keywords": ["Voltas", "Air Conditioner"],
        "clean_filename": "voltas-inverter-split-ac.jpg",
        "caption": "Voltas 1.5 Ton Inverter Air Conditioner (Portable / Split)",
        "url": "/catalog/rentals/voltas-inverter-split-ac.jpg",
    },
    {
        "title_keywords": ["Welding Machine", "ESAB"],
        "clean_filename": "welding-machine-white-bg.jpg",
        "caption": "ESAB Inverter ARC & TIG Welding Machine 200A",
        "url": "/catalog/rentals/welding-machine-white-bg.jpg",
    },
    {
        "title_keywords": ["Pagoda Tent", "20x20"],
        "clean_filename": "white-pagoda-event-tent.jpg",
        "caption": "White Waterproof Pagoda Event Tent 20x20 ft",
        "url": "/catalog/rentals/white-pagoda-event-tent.jpg",
    },
    {
        "title_keywords": ["Flood Lights", "Stage"],
        "clean_filename": "four-led-floodlights-grid.jpg",
        "caption": "Set of 4 High-Output Stage & Outdoor LED Flood Lights",
        "url": "/catalog/rentals/four-led-floodlights-grid.jpg",
    },
]


def sync_images_from_downloads() -> None:
    """Ensure all images from Downloads/New folder are synced to frontend public and backend media."""
    FRONTEND_RENTAL_DIR.mkdir(parents=True, exist_ok=True)
    BACKEND_MEDIA_DIR.mkdir(parents=True, exist_ok=True)

    if not DOWNLOADS_DIR.exists():
        return

    alias_map = {
        "Angle_grinder_cutting_disc_8ce5739a.jpg": "angle-grinder-cutting-disc.jpg",
        "Bosch_corded_impact_drill_441719a9.jpg": "bosch-corded-impact-drill.jpg",
        "Bosch_electric_drill_on_display_5202502a.jpg": "bosch-electric-drill-on-display.jpg",
        "Carpentry_tool_kit_in_toolbox_f7d382d8.jpg": "carpentry-tool-kit-in-toolbox.jpg",
        "Four_LED_floodlights_arranged_grid_3f3f1b5d.jpg": "four-led-floodlights-grid.jpg",
        "Industrial_electric_angle_grinder_045f4fd0.jpg": "industrial-electric-angle-grinder.jpg",
        "Telescopic_aluminum_ladder_standing_a8ad9572.jpg": "telescopic-aluminum-ladder-standing.jpg",
        "Toolbox_containing_organized_tools_5da49c17.jpg": "toolbox-organized-tools.jpg",
        "Welding_machine_on_white_background_441874a0.jpg": "welding-machine-white-bg.jpg",
        "White_pagoda_event_tent_bb0875b9.jpg": "white-pagoda-event-tent.jpg",
    }

    for item in DOWNLOADS_DIR.iterdir():
        if item.is_file() and item.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
            shutil.copy2(item, FRONTEND_RENTAL_DIR / item.name)
            shutil.copy2(item, BACKEND_MEDIA_DIR / item.name)

            clean_name = alias_map.get(item.name)
            if not clean_name:
                name_lower = item.name.lower()
                if "rcher" in name_lower or "c6f49258" in name_lower:
                    clean_name = "karcher-k5-high-pressure-washer.jpg"
                elif "compressor" in name_lower or "a20d9ffe" in name_lower:
                    clean_name = "portable-air-compressor-50l.jpg"
                elif "speaker" in name_lower or "38fd777a" in name_lower:
                    clean_name = "portable-party-speaker-mic.jpg"
                elif "voltas" in name_lower or "82c43ee6" in name_lower:
                    clean_name = "voltas-inverter-split-ac.jpg"

            if clean_name:
                shutil.copy2(item, FRONTEND_RENTAL_DIR / clean_name)
                shutil.copy2(item, BACKEND_MEDIA_DIR / clean_name)


class Command(BaseCommand):
    help = "Seeds new high-quality rental product images from Downloads/New folder into RentalAssetMedia."

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        sync_images_from_downloads()
        self.stdout.write("Synced rental images to frontend public and backend media directories.")

        updated_count = 0
        all_assets = list(RentalAsset.objects.all())

        for config in RENTAL_IMAGE_MAPPINGS:
            matching_assets: list[RentalAsset] = []
            for asset in all_assets:
                if all(kw.lower() in asset.title.lower() for kw in config["title_keywords"]):
                    matching_assets.append(asset)

            for asset in matching_assets:
                image_url = config["url"]
                caption = config["caption"]

                # Clean existing media and create primary clean image
                RentalAssetMedia.objects.filter(asset=asset).delete()
                RentalAssetMedia.objects.create(
                    asset=asset,
                    display_order=0,
                    url=image_url,
                    caption=caption,
                )

                self.stdout.write(
                    self.style.SUCCESS(
                        f"[Seeded] '{asset.title}' -> {image_url} ({caption})"
                    )
                )
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSuccessfully seeded {updated_count} rental product images perfectly across all rental cards."
            )
        )
