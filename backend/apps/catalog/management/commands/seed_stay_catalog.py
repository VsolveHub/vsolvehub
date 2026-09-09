"""Seed command for Category 'Rooms / PG / Hostel / Hotels' (A9_STAY).

Seeds:
- Category: Rooms / PG / Hostel / Hotels (slug: rooms-pg-hostel)
- 12 Subcategories & their Services/Variants with booking_archetype='A9_STAY'
- Demo property host partner (stay.host@vsolve.in) with A9_STAY capability
- Demo Properties across Hyderabad (Kondapur, Gachibowli, Madhapur, Hitech City, Ameerpet)
- UnitTypes, physical Units, UnitPricingRules, and PropertyPolicies matching flow mock
"""

import datetime
from datetime import time
from decimal import Decimal
from typing import Any
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceQuestion,
    ServiceQuestionOption,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.locations.models import Address, ServiceArea, ServiceAreaService
from apps.partners.models import (
    PartnerBusinessProfile,
    PartnerCapability,
    PartnerProfile,
    commercial_mode_for_archetype,
)
from apps.partners.models.onboarding import PartnerApplication
from apps.stays.models import (
    Property,
    PropertyMedia,
    PropertyPolicy,
    Unit,
    UnitPricingOverride,
    UnitPricingRule,
    UnitType,
)

User = get_user_model()

SUBCATEGORY_METADATA: dict[str, dict[str, str]] = {
    "Rooms": {
        "icon_key": "door-closed",
        "image_url": "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=600&auto=format&fit=crop&q=80",
        "description": "Comfortable private and shared rooms with flexible stays.",
    },
    "PG Accommodation": {
        "icon_key": "building",
        "image_url": "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=600&auto=format&fit=crop&q=80",
        "description": "Move-in ready verified PGs with food, Wi-Fi and housekeeping.",
    },
    "Hostels": {
        "icon_key": "users",
        "image_url": "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=600&auto=format&fit=crop&q=80",
        "description": "Budget-friendly youth and student hostels near hubs.",
    },
    "Bed Space": {
        "icon_key": "bed",
        "image_url": "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=600&auto=format&fit=crop&q=80",
        "description": "Economical single, double and shared bed spaces.",
    },
    "Co-Living Spaces": {
        "icon_key": "sparkles",
        "image_url": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&auto=format&fit=crop&q=80",
        "description": "Designer community living with work lounges and modern amenities.",
    },
    "Apartments": {
        "icon_key": "building-2",
        "image_url": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80",
        "description": "1 RK, 1 BHK, 2 BHK, 3 BHK & 4 BHK gated community flats.",
    },
    "Rental Properties": {
        "icon_key": "key",
        "image_url": "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600&auto=format&fit=crop&q=80",
        "description": "Independent houses, villas, and commercial rental spaces.",
    },
    "Short Stay": {
        "icon_key": "calendar",
        "image_url": "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&auto=format&fit=crop&q=80",
        "description": "Daily, weekly and flexi short-term furnished accommodation.",
    },
    "Student Accommodation": {
        "icon_key": "graduation-cap",
        "image_url": "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop&q=80",
        "description": "Student-focused PGs and hostels close to colleges & coaching centers.",
    },
    "Worker Accommodation": {
        "icon_key": "hard-hat",
        "image_url": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&auto=format&fit=crop&q=80",
        "description": "Clean and affordable labour, staff and factory worker stays.",
    },
    "Property Listing": {
        "icon_key": "clipboard-list",
        "image_url": "https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&auto=format&fit=crop&q=80",
        "description": "Direct owner listings for rent: rooms, flats, houses & commercial.",
    },
    "Hotels": {
        "icon_key": "building-2",
        "image_url": "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&auto=format&fit=crop&q=80",
        "description": "Hotel rooms and serviced suites: single, double, deluxe, suite and executive.",
    },
    "Premium Stays": {
        "icon_key": "crown",
        "image_url": "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=600&auto=format&fit=crop&q=80",
        "description": "Ultra luxury apartments and premium villas.",
    },
}

STAY_TAXONOMY: dict[str, list[str]] = {
    "Rooms": [
        "Single Room",
        "Double Sharing Room",
        "Triple Sharing Room",
        "Four Sharing Room",
        "Family Room",
        "Studio Room",
        "Furnished Room",
        "Semi Furnished Room",
        "Non Furnished Room",
        "AC Room",
        "Non AC Room",
        "Attached Bathroom Room",
        "Shared Bathroom Room",
    ],
    "PG Accommodation": [
        "Gents PG",
        "Ladies PG",
        "Students PG",
        "Working Professionals PG",
        "AC PG",
        "Non AC PG",
        "Food Included PG",
        "Without Food PG",
        "Single Sharing PG",
        "Double Sharing PG",
        "Triple Sharing PG",
        "Four Sharing PG",
        "Luxury PG",
        "Budget PG",
    ],
    "Hostels": [
        "Gents Hostel",
        "Ladies Hostel",
        "Students Hostel",
        "Working Professionals Hostel",
        "AC Hostel",
        "Non AC Hostel",
        "Dormitory Hostel",
        "Backpacker Hostel",
        "Budget Hostel",
    ],
    "Bed Space": [
        "Single Bed Space",
        "Double Bed Space",
        "Shared Bed Space",
        "Labour Bed Space",
    ],
    "Co-Living Spaces": [
        "Co-Living Room",
        "Shared Co-Living",
        "Premium Co-Living",
        "Fully Managed Co-Living",
    ],
    "Apartments": [
        "1 RK Apartment",
        "1 BHK Apartment",
        "2 BHK Apartment",
        "3 BHK Apartment",
        "4 BHK Apartment",
        "Fully Furnished Apartment",
        "Semi Furnished Apartment",
        "Unfurnished Apartment",
    ],
    "Rental Properties": [
        "Independent House",
        "Villa",
        "Farm House",
        "Studio Apartment",
        "Service Apartment",
        "Duplex House",
        "Commercial Space",
        "Office Space",
        "Shop Space",
        "Godown / Warehouse",
    ],
    "Short Stay": [
        "Daily Room",
        "Weekly Stay",
        "Monthly Stay",
        "Hourly Stay",
        "Guest House",
        "Service Apartment",
        "Vacation Home",
    ],
    "Student Accommodation": [
        "College Nearby Hostel",
        "College Nearby PG",
        "Exam Stay Room",
        "Coaching Student PG",
    ],
    "Worker Accommodation": [
        "Labour Room",
        "Labour Camp",
        "Construction Worker Stay",
        "Factory Worker Stay",
        "Staff Accommodation",
        "Driver Accommodation",
    ],
    "Property Listing": [
        "Room for Rent",
        "PG for Rent",
        "Hostel Vacancy",
        "Apartment for Rent",
        "House for Rent",
        "Villa for Rent",
        "Commercial Space for Rent",
        "Office Space for Rent",
        "Godown / Warehouse for Rent",
    ],
    "Hotels": [
        "Executive Suite",
        "Corporate Stay",
        "Serviced Residence",
    ],
    "Premium Stays": [
        "Luxury Apartment",
        "Premium Villa",
    ],
}

