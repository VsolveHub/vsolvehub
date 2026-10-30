"""Run the configured malware scanner over every Partner document still waiting for a verdict.

New uploads are scanned as they are accepted. This is for the ones that are not: documents
uploaded while no scanner was configured, or before the scanner existed at all. With
``DOCUMENT_SCAN_PROVIDER=unconfigured`` it scans nothing and says so — it never marks a document
clean on its own authority.
"""

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.partners.models import PartnerDocument
from apps.partners.services import scan_pending_partner_documents


class Command(BaseCommand):
    help = "Scan every Partner document still at scan_status=PENDING with the configured scanner."

    def handle(self, *args: Any, **options: Any) -> None:
        del args, options
        pending = PartnerDocument.objects.filter(
            scan_status=PartnerDocument.ScanStatus.PENDING,
        ).count()
        provider = settings.DOCUMENT_SCAN_PROVIDER
        scanned = scan_pending_partner_documents()
        self.stdout.write(
            f"{pending} pending, {scanned} scanned with DOCUMENT_SCAN_PROVIDER={provider}."
        )
        if pending and not scanned:
            self.stdout.write("No scanner gave a verdict; those documents stay PENDING.")
