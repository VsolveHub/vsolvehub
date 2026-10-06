"""Seed Rental Services and Rooms & Stays categories, subcategories, services, and partners."""

import uuid
from datetime import UTC, datetime, time
from typing import Any
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.catalog.icons import ServiceIconKey
from apps.catalog.models import (
    A1VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, User, UserRole
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerConsent,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)
from apps.pricing.models import ServiceRate, TaskRate

SEED_RATE_EFFECTIVE_FROM = datetime(2026, 1, 1, tzinfo=UTC)
DAY_STARTS_AT = time(0, 0)
DAY_ENDS_AT = time(23, 59)
SEED_DOCUMENT_VERSION = 1


RENTAL_DATA = {
    "category": {
        "slug": "rentals",
        "name": "Rental Services",
        "description": "Event furniture, tent & shamiana, sound, lights, appliances, furniture and vehicle rentals.",
        "icon_key": "package",
        "image_url": "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80",
        "display_order": 10,
    },
    "subcategories": [
        {
            "slug": "event-furniture-rental",
            "name": "Event Furniture Rental",
            "description": "Chairs, VIP sofas, banquet tables and counters on rent for events and functions.",
            "services": [
                ("plastic-chairs-rental", "Plastic Chairs on Rent", 2000, "Durable armless plastic chairs for gatherings and functions."),
                ("cushion-chairs-rental", "Cushion Banquet Chairs", 3500, "Padded banquet cushion chairs with covers."),
                ("vip-sofa-set-rental", "VIP Stage Sofa Set", 250000, "Premium leatherette 2+1 sofa set for stage and VIP guests."),
                ("round-banquet-tables-rental", "Round Banquet Tables", 25000, "Round dining and banquet tables with cloth linen."),
            ],
        },
        {
            "slug": "tent-shamiana-rental",
            "name": "Tent & Shamiana Rental",
            "description": "Tents, waterproof shamiana, dome tents and event coverings.",
            "services": [
                ("shamiana-tent-setup", "Shamiana Tent Setup (20x20 ft)", 350000, "Waterproof shamiana covering for outdoor events (up to 50 guests)."),
                ("waterproof-dome-tent", "Waterproof Dome Tent", 1200000, "Heavy-duty dome tent with side curtains for weddings and exhibitions."),
            ],
        },
        {
            "slug": "lighting-rental",
            "name": "Lighting Rental",
            "description": "LED flood lights, focus lights, stage lighting and decorative serial lights.",
            "services": [
                ("event-led-lights", "Event LED Flood Lights", 35000, "High-intensity outdoor LED flood and halogen lights."),
                ("decorative-serial-lights", "Decorative Serial Lights Set", 50000, "Fairy and serial light strings for exterior and interior decoration."),
            ],
        },
        {
            "slug": "sound-system-rental",
            "name": "Sound System Rental",
            "description": "Party speakers, wireless mics, mixers and full DJ sound equipment.",
            "services": [
                ("portable-party-speaker", "Party Speaker with Mic", 120000, "High-output Bluetooth speaker with cordless handheld microphone."),
                ("full-dj-sound-setup", "Full DJ Sound & Mixer Setup", 1000000, "Complete dual-speaker sound system with amplifier, mixer and operator."),
            ],
        },
        {
            "slug": "home-appliance-rental",
            "name": "Home Appliance Rental",
            "description": "Refrigerators, washing machines, microwaves and televisions on monthly rent.",
            "services": [
                ("refrigerator-rental", "Refrigerator on Rent", 69900, "Single or double door energy-efficient refrigerator (monthly rental)."),
                ("washing-machine-rental", "Automatic Washing Machine", 59900, "Fully automatic top-load washing machine on monthly rental."),
                ("smart-tv-rental", "Smart LED TV (43 Inch)", 79900, "Full HD Smart LED TV with wall mount on monthly rental."),
            ],
        },
        {
            "slug": "furniture-rental",
            "name": "Furniture Rental",
            "description": "Sofa sets, beds, wardrobes and dining tables for home and office.",
            "services": [
                ("sofa-set-rental", "Living Room Sofa Set (3-Seater)", 99900, "Comfortable fabric 3-seater sofa for home on monthly rental."),
                ("double-bed-rental", "Double Bed with Mattress", 89900, "Queen size wooden double bed with coir/foam mattress."),
            ],
        },
        {
            "slug": "vehicle-rental",
            "name": "Vehicle Rental Services",
            "description": "Two-wheelers, hatchbacks, sedans and transport vehicles on rent.",
            "services": [
                ("daily-bike-scooter-rental", "Daily Scooter / Bike Rental", 39900, "Gearless scooter or commuter bike for daily self-drive."),
                ("self-drive-car-rental", "Self-Drive Car Rental", 169900, "Hatchback or compact sedan for 24-hour self-drive."),
            ],
        },
    ],
}