# Sensible per-subcategory default deposit fallback (paise), used only when a host has not set a
# deposit on their own UnitPricingRule — never a floor that overrides an explicit, lower host value
# (see Django_Next.js_Plan/M3/05-a9-stay-property-type-remediation.md, Wave 0).
SUBCATEGORY_DEFAULT_DEPOSIT_PAISE: dict[str, int] = {
    "Rooms": 500000,                    # ~Rs 5,000
    "PG Accommodation": 500000,         # ~Rs 5,000
    "Hostels": 300000,                  # ~Rs 3,000
    "Bed Space": 200000,                # ~Rs 2,000
    "Co-Living Spaces": 800000,         # ~Rs 8,000
    "Apartments": 2500000,              # ~Rs 25,000
    "Rental Properties": 7500000,       # ~Rs 75,000 (villas, independent houses, commercial)
    "Short Stay": 500000,               # ~Rs 5,000
    "Student Accommodation": 300000,    # ~Rs 3,000
    "Worker Accommodation": 200000,     # ~Rs 2,000
    "Property Listing": 2500000,        # ~Rs 25,000
    "Hotels": 0,
    "Premium Stays": 10000000,          # ~Rs 1,00,000
}

# Wave 2 item 3 (plan Django_Next.js_Plan/M3/05-a9-stay-property-type-remediation.md SS5):
# occupancy-model-aware ServiceQuestion seeding. Subcategories map to SHARED (PG/Hostel/
# Co-Living-flavored) or ENTIRE_UNIT (Apartment/Villa/Rental-flavored) -- mirrors
# Property.OccupancyModel / _occupancy_model_for_property_type in apps/stays/models.py.
SHARED_SUBCATEGORIES: set[str] = {
    "Rooms",
    "PG Accommodation",
    "Hostels",
    "Bed Space",
    "Co-Living Spaces",
    "Student Accommodation",
    "Worker Accommodation",
}
ENTIRE_UNIT_SUBCATEGORIES: set[str] = {
    "Apartments",
    "Rental Properties",
    "Short Stay",
    "Property Listing",
    "Premium Stays",
}

# Within Rental Properties / Property Listing, these specific services are commercial-
# flavored: they should get neither sharing_type/food_included (SHARED) nor
# occupancy_capacity (ENTIRE_UNIT) -- only the property-type-agnostic filters
# (furnishing, AC, bathroom type) genuinely still apply. See plan SS5 Wave 2 item 3,
# last sentence.
COMMERCIAL_SERVICE_NAMES: set[str] = {
    "Commercial Space",
    "Office Space",
    "Shop Space",
    "Godown / Warehouse",
    "Commercial Space for Rent",
    "Office Space for Rent",
    "Godown / Warehouse for Rent",
}

HOTEL_SUBCATEGORIES: set[str] = {"Hotels"}
HOTEL_SERVICE_NAMES: set[str] = {
    "Executive Suite",
    "Corporate Stay",
    "Serviced Residence",
}


def _resolve_stay_variant(variant_name: str, subcategory_name: str) -> ServiceVariant | None:
    """Bind a demo UnitType to the A9 variant under the intended subcategory.

    Name-only lookup used to attach unmatched rows to the first Rooms variant,
    so Apartments/Hotels tiles showed Rooms listings.
    """
    subcat_slug = slugify(subcategory_name)
    clean = variant_name.replace(" (Standard)", "").strip()
    scoped = ServiceVariant.objects.filter(
        booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
        service__subcategory__slug=subcat_slug,
        service__subcategory__category__slug="rooms-pg-hostel",
    )
    match = scoped.filter(name__iexact=variant_name).first()
    if match is not None:
        return match
    return scoped.filter(service__name__iexact=clean).first()


