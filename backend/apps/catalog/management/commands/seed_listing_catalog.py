"""Seed command for Category 'Career Opportunity or Job Opportunities' (A10_LISTING).

Seeds:
- Category: Career Opportunity or Job Opportunities
- 30 Subcategories and 222 Services/Variants from the authoritative CSV
- A10VariantConfiguration for each variant
- Starter VendorSubscriptionPlans (Starter, Growth, Enterprise)
- Demo hiring partner with A10_LISTING capability
- Demo published career listing
"""

import csv
from pathlib import Path
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.catalog.models import (
    A10VariantConfiguration,
    Category,
    Service,
    ServiceVariant,
    Subcategory,
)
from apps.identity.models import Role, UserRole
from apps.listings.models import Listing, ListingModerationEvent, VendorSubscriptionPlan
from apps.partners.models import (
    PartnerCapability,
    PartnerProfile,
)

User = get_user_model()


def _find_csv_path() -> Path:
    candidates = [
        settings.BASE_DIR.parent / "V Solve Hub-Categories & Sub Categories.csv",
        settings.BASE_DIR / "V Solve Hub-Categories & Sub Categories.csv",
        Path("d:/web/VsolveHub/vsolvehub/V Solve Hub-Categories & Sub Categories.csv"),
    ]
    for p in candidates:
        if p.exists():
            return p
    raise FileNotFoundError("Could not find 'V Solve Hub-Categories & Sub Categories.csv'")


def _load_career_taxonomy(csv_path: Path) -> dict[str, list[str]]:
    with open(csv_path, "r", encoding="latin1") as f:
        lines = [line.rstrip("\r\n") for line in f]

    current_cat = None
    current_subcat = None
    taxonomy: dict[str, list[str]] = {}

    for line in lines[1:]:
        parts = [p.strip() for p in line.split(",")]
        cat = parts[0] if len(parts) > 0 and parts[0] else None
        subcat = parts[1] if len(parts) > 1 and parts[1] else None
        svc = parts[2] if len(parts) > 2 and parts[2] else None

        if cat:
            current_cat = cat
            current_subcat = None
        if subcat:
            current_subcat = subcat
        if current_cat == "Career Opportunity or Job Opportunities" and svc:
            if current_subcat not in taxonomy:
                taxonomy[current_subcat] = []
            taxonomy[current_subcat].append(svc)

    return taxonomy


