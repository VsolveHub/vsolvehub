"""Private Partner-document storage boundary.

The implementation lives in `apps.foundation.storage` — shared with `apps.fulfilment`'s work
evidence — so there is exactly one signed-upload/verify/review/delete boundary in the codebase,
not one per app. This module keeps the Partner-scoped entry point and bucket.
"""

from django.conf import settings

from apps.foundation.storage import (
    DocumentStorage,
    DocumentStorageError,
    SignedReview,
    SignedUpload,
    SupabaseDocumentStorage,
    UnconfiguredDocumentStorage,
    VerifiedObject,
)
from apps.foundation.storage import get_document_storage as _get_document_storage

__all__ = [
    "DocumentStorage",
    "DocumentStorageError",
    "SignedReview",
    "SignedUpload",
    "SupabaseDocumentStorage",
    "UnconfiguredDocumentStorage",
    "VerifiedObject",
    "get_document_storage",
]


def get_document_storage() -> DocumentStorage:
    return _get_document_storage(bucket=settings.PARTNER_DOCUMENT_BUCKET)
