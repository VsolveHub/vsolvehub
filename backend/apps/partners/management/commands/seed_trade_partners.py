"""Give every trade in the catalog at least one Partner who can actually take the work.

The catalog grew to 41 trades; the seeded Partners were almost all electricians. Dispatch matches
`ServiceVariant.required_skill_code` against an approved Partner's active `PartnerService` rows,
so a trade with nobody behind it produces services that price, schedule and then fail to staff —
the grid shows no capacity, and a Customer who books anyway lands on `REPLAN_REQUIRED`. A catalog
selling work nobody can do is worse than a smaller catalog.

One Partner per trade, not per service. The skill is what dispatch matches on, so one approved
electrician covers every electrician task; seeding one per service would be hundreds of accounts
saying the same thing.

Every seeded Partner is approved, linked to every active variant in their trade, attached to the
reviewed M1 service area and available 08:00-20:00 daily — which is what "staffable" means to
`carts.availability`. Anything less produces a Partner who exists but never appears in a grid,
which is the failure this command is written to prevent rather than reproduce.

## Approved means what Django means by it

Being approved is not a status field on its own. `_assert_operational_eligibility` also requires
the identity documents a reviewer signed off and the consents an applicant accepted; writing
APPROVED and stopping there — as an earlier version of this command did — produces a Partner the
domain calls approved and `presence/online` refuses with a 403, the exact trap
`seed_test_partner` was written to avoid. This command satisfies the same invariants.

Idempotent: reruns update in place, keyed on the phone number derived from the trade.
"""

from datetime import time
from typing import Any

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import ServiceVariant, Subcategory
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

#: A band of its own so these never collide with the demo, density or test-partner seeds, each of
#: which owns its own range.
PHONE_PREFIX = "+9170100"
SERVICE_AREA_SLUG = "hyderabad-500032"
SHIFT_START = time(8)
SHIFT_END = time(20)
SEED_DOCUMENT_VERSION = 1


class Command(BaseCommand):
    help = "Create one approved, available Partner for every trade in the catalog."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--category",
            action="append",
            dest="categories",
            help="Limit to one category slug. Repeatable. Defaults to every category.",
        )

    @transaction.atomic
    def handle(self, *_args: Any, **options: Any) -> None:
        # Consents can only be accepted against a published document. Idempotent on its own
        # side — see its docstring — so calling it here does not risk clobbering real text.
        call_command("seed_partner_reference_data")

        area = ServiceArea.objects.filter(slug=SERVICE_AREA_SLUG).first()
        if area is None:
            self.stdout.write(
                self.style.ERROR(
                    f"Service area {SERVICE_AREA_SLUG} does not exist. Seed the catalog first — "
                    "a Partner with no area is invisible to every grid."
                )
            )
            return

        categories = options.get("categories")
        trades = Subcategory.objects.filter(is_active=True).select_related("category")
        if categories:
            trades = trades.filter(category__slug__in=categories)

        seeded = 0
        skipped = 0
        for index, trade in enumerate(trades.order_by("category__slug", "slug"), start=1):
            variants = list(
                ServiceVariant.objects.filter(
                    service__subcategory=trade,
                    is_active=True,
                    service__status="ACTIVE",
                )
            )
            if not variants:
                # A trade with no active services needs no Partner, and inventing one would put
                # somebody on the roster for work that cannot be booked.
                skipped += 1
                continue

            self._seed_partner(trade=trade, variants=variants, area=area, index=index)
            seeded += 1
            self.stdout.write(
                f"{trade.category.slug}/{trade.slug}: 1 partner across {len(variants)} variants"
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {seeded} trade partners; skipped {skipped} trades with no active services."
            )
        )

    def _seed_partner(
        self,
        *,
        trade: Subcategory,
        variants: list[ServiceVariant],
        area: ServiceArea,
        index: int,
    ) -> PartnerProfile:
        phone = f"{PHONE_PREFIX}{index:05d}"
        display_name = f"{trade.name} Pro"
        user, _ = User.objects.update_or_create(
            phone_number=phone,
            defaults={"full_name": display_name},
        )
        # Session login always grants `customer` and never `partner` — that grant only
        # exists because `apps.partners.services._draft_application_for_update` makes it
        # when a real application is created. Writing `PartnerProfile`/`PartnerApplication`
        # directly, as this command does, skips that path entirely, so without this the
        # seeded Partner can log in but Django refuses to switch their session into the
        # `partner` role — they hold the profile but were never granted the role.
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
                "biography": f"Seeded {trade.name.lower()} for local development.",
                "experience_years": 5,
            },
        )
        application, _ = PartnerApplication.objects.update_or_create(
            partner=partner,
            defaults={"status": PartnerApplication.Status.APPROVED},
        )
        self._accept_current_consents(partner)
        self._approve_required_documents(application)

        # The skill is what dispatch matches on; the service links are what the grid counts.
        # Both are required — either alone produces a Partner who looks staffable and is not.
        skill = Skill.objects.filter(code=trade.slug).first()
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

    @staticmethod
    def _accept_current_consents(partner: PartnerProfile) -> None:
        """Record acceptance of every currently published required consent.

        Mirrors `seed_test_partner._accept_current_consents`: the receipt points at the
        document row rather than repeating its version, because `_required_consents_exist`
        compares document ids. `request_ip_hash` and `device_hash` are left blank on purpose —
        those record where a real acceptance came from, and inventing them would forge the
        provenance of a legal receipt.
        """
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
        """Give the fixture the approved identity documents eligibility demands.

        Mirrors `seed_test_partner._approve_required_documents`: one row per required kind, at
        a fixed version, so a rerun updates it in place instead of stacking a new version each
        time — the eligibility check reads the *latest* version, so a duplicate would decide
        the outcome by insertion order.
        """
        now = timezone.now()
        for kind in settings.PARTNER_REQUIRED_DOCUMENT_KINDS:
            PartnerDocument.objects.update_or_create(
                application=application,
                kind=kind,
                version=SEED_DOCUMENT_VERSION,
                defaults={
                    # Nothing was uploaded, and the key says so rather than imitating a
                    # storage path that resolves to nothing.
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