class Command(BaseCommand):
    help = "Seeds Career Opportunity or Job Opportunities (A10_LISTING) taxonomy and starter data."

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        csv_path = _find_csv_path()
        taxonomy = _load_career_taxonomy(csv_path)

        self.stdout.write(f"Loaded {len(taxonomy)} subcategories from CSV.")

        category, _ = Category.objects.get_or_create(
            slug="career-jobs",
            defaults={
                "name": "Career Opportunity or Job Opportunities",
                "description": "Local job listings, professional roles, and career opportunities.",
            },
        )
        if category.name != "Career Opportunity or Job Opportunities":
            category.name = "Career Opportunity or Job Opportunities"
            category.save(update_fields=("name",))

        total_services_created = 0
        first_variant = None

        for subcat_name, service_names in taxonomy.items():
            subcat_slug = slugify(subcat_name)
            subcategory, _ = Subcategory.objects.get_or_create(
                category=category,
                slug=subcat_slug,
                defaults={"name": subcat_name, "description": f"{subcat_name} roles and postings."},
            )

            for svc_name in service_names:
                svc_slug = slugify(f"{subcat_slug}-{svc_name}")[:80]
                service, _ = Service.objects.get_or_create(
                    subcategory=subcategory,
                    slug=svc_slug,
                    defaults={
                        "name": svc_name,
                        "short_description": f"Hiring for {svc_name}",
                        "status": Service.Status.ACTIVE,
                    },
                )

                var_code = slugify(f"{svc_slug}-listing")[:64]
                variant, _ = ServiceVariant.objects.get_or_create(
                    service=service,
                    code=var_code,
                    defaults={
                        "name": f"{svc_name} listing",
                        "pricing_strategy": ServiceVariant.PricingStrategy.FIXED,
                        "booking_archetype": ServiceVariant.BookingArchetype.A10_LISTING,
                        "required_skill_code": svc_slug[:32],
                        "tax_category_code": "listing",
                    },
                )
                if first_variant is None:
                    first_variant = variant

                A10VariantConfiguration.objects.get_or_create(
                    variant=variant,
                    version=1,
                    defaults={
                        "status": A10VariantConfiguration.Status.ACTIVE,
                        "application_cooldown_hours": 24,
                        "listing_type_schema": {
                            "type": "object",
                            "properties": {
                                "role_type": {"type": "string"},
                                "salary_range": {"type": "string"},
                                "experience_years": {"type": "string"},
                                "shift": {"type": "string"},
                            },
                        },
                        "application_schema": {
                            "type": "object",
                            "properties": {
                                "experience": {"type": "string"},
                                "portfolio_url": {"type": "string"},
                            },
                        },
                    },
                )
                total_services_created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully seeded category with {len(taxonomy)} subcategories and {total_services_created} services/variants."
            )
        )

        # Seed subscription plans
        plans_data = [
            {
                "code": "starter",
                "name": "Starter Plan",
                "price_paise": 99900,
                "duration_days": 30,
                "max_active_listings": 5,
                "premium_capabilities": [],
            },
            {
                "code": "growth",
                "name": "Growth Plan",
                "price_paise": 249900,
                "duration_days": 60,
                "max_active_listings": 15,
                "premium_capabilities": ["FEATURED_PLACEMENT"],
            },
            {
                "code": "enterprise",
                "name": "Enterprise Plan",
                "price_paise": 499900,
                "duration_days": 90,
                "max_active_listings": 50,
                "premium_capabilities": ["FEATURED_PLACEMENT", "PRIORITY_MODERATION"],
            },
        ]
        for p in plans_data:
            VendorSubscriptionPlan.objects.update_or_create(
                code=p["code"],
                defaults={
                    "name": p["name"],
                    "price_paise": p["price_paise"],
                    "duration_days": p["duration_days"],
                    "max_active_listings": p["max_active_listings"],
                    "premium_capabilities": p["premium_capabilities"],
                    "is_active": True,
                },
            )
        self.stdout.write(self.style.SUCCESS("Seeded 3 VendorSubscriptionPlans."))

        # Seed demo employer partner
        demo_user, _ = User.objects.get_or_create(
            phone_number="+919900000088",
            defaults={"full_name": "Apex Staffing Solutions"},
        )
        partner_role, _ = Role.objects.get_or_create(code="PARTNER", defaults={"name": "Partner"})
        UserRole.objects.get_or_create(user=demo_user, role=partner_role)

        profile, _ = PartnerProfile.objects.get_or_create(
            user=demo_user,
            defaults={"display_name": "Apex Staffing Solutions"},
        )

        if first_variant:
            PartnerCapability.objects.get_or_create(
                partner=profile,
                archetype=ServiceVariant.BookingArchetype.A10_LISTING,
                defaults={"variant": first_variant, "status": PartnerCapability.Status.APPROVED},
            )

            # Seed a published demo listing
            now = timezone.now()
            listing, created = Listing.objects.get_or_create(
                poster=profile,
                title="Experienced Full Stack Developer",
                defaults={
                    "variant": first_variant,
                    "description": "Looking for a seasoned Full Stack Developer with Python/Django and Next.js experience to join our growing product team.",
                    "location_text": "Hyderabad, Telangana",
                    "contact_phone": "+919900000088",
                    "contact_email": "careers@apexstaffing.in",
                    "status": Listing.Status.PUBLISHED,
                    "moderation_status": Listing.ModerationStatus.APPROVED,
                    "published_at": now,
                    "expires_at": now + timezone.timedelta(days=30),
                    "structured_fields": {
                        "role_type": "Full Time",
                        "salary_range": "₹8,00,000 - ₹14,00,000 / year",
                        "experience_years": "3+ years",
                        "shift": "Day Shift",
                    },
                },
            )
            if created:
                ListingModerationEvent.objects.create(
                    listing=listing,
                    actor=demo_user,
                    action=ListingModerationEvent.Action.PUBLISHED,
                    reason="Initial demo listing seed.",
                )
                self.stdout.write(self.style.SUCCESS(f"Created demo listing: {listing.title}"))

        self.stdout.write(self.style.SUCCESS("seed_listing_catalog completed successfully."))
