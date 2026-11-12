"""Seed script to ensure ONLY the services shown in the deployed portal image are active,
and their Cloudflare R2 image URLs are properly seeded in the database.

Categories & Subcategories/Services:
1. Career Opportunity or Job Opportunities:
   - Health Care Jobs
   - Hiring Partners
   - IT & Software Jobs
   - Retail & Shop Staff

2. Rental Services:
   - Camera & Media Equipment
   - Catering Equipment
   - Construction Equipment
   - Cooling/Heating
   - Decor Items Rent
   - Event Furniture Rental
   - Furniture Rental (Home/Office)

3. Rooms / PG / Hostel / Hotels:
   - Apartments
   - Bed Space
   - Co-Living Spaces
   - Hostels
   - Hotels
   - PG Accommodation
   - Premium Stays
"""

import os
import sys

import django

# Setup Django environment
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
django.setup()

from django.conf import settings

from apps.catalog.models import Category, Service, Subcategory

CANONICAL_R2_BASE = settings.R2_PUBLIC_BASE_URL

# Canonical category icon overrides in Cloudflare R2 (`catalog/tiles/`)
CATEGORY_ICON_OVERRIDES = {
    "electrician": f"{CANONICAL_R2_BASE}/catalog/tiles/d4662a4b-73bb-4ae0-bb88-cc80c321ce38.png_620b3506_2K.jpg",
    "plumber": f"{CANONICAL_R2_BASE}/catalog/tiles/plumber.jpg",
    "home-services": f"{CANONICAL_R2_BASE}/catalog/tiles/House_and_maintenance_tools_icon_b8b96031_2K.jpg",
    "construction": f"{CANONICAL_R2_BASE}/catalog/tiles/Construction_worker_3D_icon_dde69562_2K.jpg",
    "rooms-pg-hostel-hotels": f"{CANONICAL_R2_BASE}/catalog/tiles/Create_3D_hotel_icon_fb85216d_2K.jpg",
}

ALLOWED_SERVICES = {
    "career-jobs": [
        "Health Care Jobs",
        "Hiring Partners",
        "IT & Software Jobs",
        "Retail & Shop Staff",
    ],
    "rental-services": [
        "Camera & Media Equipment",
        "Catering Equipment",
        "Construction Equipment",
        "Cooling/Heating",
        "Decor Items Rent",
        "Event Furniture Rental",
        "Furniture Rental (Home/Office)",
    ],
    "rooms-pg-hostel-hotels": [
        "Apartments",
        "Bed Space",
        "Co-Living Spaces",
        "Hostels",
        "Hotels",
        "PG Accommodation",
        "Premium Stays",
    ],
}


def sync_deployed_services():
    print("Syncing portal services and Cloudflare R2 icons...")
    for cat_slug, icon_url in CATEGORY_ICON_OVERRIDES.items():
        try:
            cat = Category.objects.get(slug=cat_slug)
            cat.image_url = icon_url
            cat.save(update_fields=["image_url", "updated_at"])
            print(f"Updated category icon '{cat.slug}' -> {cat.image_url}")
        except Category.DoesNotExist:
            print(f"Warning: Category {cat_slug} not found for icon override.")

    for cat_slug, names in ALLOWED_SERVICES.items():
        try:
            cat = Category.objects.get(slug=cat_slug)
        except Category.DoesNotExist:
            print(f"Warning: Category {cat_slug} not found.")
            continue

        cat.image_url = CATEGORY_ICON_OVERRIDES.get(
            cat.slug, f"{CANONICAL_R2_BASE}/catalog/tiles/{cat.slug}.png"
        )
        cat.is_active = True
        cat.save(update_fields=["image_url", "is_active", "updated_at"])

        deactivated = Subcategory.objects.filter(category=cat).exclude(name__in=names).update(is_active=False)
        activated = Subcategory.objects.filter(category=cat, name__in=names).update(is_active=True)

        for sub in Subcategory.objects.filter(category=cat, name__in=names):
            sub.image_url = f"{CANONICAL_R2_BASE}/catalog/tiles/{sub.slug}.png"
            sub.save(update_fields=["image_url", "updated_at"])

        print(f"Category '{cat.name}': {activated} active, {deactivated} deactivated.")

        active_subs = Subcategory.objects.filter(category=cat, is_active=True).order_by("name")
        for sub in active_subs:
            svc_count = sub.services.filter(status=Service.Status.ACTIVE).count()
            print(f"  - {sub.name} ({svc_count} services) -> {sub.image_url}")

    print("Portal services and Cloudflare icons synced successfully.")


if __name__ == "__main__":
    sync_deployed_services()
