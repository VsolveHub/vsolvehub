"""Seed command for Category 'Career Opportunity or Job Opportunities' (A10_LISTING).

Seeds:
- Category: Career Opportunity or Job Opportunities
- 30 Subcategories and 222 Services/Variants from the authoritative CSV
- A10VariantConfiguration for each variant
- Starter VendorSubscriptionPlans (Starter, Growth, Enterprise)
- Career apply Skill + hiring-partner variant (Partner "Your trades")
- Demo hiring partner with A10_LISTING capability
- Demo published career listings (regular + Featured/premium)
- End-to-end mock flow for customer / partner / operations surfaces
"""

from datetime import timedelta
from pathlib import Path
from typing import Any, TypedDict

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
from apps.listings.models import (
    Application,
    ApplicationStatusEvent,
    Listing,
    ListingModerationEvent,
    VendorSubscription,
    VendorSubscriptionPlan,
)
from apps.locations.models import ServiceArea, ServiceAreaService
from apps.partners.models import (
    PartnerApplication,
    PartnerCapability,
    PartnerProfile,
    Skill,
)

User = get_user_model()


class _DemoListing(TypedDict):
    title: str
    description: str
    location_text: str
    is_premium: bool
    salary_min_paise: int
    salary_max_paise: int
    salary_period: str
    structured_fields: dict[str, str]
    moderation_reason: str


_FALLBACK_CAREER_TAXONOMY: dict[str, list[str]] = {
    "IT & Software Jobs": ["Software Developer", "Full Stack Developer", "QA Engineer"],
    "Retail & Shop Staff": ["Store Associate", "Cashier"],
    "Health Care Jobs": ["Staff Nurse", "Pharmacist"],
}


def _find_csv_path() -> Path | None:
    candidates = [
        settings.BASE_DIR.parent / "V Solve Hub-Categories & Sub Categories.csv",
        settings.BASE_DIR / "V Solve Hub-Categories & Sub Categories.csv",
        Path("/home/srikar/vsolvehub/vsolvehub/V Solve Hub-Categories & Sub Categories.csv"),
        Path("d:/web/VsolveHub/vsolvehub/V Solve Hub-Categories & Sub Categories.csv"),
    ]
    for path in candidates:
        if path.exists():
            return path
    return None


def _load_career_taxonomy(csv_path: Path) -> dict[str, list[str]]:
    with open(csv_path, encoding="latin1") as f:
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
        # A row before any subcategory has nowhere to go: skip it rather than file it under None.
        if (
            current_cat == "Career Opportunity or Job Opportunities"
            and svc
            and current_subcat is not None
        ):
            if current_subcat not in taxonomy:
                taxonomy[current_subcat] = []
            taxonomy[current_subcat].append(svc)

    return taxonomy


