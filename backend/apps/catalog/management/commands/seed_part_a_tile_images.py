import textwrap
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.catalog.models import Category

CATEGORY_TILE_FILENAMES = {
    "rooms-pg-hostel-hotels": "Create_3D_hotel_icon_fb85216d_2K.jpg",
}

SUBCATEGORY_TILE_FILENAMES = {
    "tools-machinery": "Cordless_power_drill_and_toolbox_1bece15f_2K.jpg",
    "sound-system-rental": "Speaker_and_microphone_3D_icon_dac6a94e_2K.jpg",
    "tentshamiana": "Tent_and_shamiana_rental_icon_8864d708_2K.jpg",
    "home-appliance-rental": "Home_appliance_rental_icons_5c68059e_2K.jpg",
    "lighting-rental": "Spotlight_stand_icon_rental_2616c2cb_2K.jpg",
}


class Command(BaseCommand):
    help = textwrap.dedent("""
    Seeds Cloudflare R2 / local tile image URLs for Part A categories and their subcategories.
    Points image_url at the public media domain (R2_PUBLIC_BASE_URL)/catalog/tiles/<slug>.png
    """)

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--force",
            action="store_true",
            default=True,
            help="Overwrite relative or outdated image URLs with full Cloudflare R2 URLs.",
        )
        parser.add_argument(
            "--base-url",
            default="",
            help="Base URL for images (default: R2_PUBLIC_BASE_URL).",
        )

    def handle(self, *args: object, **options: Any) -> None:
        force = options.get("force", True)
        base_url = str(options.get("base_url") or settings.R2_PUBLIC_BASE_URL).rstrip("/")

        targets = {
            "career-jobs": None,  # None means all subcategories
            "rental-services": None,  # all rental subcategories
            "rooms-pg-hostel-hotels": None,  # all stay subcategories
        }

        updated_categories = 0
        updated_subcategories = 0

        with transaction.atomic():
            for cat_slug, subcat_slugs in targets.items():
                try:
                    category = Category.objects.get(slug=cat_slug)
                except Category.DoesNotExist:
                    self.stderr.write(
                        self.style.WARNING(f"Category '{cat_slug}' not found, skipping.")
                    )
                    continue

                # Target Cloudflare R2 URL
                tile_filename = CATEGORY_TILE_FILENAMES.get(category.slug, f"{category.slug}.png")
                cat_target_url = f"{base_url}/catalog/tiles/{tile_filename}"
                if force or not category.image_url or category.image_url.startswith("/"):
                    category.image_url = cat_target_url
                    category.save(update_fields=["image_url", "updated_at"])
                    updated_categories += 1
                    self.stdout.write(f"Updated category: {category.slug} -> {category.image_url}")

                # Update Subcategories
                if subcat_slugs is None:
                    subcategories = category.subcategories.all()
                else:
                    subcategories = category.subcategories.filter(slug__in=subcat_slugs)

                for subcategory in subcategories:
                    tile_file = SUBCATEGORY_TILE_FILENAMES.get(subcategory.slug, f"{subcategory.slug}.png")
                    subcat_target_url = f"{base_url}/catalog/tiles/{tile_file}"
                    if force or not subcategory.image_url or subcategory.image_url.startswith("/"):
                        subcategory.image_url = subcat_target_url
                        subcategory.save(update_fields=["image_url", "updated_at"])
                        updated_subcategories += 1
                        self.stdout.write(f"Updated subcategory: {subcategory.slug} -> {subcategory.image_url}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully updated {updated_categories} categories and {updated_subcategories} subcategories to Cloudflare R2."
            )
        )
