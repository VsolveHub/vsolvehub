"""Private requirement-attachment storage boundary.

There is one signed-upload/verify/review/delete implementation in this codebase and it lives in
`apps.foundation.storage`. `apps.partners` uses it for KYC documents and `apps.fulfilment` for work
evidence; this module is the third caller and adds a **bucket, not an adapter** — which is the
reuse rule `02-backend-tasks.md` states against `M2-BE-202` by name.

A separate bucket rather than a shared one because the retention rules differ: a KYC document is
kept for the life of the Partner relationship, and a Customer's photograph of their own building is
deleted with the requirement.
"""

from django.conf import settings

from apps.foundation.storage import (
    DocumentStorage,
    DocumentStorageError,
    SignedReview,
    SignedUpload,
    VerifiedObject,
)
from apps.foundation.storage import get_document_storage as _get_document_storage

__all__ = [
    "DocumentStorage",
    "DocumentStorageError",
    "SignedReview",
    "SignedUpload",
    "VerifiedObject",
    "get_attachment_storage",
]


def get_attachment_storage() -> DocumentStorage:
    return _get_document_storage(bucket=settings.REQUIREMENT_ATTACHMENT_BUCKET)
