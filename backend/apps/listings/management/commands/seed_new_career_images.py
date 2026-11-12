"""Seed new high-quality career listing images for all job opportunities across Web and Expo customer portals."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.foundation.catalog_media import catalog_image_url
from apps.listings.models import Listing, ListingMedia

_SOURCE_DIR = os.environ.get("VSOLVE_CAREER_IMAGES_DIR")
# Optional folder of raw photos to copy in; the committed catalog images are used when unset.
DOWNLOADS_DIR = Path(_SOURCE_DIR) if _SOURCE_DIR else None
FRONTEND_WEB_CAREER_DIR = (
    Path(settings.BASE_DIR).parent
    / "frontend"
    / "apps"
    / "customer"
    / "public"
    / "catalog"
    / "careers"
)
FRONTEND_EXPO_CAREER_DIR = (
    Path(settings.BASE_DIR).parent
    / "frontend"
    / "mobile"
    / "apps"
    / "customer"
    / "assets"
    / "catalog"
    / "careers"
)
BACKEND_MEDIA_DIR = Path(settings.MEDIA_ROOT) / "careers"

CAREER_IMAGE_MAPPINGS: list[dict[str, Any]] = [
    {
        "listing_id": "540b366f-10a3-4ddb-8cc4-2e2ce0b5ace0",
        "slug_keyword": "accountant-suryapet",
        "title": "Accountant",
        "city": "Suryapet",
        "raw_pattern": "Accountant_working_with_financia",
        "clean_filename": "accountant-working-with-financial-calculator.jpg",
        "caption": "Accountant working with financial calculator and reports",
        "url": "/catalog/careers/accountant-working-with-financial-calculator.jpg",
    },
    {
        "listing_id": "5cf8bec5-a337-4886-835b-04c4adee9c76",
        "slug_keyword": "accountant-hyderabad",
        "title": "Accountant",
        "city": "Hyderabad",
        "raw_pattern": "Woman_reviewing_financial_spread",
        "clean_filename": "woman-reviewing-financial-spreadsheets.jpg",
        "caption": "Accountant reviewing financial spreadsheets and statements",
        "url": "/catalog/careers/woman-reviewing-financial-spreadsheets.jpg",
    },
    {
        "listing_id": "95ceb411-589f-439c-84b9-4f45eafc9178",
        "slug_keyword": "accountant-mancherial",
        "title": "Accountant",
        "city": "Mancherial",
        "raw_pattern": "Man_reviewing_financial_documents",
        "clean_filename": "man-reviewing-financial-documents.jpg",
        "caption": "Senior Accountant reviewing corporate balance sheets",
        "url": "/catalog/careers/man-reviewing-financial-documents.jpg",
    },
    {
        "listing_id": "8deb8f89-e775-431d-aeee-eafdbe5c602d",
        "slug_keyword": "tally-operator",
        "title": "Tally Operator",
        "city": "Sangareddy",
        "raw_pattern": "Tally_operator_working_at_computer",
        "clean_filename": "tally-operator-working-at-computer.jpg",
        "caption": "Tally Operator working on accounts ledger and GST entries",
        "url": "/catalog/careers/tally-operator-working-at-computer.jpg",
    },
    {
        "listing_id": "29a6c3fc-95a9-477e-8ca2-38902e2316af",
        "slug_keyword": "junior-full-stack-developer",
        "title": "Junior Full Stack Developer",
        "city": "Hyderabad",
        "raw_pattern": "Developer_working_on_laptop",
        "clean_filename": "developer-working-on-laptop.jpg",
        "caption": "Junior Full Stack Developer coding modern web application",
        "url": "/catalog/careers/developer-working-on-laptop.jpg",
    },
    {
        "listing_id": "4c166e6e-fb2a-4027-a1b0-eda49f85e7ce",
        "slug_keyword": "experienced-full-stack-developer",
        "title": "Experienced Full Stack Developer",
        "city": "",
        "raw_pattern": "Software_developer_working_at_wo",
        "clean_filename": "software-developer-working-at-workstation.jpg",
        "caption": "Experienced Software Engineer architecting enterprise solutions",
        "url": "/catalog/careers/software-developer-working-at-workstation.jpg",
    },
    {
        "listing_id": "a5fd8a7f-7fe1-4ade-b252-be4a0861a91c",
        "slug_keyword": "lead-qa-engineer",
        "title": "Lead QA Engineer",
        "city": "",
        "raw_pattern": "Woman_reviewing_software_testing",
        "clean_filename": "woman-reviewing-software-testing.jpg",
        "caption": "Lead QA Engineer analyzing test suites and test automation",
        "url": "/catalog/careers/woman-reviewing-software-testing.jpg",
    },
    {
        "listing_id": "4eff788b-dbd5-4aa9-b4f0-25104783f48e",
        "slug_keyword": "cashier-madhapur",
        "title": "Cashier",
        "city": "Hyderabad",
        "raw_pattern": "Cashier_handling_retail_transaction",
        "clean_filename": "cashier-handling-retail-transaction.jpg",
        "caption": "Retail Cashier processing POS checkout transaction",
        "url": "/catalog/careers/cashier-handling-retail-transaction.jpg",
    },
    {
        "listing_id": "666afcd2-6182-4ad9-a17e-be0a9f89f7f0",
        "slug_keyword": "billing-executive",
        "title": "Billing Executive",
        "city": "Hyderabad",
        "raw_pattern": "Man_working_at_billing_counter",
        "clean_filename": "man-working-at-billing-counter.jpg",
        "caption": "Billing Executive preparing retail invoices and receipts",
        "url": "/catalog/careers/man-working-at-billing-counter.jpg",
    },
    {
        "listing_id": "7623609a-6aaa-45d8-ba32-f1da44b29199",
        "slug_keyword": "showroom-sales-executive",
        "title": "Showroom Sales Executive",
        "city": "Hyderabad",
        "raw_pattern": "Sales_executive_assisting_customer",
        "clean_filename": "sales-executive-assisting-customer.jpg",
        "caption": "Showroom Sales Executive assisting retail customers",
        "url": "/catalog/careers/sales-executive-assisting-customer.jpg",
    },
    {
        "listing_id": "56f04d99-8422-4f63-ab4b-e4beb12df848",
        "slug_keyword": "jewellery-sales-executive-suryapet",
        "title": "Jewellery Sales Executive",
        "city": "Suryapet",
        "raw_pattern": "Man_presenting_jewellery_in_show",
        "clean_filename": "man-presenting-jewellery-in-showroom.jpg",
        "caption": "Jewellery Sales Executive presenting gold ornaments",
        "url": "/catalog/careers/man-presenting-jewellery-in-showroom.jpg",
    },
    {
        "listing_id": "893f1987-5c99-4263-ae83-750a2604ddae",
        "slug_keyword": "jewellery-sales-executive-ameerpet",
        "title": "Jewellery Sales Executive",
        "city": "Hyderabad",
        "raw_pattern": "Sales_executive_presenting_jewel",
        "clean_filename": "sales-executive-presenting-jewellery.jpg",
        "caption": "Jewellery Sales Specialist showcasing diamond collection",
        "url": "/catalog/careers/sales-executive-presenting-jewellery.jpg",
    },
    {
        "listing_id": "b6543349-95d1-4b88-973a-caf3cb571ae7",
        "slug_keyword": "site-supervisor",
        "title": "Site Supervisor",
        "city": "Mancherial",
        "raw_pattern": "Supervisor_reviewing_constructio",
        "clean_filename": "supervisor-reviewing-construction-site.jpg",
        "caption": "Construction Site Supervisor inspecting building blueprint",
        "url": "/catalog/careers/supervisor-reviewing-construction-site.jpg",
    },
    {
        "listing_id": "c6d98440-6e68-4201-b1a3-d2557458cd27",
        "slug_keyword": "office-coordinator",
        "title": "Office Coordinator",
        "city": "Hyderabad",
        "raw_pattern": "Woman_working_at_office_desk",
        "clean_filename": "woman-working-at-office-desk.jpg",
        "caption": "Office Coordinator managing administrative operations",
        "url": "/catalog/careers/woman-working-at-office-desk.jpg",
    },
    {
        "listing_id": "e8651536-99ed-4ca1-a3c9-d61be7814cd9",
        "slug_keyword": "warehouse-helper-packer",
        "title": "Warehouse Helper / Packer",
        "city": "Siddipet",
        "raw_pattern": "Worker_packing_boxes_in_warehouse",
        "clean_filename": "worker-packing-boxes-in-warehouse.jpg",
        "caption": "Warehouse Operations Associate packing and sorting parcels",
        "url": "/catalog/careers/worker-packing-boxes-in-warehouse.jpg",
    },
    {
        "listing_id": "fe5268ee-aaf6-4d06-ae2e-f9d71ed81ede",
        "slug_keyword": "staff-nurse",
        "title": "Staff Nurse",
        "city": "Adilabad",
        "raw_pattern": "Nurse_wearing_stethoscope_in_hos",
        "clean_filename": "nurse-wearing-stethoscope-in-hospital.jpg",
        "caption": "Registered Staff Nurse providing compassionate inpatient care",
        "url": "/catalog/careers/nurse-wearing-stethoscope-in-hospital.jpg",
    },
    {
        "listing_id": "2b496e2c-fcb1-4fc7-83d9-e47d6e1abec6",
        "slug_keyword": "waiter-steward",
        "title": "Waiter / Steward",
        "city": "Suryapet",
        "raw_pattern": "Waiter_holding_serving_tray",
        "clean_filename": "waiter-holding-serving-tray.jpg",
        "caption": "Dining Steward & Waiter serving food and beverage orders",
        "url": "/catalog/careers/waiter-holding-serving-tray.jpg",
    },
]


def sync_images_to_destinations() -> dict[str, Path]:
    """Copy images from Downloads/career to Web, Expo, and Backend media directories.

    Returns a mapping from raw pattern keyword to the copied clean file.
    """
    copied_files: dict[str, Path] = {}

    if DOWNLOADS_DIR is None or not DOWNLOADS_DIR.exists():
        return copied_files

    FRONTEND_WEB_CAREER_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_EXPO_CAREER_DIR.mkdir(parents=True, exist_ok=True)
    BACKEND_MEDIA_DIR.mkdir(parents=True, exist_ok=True)

    for config in CAREER_IMAGE_MAPPINGS:
        raw_pattern = config["raw_pattern"].lower()
        clean_name = config["clean_filename"]

        matched_file: Path | None = None
        for item in DOWNLOADS_DIR.iterdir():
            if item.is_file() and raw_pattern in item.name.lower():
                matched_file = item
                break

        if matched_file:
            # Copy under clean name
            for dest_dir in [FRONTEND_WEB_CAREER_DIR, FRONTEND_EXPO_CAREER_DIR, BACKEND_MEDIA_DIR]:
                shutil.copy2(matched_file, dest_dir / clean_name)
                # Also copy under raw name for maximum resilience
                shutil.copy2(matched_file, dest_dir / matched_file.name)

            copied_files[config["raw_pattern"]] = matched_file

    # Also sync the primary accountant hero image to career-accountant.jpg in public tiles for fallback parity
    accountant_clean = FRONTEND_WEB_CAREER_DIR / "accountant-working-with-financial-calculator.jpg"
    if accountant_clean.exists():
        tiles_dir = FRONTEND_WEB_CAREER_DIR.parent / "tiles"
        if tiles_dir.exists():
            shutil.copy2(accountant_clean, tiles_dir / "career-accountant.jpg")
            shutil.copy2(accountant_clean, tiles_dir / "career-accountant-ref.jpg")

    return copied_files


class Command(BaseCommand):
    help = "Seeds new high-quality career listing images from Downloads/career into ListingMedia for Web and Expo portals."

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        copied = sync_images_to_destinations()
        self.stdout.write(
            f"Synced {len(copied)} career images to Web customer public, Expo customer assets, and Backend media."
        )

        all_listings = {str(listing.id): listing for listing in Listing.objects.all()}
        updated_count = 0

        for config in CAREER_IMAGE_MAPPINGS:
            listing = all_listings.get(config["listing_id"])
            if not listing:
                # Fallback search by slug keyword
                for cand in all_listings.values():
                    if config["slug_keyword"] in (cand.slug or "").lower():
                        listing = cand
                        break

            if not listing:
                self.stdout.write(
                    self.style.WARNING(
                        f"[Skip] Could not find listing for {config['title']} ({config['city']})"
                    )
                )
                continue

            image_url = catalog_image_url(config["url"])
            caption = config["caption"]

            # Replace any existing media with the verified primary image
            ListingMedia.objects.filter(listing=listing).delete()
            ListingMedia.objects.create(
                listing=listing,
                kind=ListingMedia.Kind.IMAGE,
                display_order=0,
                url=image_url,
                alt_text=caption,
            )

            self.stdout.write(
                self.style.SUCCESS(
                    f"[Seeded] '{listing.title} ({listing.city or 'General'})' -> {image_url}"
                )
            )
            updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSuccessfully seeded {updated_count}/17 career listing images perfectly across Web Customer and Expo Customer portals."
            )
        )