class Command(BaseCommand):
    help = "Seeds Career Opportunity or Job Opportunities (A10_LISTING) taxonomy and starter data."

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:  # noqa: PLR0912, PLR0915
        csv_path = _find_csv_path()
        if csv_path is None:
            taxonomy = _FALLBACK_CAREER_TAXONOMY
            self.stdout.write(
                "Category spreadsheet not found; seeding the built-in Career/Jobs fallback taxonomy."
            )
        else:
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
                        "required_skill_code": "career-jobs",
                        "tax_category_code": "listing",
                    },
                )
                if variant.required_skill_code != "career-jobs":
                    variant.required_skill_code = "career-jobs"
                    variant.save(update_fields=("required_skill_code", "updated_at"))
                if first_variant is None:
                    first_variant = variant

                A10VariantConfiguration.objects.update_or_create(
                    variant=variant,
                    version=1,
                    defaults={
                        "status": A10VariantConfiguration.Status.ACTIVE,
                        "application_cooldown_hours": 24,
                        "listing_type_schema": {
                            "type": "object",
                            "properties": {
                                "role_type": {
                                    "type": "string",
                                    "title": "Role Type / Employment",
                                    "enum": ["Full-Time", "Part-Time", "Contract", "Internship"],
                                },
                                "salary_period": {
                                    "type": "string",
                                    "title": "Pay period",
                                    "enum": ["MONTHLY", "YEARLY", "HOURLY"],
                                },
                                "experience_years": {"type": "string", "title": "Experience"},
                                "shift": {
                                    "type": "string",
                                    "title": "Workplace Mode / Shift",
                                    "enum": [
                                        "On-site",
                                        "Hybrid",
                                        "Remote",
                                        "Day",
                                        "Night",
                                        "Rotational",
                                    ],
                                },
                            },
                        },
                        "application_schema": {
                            "type": "object",
                            "properties": {
                                "experience": {
                                    "type": "string",
                                    "title": "Experience / Qualification",
                                },
                                "resume_url": {
                                    "type": "string",
                                    "title": "Resume Link / Portfolio URL",
                                },
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
                "premium_capabilities": ["CANDIDATE_MATCHING"],
                "premium_price_paise": 49900,
            },
            {
                "code": "growth",
                "name": "Growth Plan",
                "price_paise": 249900,
                "duration_days": 60,
                "max_active_listings": 15,
                "premium_capabilities": ["FEATURED_PLACEMENT", "CANDIDATE_MATCHING"],
                "premium_price_paise": 49900,
            },
            {
                "code": "enterprise",
                "name": "Enterprise Plan",
                "price_paise": 499900,
                "duration_days": 90,
                "max_active_listings": 50,
                "premium_capabilities": ["FEATURED_PLACEMENT", "CANDIDATE_MATCHING"],
                "premium_price_paise": 49900,
            },
        ]
        for p in plans_data:
            VendorSubscriptionPlan.objects.update_or_create(
                code=p["code"],
                defaults={
                    "service": None,
                    "name": p["name"],
                    "price_paise": p["price_paise"],
                    "duration_days": p["duration_days"],
                    "max_active_listings": p["max_active_listings"],
                    "premium_capabilities": p["premium_capabilities"],
                    "premium_price_paise": p["premium_price_paise"],
                    "details": (
                        f"Up to {p['max_active_listings']} live job posts for "
                        f"{p['duration_days']} days. Featured placement is an add-on "
                        "when this plan lists FEATURED_PLACEMENT."
                    ),
                    "is_active": True,
                },
            )
        self.stdout.write(self.style.SUCCESS("Seeded 3 VendorSubscriptionPlans."))

        # Partner apply "Your trades" maps categories → Skill codes. Without this
        # row, Career/Jobs is listed but the checkbox is a no-op (no skill to toggle).
        Skill.objects.update_or_create(
            code="career-jobs",
            defaults={
                "name": "Career Opportunity or Job Opportunities",
                "description": (
                    "Hiring / employer partners who post Career & Jobs listings "
                    "(A10_LISTING). Not a field-visit trade skill."
                ),
                "is_active": True,
            },
        )
        # One apply-facing variant under Career so registration can attach a
        # service (submit requires skills + variants). Role taxonomy variants keep
        # their own required_skill_code and are hidden from the trades picker.
        hiring_subcat, _ = Subcategory.objects.get_or_create(
            category=category,
            slug="hiring-partners",
            defaults={
                "name": "Hiring Partners",
                "description": "Employer partners who post job openings on V Solve Hub.",
            },
        )
        hiring_service, _ = Service.objects.get_or_create(
            subcategory=hiring_subcat,
            slug="hiring-partner-job-listings",
            defaults={
                "name": "Job listings (hiring partner)",
                "short_description": "Post and manage Career & Jobs openings.",
                "status": Service.Status.ACTIVE,
            },
        )
        hiring_variant, _ = ServiceVariant.objects.update_or_create(
            service=hiring_service,
            code="career-jobs-hiring-listing",
            defaults={
                "name": "Career & Jobs listing access",
                "pricing_strategy": ServiceVariant.PricingStrategy.FIXED,
                "booking_archetype": ServiceVariant.BookingArchetype.A10_LISTING,
                "required_skill_code": "career-jobs",
                "tax_category_code": "listing",
                "is_active": True,
            },
        )
        A10VariantConfiguration.objects.update_or_create(
            variant=hiring_variant,
            version=1,
            defaults={
                "status": A10VariantConfiguration.Status.ACTIVE,
                "application_cooldown_hours": 24,
                "listing_type_schema": {
                    "type": "object",
                    "properties": {
                        "role_type": {
                            "type": "string",
                            "title": "Role Type / Employment",
                            "enum": ["Full-Time", "Part-Time", "Contract", "Internship"],
                        },
                        "salary_period": {
                            "type": "string",
                            "title": "Pay period",
                            "enum": ["MONTHLY", "YEARLY", "HOURLY"],
                        },
                        "experience_years": {"type": "string", "title": "Experience"},
                        "shift": {
                            "type": "string",
                            "title": "Workplace Mode / Shift",
                            "enum": [
                                "On-site",
                                "Hybrid",
                                "Remote",
                                "Day",
                                "Night",
                                "Rotational",
                            ],
                        },
                    },
                },
                "application_schema": {
                    "type": "object",
                    "properties": {
                        "experience": {
                            "type": "string",
                            "title": "Experience / Qualification",
                        },
                        "resume_url": {
                            "type": "string",
                            "title": "Resume Link / Portfolio URL",
                        },
                    },
                },
            },
        )
        area = ServiceArea.objects.filter(slug="hyderabad-500032").first()
        if area is not None:
            ServiceAreaService.objects.update_or_create(
                service_area=area,
                variant=hiring_variant,
                defaults={"is_active": True},
            )
        if first_variant is None:
            first_variant = hiring_variant
        self.stdout.write(
            self.style.SUCCESS(
                "Seeded career-jobs Skill + hiring-partner apply variant for Your trades."
            )
        )

        # Seed demo employer partner
        demo_user, _ = User.objects.get_or_create(
            phone_number="+919900000088",
            defaults={"full_name": "Apex Staffing Solutions"},
        )
        partner_role, _ = Role.objects.get_or_create(
            code="partner", defaults={"name": "Partner", "is_system": True}
        )
        customer_role, _ = Role.objects.get_or_create(
            code="customer", defaults={"name": "Customer", "is_system": True}
        )
        UserRole.objects.update_or_create(
            user=demo_user, role=partner_role, defaults={"revoked_at": None}
        )
        UserRole.objects.update_or_create(
            user=demo_user, role=customer_role, defaults={"revoked_at": None}
        )
        # Older seed drafts used uppercase PARTNER; FE hasRole expects "partner".
        UserRole.objects.filter(user=demo_user, role__code="PARTNER").delete()

        profile, _ = PartnerProfile.objects.get_or_create(
            user=demo_user,
            defaults={"display_name": "Apex Staffing Solutions"},
        )
        # PartnerShell gates requirePartnerRole on an APPROVED application, not
        # capability alone. Without this row the employer OTP-logs in and lands
        # on /apply instead of /listings (same pattern as seed_trade_partners).
        PartnerApplication.objects.update_or_create(
            partner=profile,
            defaults={"status": PartnerApplication.Status.APPROVED},
        )

        if first_variant:
            PartnerCapability.objects.get_or_create(
                partner=profile,
                archetype=ServiceVariant.BookingArchetype.A10_LISTING,
                defaults={"variant": first_variant, "status": PartnerCapability.Status.APPROVED},
            )

            # Seed published demo listings (regular + premium/Featured for customer browse)
            now = timezone.now()
            demo_listings: list[_DemoListing] = [
                {
                    "title": "Experienced Full Stack Developer",
                    "description": (
                        "Looking for a seasoned Full Stack Developer with Python/Django "
                        "and Next.js experience to join our growing product team."
                    ),
                    "location_text": "Hyderabad, Telangana",
                    "is_premium": False,
                    "salary_min_paise": 80000000,
                    "salary_max_paise": 140000000,
                    "salary_period": "YEARLY",
                    "structured_fields": {
                        "role_type": "Full-Time",
                        "experience_years": "3+ years",
                        "shift": "Day",
                    },
                    "moderation_reason": "Initial demo listing seed.",
                },
                {
                    "title": "Lead QA Engineer — Featured",
                    "description": (
                        "Featured premium placement demo. Hire a Lead QA Engineer for "
                        "automation (Playwright/pytest) and release quality ownership."
                    ),
                    "location_text": "Hyderabad / Hybrid",
                    "is_premium": True,
                    "salary_min_paise": 120000000,
                    "salary_max_paise": 180000000,
                    "salary_period": "YEARLY",
                    "structured_fields": {
                        "role_type": "Full-Time",
                        "experience_years": "5+ years",
                        "shift": "Day",
                    },
                    "moderation_reason": "Demo premium / Featured listing seed.",
                },
            ]
            for demo in demo_listings:
                listing, created = Listing.objects.get_or_create(
                    poster=profile,
                    title=demo["title"],
                    defaults={
                        "variant": first_variant,
                        "description": demo["description"],
                        "location_text": demo["location_text"],
                        "contact_phone": "+919900000088",
                        "contact_email": "careers@apexstaffing.in",
                        "status": Listing.Status.PUBLISHED,
                        "moderation_status": Listing.ModerationStatus.APPROVED,
                        "is_premium": demo["is_premium"],
                        "published_at": now,
                        "expires_at": now + timedelta(days=30),
                        "salary_min_paise": demo["salary_min_paise"],
                        "salary_max_paise": demo["salary_max_paise"],
                        "salary_period": demo["salary_period"],
                        "structured_fields": demo["structured_fields"],
                    },
                )
                if not created:
                    listing.description = demo["description"]
                    listing.location_text = demo["location_text"]
                    listing.status = Listing.Status.PUBLISHED
                    listing.moderation_status = Listing.ModerationStatus.APPROVED
                    listing.is_premium = demo["is_premium"]
                    listing.published_at = listing.published_at or now
                    listing.expires_at = now + timedelta(days=30)
                    listing.salary_min_paise = demo["salary_min_paise"]
                    listing.salary_max_paise = demo["salary_max_paise"]
                    listing.salary_period = demo["salary_period"]
                    listing.structured_fields = demo["structured_fields"]
                    listing.save(
                        update_fields=(
                            "description",
                            "location_text",
                            "status",
                            "moderation_status",
                            "is_premium",
                            "published_at",
                            "expires_at",
                            "salary_min_paise",
                            "salary_max_paise",
                            "salary_period",
                            "structured_fields",
                            "updated_at",
                        )
                    )
                if created:
                    ListingModerationEvent.objects.create(
                        listing=listing,
                        actor=demo_user,
                        action=ListingModerationEvent.Action.PUBLISHED,
                        reason=demo["moderation_reason"],
                    )
                badge = " [Featured]" if listing.is_premium else ""
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{'Created' if created else 'Updated'} demo listing: {listing.title}{badge}"
                    )
                )

            # Older smoke draft that was premium-but-unpublished — make it visible too.
            smoke = Listing.objects.filter(poster=profile, title="Smoke Premium Role").first()
            if smoke is not None and (
                smoke.status != Listing.Status.PUBLISHED or not smoke.is_premium
            ):
                smoke.status = Listing.Status.PUBLISHED
                smoke.moderation_status = Listing.ModerationStatus.APPROVED
                smoke.is_premium = True
                smoke.published_at = smoke.published_at or now
                smoke.expires_at = now + timedelta(days=30)
                smoke.save(
                    update_fields=(
                        "status",
                        "moderation_status",
                        "is_premium",
                        "published_at",
                        "expires_at",
                        "updated_at",
                    )
                )
                self.stdout.write(
                    self.style.SUCCESS("Published existing smoke premium listing for demo.")
                )

            self._seed_complete_demo_flow(
                profile=profile,
                demo_user=demo_user,
                variant=first_variant,
                now=now,
            )

        self.stdout.write(self.style.SUCCESS("seed_listing_catalog completed successfully."))
        self.stdout.write(
            "Demo logins — Customer :3000 /listings  phone 9900000077 | "
            "Partner :3001 /listings  phone 9900000088 | "
            "Operations :3002 /operations/listings  phone 8019013032 (OTP on screen)."
        )

    def _seed_complete_demo_flow(
        self,
        *,
        profile: PartnerProfile,
        demo_user: Any,
        variant: ServiceVariant,
        now: Any,
    ) -> None:
        """Customer applicant + pending ops listing + applications for a full UI walkthrough."""

        enterprise = VendorSubscriptionPlan.objects.filter(code="enterprise").first()
        if enterprise is not None:
            VendorSubscription.objects.update_or_create(
                poster=profile,
                plan=enterprise,
                defaults={
                    "status": VendorSubscription.Status.ACTIVE,
                    "starts_at": now - timedelta(days=1),
                    "ends_at": now + timedelta(days=89),
                },
            )
            self.stdout.write(
                self.style.SUCCESS("Ensured ACTIVE Enterprise subscription for Apex.")
            )

        # Ops moderation queue — submitted, not yet live.
        pending, pending_created = Listing.objects.get_or_create(
            poster=profile,
            title="Office Coordinator — Pending Ops Review",
            defaults={
                "variant": variant,
                "description": (
                    "Demo listing waiting in Operations Job Listings. Approve with a reason "
                    "to publish it for customers."
                ),
                "location_text": "Hyderabad, Telangana",
                "contact_phone": "+919900000088",
                "contact_email": "careers@apexstaffing.in",
                "status": Listing.Status.DRAFT,
                "moderation_status": Listing.ModerationStatus.PENDING,
                "salary_min_paise": 35000000,
                "salary_max_paise": 50000000,
                "salary_period": "YEARLY",
                "structured_fields": {
                    "role_type": "Full-Time",
                    "experience_years": "1-2 years",
                    "shift": "Day",
                },
            },
        )
        if not pending_created:
            pending.status = Listing.Status.DRAFT
            pending.moderation_status = Listing.ModerationStatus.PENDING
            pending.variant = variant
            pending.salary_min_paise = 35000000
            pending.salary_max_paise = 50000000
            pending.salary_period = "YEARLY"
            pending.structured_fields = {
                "role_type": "Full-Time",
                "experience_years": "1-2 years",
                "shift": "Day",
            }
            pending.save(
                update_fields=(
                    "status",
                    "moderation_status",
                    "variant",
                    "salary_min_paise",
                    "salary_max_paise",
                    "salary_period",
                    "structured_fields",
                    "updated_at",
                ),
            )
        if pending_created:
            ListingModerationEvent.objects.create(
                listing=pending,
                actor=demo_user,
                action=ListingModerationEvent.Action.SUBMITTED,
                reason="Demo seed — awaiting Operations review.",
            )
        self.stdout.write(
            self.style.SUCCESS(
                f"{'Created' if pending_created else 'Updated'} ops-queue listing: {pending.title}"
            )
        )

        # Customer applicant (browse + My Applications on :3000).
        applicant, _ = User.objects.get_or_create(
            phone_number="+919900000077",
            defaults={"full_name": "Demo Career Applicant"},
        )
        customer_role, _ = Role.objects.get_or_create(
            code="customer", defaults={"name": "Customer", "is_system": True}
        )
        UserRole.objects.update_or_create(
            user=applicant, role=customer_role, defaults={"revoked_at": None}
        )

        published = list(
            Listing.objects.filter(
                poster=profile,
                status=Listing.Status.PUBLISHED,
                moderation_status=Listing.ModerationStatus.APPROVED,
            ).order_by("title")
        )
        if not published:
            self.stdout.write(self.style.WARNING("No published listings — skipped applicant apps."))
            return

        primary = next(
            (row for row in published if row.title.startswith("Experienced Full Stack")),
            published[0],
        )
        featured = next(
            (row for row in published if "Featured" in row.title or row.is_premium),
            published[-1],
        )

        submitted, created_submitted = Application.objects.get_or_create(
            listing=primary,
            applicant=applicant,
            defaults={
                "status": Application.Status.SUBMITTED,
                "applicant_snapshot": {
                    "full_name": "Demo Career Applicant",
                    "phone_number": "+919900000077",
                },
                "cover_note": (
                    "Demo application — visible on customer My Applications and partner leads."
                ),
                "resume_url": "https://example.test/demo-applicant-resume.pdf",
            },
        )
        if created_submitted:
            ApplicationStatusEvent.objects.create(
                application=submitted,
                actor=applicant,
                from_status="",
                to_status=Application.Status.SUBMITTED,
                kind="SUBMITTED",
                note="Demo seed application.",
            )

        shortlisted, created_shortlisted = Application.objects.get_or_create(
            listing=featured,
            applicant=applicant,
            defaults={
                "status": Application.Status.SHORTLISTED,
                "applicant_snapshot": {
                    "full_name": "Demo Career Applicant",
                    "phone_number": "+919900000077",
                },
                "cover_note": "Demo shortlisted application for partner inbox.",
                "resume_url": "https://example.test/demo-applicant-resume.pdf",
            },
        )
        if not created_shortlisted and shortlisted.status != Application.Status.SHORTLISTED:
            shortlisted.status = Application.Status.SHORTLISTED
            shortlisted.save(update_fields=("status", "updated_at"))
        if created_shortlisted:
            ApplicationStatusEvent.objects.create(
                application=shortlisted,
                actor=demo_user,
                from_status=Application.Status.SUBMITTED,
                to_status=Application.Status.SHORTLISTED,
                kind="SHORTLISTED",
                note="Demo seed shortlist.",
            )

        self.stdout.write(
            self.style.SUCCESS(
                "Seeded customer applicant 9900000077 with submitted + shortlisted applications."
            )
        )
