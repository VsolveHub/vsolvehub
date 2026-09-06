"""Seed command for Category 'Rental Services' (A7_RENTAL).

Seeds:
- Category: Rental Services
- 12 Subcategories & their Services/Variants with booking_archetype='A7_RENTAL'
- A7VariantConfiguration for each variant
- Demo rental partner with A7_RENTAL capability
- Demo RentalAssets (serialized and pooled) in Hyderabad service area
"""

from datetime import time
from typing import Any
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.catalog.icons import ServiceIconKey
from apps.catalog.models import (
    A7VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.locations.models import ServiceArea
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerBusinessProfile,
    PartnerCapability,
    PartnerConsent,
    PartnerConsentDocument,
    PartnerDocument,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
)
from apps.rentals.models import RentalAsset

User = get_user_model()

# The 12 official subcategories from the prompt & spreadsheet:
RENTAL_TAXONOMY: dict[str, list[str]] = {
    "Event Furniture Rental": [
        "Plastic Chair",
        "Cushion Chair",
        "VIP Sofa Chair",
        "Round Table",
        "Dining Table",
        "Cocktail Table",
        "Stage Sofa Set",
        "Bride/Groom Chair",
        "Reception Table",
        "VIP Lounge Sofa",
        "Bar Counter",
    ],
    "Tent/Shamiana": [
        "10x10 ft Tent (10–15 members)",
        "20x20 ft Tent (30–50 members)",
        "30x30 ft Tent (70–100 members)",
        "40x40 ft Tent (120–150 members)",
        "50x50 ft Tent (200–300 members)",
        "60x40 ft Tent (250–400 members)",
        "100x50 ft Tent (500+ members)",
        "Dome Tent",
        "Pagoda Tent",
    ],
    "Lighting Rental": [
        "LED Lights",
        "Focus Lights",
        "Decorative Lights",
        "Serial Lights",
        "Flood Lights",
        "Stage Lights",
        "Moving Head Lights",
        "Laser Lights",
        "LED Wall",
    ],
    "Sound System Rental": [
        "Small Speaker",
        "Large Speaker",
        "Line Array System",
        "Subwoofer",
        "Microphone",
        "Cordless Microphone",
        "Amplifier",
        "DJ Setup",
        "Mixer System",
        "Audio Mixer Console",
    ],
    "Décor Items Rent": [
        "Balloon Kit",
        "Theme Props",
        "Photo Booth Setup",
        "Cutouts",
        "Flower Panels",
        "Entry Gate Setup",
        "Selfie Point Setup",
        "LED Name Board",
        "Red Carpet",
    ],
    "Catering Equipment": [
        "Cooking Vessels",
        "Serving Dishes",
        "Buffet Tables",
        "Plates & Glasses",
        "Water Dispenser",
        "Gas Stove",
        "Deep Freezer",
        "Tea/Coffee Counter Setup",
    ],
    "Construction Equipment": [
        "Concrete Mixer",
        "Vibrator Machine",
        "Scaffolding",
        "Centering Material",
        "JCB / Excavator",
        "Drilling Machine",
        "Power Trowel",
        "Diesel Generator",
    ],
    "Home Appliance Rental": [
        "Refrigerator",
        "Washing Machine",
        "TV",
        "AC",
        "Air Cooler",
        "Water Purifier",
        "Microwave Oven",
    ],
    "Furniture Rental (Home/Office)": [
        "Sofa",
        "Bed",
        "Mattress",
        "Wardrobe",
        "Office Chair",
        "Office Table",
        "Study Table",
        "Workstation",
    ],
    "Camera & Media Equipment": [
        "DSLR Camera",
        "Lens",
        "Video Camera",
        "Tripod",
        "Gimbal",
        "Drone Camera",
        "Action Camera",
        "LED Video Light",
    ],
    "Tools & Machinery": [
        "Drill Machine",
        "Cutter Machine",
        "Grinder",
        "Welding Machine",
        "Power Tools Kit",
        "Air Compressor",
        "Pressure Washer",
        "Ladder",
    ],
    "Cooling/Heating": [
        "Air Cooler",
        "AC Rental",
        "Industrial Fan",
        "Heater",
        "Air Blower",
        "Mist Fan",
    ],
}

DEFAULT_PRICES: dict[str, tuple[int, int]] = {
    # Default (daily_price_paise, deposit_paise)
    "Plastic Chair": (1500, 5000),           # ₹15/day, ₹50 deposit
    "Drill Machine": (35000, 100000),        # ₹350/day, ₹1,000 deposit
    "Concrete Mixer": (150000, 500000),      # ₹1,500/day, ₹5,000 deposit
    "Refrigerator": (12000, 200000),         # ₹120/day, ₹2,000 deposit
    "DSLR Camera": (80000, 300000),          # ₹800/day, ₹3,000 deposit
    "LED Lights": (5000, 20000),             # ₹50/day, ₹200 deposit
    "Small Speaker": (60000, 150000),        # ₹600/day, ₹1,500 deposit
    "AC Rental": (15000, 250000),            # ₹150/day, ₹2,500 deposit
    "Sofa": (20000, 300000),                 # ₹200/day, ₹3,000 deposit
}


