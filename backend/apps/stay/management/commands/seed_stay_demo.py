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
        taxonomy: list[dict[str, Any]] = [
            {
                "sub": "Rooms",
                "services": [
                    {
                        "name": "Room",
                        "schema": {
                            "type": "object",
                            "required": ["occupancy", "furnishing", "ac", "bathroom"],
                            "properties": {
                                "occupancy": {
                                    "type": "string",
                                    "enum": [
                                        "Single",
                                        "Double sharing",
                                        "Triple sharing",
                                        "Four sharing",
                                        "Family",
                                        "Studio",
                                    ],
                                },
                                "furnishing": {
                                    "type": "string",
                                    "enum": ["Furnished", "Semi furnished", "Non furnished"],
                                },
                                "ac": {"type": "string", "enum": ["AC", "Non AC"]},
                                "bathroom": {
                                    "type": "string",
                                    "enum": ["Attached bathroom", "Shared bathroom"],
                                },
                            },
                        },
                    }
                ],
            },
            {
                "sub": "PG Accommodation",
                "services": [
                    {
                        "name": "PG",
                        "schema": {
                            "type": "object",
                            "required": ["gender", "occupant", "food", "ac", "sharing", "tier"],
                            "properties": {
                                "gender": {
                                    "type": "string",
                                    "enum": ["Gents", "Ladies", "Unisex"],
                                },
                                "occupant": {
                                    "type": "string",
                                    "enum": ["Students", "Working professionals"],
                                },
                                "food": {
                                    "type": "string",
                                    "enum": ["Food included", "Without food"],
                                },
                                "ac": {"type": "string", "enum": ["AC", "Non AC"]},
                                "sharing": {
                                    "type": "string",
                                    "enum": ["Single", "Double", "Triple", "Four"],
                                },
                                "tier": {
                                    "type": "string",
                                    "enum": ["Budget", "Standard", "Luxury"],
                                },
                            },
                        },
                    }
                ],
            },
            {
                "sub": "Hostels",
                "services": [
                    {
                        "name": "Hostel",
                        "schema": {
                            "type": "object",
                            "required": ["gender", "occupant", "ac", "hostel_type", "tier"],
                            "properties": {
                                "gender": {
                                    "type": "string",
                                    "enum": ["Gents", "Ladies", "Unisex"],
                                },
                                "occupant": {
                                    "type": "string",
                                    "enum": ["Students", "Working professionals"],
                                },
                                "ac": {"type": "string", "enum": ["AC", "Non AC"]},
                                "hostel_type": {
                                    "type": "string",
                                    "enum": ["Standard", "Dormitory", "Backpacker"],
                                },
                                "tier": {"type": "string", "enum": ["Budget", "Standard"]},
                            },
                        },
                    }
                ],
            },
            {
                "sub": "Bed Space",
                "services": [
                    {
                        "name": "Bed space",
                        "schema": {
                            "type": "object",
                            "required": ["occupancy"],
                            "properties": {
                                "occupancy": {
                                    "type": "string",
                                    "enum": ["Single", "Double", "Shared", "Labour"],
                                },
                                "ac": {"type": "string", "enum": ["AC", "Non AC"]},
                            },
                        },
                    }
                ],
            },
            {
                "sub": "Co-Living Spaces",
                "services": [
                    {
                        "name": "Co-living",
                        "schema": {
                            "type": "object",
                            "required": ["room_type", "tier"],
                            "properties": {
                                "room_type": {
                                    "type": "string",
                                    "enum": ["Private room", "Shared"],
                                },
                                "tier": {
                                    "type": "string",
                                    "enum": ["Standard", "Premium", "Fully managed"],
                                },
                                "wifi": {"type": "boolean"},
                                "food": {"type": "boolean"},
                            },
                        },
                    }
                ],
            },
            {
                "sub": "Apartments",
                "services": [
                    {
                        "name": "Apartment",
                        "schema": {
                            "type": "object",
                            "required": ["layout", "furnishing"],
                            "properties": {
                                "layout": {
                                    "type": "string",
                                    "enum": ["1 RK", "1 BHK", "2 BHK", "3 BHK", "4 BHK"],
                                },
                                "furnishing": {
                                    "type": "string",
                                    "enum": [
                                        "Fully furnished",
                                        "Semi furnished",
                                        "Unfurnished",
                                    ],
                                },
                                "parking": {"type": "boolean"},
                            },
                        },
                    }
                ],
            },
            {
                "sub": "Rental Properties",
                "services": [
                    {
                        "name": "Residential rental",
                        "schema": {
                            "type": "object",
                            "required": ["property_type"],
                            "properties": {
                                "property_type": {
                                    "type": "string",
                                    "enum": [
                                        "Independent house",
                                        "Villa",
                                        "Farm house",
                                        "Studio apartment",
                                        "Serviced apartment",
                                        "Duplex house",
                                    ],
                                },
                                "furnishing": {
                                    "type": "string",
                                    "enum": [
                                        "Furnished",
                                        "Semi furnished",
                                        "Unfurnished",
                                    ],
                                },
                            },
                        },
                    },
                    {
                        "name": "Commercial rental",
                        "schema": {
                            "type": "object",
                            "required": ["property_type"],
                            "properties": {
                                "property_type": {
                                    "type": "string",
                                    "enum": [
                                        "Commercial space",
                                        "Office space",
                                        "Shop space",
                                        "Godown / warehouse",
                                    ],
                                },
                            },
                        },
                    },
                ],
            },
            {
                "sub": "Short Stay",
                "services": [
                    {
                        "name": "Short stay",
                        "schema": {
                            "type": "object",
                            "required": ["duration", "stay_type"],
                            "properties": {
                                "duration": {
                                    "type": "string",
                                    "enum": ["Daily", "Weekly", "Monthly", "Hourly"],
                                },
                                "stay_type": {
                                    "type": "string",
                                    "enum": [
                                        "Room",
                                        "Guest house",
                                        "Service apartment",
                                        "Vacation home",
                                    ],
                                },
                            },
                        },
                    }
                ],
            },
            {
                "sub": "Student Accommodation",
                "services": [
                    {
                        "name": "Student stay",
                        "schema": {
                            "type": "object",
                            "required": ["stay_type"],
                            "properties": {
                                "stay_type": {
                                    "type": "string",
                                    "enum": [
                                        "College nearby hostel",
                                        "College nearby PG",
                                        "Exam stay room",
                                        "Coaching student PG",
                                    ],
                                },
                                "gender": {
                                    "type": "string",
                                    "enum": ["Gents", "Ladies", "Unisex"],
                                },
                                "food": {"type": "boolean"},
                            },
                        },
                    }
                ],
            },
            {
                "sub": "Worker Accommodation",
                "services": [
                    {
                        "name": "Worker stay",
                        "schema": {
                            "type": "object",
                            "required": ["stay_type"],
                            "properties": {
                                "stay_type": {
                                    "type": "string",
                                    "enum": [
                                        "Labour room",
                                        "Labour camp",
                                        "Construction worker stay",
                                        "Factory worker stay",
                                        "Staff accommodation",
                                        "Driver accommodation",
                                    ],
                                },
                                "capacity": {"type": "number"},
                            },
                        },
                    }
                ],
            },
            {
                "sub": "Property Listing",
                "services": [
                    {
                        "name": "Property listing",
                        "schema": {
                            "type": "object",
                            "required": ["listing_type"],
                            "properties": {
                                "listing_type": {
                                    "type": "string",
                                    "enum": [
                                        "Room for rent",
                                        "PG for rent",
                                        "Hostel vacancy",
                                        "Apartment for rent",
                                        "House for rent",
                                        "Villa for rent",
                                        "Commercial space for rent",
                                        "Office space for rent",
                                        "Godown / warehouse for rent",
                                    ],
                                },
                            },
                        },
                    }
                ],
            },
            {
                "sub": "Premium Stays",
                "services": [
                    {
                        "name": "Premium stay",
                        "schema": {
                            "type": "object",
                            "required": ["stay_type"],
                            "properties": {
                                "stay_type": {
                                    "type": "string",
                                    "enum": [
                                        "Luxury apartment",
                                        "Premium villa",
                                        "Executive suite",
                                        "Corporate stay",
                                        "Serviced residence",
                                    ],
                                },
                            },
                        },
                    }
                ],
            },
        ]
        first_variant = None
        keep_service_ids: list[Any] = []
        for group in taxonomy:
            sub_name = str(group["sub"])
            sub, _ = Subcategory.objects.get_or_create(
                category=category,
                slug=slugify(sub_name)[:80],
                defaults={"name": sub_name, "description": f"{sub_name}."},
            )
            for svc_def in group["services"]:
                svc_name = str(svc_def["name"])
                svc, _ = Service.objects.update_or_create(
                    subcategory=sub,
                    slug=slugify(f"{sub.slug}-{svc_name}")[:80],
                    defaults={
                        "name": svc_name,
                        "short_description": svc_name,
                        "status": Service.Status.ACTIVE,
                    },
                )
                keep_service_ids.append(svc.id)
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
                A9VariantConfiguration.objects.update_or_create(
                    variant=variant,
                    version=1,
                    defaults={
                        "status": A9VariantConfiguration.Status.ACTIVE,
                        "property_schema": svc_def["schema"],
                    },
                )
                if first_variant is None:
                    first_variant = variant
        Service.objects.filter(subcategory__category=category).exclude(
            id__in=keep_service_ids
        ).update(status=Service.Status.RETIRED)

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