STAYS_DATA = {
    "category": {
        "slug": "stays",
        "name": "Rooms & Stays",
        "description": "Verified rooms, PG accommodation, hostels, apartments, rental properties and premium stays.",
        "icon_key": "home",
        "image_url": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
        "display_order": 11,
    },
    "subcategories": [
        {
            "slug": "rooms-for-rent",
            "name": "Rooms for Rent",
            "description": "Individual single and double furnished rooms available for monthly rent.",
            "services": [
                ("single-room-rent", "Single Room for Rent", 450000, "Private single bedroom with attached bathroom and ventilation."),
                ("double-sharing-room", "Double Sharing Room", 350000, "Spacious room with two beds, wardrobe and study desks."),
            ],
        },
        {
            "slug": "pg-accommodation",
            "name": "PG Accommodation",
            "description": "Paying guest accommodation for boys, girls and co-living with meals.",
            "services": [
                ("boys-pg-accommodation", "Verified Boys PG with Meals", 600000, "Twin/triple sharing boys PG with 3 times food, WiFi and laundry."),
                ("girls-pg-accommodation", "Verified Girls PG with Security", 650000, "Safe girls PG with CCTV security, nutritious food and housekeeping."),
            ],
        },
        {
            "slug": "hostels",
            "name": "Hostels",
            "description": "Student hostels and working professionals hostels near educational and IT hubs.",
            "services": [
                ("student-hostel-stay", "Student Hostel Stay", 400000, "Budget-friendly student hostel with study room and mess facilities."),
                ("working-professionals-hostel", "Working Professionals Hostel", 500000, "Hostel for working executives with high-speed internet and power backup."),
            ],
        },
        {
            "slug": "short-stay",
            "name": "Short Stay & Transit",
            "description": "Daily and weekly transit room stays for travellers and visitors.",
            "services": [
                ("daily-room-stay", "Daily Transit Room Stay", 99900, "Clean AC room for 24-hour day transit stay with attached bath."),
                ("weekly-budget-stay", "Weekly Furnished Room Stay", 499900, "Fully furnished room for 7-day stay with housekeeping."),
            ],
        },
        {
            "slug": "apartments",
            "name": "Apartments & Flats",
            "description": "1 BHK, 2 BHK and 3 BHK family apartments for monthly rent.",
            "services": [
                ("1bhk-apartment-rent", "1 BHK Furnished Apartment", 950000, "Cozy 1 BHK flat with kitchen, hall, bedroom and balcony."),
                ("2bhk-apartment-rent", "2 BHK Family Apartment", 1600000, "Spacious 2 BHK residential apartment in gated community with parking."),
            ],
        },
        {
            "slug": "rental-properties",
            "name": "Rental Properties",
            "description": "Independent houses, villas and commercial office spaces on lease/rent.",
            "services": [
                ("independent-house-rent", "Independent House / Villa", 2200000, "Independent duplex residential home with private compound."),
                ("commercial-office-space", "Commercial Office Space", 1800000, "Plug-and-play commercial space suitable for shop or office."),
            ],
        },
        {
            "slug": "premium-stays",
            "name": "Premium Stays & Suites",
            "description": "Luxury serviced apartments, executive suites and private villa farmhouses.",
            "services": [
                ("luxury-serviced-apartment", "Luxury Serviced Apartment", 399900, "Premium serviced apartment with modular kitchen, king bed and room service."),
                ("private-villa-resort-stay", "Private Villa & Farmhouse Stay", 1199900, "Exclusive private villa with lawn and pool for weekend stays."),
            ],
        },
    ],
}


