"""Seed a *second* approved Partner for a variant, so a replacement search has somebody to find.

`seed_trade_partners` deliberately creates one Partner per trade — the skill is what dispatch
matches on, so one is enough to make the catalog staffable. That is exactly one too few to
observe post-payment recovery: `evaluate_unit_candidates` excludes any Partner already holding
an `AssignmentAttempt` on the unit, so when the only qualified Partner releases the job, the
search correctly finds nobody and settles the visit as unstaffable. Nothing is broken; there is
genuinely no one else.

This command adds that someone else. Same trade, same reviewed service area, same hours, same
approvals — a real second candidate rather than a relaxed one, because a replacement who is
eligible only because the fixture lowered the bar would prove nothing about the flow.

Idempotent: rerunning updates the same account in place, keyed on `--suffix`.
"""

from datetime import time
from typing import Any

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import ServiceVariant
from apps.identity.models import Role, User, UserRole
from apps.locations.models import ServiceArea
from apps.partners.management.commands.seed_trade_partners import Command as TradePartnerCommand
from apps.partners.models import (
    PartnerApplication,
    PartnerAvailabilityRule,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)

#: A band of its own, above `seed_trade_partners`' `+9170100xxxxx`, so a rerun of either command
#: can never overwrite the other's accounts.
PHONE_PREFIX = "+9170200"
SERVICE_AREA_SLUG = "hyderabad-500032"
SHIFT_START = time(8)
SHIFT_END = time(20)


class Command(BaseCommand):
    help = "Create a second approved Partner covering the given service variants."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--subcategory",
            default="home-cleaning",
            help=(
                "Trade slug. The Partner is linked to every active variant in it, which is what "
                "makes them a true peer of the Partner they are replacing rather than a "
                "narrower one."
            ),
        )
        parser.add_argument(
            "--variant",
            action="append",
            dest="variants",
            help=(
                "Service variant code, if you want a narrower Partner than the whole trade. "
                "Repeatable. Overrides --subcategory."
            ),
        )
        parser.add_argument(
            "--suffix",
            default="00001",
            help="Five digits appended to the phone prefix. Change it for a third Partner.",
        )
        parser.add_argument(
            "--name",
            default="Second Home Cleaning Pro",
            help="Display name the Customer would see on the replacement card.",
        )

    @transaction.atomic
    def handle(self, *_args: Any, **options: Any) -> None:
        call_command("seed_partner_reference_data")

        area = ServiceArea.objects.filter(slug=SERVICE_AREA_SLUG).first()
        if area is None:
            self.stdout.write(
                self.style.ERROR(
                    f"Service area {SERVICE_AREA_SLUG} does not exist. Seed the catalog first."
                )
            )
            return

        offerable = ServiceVariant.objects.filter(
            is_active=True, service__status="ACTIVE"
        ).select_related("service__subcategory")
        codes = options.get("variants")
        if codes:
            variants = list(offerable.filter(code__in=codes))
            missing = sorted(set(codes) - {variant.code for variant in variants})
        else:
            variants = list(offerable.filter(service__subcategory__slug=options["subcategory"]))
            missing = [] if variants else [options["subcategory"]]
        if missing:
            # Stated, not silently skipped: a Partner seeded against a variant that does not
            # exist is a Partner who will never be offered anything, and the run would look
            # like it succeeded.
            self.stdout.write(
                self.style.ERROR(f"No active variant for: {', '.join(missing)}. Nothing seeded.")
            )
            return

        phone = f"{PHONE_PREFIX}{options['suffix']}"
        partner = self._seed(
            phone=phone, display_name=options["name"], variants=variants, area=area
        )

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Partner ready: {partner.display_name}"))
        self.stdout.write(self.style.SUCCESS(f"  Log in with: {phone}"))
        # Counted rather than listed: `ServiceVariant.code` is unique per service, not
        # globally, so a whole trade lists "standard" a dozen times and reads like a bug.
        self.stdout.write(
            f"  Offers: {len(variants)} active variants across "
            f"{len({variant.service_id for variant in variants})} services"
        )
        self.stdout.write(f"  Area: {area.slug} · {SHIFT_START:%H:%M}-{SHIFT_END:%H:%M} daily")
        self.stdout.write(
            "  Approved, documents on file, current consents accepted — eligible for dispatch."
        )

    def _seed(
        self,
        *,
        phone: str,
        display_name: str,
        variants: list[ServiceVariant],
        area: ServiceArea,
    ) -> PartnerProfile:
        user, _ = User.objects.update_or_create(
            phone_number=phone, defaults={"full_name": display_name}
        )
        # Session login grants `customer` only; the `partner` grant normally comes from
        # `partners.services._draft_application_for_update`, which writing the profile
        # directly skips. Without it the account logs in and cannot switch roles.
        partner_role, _ = Role.objects.get_or_create(
            code="partner", defaults={"name": "Partner", "is_system": True}
        )
        UserRole.objects.update_or_create(
            user=user, role=partner_role, defaults={"revoked_at": None}
        )
        partner, _ = PartnerProfile.objects.update_or_create(
            user=user,
            defaults={
                "display_name": display_name,
                "biography": "Seeded replacement candidate for local development.",
                "experience_years": 4,
            },
        )
        application, _ = PartnerApplication.objects.update_or_create(
            partner=partner, defaults={"status": PartnerApplication.Status.APPROVED}
        )
        # Approval is not a status field on its own: `_assert_operational_eligibility` also
        # demands reviewed documents and accepted consents. Reused from the trade seeder rather
        # than reimplemented, so the two fixtures cannot drift into different ideas of approved.
        TradePartnerCommand._accept_current_consents(partner)
        TradePartnerCommand._approve_required_documents(application)

        for trade_slug in {variant.service.subcategory.slug for variant in variants}:
            skill = Skill.objects.filter(code=trade_slug).first()
            if skill is not None:
                PartnerSkill.objects.update_or_create(
                    partner=partner, skill=skill, defaults={"is_active": True}
                )
        for variant in variants:
            PartnerService.objects.update_or_create(
                partner=partner, variant=variant, defaults={"is_active": True}
            )
        PartnerServiceArea.objects.update_or_create(
            partner=partner, service_area=area, defaults={"is_active": True}
        )
        for weekday in range(7):
            PartnerAvailabilityRule.objects.update_or_create(
                partner=partner,
                service_area=area,
                weekday=weekday,
                defaults={
                    "starts_at": SHIFT_START,
                    "ends_at": SHIFT_END,
                    "is_active": True,
                },
            )
        return partner
