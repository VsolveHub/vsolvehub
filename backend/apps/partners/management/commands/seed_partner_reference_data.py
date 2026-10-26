"""Synchronize the Partner reference data an application is assembled from.

Two kinds of it: the normalized skills derived from the active service catalog,
and the published consent documents an applicant accepts.

The consent documents are not optional furniture. `_required_consents_exist`
returns False when nothing is published, so an environment without them has no
path to a complete application — nobody can submit, nobody can be approved, and
`presence/online` refuses everyone. Only the migration that created the table
existed before this, so a fresh database was born in that state.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.catalog.models import Service, ServiceVariant
from apps.partners.models import PartnerConsentDocument, Skill

# (purpose, title, version, path on the Partner site, placeholder for environments without one).
# With `PARTNER_LEGAL_BASE_URL` set — production refuses to start without it — the agreement is
# the real page the Partner site publishes. Without it (local, tests) the URL is a reserved
# `.test` host, deliberately: a seed must never look like a real agreement a receipt could be
# disputed against.
REQUIRED_CONSENT_DOCUMENTS = (
    (
        "partner_terms",
        "Partner terms",
        "2026-07",
        "/terms",
        "https://legal.vsolvehub.test/partner-terms/2026-07",
    ),
    (
        "privacy_notice",
        "Partner privacy notice",
        "2026-07",
        "/privacy",
        "https://legal.vsolvehub.test/partner-privacy/2026-07",
    ),
)


def consent_document_url(path: str, placeholder: str) -> str:
    base = str(getattr(settings, "PARTNER_LEGAL_BASE_URL", "") or "").rstrip("/")
    return f"{base}{path}" if base else placeholder


class Command(BaseCommand):
    help = "Upsert Partner skills and published consent documents."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--deactivate-missing",
            action="store_true",
            help="Deactivate skills no longer referenced by an active service variant.",
        )

    @transaction.atomic
    def handle(self, *_args: object, **options: object) -> None:
        variants = (
            ServiceVariant.objects.filter(
                is_active=True,
                service__status=Service.Status.ACTIVE,
            )
            .exclude(required_skill_code="")
            .exclude(booking_archetype=ServiceVariant.BookingArchetype.A10_LISTING)
            .select_related("service__subcategory")
            .order_by("required_skill_code", "service__subcategory__name")
        )
        names_by_code: dict[str, str] = {}
        for variant in variants:
            names_by_code.setdefault(
                variant.required_skill_code,
                variant.service.subcategory.name,
            )

        for code, name in names_by_code.items():
            Skill.objects.update_or_create(
                code=code,
                defaults={"name": name, "is_active": True},
            )

        if bool(options["deactivate_missing"]):
            Skill.objects.exclude(code__in=names_by_code).update(is_active=False)

        published = self._publish_consent_documents()

        self.stdout.write(
            self.style.SUCCESS(
                f"Partner reference data synchronized ({len(names_by_code)} active skills, "
                f"{published} consent documents).",
            ),
        )

    def _publish_consent_documents(self) -> int:
        """Publish a current version of each required consent, without clobbering.

        A purpose that already has a current document is left exactly as it is.
        Operations owns published legal text, and a seed that replaced a live
        version would invalidate every receipt pointing at it — the one thing the
        consent model exists to keep intact.
        """
        for purpose, title, version, path, placeholder in REQUIRED_CONSENT_DOCUMENTS:
            if PartnerConsentDocument.objects.filter(purpose=purpose, is_current=True).exists():
                continue
            url = consent_document_url(path, placeholder)
            PartnerConsentDocument.objects.update_or_create(
                purpose=purpose,
                document_version=version,
                defaults={
                    "title": title,
                    "document_url": url,
                    "is_required_for_submission": True,
                    "is_current": True,
                },
            )
        return PartnerConsentDocument.objects.filter(is_current=True).count()
