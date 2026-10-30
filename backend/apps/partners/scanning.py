"""Malware scanning for uploaded Partner documents.

A document starts at ``scan_status=PENDING`` and no reviewer can open or approve it until the
configured provider records ``CLEAN`` (``docs/runbooks/partner-document-storage.md``). Selection
fails closed, as every provider does here (ADR 0004):

- ``unconfigured`` (the default) scans nothing. Documents stay ``PENDING``.
- ``development`` records every document ``CLEAN`` without looking at it, so onboarding can be
  exercised on a laptop or in staging. Production refuses to start with it.
- ``none`` is the owner's decision (October 2026) to run production **without malware scanning**:
  every upload is accepted as ``CLEAN`` unscanned. It is never a default — it has to be set — so
  "clean" in an environment configured this way means "accepted without a scan".

A real provider joins as another class behind ``DocumentScanner``; nothing else changes. Running
a scanner and recording its verdict is ``apps.partners.services.documents.scan_partner_document``.
"""

from dataclasses import dataclass
from typing import Protocol, cast

from django.conf import settings

from apps.partners.models import PartnerDocument


@dataclass(frozen=True, slots=True)
class ScanVerdict:
    is_clean: bool
    failure_code: str = ""


class DocumentScanner(Protocol):
    def scan(self, document: PartnerDocument) -> ScanVerdict | None:
        """The verdict, or ``None`` when there is none yet and the document stays ``PENDING``."""
        ...


class UnconfiguredDocumentScanner:
    def scan(self, document: PartnerDocument) -> ScanVerdict | None:
        del document
        return None


class DevelopmentDocumentScanner:
    """Marks everything clean. Never a scanner: a stand-in so onboarding can be tested."""

    def scan(self, document: PartnerDocument) -> ScanVerdict | None:
        del document
        return ScanVerdict(is_clean=True)


class NoScanDocumentScanner:
    """Production without malware scanning, by explicit owner decision. See the module note."""

    def scan(self, document: PartnerDocument) -> ScanVerdict | None:
        del document
        return ScanVerdict(is_clean=True)


def get_document_scanner() -> DocumentScanner:
    provider = cast(str, settings.DOCUMENT_SCAN_PROVIDER).lower()
    if provider == "development":
        return DevelopmentDocumentScanner()
    if provider == "none":
        return NoScanDocumentScanner()
    return UnconfiguredDocumentScanner()
