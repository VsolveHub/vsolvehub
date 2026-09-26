"""Seed A9 stay catalog + enquiry-first demo data."""

from datetime import timedelta
from typing import Any

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.catalog.models import (
    A9VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.models import Property, PropertyMedia, StayEnquiry, StayReview
from apps.stay.services import create_enquiry, create_property, moderate_property, submit_property

User = get_user_model()


class Command(BaseCommand):
    help = "Seeds A9 stay taxonomy, ACTIVE configs, and demo enquiry E2E data."

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        category, _ = Category.objects.get_or_create(
            slug="rooms-pg-hostel-hotels",
            defaults={
                "name": "Rooms / PG / Hostel / Hotels",
                "description": "Nights in a property unit — enquiry-first MVP.",
            },
        )
        taxonomy = {
    "Rooms": [
        "Single Room", "Double Sharing Room", "Triple Sharing Room", "Four Sharing Room",
        "Family Room", "Studio Room", "Furnished Room", "Semi Furnished Room",
        "Non Furnished Room", "AC Room", "Non AC Room", "Attached Bathroom Room",
        "Shared Bathroom Room",
    ],
    "PG Accommodation": [
        "Gents PG", "Ladies PG", "Students PG", "Working Professionals PG",
        "AC PG", "Non AC PG", "Food Included PG", "Without Food PG",
        "Single Sharing PG", "Double Sharing PG", "Triple Sharing PG",
        "Four Sharing PG", "Luxury PG", "Budget PG",
    ],
    "Hostels": [
        "Gents Hostel", "Ladies Hostel", "Students Hostel",
        "Working Professionals Hostel", "AC Hostel", "Non AC Hostel",
        "Dormitory Hostel", "Backpacker Hostel", "Budget Hostel",
    ],
    "Bed Space": [
        "Single Bed Space", "Double Bed Space", "Shared Bed Space", "Labour Bed Space",
    ],
    "Co-Living Spaces": [
        "Co-Living Room", "Shared Co-Living", "Premium Co-Living", "Fully Managed Co-Living",
    ],
    "Apartments": [
        "1 RK Apartment", "1 BHK Apartment", "2 BHK Apartment", "3 BHK Apartment",
        "4 BHK Apartment", "Fully Furnished Apartment", "Semi Furnished Apartment",
        "Unfurnished Apartment",
    ],
    "Rental Properties": [
        "Independent House", "Villa", "Farm House", "Studio Apartment",
        "Service Apartment", "Duplex House", "Commercial Space",
        "Office Space", "Shop Space", "Godown / Warehouse",
    ],
    "Short Stay": [
        "Daily Room", "Weekly Stay", "Monthly Stay", "Hourly Stay",
        "Guest House", "Service Apartment", "Vacation Home",
    ],
    "Student Accommodation": [
        "College Nearby Hostel", "College Nearby PG", "Exam Stay Room", "Coaching Student PG",
    ],
    "Worker Accommodation": [
        "Labour Room", "Labour Camp", "Construction Worker Stay",
        "Factory Worker Stay", "Staff Accommodation", "Driver Accommodation",
    ],
    "Property Listing": [
        "Room for Rent", "PG for Rent", "Hostel Vacancy", "Apartment for Rent",
        "House for Rent", "Villa for Rent", "Commercial Space for Rent",
        "Office Space for Rent", "Godown / Warehouse for Rent",
    ],
    "Premium Stays": [
        "Luxury Apartment", "Premium Villa", "Executive Suite",
        "Corporate Stay", "Serviced Residence",
    ],
}
        first_variant = None
        for sub_name, services in taxonomy.items():
            sub, _ = Subcategory.objects.get_or_create(
                category=category,
                slug=slugify(sub_name)[:80],
                defaults={"name": sub_name, "description": f"{sub_name}."},
            )
            for svc_name in services:
                svc, _ = Service.objects.get_or_create(
                    subcategory=sub,
                    slug=slugify(f"{sub.slug}-{svc_name}")[:80],
                    defaults={
                        "name": svc_name,
                        "short_description": svc_name,
                        "status": Service.Status.ACTIVE,
                    },
                )
                variant, _ = ServiceVariant.objects.update_or_create(
                    service=svc,
                    code=slugify(f"{svc.slug}-stay")[:64],
                    defaults={
                        "name": f"{svc_name} stay",
                        "pricing_strategy": ServiceVariant.PricingStrategy.FIXED,
                        "booking_archetype": ServiceVariant.BookingArchetype.A9_STAY,
                        "required_skill_code": "stay-host",
                        "tax_category_code": "stay",
                        "is_active": True,
                    },
                )
                property_schema: dict[str, Any] = {}
                if "PG" in sub_name:
                    property_schema = {
                        "type": "object",
                        "properties": {
                            "gender": {"type": "string", "enum": ["GENTS", "LADIES", "UNISEX"]},
                            "food": {"type": "boolean"},
                            "ac": {"type": "boolean"},
                            "sharing": {"type": "number"},
                            "tier": {"type": "string", "enum": ["BUDGET", "LUXURY", "STANDARD"]},
                        },
                    }
                elif "Hostel" in sub_name:
                    property_schema = {
                        "type": "object",
                        "properties": {
                            "gender": {"type": "string", "enum": ["GENTS", "LADIES", "UNISEX"]},
                            "ac": {"type": "boolean"},
                            "hostel_type": {"type": "string"},
                            "sharing": {"type": "number"},
                        },
                    }
                elif "Bed Space" in sub_name:
                    property_schema = {
                        "type": "object",
                        "properties": {
                            "occupancy_type": {"type": "string"},
                            "bed_type": {"type": "string"},
                            "ac": {"type": "boolean"},
                        },
                    }
                elif "Co-Living" in sub_name:
                    property_schema = {
                        "type": "object",
                        "properties": {
                            "room_type": {"type": "string"},
                            "tier": {"type": "string"},
                            "wifi": {"type": "boolean"},
                            "food": {"type": "boolean"},
                        },
                    }
                elif "Apartment" in sub_name:
                    property_schema = {
                        "type": "object",
                        "properties": {
                            "bhk": {"type": "string"},
                            "furnishing": {"type": "string", "enum": ["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"]},
                            "bathrooms": {"type": "number"},
                            "parking": {"type": "boolean"},
                        },
                    }
                elif "Rental Properties" in sub_name:
                    property_schema = {
                        "type": "object",
                        "properties": {
                            "property_type": {"type": "string"},
                            "bhk": {"type": "string"},
                            "furnishing": {"type": "string"},
                            "commercial": {"type": "boolean"},
                        },
                    }
                elif "Short Stay" in sub_name:
                    property_schema = {
                        "type": "object",
                        "properties": {
                            "duration_mode": {"type": "string", "enum": ["DAILY", "WEEKLY", "MONTHLY", "HOURLY"]},
                            "check_in_time": {"type": "string"},
                            "wifi": {"type": "boolean"},
                        },
                    }
                elif "Student" in sub_name:
                    property_schema = {
                        "type": "object",
                        "properties": {
                            "institution_nearby": {"type": "string"},
                            "gender": {"type": "string"},
                            "food": {"type": "boolean"},
                            "curfew": {"type": "string"},
                        },
                    }
                elif "Worker" in sub_name:
                    property_schema = {
                        "type": "object",
                        "properties": {
                            "worker_type": {"type": "string"},
                            "capacity": {"type": "number"},
                            "transport_provided": {"type": "boolean"},
                        },
                    }
                elif "Property Listing" in sub_name:
                    property_schema = {
                        "type": "object",
                        "properties": {
                            "listing_type": {"type": "string"},
                            "bhk": {"type": "string"},
                            "deposit": {"type": "number"},
                        },
                    }
                elif "Premium" in sub_name:
                    property_schema = {
                        "type": "object",
                        "properties": {
                            "tier": {"type": "string"},
                            "duration_mode": {"type": "string"},
                            "amenities": {"type": "string"},
                        },
                    }
                else:
                    property_schema = {
                        "type": "object",
                        "properties": {
                            "room_type": {"type": "string"},
                            "sharing": {"type": "number"},
                            "ac": {"type": "boolean"},
                            "bathroom": {"type": "string"},
                            "furnishing": {"type": "string"},
                        },
                    }

                A9VariantConfiguration.objects.update_or_create(
                    variant=variant,
                    version=1,
                    defaults={
                        "status": A9VariantConfiguration.Status.ACTIVE,
                        "property_schema": property_schema,
                    },
                )
                if first_variant is None:
                    first_variant = variant

        assert first_variant is not None

        host_user, _ = User.objects.get_or_create(
            phone_number="+919900000044",
            defaults={"full_name": "Lakeview PG Host"},
        )
        partner_role, _ = Role.objects.get_or_create(
            code="partner", defaults={"name": "Partner", "is_system": True}
        )
        UserRole.objects.update_or_create(
            user=host_user, role=partner_role, defaults={"revoked_at": None}
        )
        customer_role, _ = Role.objects.get_or_create(
            code="customer", defaults={"name": "Customer", "is_system": True}
        )
        UserRole.objects.update_or_create(
            user=host_user, role=customer_role, defaults={"revoked_at": None}
        )
        profile, _ = PartnerProfile.objects.get_or_create(
            user=host_user, defaults={"display_name": "Lakeview PG"}
        )
        PartnerApplication.objects.update_or_create(
            partner=profile, defaults={"status": PartnerApplication.Status.APPROVED}
        )
        PartnerCapability.objects.get_or_create(
            partner=profile,
            archetype=ServiceVariant.BookingArchetype.A9_STAY,
            defaults={
                "variant": first_variant,
                "status": PartnerCapability.Status.APPROVED,
            },
        )

        prop = Property.objects.filter(host=profile, title="Lakeview Double Sharing — Demo").first()
        if prop is None:
            prop = create_property(
                host=profile,
                variant_id=first_variant.id,
                title="Lakeview Double Sharing — Demo",
                description="High quality double sharing PG with attached bathroom, air conditioning, and 3 home-style meals included.",
                location_text="Gachibowli, Hyderabad",
                unit_name="Double sharing AC",
                nightly_rate_paise=85000,
                sharing_count=2,
            )
            prop.structured_fields = {
                "ac": True,
                "food": True,
                "wifi": True,
                "power_backup": True,
                "cleaning": True,
                "room_type": "DOUBLE_SHARING",
            }
            prop.cancellation_policy_text = "Free cancellation up to 24 hours before check-in. 50% charge thereafter."
            prop.house_rules = "No smoking in rooms. Gate closes at 11 PM. Visitors allowed in lounge only."
            prop.save(update_fields=("structured_fields", "cancellation_policy_text", "house_rules", "moderation_status", "updated_at"))
            submit_property(prop=prop, host=profile)
            moderate_property(
                prop=prop,
                actor=host_user,
                action="APPROVE",
                reason="Demo seed approve for customer browse.",
            )
        else:
            prop.structured_fields = {
                "ac": True,
                "food": True,
                "wifi": True,
                "power_backup": True,
                "cleaning": True,
                "room_type": "DOUBLE_SHARING",
            }
            prop.cancellation_policy_text = "Free cancellation up to 24 hours before check-in. 50% charge thereafter."
            prop.house_rules = "No smoking in rooms. Gate closes at 11 PM. Visitors allowed in lounge only."
            prop.moderation_status = Property.ModerationStatus.APPROVED
            prop.save(update_fields=("structured_fields", "cancellation_policy_text", "house_rules", "moderation_status", "updated_at"))

        # Add single room private stay
        single_prop = Property.objects.filter(host=profile, title="Cyber Towers Executive Single Room").first()
        if single_prop is None:
            single_prop = create_property(
                host=profile,
                variant_id=first_variant.id,
                title="Cyber Towers Executive Single Room",
                description="Spacious private single room for working professionals with dedicated workstation, superfast WiFi, and daily housekeeping.",
                location_text="Hitec City, Hyderabad",
                unit_name="Executive Single AC Room",
                nightly_rate_paise=160000,
                sharing_count=1,
            )
            single_prop.structured_fields = {
                "ac": True,
                "food": True,
                "wifi": True,
                "power_backup": True,
                "workstation": True,
                "room_type": "PRIVATE_ROOM",
            }
            single_prop.cancellation_policy_text = "Standard flexible cancellation: full refund 48 hours prior."
            single_prop.house_rules = "Quiet hours after 10 PM. No pets allowed."
            single_prop.save(update_fields=("structured_fields", "cancellation_policy_text", "house_rules", "moderation_status", "updated_at"))
            submit_property(prop=single_prop, host=profile)
            moderate_property(
                prop=single_prop,
                actor=host_user,
                action="APPROVE",
                reason="Executive single room approved.",
            )
        else:
            single_prop.cancellation_policy_text = "Standard flexible cancellation: full refund 48 hours prior."
            single_prop.house_rules = "Quiet hours after 10 PM. No pets allowed."
            single_prop.save(update_fields=("cancellation_policy_text", "house_rules", "updated_at"))

        pending = Property.objects.filter(host=profile, title="Pending Ops Hostel Bed").first()
        if pending is None:
            pending = create_property(
                host=profile,
                variant_id=first_variant.id,
                title="Pending Ops Hostel Bed",
                description="Ops queue demo — approve with a reason.",
                location_text="Hyderabad",
                unit_name="Bed",
                nightly_rate_paise=45000,
            )
            submit_property(prop=pending, host=profile)

        # Property Media galleries
        PropertyMedia.objects.get_or_create(
            property=prop,
            url="https://picsum.photos/seed/stay1/800/600",
            defaults={"caption": "Spacious Double Sharing Room", "display_order": 0},
        )
        PropertyMedia.objects.get_or_create(
            property=prop,
            url="https://picsum.photos/seed/stay2/800/600",
            defaults={"caption": "Common Dining & Lounge Area", "display_order": 1},
        )
        PropertyMedia.objects.get_or_create(
            property=prop,
            url="https://picsum.photos/seed/stay3/800/600",
            defaults={"caption": "Modern Attached Washroom", "display_order": 2},
        )
        PropertyMedia.objects.get_or_create(
            property=single_prop,
            url="https://picsum.photos/seed/stay4/800/600",
            defaults={"caption": "Executive Single AC Room", "display_order": 0},
        )
        PropertyMedia.objects.get_or_create(
            property=single_prop,
            url="https://picsum.photos/seed/stay5/800/600",
            defaults={"caption": "Dedicated Workstation", "display_order": 1},
        )
        PropertyMedia.objects.get_or_create(
            property=pending,
            url="https://picsum.photos/seed/stay6/800/600",
            defaults={"caption": "Hostel Bed Space", "display_order": 0},
        )

        customer, _ = User.objects.get_or_create(
            phone_number="+919900000033",
            defaults={"full_name": "Demo Stay Guest"},
        )
        customer_role, _ = Role.objects.get_or_create(
            code="customer", defaults={"name": "Customer", "is_system": True}
        )
        UserRole.objects.update_or_create(
            user=customer, role=customer_role, defaults={"revoked_at": None}
        )
        UserRole.objects.update_or_create(
            user=customer, role=partner_role, defaults={"revoked_at": None}
        )

        enquiry = StayEnquiry.objects.filter(customer=customer, property=prop).first()
        if enquiry is None:
            check_in = timezone.localdate() + timedelta(days=7)
            enquiry = create_enquiry(
                customer=customer,
                property_id=prop.id,
                check_in=check_in,
                check_out=check_in + timedelta(days=30),
                guest_count=1,
                message="Demo enquiry — looking for a double sharing PG near Gachibowli.",
            )
        enquiry.status = StayEnquiry.Status.CONFIRMED
        enquiry.save(update_fields=("status", "updated_at"))

        StayReview.objects.get_or_create(
            property=prop,
            customer=customer,
            defaults={
                "enquiry": enquiry,
                "rating": 5,
                "body": "Excellent stay! Clean rooms, fast WiFi, and delicious food provided daily.",
                "comment": "Excellent stay! Clean rooms, fast WiFi, and delicious food provided daily.",
                "image_urls": ["https://picsum.photos/seed/review1/800/600"],
            },
        )

        self.stdout.write(self.style.SUCCESS("seed_stay_demo completed."))
        self.stdout.write(
            "Demo — Customer :3000 /stays phone 9900000033 | "
            "Partner :3001 /stays phone 9900000044 | "
            "Ops :3002 /operations/stays phone 8019013032"
        )