class Command(BaseCommand):
    help = "Seeds Category 'Rental Services' with 12 subcategories, services, variants and demo assets."

    def handle(self, *args: Any, **options: Any) -> None:
        with transaction.atomic():
            # 1. Create or update Category
            category, _ = Category.objects.update_or_create(
                slug="rental-services",
                defaults={
                    "name": "Rental Services",
                    "description": "Rent machinery, tools, event furniture, sound systems, and home appliances with verified local providers.",
                    "icon_key": "rental",
                    "display_order": 10,
                    "is_active": True,
                },
            )
            self.stdout.write(self.style.SUCCESS(f"Category: {category.name}"))

            # 2. Iterate subcategories & services
            subcat_order = 1
            for subcat_name, service_names in RENTAL_TAXONOMY.items():
                subcat_slug = slugify(subcat_name)
                subcategory, _ = Subcategory.objects.update_or_create(
                    category=category,
                    slug=subcat_slug,
                    defaults={
                        "name": subcat_name,
                        "description": f"Verified rental providers for {subcat_name}.",
                        "icon_key": subcat_slug,
                        "display_order": subcat_order,
                        "is_active": True,
                    },
                )
                subcat_order += 1

                service_order = 1
                for s_name in service_names:
                    # Clean slug
                    base_slug = slugify(s_name)
                    # Unique slug under subcategory/service
                    s_slug = f"rental-{base_slug}"
                    service, _ = Service.objects.update_or_create(
                        slug=s_slug,
                        defaults={
                            "subcategory": subcategory,
                            "name": s_name,
                            "short_description": f"Rent {s_name} by the day with delivery or pickup.",
                            "status": Service.Status.ACTIVE,
                            "icon_key": ServiceIconKey.SERVICE,
                            "display_order": service_order,
                        },
                    )
                    service_order += 1

                    # Create standard variant for A7_RENTAL
                    variant, _ = ServiceVariant.objects.update_or_create(
                        service=service,
                        code="standard",
                        defaults={
                            "name": "Daily Rental",
                            "description": f"Standard daily rental of {s_name}.",
                            "pricing_strategy": ServiceVariant.PricingStrategy.DURATION,
                            "booking_archetype": ServiceVariant.BookingArchetype.A7_RENTAL,
                            "required_skill_code": subcat_slug,
                            "tax_category_code": "standard",
                            "display_order": 1,
                            "is_active": True,
                        },
                    )

                    # Create A7VariantConfiguration
                    default_rates = DEFAULT_PRICES.get(s_name, (50000, 150000))
                    A7VariantConfiguration.objects.update_or_create(
                        variant=variant,
                        version=1,
                        defaults={
                            "status": A7VariantConfiguration.Status.ACTIVE,
                            "deposit_required": True,
                            "default_deposit_paise": default_rates[1],
                            "pickup_allowed": True,
                            "delivery_allowed": True,
                            "min_rental_days": 1,
                            "max_rental_days": 30,
                            "late_fee_per_day_paise": default_rates[0],
                            "minor_damage_cap_paise": 500000,
                        },
                    )

            self.stdout.write(self.style.SUCCESS("All 12 subcategories & services seeded successfully."))

            # 3. Create Demo Rental Partner & Assets
            call_command("seed_partner_reference_data")

            demo_user, _ = User.objects.update_or_create(
                phone_number="+919900000077",
                defaults={
                    "full_name": "Balaji Equipment Rentals",
                },
            )
            role, _ = Role.objects.get_or_create(
                code="partner",
                defaults={"name": "Partner", "is_system": True},
            )
            UserRole.objects.update_or_create(user=demo_user, role=role, defaults={"revoked_at": None})

            partner_profile, _ = PartnerProfile.objects.update_or_create(
                user=demo_user,
                defaults={
                    "display_name": "Balaji Rentals",
                    "experience_years": 5,
                },
            )
            application, _ = PartnerApplication.objects.update_or_create(
                partner=partner_profile,
                defaults={"status": PartnerApplication.Status.APPROVED},
            )

            # Consents
            for document in PartnerConsentDocument.objects.filter(
                is_current=True,
                is_required_for_submission=True,
                retired_at__isnull=True,
            ):
                PartnerConsent.objects.update_or_create(
                    partner=partner_profile,
                    purpose=document.purpose,
                    document_version=document.document_version,
                    defaults={"document": document, "withdrawn_at": None},
                )

            # Documents
            now = timezone.now()
            for kind in settings.PARTNER_REQUIRED_DOCUMENT_KINDS:
                PartnerDocument.objects.update_or_create(
                    application=application,
                    kind=kind,
                    version=1,
                    defaults={
                        "object_key": f"seed/non-production/{kind.lower()}.txt",
                        "content_type": "text/plain",
                        "size_bytes": 1,
                        "sha256": "0" * 64,
                        "scan_status": PartnerDocument.ScanStatus.CLEAN,
                        "scanned_at": now,
                        "status": PartnerDocument.Status.APPROVED,
                        "reviewed_at": now,
                        "review_reason": "Seeded rental partner fixture",
                    },
                )

            PartnerBusinessProfile.objects.update_or_create(
                partner=partner_profile,
                defaults={
                    "legal_name": "Balaji Equipment & Tool Rentals",
                    "business_type": PartnerBusinessProfile.BusinessType.INDIVIDUAL,
                    "gst_registered": False,
                },
            )
            # Service Area
            hyd_area = ServiceArea.objects.filter(slug="hyderabad-500032").first()
            if hyd_area:
                PartnerServiceArea.objects.update_or_create(
                    partner=partner_profile, service_area=hyd_area, defaults={"is_active": True}
                )
                for weekday in range(7):
                    PartnerAvailabilityRule.objects.update_or_create(
                        partner=partner_profile,
                        service_area=hyd_area,
                        weekday=weekday,
                        starts_at=time(8),
                        defaults={
                            "ends_at": time(20),
                            "ends_next_day": False,
                            "is_active": True,
                        },
                    )

            # Seed demo assets (serialized and pooled)
            demo_items = [
                ("rental-drill-machine", "Bosch Professional Hammer Drill (500W)", True, "BOSCH-HD-8841", 1, 35000, 100000, "EXCELLENT"),
                ("rental-drill-machine", "Bosch Professional Hammer Drill (500W)", True, "BOSCH-HD-8842", 1, 35000, 100000, "EXCELLENT"),
                ("rental-concrete-mixer", "Heavy Duty Concrete Mixer 10/7", True, "CM-107-HYD-01", 1, 150000, 500000, "GOOD"),
                ("rental-dslr-camera", "Sony Alpha A7 III with 28-70mm Lens", True, "SONY-A7M3-901", 1, 120000, 500000, "EXCELLENT"),
                ("rental-plastic-chair", "Standard White Banquet Chairs", False, "", 50, 1500, 5000, "EXCELLENT"),
                ("rental-refrigerator", "Whirlpool 190L Single Door Refrigerator", True, "WP-RF-190L-12", 1, 15000, 200000, "GOOD"),
            ]

            for s_slug, title, is_serialized, serial, qty, daily_price, deposit, grade in demo_items:
                v = ServiceVariant.objects.filter(service__slug=s_slug, code="standard").first()
                if v:
                    asset, _ = RentalAsset.objects.update_or_create(
                        partner=partner_profile,
                        variant=v,
                        asset_identifier=serial,
                        defaults={
                            "title": title,
                            "description": f"High quality {title} available for daily rental.",
                            "is_serialized": is_serialized,
                            "quantity_available": qty,
                            "daily_price_paise": daily_price,
                            "deposit_paise": deposit,
                            "condition_grade": grade,
                            "current_status": RentalAsset.Status.ACTIVE,
                        },
                    )
                    if hyd_area:
                        asset.service_areas.add(hyd_area)

            # Ensure capability and asset exists for EVERY A7 rental variant
            all_a7_variants = ServiceVariant.objects.filter(
                booking_archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
                is_active=True,
            ).select_related("service")

            for v in all_a7_variants:
                PartnerService.objects.update_or_create(
                    partner=partner_profile,
                    variant=v,
                    defaults={"is_active": True},
                )
                PartnerCapability.objects.update_or_create(
                    partner=partner_profile,
                    variant=v,
                    defaults={
                        "archetype": ServiceVariant.BookingArchetype.A7_RENTAL,
                        "status": PartnerCapability.Status.APPROVED,
                    },
                )
                if not RentalAsset.objects.filter(partner=partner_profile, variant=v).exists():
                    cfg = v.a7_configurations.first()
                    daily = cfg.late_fee_per_day_paise if cfg else 45000
                    dep = cfg.default_deposit_paise if cfg else 100000
                    asset = RentalAsset.objects.create(
                        partner=partner_profile,
                        variant=v,
                        asset_identifier=f"BALAJI-{slugify(v.service.name)[:8].upper()}-01",
                        title=f"{v.service.name} (Professional Grade)",
                        description=f"Verified commercial grade {v.service.name} for daily rental.",
                        is_serialized=True,
                        quantity_available=1,
                        daily_price_paise=daily,
                        deposit_paise=dep,
                        condition_grade=RentalAsset.ConditionGrade.EXCELLENT,
                        current_status=RentalAsset.Status.ACTIVE,
                    )
            from apps.locations.models import ServiceAreaService

            active_areas = list(ServiceArea.objects.filter(is_active=True))
            for area in active_areas:
                for v in all_a7_variants:
                    ServiceAreaService.objects.get_or_create(
                        service_area=area,
                        variant=v,
                        defaults={"is_active": True},
                    )

            self.stdout.write(self.style.SUCCESS(f"Seeded inventory assets, service area links, and capabilities for all {all_a7_variants.count()} rental variants."))
