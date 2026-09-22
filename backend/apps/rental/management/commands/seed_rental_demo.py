"""Seed A7 rental catalog + demo partner/customer/ops walkthrough data."""

from datetime import timedelta
from typing import Any

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.catalog.models import A7VariantConfiguration, Category, Service, ServiceVariant, Subcategory
from apps.identity.models import Role, UserRole
from apps.partners.models import PartnerApplication, PartnerCapability, PartnerProfile
from apps.rental.models import RentalAsset, RentalBooking
from apps.rental.services import create_asset, create_booking, moderate_asset, submit_asset

User = get_user_model()


class Command(BaseCommand):
    help = "Seeds A7 rental taxonomy, ACTIVE configs, and demo rental E2E data."

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        category, _ = Category.objects.get_or_create(
            slug="rental-services",
            defaults={
                "name": "Rental Services",
                "description": "Temporary possession of tools, appliances, and equipment.",
            },
        )
        taxonomy = {
            "Tools & Machinery": ["Drill Machine", "Angle Grinder"],
            "Home Appliance Rental": ["AC Rental", "Refrigerator Rental"],
        }
        first_variant = None
        for sub_name, services in taxonomy.items():
            sub, _ = Subcategory.objects.get_or_create(
                category=category,
                slug=slugify(sub_name)[:80],
                defaults={"name": sub_name, "description": f"{sub_name} rentals."},
            )
            for svc_name in services:
                svc, _ = Service.objects.get_or_create(
                    subcategory=sub,
                    slug=slugify(f"{sub.slug}-{svc_name}")[:80],
                    defaults={
                        "name": svc_name,
                        "short_description": f"Rent a {svc_name}",
                        "status": Service.Status.ACTIVE,
                    },
                )
                variant, _ = ServiceVariant.objects.update_or_create(
                    service=svc,
                    code=slugify(f"{svc.slug}-rental")[:64],
                    defaults={
                        "name": f"{svc_name} rental",
                        "pricing_strategy": ServiceVariant.PricingStrategy.FIXED,
                        "booking_archetype": ServiceVariant.BookingArchetype.A7_RENTAL,
                        "required_skill_code": "rental-services",
                        "tax_category_code": "rental",
                        "is_active": True,
                    },
                )
                A7VariantConfiguration.objects.get_or_create(
                    variant=variant,
                    version=1,
                    defaults={
                        "status": A7VariantConfiguration.Status.ACTIVE,
                        "default_deposit_paise": 200000,
                        "min_rental_days": 1,
                        "deposit_required": True,
                    },
                )
                if first_variant is None:
                    first_variant = variant

        assert first_variant is not None

        owner_user, _ = User.objects.get_or_create(
            phone_number="+919900000066",
            defaults={"full_name": "Hyderabad Tool Rentals"},
        )
        partner_role, _ = Role.objects.get_or_create(
            code="partner", defaults={"name": "Partner", "is_system": True}
        )
        UserRole.objects.update_or_create(
            user=owner_user, role=partner_role, defaults={"revoked_at": None}
        )
        profile, _ = PartnerProfile.objects.get_or_create(
            user=owner_user, defaults={"display_name": "Hyderabad Tool Rentals"}
        )
        PartnerApplication.objects.update_or_create(
            partner=profile, defaults={"status": PartnerApplication.Status.APPROVED}
        )
        PartnerCapability.objects.get_or_create(
            partner=profile,
            archetype=ServiceVariant.BookingArchetype.A7_RENTAL,
            defaults={
                "variant": first_variant,
                "status": PartnerCapability.Status.APPROVED,
            },
        )

        asset = RentalAsset.objects.filter(partner=profile, title="Bosch Drill — Demo").first()
        if asset is None:
            asset = create_asset(
                partner=profile,
                variant_id=first_variant.id,
                title="Bosch Drill — Demo",
                description="Seeded A7 demo asset for browse → book → handover → return.",
                location_text="Hyderabad, Telangana",
                daily_rate_paise=49900,
                deposit_paise=200000,
                asset_identifier="DEMO-DRILL-001",
            )
            submit_asset(asset=asset, partner=profile)
            moderate_asset(
                asset=asset,
                actor=owner_user,
                action="APPROVE",
                reason="Demo seed approve for customer browse.",
            )
        else:
            asset.moderation_status = "APPROVED"
            asset.current_status = RentalAsset.Status.ACTIVE
            asset.save(update_fields=("moderation_status", "current_status", "updated_at"))

        # Second approved rental asset: Carpentry & Hand Tool Kit
        carpenter_kit = RentalAsset.objects.filter(
            partner=profile, title="Stanley Pro Carpentry Tool Kit"
        ).first()
        if carpenter_kit is None:
            carpenter_kit = create_asset(
                partner=profile,
                variant_id=first_variant.id,
                title="Stanley Pro Carpentry Tool Kit",
                description="Complete professional woodworking kit including claw hammer, precision chisels, block plane, try square, and heavy-duty clamps.",
                location_text="Madhapur, Hyderabad",
                daily_rate_paise=29900,
                deposit_paise=120000,
                asset_identifier="STANLEY-CARP-002",
            )
            submit_asset(asset=carpenter_kit, partner=profile)
            moderate_asset(
                asset=carpenter_kit,
                actor=owner_user,
                action="APPROVE",
                reason="Woodworking and carpenter demo asset.",
            )
        else:
            carpenter_kit.moderation_status = "APPROVED"
            carpenter_kit.current_status = RentalAsset.Status.ACTIVE
            carpenter_kit.save(update_fields=("moderation_status", "current_status", "updated_at"))

        pending = RentalAsset.objects.filter(
            partner=profile, title="Angle Grinder — Pending Ops"
        ).first()
        if pending is None:
            pending = create_asset(
                partner=profile,
                variant_id=first_variant.id,
                title="Angle Grinder — Pending Ops",
                description="Ops queue demo — approve with a reason.",
                location_text="Hyderabad",
                daily_rate_paise=39900,
                deposit_paise=150000,
            )
            submit_asset(asset=pending, partner=profile)

        customer, _ = User.objects.get_or_create(
            phone_number="+919900000055",
            defaults={"full_name": "Demo Rental Customer"},
        )
        customer_role, _ = Role.objects.get_or_create(
            code="customer", defaults={"name": "Customer", "is_system": True}
        )
        UserRole.objects.update_or_create(
            user=customer, role=customer_role, defaults={"revoked_at": None}
        )

        if not RentalBooking.objects.filter(customer=customer, asset=asset).exists():
            start = timezone.localdate() + timedelta(days=2)
            end = start + timedelta(days=3)
            create_booking(
                customer=customer,
                asset_id=asset.id,
                start_date=start,
                end_date=end,
                notes="Seeded demo rental booking with PARTIAL deposit hold.",
            )

        self.stdout.write(self.style.SUCCESS("seed_rental_demo completed."))
        self.stdout.write(
            "Demo — Customer :3000 /rentals phone 9900000055 | "
            "Partner :3001 /rentals phone 9900000066 | "
            "Ops :3002 /operations/rentals phone 8019013032"
        )
