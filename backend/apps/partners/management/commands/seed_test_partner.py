"""Seed one obviously non-production Partner who is eligible for every published job.

Local testing only. The Partner is approved, carries every active skill, covers every
service area, offers every active service variant, and is available around the clock on
every weekday — which together are exactly the conditions
`apps.assignments.group_services._eligible_candidates` filters on, so dispatch will
actually reach them.

## Approved means what Django means by it

Being approved is not a status field on its own. `_assert_operational_eligibility`
also requires the identity documents a reviewer signed off and the consents an
applicant accepted, and Django's own approval transition refuses to set APPROVED
without them. Writing the status directly and stopping there produced a Partner
the domain called approved and `presence/online` refused with a 403 — a state no
real review could ever have created. So this fixture satisfies the same
invariants a reviewer would have, rather than the one field that is easy to set.
"""

from datetime import time

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.catalog.models import ServiceVariant
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

PHONE_NUMBER = "+919900000099"
DISPLAY_NAME = "Test Partner (all trades)"
DAY_STARTS_AT = time(0, 0)
DAY_ENDS_AT = time(23, 59)
SEED_DOCUMENT_VERSION = 1


class Command(BaseCommand):
    help = "Seed a single non-production Partner eligible for every job; never use in production."

    @transaction.atomic
    def handle(self, *_args: object, **_options: object) -> None:
        if not settings.DEBUG:
            raise CommandError("The test Partner fixture is forbidden outside local development.")

        # Skills and published consent documents are both prerequisites for a
        # complete application, and both come from reference data. Running it
        # here means one command produces a working Partner instead of failing
        # quietly for anyone who did not know to run two.
        call_command("seed_partner_reference_data")

        user, _ = User.objects.get_or_create(
            phone_number=PHONE_NUMBER,
            defaults={"full_name": DISPLAY_NAME},
        )
        role, _ = Role.objects.get_or_create(
            code="partner",
            defaults={"name": "Partner", "is_system": True},
        )
        # Session role gates every Partner endpoint, so the profile alone is not enough.
        UserRole.objects.update_or_create(user=user, role=role, defaults={"revoked_at": None})

        partner, _ = PartnerProfile.objects.get_or_create(
            user=user,
            defaults={"display_name": DISPLAY_NAME, "experience_years": 5},
        )
        application, _ = PartnerApplication.objects.update_or_create(
            partner=partner,
            defaults={"status": PartnerApplication.Status.APPROVED},
        )

        self._accept_current_consents(partner)
        self._approve_required_documents(application)

        for skill in Skill.objects.filter(is_active=True):
            PartnerSkill.objects.update_or_create(
                partner=partner, skill=skill, defaults={"is_active": True}
            )

        areas = list(ServiceArea.objects.filter(is_active=True))
        for area in areas:
            PartnerServiceArea.objects.update_or_create(
                partner=partner, service_area=area, defaults={"is_active": True}
            )
            for weekday in range(7):
                PartnerAvailabilityRule.objects.update_or_create(
                    partner=partner,
                    service_area=area,
                    weekday=weekday,
                    starts_at=DAY_STARTS_AT,
                    defaults={
                        "ends_at": DAY_ENDS_AT,
                        "ends_next_day": False,
                        "is_active": True,
                    },
                )

        variants = list(ServiceVariant.objects.filter(is_active=True, service__status="ACTIVE"))
        for variant in variants:
            PartnerService.objects.update_or_create(
                partner=partner, variant=variant, defaults={"is_active": True}
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Partner {PHONE_NUMBER} is approved for "
                f"{len(variants)} service variants across {len(areas)} areas, "
                "available every weekday, and is eligible to go online."
            )
        )

    @staticmethod
    def _accept_current_consents(partner: PartnerProfile) -> None:
        """Record acceptance of every currently published required consent.

        The receipt points at the document row rather than repeating its version,
        because `_required_consents_exist` compares document ids — a receipt
        carrying the right version string but no `document` would satisfy a
        reading of the data and not the check that matters.

        `request_ip_hash` and `device_hash` are left blank on purpose. Those
        record where a real acceptance came from, and inventing them would forge
        the provenance of a legal receipt.
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

        One row per required kind, at a fixed version so re-running the command
        updates that row instead of stacking a new version each time — the
        eligibility check reads the *latest* version, so a duplicate would decide
        the outcome by insertion order.
        """
        now = timezone.now()
        for kind in settings.PARTNER_REQUIRED_DOCUMENT_KINDS:
            PartnerDocument.objects.update_or_create(
                application=application,
                kind=kind,
                version=SEED_DOCUMENT_VERSION,
                defaults={
                    # Nothing was uploaded, and the key says so rather than
                    # imitating a storage path that resolves to nothing.
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