class Command(BaseCommand):
    help = "Seed Rental Services and Rooms & Stays categories, subcategories, services and partner accounts."

    @transaction.atomic
    def handle(self, *_args: object, **_options: object) -> None:
        self.stdout.write("Seeding reference skills for Rentals and Stays...")
        rental_skill, _ = Skill.objects.update_or_create(
            code="rental-provider",
            defaults={"name": "Rental Services Provider", "is_active": True},
        )
        stay_skill, _ = Skill.objects.update_or_create(
            code="stay-host",
            defaults={"name": "Rooms & Stays Host", "is_active": True},
        )

        # 1. Seed Rentals Catalog
        rental_variants = self._seed_catalog_section(RENTAL_DATA, skill_code="rental-provider")
        self.stdout.write(self.style.SUCCESS(f"Seeded Rentals catalog: {len(rental_variants)} variants."))

        # 2. Seed Stays Catalog
        stays_variants = self._seed_catalog_section(STAYS_DATA, skill_code="stay-host")
        self.stdout.write(self.style.SUCCESS(f"Seeded Stays catalog: {len(stays_variants)} variants."))

        # 3. Seed Dedicated Partner Accounts
        self._seed_partner(
            phone_number="+919900000088",
            display_name="Rental Pro Services",
            skill=rental_skill,
            variants=rental_variants,
        )

        self._seed_partner(
            phone_number="+919900000089",
            display_name="Stays & Properties Host",
            skill=stay_skill,
            variants=stays_variants,
        )

        # 4. Also attach to universal test partner (+919900000099)
        self._attach_to_universal_partner(rental_variants + stays_variants, [rental_skill, stay_skill])

        self.stdout.write(self.style.SUCCESS("All Rental & Stays categories, services, and partner accounts seeded successfully!"))

    def _seed_catalog_section(self, section_data: dict[str, Any], skill_code: str) -> list[ServiceVariant]:
        cat_info = section_data["category"]
        category, _ = Category.objects.update_or_create(
            slug=cat_info["slug"],
            defaults={
                "name": cat_info["name"],
                "description": cat_info["description"],
                "icon_key": cat_info["icon_key"],
                "image_url": cat_info["image_url"],
                "display_order": cat_info["display_order"],
                "is_active": True,
            },
        )

        variants: list[ServiceVariant] = []

        for subcat_idx, subcat_info in enumerate(section_data["subcategories"], start=1):
            subcategory, _ = Subcategory.objects.update_or_create(
                category=category,
                slug=subcat_info["slug"],
                defaults={
                    "name": subcat_info["name"],
                    "description": subcat_info["description"],
                    "display_order": subcat_idx,
                    "is_active": True,
                },
            )

            for s_idx, (slug, name, price_paise, desc) in enumerate(subcat_info["services"], start=1):
                service, _ = Service.objects.update_or_create(
                    slug=slug,
                    defaults={
                        "subcategory": subcategory,
                        "name": name,
                        "short_description": desc,
                        "description": desc,
                        "status": Service.Status.ACTIVE,
                        "display_order": s_idx,
                        "icon_key": ServiceIconKey.SERVICE,
                    },
                )

                variant, _ = ServiceVariant.objects.update_or_create(
                    service=service,
                    code="standard",
                    defaults={
                        "name": "Standard",
                        "description": desc,
                        "pricing_strategy": ServiceVariant.PricingStrategy.FIXED,
                        "booking_archetype": ServiceVariant.BookingArchetype.A1_TASK_VISIT,
                        "minimum_duration_minutes": 60,
                        "recommended_duration_minutes": 60,
                        "duration_increment_minutes": 30,
                        "maximum_duration_minutes": 240,
                        "required_skill_code": skill_code,
                        "tax_category_code": "general-services",
                        "display_order": 1,
                        "is_active": True,
                    },
                )

                ServiceRate.objects.update_or_create(
                    variant=variant,
                    effective_from=SEED_RATE_EFFECTIVE_FROM,
                    defaults={
                        "amount_paise": price_paise,
                        "currency": "INR",
                        "effective_to": None,
                        "is_active": True,
                    },
                )

                TaskRate.objects.update_or_create(
                    variant=variant,
                    task_code=slug,
                    effective_from=SEED_RATE_EFFECTIVE_FROM,
                    defaults={
                        "unit_price_paise": price_paise,
                        "base_duration_minutes": 30,
                        "marginal_duration_minutes": 30,
                        "currency": "INR",
                        "effective_to": None,
                        "is_active": True,
                    },
                )

                A1VariantConfiguration.objects.update_or_create(
                    variant=variant,
                    version=1,
                    defaults={
                        "status": A1VariantConfiguration.Status.ACTIVE,
                        "scope_schema": {
                            "version": 1,
                            "questions": [
                                {"code": "quantity", "kind": "INTEGER", "required": True, "minimum": 1},
                            ],
                        },
                        "required_equipment": [],
                        "out_of_scope_rules": [],
                        "evidence_policy": {
                            "before_photos_required": False,
                            "after_photos_required": False,
                            "completion_checklist_required": True,
                        },
                    },
                )

                variants.append(variant)

        return variants

    def _seed_partner(
        self,
        *,
        phone_number: str,
        display_name: str,
        skill: Skill,
        variants: list[ServiceVariant],
    ) -> None:
        user, _ = User.objects.get_or_create(
            phone_number=phone_number,
            defaults={"full_name": display_name},
        )
        role, _ = Role.objects.get_or_create(
            code="partner",
            defaults={"name": "Partner", "is_system": True},
        )
        UserRole.objects.update_or_create(user=user, role=role, defaults={"revoked_at": None})

        partner, _ = PartnerProfile.objects.get_or_create(
            user=user,
            defaults={"display_name": display_name, "experience_years": 5},
        )
        application, _ = PartnerApplication.objects.update_or_create(
            partner=partner,
            defaults={"status": PartnerApplication.Status.APPROVED},
        )

        self._accept_current_consents(partner)
        self._approve_required_documents(application)

        PartnerSkill.objects.update_or_create(
            partner=partner, skill=skill, defaults={"is_active": True}
        )

        areas = list(ServiceArea.objects.filter(is_active=True))
        for area in areas:
            PartnerServiceArea.objects.update_or_create(
                partner=partner, service_area=area, defaults={"is_active": True}
            )
            for weekday in range(7):
                PartnerAvailabilityRule.objects.update_or_create(
                    partner=partner,
                    service_area=area,
                    weekday=weekday,
                    starts_at=DAY_STARTS_AT,
                    defaults={
                        "ends_at": DAY_ENDS_AT,
                        "ends_next_day": False,
                        "is_active": True,
                    },
                )

        for variant in variants:
            PartnerService.objects.update_or_create(
                partner=partner, variant=variant, defaults={"is_active": True}
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Partner {phone_number} ({display_name}) is approved with {len(variants)} variants across {len(areas)} areas."
            )
        )

    def _attach_to_universal_partner(
        self,
        variants: list[ServiceVariant],
        skills: list[Skill],
    ) -> None:
        universal_user = User.objects.filter(phone_number="+919900000099").first()
        if not universal_user:
            return
        partner = PartnerProfile.objects.filter(user=universal_user).first()
        if not partner:
            return

        for skill in skills:
            PartnerSkill.objects.update_or_create(
                partner=partner, skill=skill, defaults={"is_active": True}
            )

        for variant in variants:
            PartnerService.objects.update_or_create(
                partner=partner, variant=variant, defaults={"is_active": True}
            )

    @staticmethod
    def _accept_current_consents(partner: PartnerProfile) -> None:
        for document in PartnerConsentDocument.objects.filter(
            is_current=True,
            is_required_for_submission=True,
            retired_at__isnull=True,
        ):
            PartnerConsent.objects.update_or_create(
                partner=partner,
                purpose=document.purpose,
                document_version=document.document_version,
                defaults={"document": document, "withdrawn_at": None},
            )

    @staticmethod
    def _approve_required_documents(application: PartnerApplication) -> None:
        now = timezone.now()
        for kind in settings.PARTNER_REQUIRED_DOCUMENT_KINDS:
            PartnerDocument.objects.update_or_create(
                application=application,
                kind=kind,
                version=SEED_DOCUMENT_VERSION,
                defaults={
                    "object_key": f"seed/non-production/{kind.lower()}.txt",
                    "content_type": "text/plain",
                    "size_bytes": 1,
                    "sha256": "0" * 64,
                    "scan_status": PartnerDocument.ScanStatus.CLEAN,
                    "scanned_at": now,
                    "status": PartnerDocument.Status.APPROVED,
                    "reviewed_at": now,
                    "review_reason": "Seeded local fixture; no document was uploaded or reviewed.",
                },
            )