class Command(BaseCommand):
    help = "Seed Category 'Rooms / PG / Hostel / Hotels' (A9_STAY) with subcategories, host partner, and demo properties"

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        self.stdout.write(self.style.NOTICE("Seeding Category 'Rooms / PG / Hostel / Hotels' (A9_STAY)..."))

        # 1. Ensure Top-Level Category
        category, _ = Category.objects.get_or_create(
            slug="rooms-pg-hostel",
            defaults={
                "name": "Rooms / PG / Hostel / Hotels",
                "description": "Find rooms, PGs, hostels, co-living spaces, and rental properties with verified hosts.",
                "icon_key": "building",
                "image_url": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&auto=format&fit=crop&q=80",
                "display_order": 8,
                "is_active": True,
            },
        )
        self.stdout.write(f"Category: {category.name}")

        # 2. Seed 12 Subcategories & Services
        all_variants: list[ServiceVariant] = []
        for order, (subcat_name, service_list) in enumerate(STAY_TAXONOMY.items(), start=1):
            subcat_slug = slugify(subcat_name)
            meta = SUBCATEGORY_METADATA.get(subcat_name, {})
            subcat, _ = Subcategory.objects.update_or_create(
                category=category,
                slug=subcat_slug,
                defaults={
                    "name": subcat_name,
                    "description": meta.get("description", f"Verified {subcat_name} in prime city localities."),
                    "icon_key": meta.get("icon_key", "home"),
                    "image_url": meta.get("image_url", "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&auto=format&fit=crop&q=80"),
                    "display_order": order,
                    "is_active": True,
                },
            )

            for s_order, service_name in enumerate(service_list, start=1):
                base_slug = slugify(service_name)
                srv_slug = base_slug
                # Handle duplicate names across subcategories (e.g. Service Apartment)
                if Service.objects.filter(slug=srv_slug).exclude(subcategory=subcat).exists():
                    srv_slug = f"{subcat_slug}-{base_slug}"
                if len(srv_slug) > 130:
                    srv_slug = srv_slug[:130]

                service, _ = Service.objects.update_or_create(
                    subcategory=subcat,
                    slug=srv_slug,
                    defaults={
                        "name": service_name,
                        "description": f"Book verified {service_name} with transparent pricing.",
                        "icon_key": "service",
                        "status": Service.Status.ACTIVE,
                    },
                )

                variant_code = f"{srv_slug[:65]}-std"
                variant, _ = ServiceVariant.objects.update_or_create(
                    service=service,
                    code=variant_code,
                    defaults={
                        "name": f"{service_name} (Standard)",
                        "description": f"Verified standard booking for {service_name}",
                        "pricing_strategy": ServiceVariant.PricingStrategy.DURATION,
                        "booking_archetype": ServiceVariant.BookingArchetype.A9_STAY,
                        "required_skill_code": "property-host",
                        "tax_category_code": "accommodation",
                        "minimum_duration_minutes": 1440,
                        "recommended_duration_minutes": 1440,
                        "duration_increment_minutes": 1440,
                        "maximum_duration_minutes": 30000,
                    },
                )
                all_variants.append(variant)

                is_commercial_service = service_name in COMMERCIAL_SERVICE_NAMES
                is_hotel_service = (
                    subcat_name in HOTEL_SUBCATEGORIES or service_name in HOTEL_SERVICE_NAMES
                )
                is_shared_subcat = subcat_name in SHARED_SUBCATEGORIES
                is_entire_unit_subcat = subcat_name in ENTIRE_UNIT_SUBCATEGORIES and not is_hotel_service

                A9VariantConfiguration.objects.update_or_create(
                    variant=variant,
                    version=1,
                    defaults={
                        "status": A9VariantConfiguration.Status.ACTIVE,
                        "deposit_required": not is_hotel_service,
                        "default_deposit_paise": (
                            0
                            if is_hotel_service
                            else SUBCATEGORY_DEFAULT_DEPOSIT_PAISE.get(subcat_name, 500000)
                        ),
                        "min_stay_nights": 1,
                        "max_stay_nights": 30 if is_hotel_service else 365,
                        "id_verification_required": True,
                    },
                )

                # Seed ServiceQuestion metadata for stay filters -- occupancy-model-aware
                # split (plan SS5 Wave 2 item 3). Property-type-agnostic filters
                # (furnishing, AC, bathroom type) apply to every service; sharing_type/
                # food_included only to SHARED subcategories, occupancy_capacity only to
                # ENTIRE_UNIT ones. Hotels seed room_class + occupancy_capacity.
                # Commercial-flavored services within Rental Properties /
                # Property Listing (Godown, Office Space, Commercial Space, Shop Space) get
                # neither -- only the agnostic filters.

                q_furnishing, _ = ServiceQuestion.objects.get_or_create(
                    variant=variant,
                    code="furnishing_status",
                    defaults={
                        "prompt": "Furnishing Status",
                        "kind": ServiceQuestion.Kind.SINGLE_CHOICE,
                        "display_order": 2,
                        "is_active": True,
                    },
                )
                for f_code, f_label in [
                    ("FULLY_FURNISHED", "Fully Furnished"),
                    ("SEMI_FURNISHED", "Semi-Furnished"),
                    ("UNFURNISHED", "Unfurnished"),
                ]:
                    ServiceQuestionOption.objects.get_or_create(
                        question=q_furnishing,
                        code=f_code,
                        defaults={"label": f_label, "display_order": 1},
                    )

                ServiceQuestion.objects.get_or_create(
                    variant=variant,
                    code="is_ac",
                    defaults={
                        "prompt": "Air Conditioning (AC)",
                        "kind": ServiceQuestion.Kind.BOOLEAN,
                        "display_order": 3,
                        "is_active": True,
                    },
                )

                ServiceQuestion.objects.get_or_create(
                    variant=variant,
                    code="bathroom_type",
                    defaults={
                        "prompt": "Bathroom Type",
                        "kind": ServiceQuestion.Kind.SINGLE_CHOICE,
                        "display_order": 6,
                        "is_active": True,
                    },
                )

                # Idempotent re-runs: remove any wrongly-scoped question left over from
                # before this occupancy-model split (e.g. sharing_type seeded onto an
                # ENTIRE_UNIT service in a prior run).
                if is_commercial_service or not is_shared_subcat:
                    ServiceQuestion.objects.filter(
                        variant=variant, code__in=("sharing_type", "food_included")
                    ).delete()
                if is_commercial_service or not (is_entire_unit_subcat or is_hotel_service):
                    ServiceQuestion.objects.filter(
                        variant=variant, code="occupancy_capacity"
                    ).delete()
                if is_commercial_service or not is_hotel_service:
                    ServiceQuestion.objects.filter(
                        variant=variant, code="room_class"
                    ).delete()

                if is_shared_subcat and not is_commercial_service:
                    q_sharing, _ = ServiceQuestion.objects.get_or_create(
                        variant=variant,
                        code="sharing_type",
                        defaults={
                            "prompt": "Sharing Type",
                            "kind": ServiceQuestion.Kind.SINGLE_CHOICE,
                            "display_order": 1,
                            "is_active": True,
                        },
                    )
                    for s_code, s_label in [
                        ("PRIVATE", "Private Room / 1-Sharing"),
                        ("DOUBLE", "2-Sharing"),
                        ("TRIPLE", "3-Sharing"),
                        ("FOUR_PLUS", "4+ Sharing / Dormitory"),
                    ]:
                        ServiceQuestionOption.objects.get_or_create(
                            question=q_sharing,
                            code=s_code,
                            defaults={"label": s_label, "display_order": 1},
                        )

                    ServiceQuestion.objects.get_or_create(
                        variant=variant,
                        code="food_included",
                        defaults={
                            "prompt": "Food Included",
                            "kind": ServiceQuestion.Kind.BOOLEAN,
                            "display_order": 4,
                            "is_active": True,
                        },
                    )
                elif is_hotel_service and not is_commercial_service:
                    q_room_class, _ = ServiceQuestion.objects.get_or_create(
                        variant=variant,
                        code="room_class",
                        defaults={
                            "prompt": "Room Class",
                            "kind": ServiceQuestion.Kind.SINGLE_CHOICE,
                            "display_order": 1,
                            "is_active": True,
                        },
                    )
                    for r_code, r_label in [
                        ("SINGLE", "Single"),
                        ("DOUBLE", "Double"),
                        ("TWIN", "Twin"),
                        ("DELUXE", "Deluxe"),
                        ("SUITE", "Suite"),
                        ("EXECUTIVE", "Executive"),
                    ]:
                        ServiceQuestionOption.objects.get_or_create(
                            question=q_room_class,
                            code=r_code,
                            defaults={"label": r_label, "display_order": 1},
                        )

                    q_capacity, _ = ServiceQuestion.objects.get_or_create(
                        variant=variant,
                        code="occupancy_capacity",
                        defaults={
                            "prompt": "Sleeps Up To",
                            "kind": ServiceQuestion.Kind.NUMBER,
                            "display_order": 2,
                            "is_active": True,
                        },
                    )
                    for c_code, c_label in [
                        ("2", "Sleeps 2+"),
                        ("4", "Sleeps 4+"),
                        ("6", "Sleeps 6+"),
                    ]:
                        ServiceQuestionOption.objects.get_or_create(
                            question=q_capacity,
                            code=c_code,
                            defaults={"label": c_label, "display_order": 1},
                        )
                elif is_entire_unit_subcat and not is_commercial_service:
                    q_capacity, _ = ServiceQuestion.objects.get_or_create(
                        variant=variant,
                        code="occupancy_capacity",
                        defaults={
                            "prompt": "Sleeps Up To",
                            "kind": ServiceQuestion.Kind.NUMBER,
                            "display_order": 1,
                            "is_active": True,
                        },
                    )
                    for c_code, c_label in [
                        ("2", "Sleeps 2+"),
                        ("4", "Sleeps 4+"),
                        ("6", "Sleeps 6+"),
                    ]:
                        ServiceQuestionOption.objects.get_or_create(
                            question=q_capacity,
                            code=c_code,
                            defaults={"label": c_label, "display_order": 1},
                        )
                # Commercial-flavored services (Godown/Warehouse, Office Space, Commercial
                # Space, Shop Space) fall through to neither branch -- agnostic filters only.

            # Clean up any legacy services under this subcategory not in the taxonomy
            for extra_s in subcat.services.exclude(name__in=service_list):
                for v in extra_s.variants.all():
                    replacement = (
                        ServiceVariant.objects.filter(
                            booking_archetype=ServiceVariant.BookingArchetype.A9_STAY,
                            service__name=extra_s.name,
                            service__subcategory__category__slug="rooms-pg-hostel",
                        )
                        .exclude(pk=v.pk)
                        .first()
                    )
                    if replacement is not None:
                        UnitType.objects.filter(variant=v).update(variant=replacement)
                    elif UnitType.objects.filter(variant=v).exists():
                        self.stdout.write(
                            self.style.WARNING(
                                f"Keeping leftover service {extra_s.name!r} under {subcat_name}: "
                                "unit types still reference it."
                            )
                        )
                        continue
                    PartnerCapability.objects.filter(variant=v).delete()
                    A9VariantConfiguration.objects.filter(variant=v).delete()
                    ServiceQuestion.objects.filter(variant=v).delete()
                    v.delete()
                if not extra_s.variants.exists():
                    extra_s.delete()

        self.stdout.write(f"Created {len(STAY_TAXONOMY)} subcategories and {len(all_variants)} stay variants.")

        # 3. Create or Get Demo Host User & PartnerProfile
        demo_user, _ = User.objects.update_or_create(
            phone_number="+919900000088",
            defaults={
                "full_name": "Ramesh Kumar (Host)",
                "email": "stay.host@vsolve.in",
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
                "display_name": "Ramesh Kumar Stays",
                "experience_years": 5,
            },
        )

        PartnerBusinessProfile.objects.get_or_create(
            partner=partner_profile,
            defaults={
                "business_type": PartnerBusinessProfile.BusinessType.INDIVIDUAL,
                "legal_name": "Ramesh Kumar Stays & Properties",
                "registration_number": "",
                "gst_registered": False,
            },
        )

        PartnerApplication.objects.update_or_create(
            partner=partner_profile,
            defaults={
                "status": PartnerApplication.Status.APPROVED,
                "submitted_at": timezone.now(),
                "reviewed_at": timezone.now(),
            },
        )

        # Grant A9_STAY capability to host for all variants
        for var in all_variants:
            PartnerCapability.objects.get_or_create(
                partner=partner_profile,
                variant=var,
                defaults={
                    "archetype": ServiceVariant.BookingArchetype.A9_STAY,
                    "status": PartnerCapability.Status.APPROVED,
                },
            )

        # 4. Service Area & Addresses in Hyderabad
        hyderabad_area = ServiceArea.objects.filter(slug="hyderabad-core").first()
        if not hyderabad_area:
            hyderabad_area = ServiceArea.objects.create(
                name="Hyderabad Core",
                slug="hyderabad-core",
                state_code="TG",
            )

        offer_areas = {hyderabad_area.id: hyderabad_area}
        for area in ServiceArea.objects.filter(is_active=True):
            offer_areas[area.id] = area
        for area in offer_areas.values():
            for variant in all_variants:
                ServiceAreaService.objects.update_or_create(
                    service_area=area,
                    variant=variant,
                    defaults={"is_active": True},
                )

        # 5. Seed Properties covering EVERY PropertyType subcategory
        demo_properties_data: list[dict[str, Any]] = [
            {
                "title": "Independent House, Kondapur",
                "catalog_subcategory": "Rental Properties",
                "property_type": Property.PropertyType.INDEPENDENT_HOUSE,
                "locality": "Kondapur, Hyderabad",
                "address_line": "Plot 42, Raghavendra Colony, Kondapur",
                "pincode": "500084",
                "rating": 4.6,
                "reviews_count": 86,
                "description": "Spacious 3 BHK independent house with modular kitchen, wardrobes, power backup, 24x7 water supply and covered parking.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800&auto=format&fit=crop&q=80",
                    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&auto=format&fit=crop&q=80",
                    "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(12, 0),
                    "check_out": time(11, 0),
                    "max_guests": 6,
                    "notice_days": 30,
                    "rules": ["No loud music after 10 PM", "Families or working professionals preferred", "Pets allowed with prior notice"],
                },
                "unit_types": [
                    {
                        "name": "3 BHK Entire House",
                        "variant_name": "Independent House (Standard)",
                        "sharing_type": UnitType.SharingType.ENTIRE_PLACE,
                        "sharing_count": 1,
                        "bhk": "3 BHK",
                        "occupancy_capacity": 6,
                        "bathrooms": 3,
                        "built_up_sqft": 1800,
                        "facing": "East",
                        "floor": "Ground + 1",
                        "is_ac": True,
                        "furnishing_status": UnitType.FurnishingStatus.SEMI_FURNISHED,
                        "amenities": ["Parking", "Power Backup", "24x7 Water", "Gas Pipeline", "Garden/Lawn", "Children Play Area", "Modular Kitchen", "Pet Friendly", "Gated Community", "CCTV Security"],
                        "image_url": "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 3200000,      # ₹32,000 / month
                        "maintenance_paise": 200000,     # ₹2,000 / month
                        "deposit_paise": 6400000,         # ₹64,000 (2 months)
                        "units": ["Villa #42A", "Villa #42B"],
                    }
                ],
            },
            {
                "title": "Villa for Rent, Gachibowli",
                "catalog_subcategory": "Premium Stays",
                "property_type": Property.PropertyType.VILLA,
                "locality": "Gachibowli, Hyderabad",
                "address_line": "Gachibowli Financial District Road",
                "pincode": "500032",
                "rating": 4.8,
                "reviews_count": 42,
                "description": "Ultra luxury 4 BHK duplex villa with private terrace garden, swimming pool access, and club house amenities.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&auto=format&fit=crop&q=80",
                    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(14, 0),
                    "check_out": time(11, 0),
                    "max_guests": 8,
                    "notice_days": 60,
                    "rules": ["Gated community regulations apply", "No commercial filming"],
                },
                "unit_types": [
                    {
                        "name": "4 BHK Luxury Villa",
                        "variant_name": "Premium Villa (Standard)",
                        "sharing_type": UnitType.SharingType.ENTIRE_PLACE,
                        "sharing_count": 1,
                        "bhk": "4 BHK",
                        "occupancy_capacity": 8,
                        "bathrooms": 4,
                        "built_up_sqft": 2500,
                        "facing": "North-East",
                        "floor": "G + 2",
                        "is_ac": True,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["Covered Parking", "Private Lawn", "Club House", "Gym", "Power Backup", "Modular Kitchen"],
                        "image_url": "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 6600000,      # ₹66,000 / month
                        "maintenance_paise": 400000,     # ₹4,000 / month
                        "deposit_paise": 13200000,       # ₹1,32,000
                        "units": ["Villa #12"],
                    }
                ],
            },
            {
                "title": "Zolo Stay Luxury PG, Hitech City",
                "catalog_subcategory": "PG Accommodation",
                "property_type": Property.PropertyType.PG,
                "locality": "Hitech City, Hyderabad",
                "address_line": "Near Cyber Towers, Hitech City",
                "pincode": "500081",
                "rating": 4.5,
                "reviews_count": 110,
                "description": "Comfortable AC PG accommodation with food included, daily housekeeping, 100 Mbps Wi-Fi, and biometric security.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800&auto=format&fit=crop&q=80",
                    "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(10, 0),
                    "check_out": time(10, 0),
                    "max_guests": 2,
                    "notice_days": 15,
                    "rules": ["Biometric entry 24x7", "Meals served: Breakfast & Dinner on weekdays, 3 meals on weekends"],
                },
                "unit_types": [
                    {
                        "name": "2-Sharing AC PG Room",
                        "variant_name": "Double Sharing PG (Standard)",
                        "sharing_type": UnitType.SharingType.DOUBLE,
                        "sharing_count": 2,
                        "bhk": "1 Room",
                        "bathrooms": 1,
                        "built_up_sqft": 220,
                        "facing": "East",
                        "floor": "2nd Floor",
                        "is_ac": True,
                        "food_included": True,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["Wi-Fi", "Daily Cleaning", "Meals Included", "Air Conditioner", "Geyser", "RO Water", "Washing Machine"],
                        "image_url": "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 1200000,      # ₹12,000 / month per bed
                        "maintenance_paise": 0,
                        "deposit_paise": 1500000,        # ₹15,000 deposit
                        "units": ["Bed 201-A", "Bed 201-B", "Bed 202-A", "Bed 202-B", "Bed 203-A", "Bed 203-B"],
                    }
                ],
            },
            {
                "title": "Youth Space Student & Professional Hostel, Ameerpet",
                "catalog_subcategory": "Hostels",
                "property_type": Property.PropertyType.HOSTEL,
                "locality": "Ameerpet, Hyderabad",
                "address_line": "Near Ameerpet Metro Station, SR Nagar Main Road",
                "pincode": "500038",
                "rating": 4.5,
                "reviews_count": 76,
                "description": "Affordable and secure hostel for students and job seekers. Homestyle 3 meals a day, high-speed Wi-Fi, study hall, personal lockers, and CCTV surveillance.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&auto=format&fit=crop&q=80",
                    "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&auto=format&fit=crop&q=80",
                    "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(8, 0),
                    "check_out": time(20, 0),
                    "max_guests": 3,
                    "notice_days": 15,
                    "rules": ["Gate closing time: 10:30 PM", "Quiet study hours after 10 PM", "ID proof mandatory"],
                },
                "unit_types": [
                    {
                        "name": "3-Sharing Student Hostel Bed",
                        "variant_name": "Students Hostel (Standard)",
                        "sharing_type": UnitType.SharingType.TRIPLE,
                        "sharing_count": 3,
                        "bhk": "1 Room",
                        "bathrooms": 1,
                        "built_up_sqft": 240,
                        "facing": "North",
                        "floor": "1st Floor",
                        "is_ac": False,
                        "food_included": True,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["3 Times Food", "Wi-Fi", "Locker Facility", "Geyser", "RO Water", "CCTV Security", "Housekeeping"],
                        "image_url": "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 750000,       # ₹7,500 / month
                        "maintenance_paise": 0,
                        "deposit_paise": 1000000,        # ₹10,000
                        "units": ["Hostel Bed 101-A", "Hostel Bed 101-B", "Hostel Bed 101-C", "Hostel Bed 102-A", "Hostel Bed 102-B"],
                    }
                ],
            },
            {
                "title": "Isthara Co-Living Executive Suites, Gachibowli",
                "catalog_subcategory": "Co-Living Spaces",
                "property_type": Property.PropertyType.CO_LIVING,
                "locality": "Gachibowli, Hyderabad",
                "address_line": "Near DLF Cyber City, Gachibowli",
                "pincode": "500032",
                "rating": 4.8,
                "reviews_count": 94,
                "description": "Chic, tech-enabled co-living space designed for tech professionals. Features community cafe, work lounges, high-speed 300 Mbps Wi-Fi, gaming room, and gym.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&auto=format&fit=crop&q=80",
                    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(11, 0),
                    "check_out": time(10, 0),
                    "max_guests": 2,
                    "notice_days": 30,
                    "rules": ["Community code of conduct applies", "Visitors permitted in common lounge until 9 PM"],
                },
                "unit_types": [
                    {
                        "name": "Executive Private Co-Living Studio",
                        "variant_name": "Co-Living Room (Standard)",
                        "sharing_type": UnitType.SharingType.PRIVATE,
                        "sharing_count": 1,
                        "bhk": "1 RK",
                        "bathrooms": 1,
                        "built_up_sqft": 320,
                        "facing": "East",
                        "floor": "3rd Floor",
                        "is_ac": True,
                        "food_included": False,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["Air Conditioner", "Fiber Wi-Fi", "Coworking Lounge", "Gym", "Power Backup", "Housekeeping", "Lounge Access"],
                        "image_url": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 1800000,      # ₹18,000 / month
                        "maintenance_paise": 150000,     # ₹1,500 / month
                        "deposit_paise": 2500000,        # ₹25,000
                        "units": ["Co-Studio 301", "Co-Studio 302", "Co-Studio 303"],
                    }
                ],
            },
            {
                "title": "Prestige Heights 2 BHK Gated Flat, Madhapur",
                "catalog_subcategory": "Apartments",
                "property_type": Property.PropertyType.APARTMENT,
                "locality": "Madhapur, Hyderabad",
                "address_line": "Near Durgam Cheruvu, Madhapur",
                "pincode": "500081",
                "rating": 4.7,
                "reviews_count": 58,
                "description": "Contemporary 2 BHK residential apartment in a gated high-rise community with modular kitchen, lift access, 100% power backup, swimming pool, and dedicated car parking.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&auto=format&fit=crop&q=80",
                    "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(12, 0),
                    "check_out": time(11, 0),
                    "max_guests": 4,
                    "notice_days": 30,
                    "rules": ["Gated community association rules apply", "No commercial subletting"],
                },
                "unit_types": [
                    {
                        "name": "2 BHK Semi-Furnished Apartment",
                        "variant_name": "2 BHK Apartment (Standard)",
                        "sharing_type": UnitType.SharingType.ENTIRE_PLACE,
                        "sharing_count": 1,
                        "bhk": "2 BHK",
                        "occupancy_capacity": 4,
                        "bathrooms": 2,
                        "built_up_sqft": 1250,
                        "facing": "North",
                        "floor": "5th Floor",
                        "is_ac": True,
                        "food_included": False,
                        "furnishing_status": UnitType.FurnishingStatus.SEMI_FURNISHED,
                        "amenities": ["Covered Parking", "Lift", "Swimming Pool", "Power Backup", "Modular Kitchen", "Children Play Area", "Gated Security"],
                        "image_url": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 2800000,      # ₹28,000 / month
                        "maintenance_paise": 250000,     # ₹2,500
                        "deposit_paise": 5600000,        # ₹56,000 (2 months)
                        "units": ["Flat 502", "Flat 503"],
                    }
                ],
            },
            {
                "title": "Urban Nest Studio Apartment, Madhapur",
                "catalog_subcategory": "Apartments",
                "property_type": Property.PropertyType.STUDIO_APT,
                "locality": "Madhapur, Hyderabad",
                "address_line": "100 Feet Road, Ayyappa Society, Madhapur",
                "pincode": "500081",
                "rating": 4.7,
                "reviews_count": 64,
                "description": "Chic 1 RK private studio with modular kitchenette, work desk, smart TV, and balcony view.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&auto=format&fit=crop&q=80",
                    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(12, 0),
                    "check_out": time(11, 0),
                    "max_guests": 2,
                    "notice_days": 30,
                    "rules": ["No pets allowed", "Quiet hours after 11 PM"],
                },
                "unit_types": [
                    {
                        "name": "1 RK Furnished Studio",
                        "variant_name": "1 RK Apartment (Standard)",
                        "sharing_type": UnitType.SharingType.PRIVATE,
                        "sharing_count": 1,
                        "bhk": "1 RK",
                        "occupancy_capacity": 2,
                        "bathrooms": 1,
                        "built_up_sqft": 450,
                        "facing": "North",
                        "floor": "3rd Floor",
                        "is_ac": True,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["Air Conditioner", "Smart TV", "Kitchenette", "Balcony", "Elevator", "Power Backup"],
                        "image_url": "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 2200000,      # ₹22,000 / month
                        "maintenance_paise": 150000,     # ₹1,500
                        "deposit_paise": 4400000,        # ₹44,000
                        "units": ["Studio 301", "Studio 302", "Studio 303"],
                    }
                ],
            },
            {
                "title": "Prime Commercial Shop Space, Ameerpet",
                "catalog_subcategory": "Rental Properties",
                "property_type": Property.PropertyType.COMMERCIAL,
                "locality": "Ameerpet, Hyderabad",
                "address_line": "Main Road, Near Metro Station, Ameerpet",
                "pincode": "500016",
                "rating": 4.5,
                "reviews_count": 28,
                "description": "High footfall ground floor commercial shop space suitable for retail, clinic, boutique, or office.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&auto=format&fit=crop&q=80",
                    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(9, 0),
                    "check_out": time(21, 0),
                    "max_guests": 20,
                    "notice_days": 90,
                    "rules": ["Commercial electricity meter provided", "Signage space included on front facade"],
                },
                "unit_types": [
                    {
                        "name": "Ground Floor Retail Shop",
                        "variant_name": "Shop Space (Standard)",
                        "sharing_type": UnitType.SharingType.ENTIRE_PLACE,
                        "sharing_count": 1,
                        "bhk": "Commercial",
                        "bathrooms": 1,
                        "built_up_sqft": 1200,
                        "facing": "East",
                        "floor": "Ground Floor",
                        "is_ac": False,
                        "furnishing_status": UnitType.FurnishingStatus.UNFURNISHED,
                        "amenities": ["Main Road Facing", "Rolling Shutter", "Washroom", "3 Phase Power", "Water Connection"],
                        "image_url": "https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 4500000,      # ₹45,000 / month
                        "maintenance_paise": 250000,     # ₹2,500
                        "deposit_paise": 15000000,       # ₹1,50,000 (3 months)
                        "units": ["Shop #1 (Ground Floor)", "Shop #2 (Ground Floor)"],
                    }
                ],
            },
            {
                "title": "Comfort Living Executive Rooms, Ameerpet",
                "catalog_subcategory": "Rooms",
                "property_type": Property.PropertyType.PG,
                "locality": "Ameerpet, Hyderabad",
                "address_line": "Near Mythrivanam, Ameerpet Main Road",
                "pincode": "500038",
                "rating": 4.6,
                "reviews_count": 52,
                "description": "Furnished single and double sharing rooms with attached bathrooms, high-speed Wi-Fi, and power backup in prime Ameerpet.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&auto=format&fit=crop&q=80",
                    "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(11, 0),
                    "check_out": time(10, 0),
                    "max_guests": 2,
                    "notice_days": 15,
                    "rules": ["Valid government ID required", "Visitors allowed until 8 PM"],
                },
                "unit_types": [
                    {
                        "name": "Single AC Room with Attached Bath",
                        "variant_name": "AC Room (Standard)",
                        "sharing_type": UnitType.SharingType.PRIVATE,
                        "sharing_count": 1,
                        "bhk": "1 Room",
                        "bathrooms": 1,
                        "built_up_sqft": 180,
                        "facing": "East",
                        "floor": "2nd Floor",
                        "is_ac": True,
                        "food_included": False,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["Air Conditioner", "Wi-Fi", "Attached Bathroom", "Geyser", "Housekeeping", "Power Backup"],
                        "image_url": "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 1100000,      # ₹11,000 / month
                        "maintenance_paise": 50000,      # ₹500
                        "deposit_paise": 1500000,        # ₹15,000
                        "units": ["Room 201", "Room 202"],
                    },
                    {
                        "name": "Single Room with Attached Bath",
                        "variant_name": "Single Room (Standard)",
                        "sharing_type": UnitType.SharingType.PRIVATE,
                        "sharing_count": 1,
                        "bhk": "1 Room",
                        "bathrooms": 1,
                        "built_up_sqft": 160,
                        "facing": "North",
                        "floor": "1st Floor",
                        "is_ac": False,
                        "food_included": False,
                        "furnishing_status": UnitType.FurnishingStatus.SEMI_FURNISHED,
                        "amenities": ["Wi-Fi", "Attached Bathroom", "Power Backup"],
                        "image_url": "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 850000,       # ₹8,500 / month
                        "maintenance_paise": 50000,
                        "deposit_paise": 1000000,
                        "units": ["Room 101", "Room 102"],
                    },
                    {
                        "name": "Attached Bathroom Premium Room",
                        "variant_name": "Attached Bathroom Room (Standard)",
                        "sharing_type": UnitType.SharingType.PRIVATE,
                        "sharing_count": 1,
                        "bhk": "1 Room",
                        "bathrooms": 1,
                        "built_up_sqft": 190,
                        "facing": "East",
                        "floor": "3rd Floor",
                        "is_ac": True,
                        "food_included": False,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["Air Conditioner", "Wi-Fi", "Attached Bathroom", "Geyser", "Housekeeping"],
                        "image_url": "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 1200000,      # ₹12,000 / month
                        "maintenance_paise": 50000,
                        "deposit_paise": 1500000,
                        "units": ["Room 301", "Room 302"],
                    },
                    {
                        "name": "Double Sharing Room with Attached Bath",
                        "variant_name": "Double Sharing Room (Standard)",
                        "sharing_type": UnitType.SharingType.DOUBLE,
                        "sharing_count": 2,
                        "bhk": "1 Room",
                        "bathrooms": 1,
                        "built_up_sqft": 220,
                        "facing": "North",
                        "floor": "2nd Floor",
                        "is_ac": True,
                        "food_included": False,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["Air Conditioner", "Wi-Fi", "Attached Bathroom", "Individual Lockers"],
                        "image_url": "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 700000,       # ₹7,000 / month per bed
                        "maintenance_paise": 50000,
                        "deposit_paise": 1000000,
                        "units": ["Bed 203-A", "Bed 203-B"],
                    },
                ],
            },
            {
                "title": "Urban Nest Executive Stays, Madhapur",
                "catalog_subcategory": "Co-Living Spaces",
                "property_type": Property.PropertyType.CO_LIVING,
                "locality": "Madhapur, Hyderabad",
                "address_line": "Near Durgam Cheruvu Metro, Madhapur",
                "pincode": "500081",
                "rating": 4.8,
                "reviews_count": 94,
                "description": "Modern furnished rooms with split AC, attached bathroom, high-speed Wi-Fi, and daily housekeeping near Cyber Towers.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&auto=format&fit=crop&q=80",
                    "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(11, 0),
                    "check_out": time(10, 0),
                    "max_guests": 2,
                    "notice_days": 15,
                    "rules": ["Valid government ID required", "No smoking inside rooms"],
                },
                "unit_types": [
                    {
                        "name": "Deluxe AC Room with Balcony",
                        "variant_name": "Co-Living Room (Standard)",
                        "sharing_type": UnitType.SharingType.PRIVATE,
                        "sharing_count": 1,
                        "bhk": "1 Room",
                        "bathrooms": 1,
                        "built_up_sqft": 200,
                        "facing": "North",
                        "floor": "2nd Floor",
                        "is_ac": True,
                        "food_included": False,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["Air Conditioner", "Balcony", "Wi-Fi", "Attached Bathroom", "Smart TV", "Geyser"],
                        "image_url": "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 1350000,      # ₹13,500 / month
                        "maintenance_paise": 50000,
                        "deposit_paise": 1500000,
                        "units": ["Deluxe 201", "Deluxe 202"],
                    },
                    {
                        "name": "Studio AC Room",
                        "variant_name": "Premium Co-Living (Standard)",
                        "sharing_type": UnitType.SharingType.PRIVATE,
                        "sharing_count": 1,
                        "bhk": "1 RK",
                        "bathrooms": 1,
                        "built_up_sqft": 240,
                        "facing": "East",
                        "floor": "3rd Floor",
                        "is_ac": True,
                        "food_included": False,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["Air Conditioner", "Wi-Fi", "Attached Bathroom", "Mini Fridge", "Work Desk"],
                        "image_url": "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 1600000,      # ₹16,000 / month
                        "maintenance_paise": 50000,
                        "deposit_paise": 2000000,
                        "units": ["Studio 301", "Studio 302"],
                    },
                ],
            },
            {
                "title": "Metro Hub Budget Bed Space, Kukatpally",
                "catalog_subcategory": "Bed Space",
                "property_type": Property.PropertyType.HOSTEL,
                "locality": "Kukatpally, Hyderabad",
                "address_line": "Near KPHB Colony Metro Station",
                "pincode": "500072",
                "rating": 4.4,
                "reviews_count": 36,
                "description": "Affordable bed spaces next to metro station with personal lockers, RO drinking water, and daily housekeeping.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(8, 0),
                    "check_out": time(20, 0),
                    "max_guests": 4,
                    "notice_days": 7,
                    "rules": ["Locker key provided upon check-in", "No smoking on premises"],
                },
                "unit_types": [
                    {
                        "name": "Single Bed Space with Locker",
                        "variant_name": "Single Bed Space (Standard)",
                        "sharing_type": UnitType.SharingType.PRIVATE,
                        "sharing_count": 1,
                        "bhk": "1 Bed",
                        "bathrooms": 1,
                        "built_up_sqft": 80,
                        "facing": "East",
                        "floor": "1st Floor",
                        "is_ac": False,
                        "food_included": False,
                        "furnishing_status": UnitType.FurnishingStatus.SEMI_FURNISHED,
                        "amenities": ["Wi-Fi", "Locker", "RO Water", "CCTV Security"],
                        "image_url": "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 350000,       # ₹3,500 / month
                        "maintenance_paise": 0,
                        "deposit_paise": 350000,
                        "units": ["Bed Space #1", "Bed Space #2"],
                    },
                ],
            },
            {
                "title": "Transit Inn Flexi Short Stays, Hitech City",
                "catalog_subcategory": "Short Stay",
                "property_type": Property.PropertyType.STUDIO_APT,
                "locality": "Hitech City, Hyderabad",
                "address_line": "Near Mindspace IT Park, Madhapur Road",
                "pincode": "500081",
                "rating": 4.7,
                "reviews_count": 68,
                "description": "Convenient daily and weekly serviced studio apartments for business travelers and transit stays.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(12, 0),
                    "check_out": time(11, 0),
                    "max_guests": 2,
                    "notice_days": 1,
                    "rules": ["24x7 front desk reception", "Self check-in keypad available"],
                },
                "unit_types": [
                    {
                        "name": "Daily Transit Room Suite",
                        "variant_name": "Daily Room (Standard)",
                        "sharing_type": UnitType.SharingType.ENTIRE_PLACE,
                        "sharing_count": 1,
                        "bhk": "1 RK",
                        "occupancy_capacity": 2,
                        "bathrooms": 1,
                        "built_up_sqft": 280,
                        "facing": "North",
                        "floor": "4th Floor",
                        "is_ac": True,
                        "food_included": True,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["High-Speed Wi-Fi", "Daily Housekeeping", "Breakfast", "Smart TV", "Air Conditioner"],
                        "image_url": "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&auto=format&fit=crop&q=80",
                        "daily_rate_paise": 150000,       # ₹1,500 / night
                        "base_rate_paise": 2800000,       # ₹28,000 / month
                        "maintenance_paise": 0,
                        "deposit_paise": 500000,
                        "units": ["Transit Suite 401", "Transit Suite 402"],
                    },
                ],
            },
            {
                "title": "Campus Edge Student PG & Hostel, SR Nagar",
                "catalog_subcategory": "Student Accommodation",
                "property_type": Property.PropertyType.HOSTEL,
                "locality": "SR Nagar, Hyderabad",
                "address_line": "Near Coaching Centers, SR Nagar Metro",
                "pincode": "500038",
                "rating": 4.5,
                "reviews_count": 82,
                "description": "Student-centric accommodation with study halls, nutritious 3 times food, high-speed fiber Wi-Fi, and 24x7 power backup.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(7, 0),
                    "check_out": time(21, 0),
                    "max_guests": 3,
                    "notice_days": 15,
                    "rules": ["Study hours enforced after 10 PM", "Student ID proof mandatory"],
                },
                "unit_types": [
                    {
                        "name": "College Nearby Student Hostel Bed",
                        "variant_name": "College Nearby Hostel (Standard)",
                        "sharing_type": UnitType.SharingType.TRIPLE,
                        "sharing_count": 3,
                        "bhk": "1 Room",
                        "bathrooms": 1,
                        "built_up_sqft": 260,
                        "facing": "North-East",
                        "floor": "2nd Floor",
                        "is_ac": True,
                        "food_included": True,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["3 Times Food", "Wi-Fi", "Study Table", "Air Conditioner", "CCTV Security"],
                        "image_url": "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 850000,       # ₹8,500 / month
                        "maintenance_paise": 0,
                        "deposit_paise": 1000000,
                        "units": ["Student Bed 201-A", "Student Bed 201-B", "Student Bed 201-C"],
                    },
                ],
            },
            {
                "title": "Industrial Workforce Quarters, Balanagar",
                "catalog_subcategory": "Worker Accommodation",
                "property_type": Property.PropertyType.HOSTEL,
                "locality": "Balanagar, Hyderabad",
                "address_line": "Phase 2, Industrial Development Area, Balanagar",
                "pincode": "500037",
                "rating": 4.3,
                "reviews_count": 22,
                "description": "Safe, organized, and clean accommodation for industrial staff, construction workers, and factory teams.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(6, 0),
                    "check_out": time(22, 0),
                    "max_guests": 6,
                    "notice_days": 15,
                    "rules": ["Contractor authorization or company ID required", "24x7 security guard on site"],
                },
                "unit_types": [
                    {
                        "name": "Industrial Staff Shared Quarters",
                        "variant_name": "Labour Room (Standard)",
                        "sharing_type": UnitType.SharingType.FOUR_PLUS,
                        "sharing_count": 4,
                        "bhk": "1 Room",
                        "bathrooms": 2,
                        "built_up_sqft": 320,
                        "facing": "East",
                        "floor": "Ground Floor",
                        "is_ac": False,
                        "food_included": False,
                        "furnishing_status": UnitType.FurnishingStatus.SEMI_FURNISHED,
                        "amenities": ["24x7 Water", "Security Guard", "Lockers", "Power Backup"],
                        "image_url": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80",
                        "base_rate_paise": 280000,       # ₹2,800 / month per bed
                        "maintenance_paise": 0,
                        "deposit_paise": 280000,
                        "units": ["Staff Bed #101", "Staff Bed #102", "Staff Bed #103", "Staff Bed #104"],
                    },
                ],
            },
            {
                # HOTEL_ROOM demo property (06-a9-hotels-integration-plan.md Wave H0 step 3):
                # was previously seeded as a VILLA/ENTIRE_UNIT "Executive Suite" -- exactly
                # the mismatch this plan exists to fix. Now a genuine HOTEL property with a
                # room_class UnitType, NIGHTLY pricing, and a per-date UnitPricingOverride so
                # G4's date-aware browse pricing has real demo data to exercise.
                "title": "The Crown Royal Suites & Penthouse, Jubilee Hills",
                "catalog_subcategory": "Hotels",
                "property_type": Property.PropertyType.HOTEL,
                "locality": "Jubilee Hills, Hyderabad",
                "address_line": "Road No. 36, Jubilee Hills",
                "pincode": "500033",
                "rating": 4.9,
                "reviews_count": 34,
                "description": "Bespoke ultra-luxury serviced suites with private infinity terrace, butler service, and panoramic skyline views.",
                "media_urls": [
                    "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&auto=format&fit=crop&q=80",
                ],
                "policy": {
                    "check_in": time(14, 0),
                    "check_out": time(12, 0),
                    "max_guests": 4,
                    "notice_days": 30,
                    "rules": ["Concierge verification mandatory", "Valet parking included"],
                    # Hotel-appropriate cancellation terms (24h flexible) -- see plan section 2:
                    # PropertyPolicy.CancellationPolicy already models this, no schema change needed.
                    "cancellation_policy": PropertyPolicy.CancellationPolicy.FLEXIBLE,
                },
                "unit_types": [
                    {
                        "name": "Bespoke Executive Corporate Suite",
                        "variant_name": "Executive Suite (Standard)",
                        # sharing_type has no null option on the model (unlike bhk); it's
                        # simply never read for HOTEL_ROOM rows since Wave 2's sharing_type
                        # filter is scoped to occupancy_model=SHARED only -- PRIVATE here is
                        # an inert, never-surfaced default, not a real classification.
                        "sharing_type": UnitType.SharingType.PRIVATE,
                        "sharing_count": 1,
                        "bhk": None,
                        "room_class": UnitType.RoomClass.EXECUTIVE,
                        "occupancy_capacity": 2,
                        "bathrooms": 2,
                        "built_up_sqft": 1600,
                        "facing": "North-East",
                        "floor": "Top Floor",
                        "is_ac": True,
                        "food_included": False,
                        "furnishing_status": UnitType.FurnishingStatus.FULLY_FURNISHED,
                        "amenities": ["Private Terrace", "Valet Parking", "Concierge", "Gym Access", "Smart Automation", "Infinity Pool Access"],
                        "image_url": "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&auto=format&fit=crop&q=80",
                        # HOTEL_ROOM properties are deposit_required=False at the variant-config
                        # level (see below) -- deposit_paise kept at 0 here; base_rate_paise below
                        # is a MONTHLY fallback rate that customers should rarely see once NIGHTLY
                        # (daily_rate_paise) is the primary duration mode for this room.
                        "base_rate_paise": 22500000,     # Rs 2,25,000 / month (fallback only)
                        "maintenance_paise": 0,
                        "deposit_paise": 0,
                        "daily_rate_paise": 1800000,     # Rs 18,000 / night (base NIGHTLY rate)
                        "rate_overrides": [
                            # Demonstrates G4: a weekend/festival surge rate distinct from the
                            # base nightly rate, so browse_stays()'s date-aware pricing path
                            # (Wave H2) has a real override to sum against.
                            {"days_from_today": 5, "rate_paise": 2600000, "reason": "Weekend surge"},
                            {"days_from_today": 6, "rate_paise": 2600000, "reason": "Weekend surge"},
                        ],
                        "units": ["Royal Suite #1", "Royal Suite #2"],
                    },
                ],
            },
        ]

        for p_data in demo_properties_data:
            addr, _ = Address.objects.get_or_create(
                customer=demo_user,
                line1=p_data["address_line"],
                defaults={
                    "label": "Property",
                    "locality": p_data["locality"],
                    "city": "Hyderabad",
                    "state": "Telangana",
                    "postal_code": p_data["pincode"],
                    "latitude": Decimal("17.440100"),
                    "longitude": Decimal("78.348900"),
                    "confirmed_at": timezone.now(),
                },
            )

            prop, _ = Property.objects.update_or_create(
                partner=partner_profile,
                title=p_data["title"],
                defaults={
                    "property_type": p_data["property_type"],
                    "locality": p_data["locality"],
                    "address": addr,
                    "description": p_data["description"],
                    "rating": p_data["rating"],
                    "reviews_count": p_data["reviews_count"],
                    "is_active": True,
                },
            )
            prop.service_areas.add(hyderabad_area)

            # Media
            for idx, m_url in enumerate(p_data["media_urls"]):
                PropertyMedia.objects.update_or_create(
                    property=prop,
                    url=m_url,
                    defaults={
                        "is_primary": (idx == 0),
                        "display_order": idx,
                    },
                )

            # Policy
            p_pol = p_data["policy"]
            PropertyPolicy.objects.update_or_create(
                property=prop,
                defaults={
                    "check_in_time": p_pol["check_in"],
                    "check_out_time": p_pol["check_out"],
                    "max_guests_per_unit": p_pol["max_guests"],
                    "notice_period_days": p_pol["notice_days"],
                    "house_rules": p_pol["rules"],
                    "id_verification_required": True,
                    "cancellation_policy": p_pol.get(
                        "cancellation_policy", PropertyPolicy.CancellationPolicy.MODERATE
                    ),
                },
            )

            # UnitTypes and Units
            catalog_subcategory = p_data.get("catalog_subcategory") or ""
            for ut_data in p_data["unit_types"]:
                var_name = ut_data.get("variant_name") or p_data.get("variant_name")
                variant_obj = None
                if var_name and catalog_subcategory:
                    variant_obj = _resolve_stay_variant(str(var_name), catalog_subcategory)
                if variant_obj is None:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Skipping unit type {ut_data['name']!r} on {p_data['title']}: "
                            f"no A9 variant {var_name!r} under subcategory {catalog_subcategory!r}"
                        )
                    )
                    continue

                unit_type, _ = UnitType.objects.update_or_create(
                    property=prop,
                    name=ut_data["name"],
                    defaults={
                        "variant": variant_obj,
                        "sharing_type": ut_data["sharing_type"],
                        "sharing_count": ut_data["sharing_count"],
                        "bhk": ut_data["bhk"],
                        # Wave 2b: ENTIRE_UNIT demo rows carry a real occupancy_capacity
                        # number now instead of relying on sharing_type=ENTIRE_PLACE --
                        # SHARED demo rows leave this unset (None), matching the model's
                        # clean() pairing rule. See plan SS3.2 / SS5 Wave 2 item 3.
                        "occupancy_capacity": ut_data.get("occupancy_capacity"),
                        "room_class": ut_data.get("room_class"),
                        "bathrooms": ut_data["bathrooms"],
                        "built_up_sqft": ut_data["built_up_sqft"],
                        "facing": ut_data["facing"],
                        "floor": ut_data["floor"],
                        "is_ac": ut_data["is_ac"],
                        "food_included": ut_data.get("food_included", False),
                        "furnishing_status": ut_data["furnishing_status"],
                        "amenities": ut_data["amenities"],
                        "image_url": ut_data["image_url"],
                        "is_active": True,
                    },
                )

                # Pricing rule (MONTHLY)
                monthly_rate = ut_data.get("monthly_rate_paise") or ut_data["base_rate_paise"]
                UnitPricingRule.objects.update_or_create(
                    unit_type=unit_type,
                    duration_mode=UnitPricingRule.DurationMode.MONTHLY,
                    defaults={
                        "base_rate_paise": monthly_rate,
                        "maintenance_paise": ut_data.get("maintenance_paise", 0),
                        "deposit_paise": ut_data.get("deposit_paise", 0),
                        "is_active": True,
                    },
                )

                # Pricing rule (DAILY / NIGHTLY if specified)
                nightly_rule = None
                if ut_data.get("daily_rate_paise"):
                    nightly_rule, _ = UnitPricingRule.objects.update_or_create(
                        unit_type=unit_type,
                        duration_mode=UnitPricingRule.DurationMode.NIGHTLY,
                        defaults={
                            "base_rate_paise": ut_data["daily_rate_paise"],
                            "maintenance_paise": 0,
                            "deposit_paise": ut_data.get("deposit_paise", 0),
                            "is_active": True,
                        },
                    )
                    UnitPricingRule.objects.update_or_create(
                        unit_type=unit_type,
                        duration_mode=UnitPricingRule.DurationMode.DAILY,
                        defaults={
                            "base_rate_paise": ut_data["daily_rate_paise"],
                            "maintenance_paise": 0,
                            "deposit_paise": ut_data.get("deposit_paise", 0),
                            "is_active": True,
                        },
                    )

                # Per-date rate overrides (06-a9-hotels-integration-plan.md Wave H0 step 3 /
                # G4): demo data for hotel-style seasonal/weekend surge pricing on the
                # NIGHTLY rule, consumed by create_stay_hold() today and by browse_stays()'s
                # date-aware pricing path once Wave H2 lands.
                if nightly_rule is not None and ut_data.get("rate_overrides"):
                    for override in ut_data["rate_overrides"]:
                        override_date = timezone.localdate() + datetime.timedelta(
                            days=override["days_from_today"]
                        )
                        UnitPricingOverride.objects.update_or_create(
                            pricing_rule=nightly_rule,
                            date=override_date,
                            defaults={
                                "rate_paise": override["rate_paise"],
                                "reason": override.get("reason", ""),
                            },
                        )

                # Physical Units
                for u_code in ut_data["units"]:
                    Unit.objects.update_or_create(
                        property=prop,
                        unit_code=u_code,
                        defaults={
                            "unit_type": unit_type,
                            "floor": ut_data["floor"],
                            "current_status": Unit.Status.ACTIVE,
                        },
                    )

        self.stdout.write(self.style.SUCCESS(f"Successfully seeded {len(demo_properties_data)} demo properties with UnitTypes and Units!"))
