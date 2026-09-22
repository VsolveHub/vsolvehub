"""Seed A9 stay catalog + enquiry-first demo data."""

from datetime import timedelta
from typing import Any

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.catalog.models import A9VariantConfiguration, Category, Service, ServiceVariant, Subcategory
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.stay.models import Property, StayEnquiry
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
            "PG Accommodation": ["Single Sharing PG", "Double Sharing PG"],
            "Hostels": ["Hostel Bed"],
            "Short Stay": ["Studio Short Stay"],
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
                A9VariantConfiguration.objects.get_or_create(
                    variant=variant,
                    version=1,
                    defaults={"status": A9VariantConfiguration.Status.ACTIVE},
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
            prop.save(update_fields=("structured_fields",))
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
            prop.moderation_status = Property.ModerationStatus.APPROVED
            prop.save(update_fields=("structured_fields", "moderation_status", "updated_at"))

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
            single_prop.save(update_fields=("structured_fields",))
            submit_property(prop=single_prop, host=profile)
            moderate_property(
                prop=single_prop,
                actor=host_user,
                action="APPROVE",
                reason="Executive single room approved.",
            )

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

        if not StayEnquiry.objects.filter(customer=customer, property=prop).exists():
            check_in = timezone.localdate() + timedelta(days=7)
            create_enquiry(
                customer=customer,
                property_id=prop.id,
                check_in=check_in,
                check_out=check_in + timedelta(days=30),
                guest_count=1,
                message="Demo enquiry — looking for a double sharing PG near Gachibowli.",
            )

        self.stdout.write(self.style.SUCCESS("seed_stay_demo completed."))
        self.stdout.write(
            "Demo — Customer :3000 /stays phone 9900000033 | "
            "Partner :3001 /stays phone 9900000044 | "
            "Ops :3002 /operations/stays phone 8019013032"
        )
