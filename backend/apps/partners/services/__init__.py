"""Transactional Partner commands and Redis-first presence coordination.

Where each slice lives:

- `base` — constants, schedule/upload input types, and the application-row helpers every other
  slice reuses; imports nothing from its siblings.
- `application` — the Partner-authored application aggregate: draft edits, skill/service/area
  resolution, consent receipts, submission.
- `documents` — the KYC document aggregate end to end: upload intent, finalization, scan result,
  reviewer access and decision, orphan cleanup.
- `review` — Operations decisions on the application row: claim and status transition, including
  the presence teardown a suspension or offboarding drags behind it.
- `schedule` — availability rules and exceptions, replaced by the Partner or by Operations against
  a consent receipt.
- `presence` — online sessions, coarse location capture, presence publish and reconciliation.
"""

from django.core.cache import cache

from apps.partners.storage import get_document_storage

from .application import (
    _draft_application_for_update,
    _ensure_partner_role,
    _record_partner_consents,
    _resolve_application_service_areas,
    _resolve_application_skills,
    _resolve_application_variants,
    _set_active_service_areas,
    _set_active_services,
    _set_active_skills,
    _update_partner_profile,
    _validate_service_configuration,
    submit_partner_application,
    update_partner_application,
)
from .base import (
    COORDINATE_QUANTUM,
    DOCUMENT_CONTENT_TYPE_SUFFIXES,
    MAX_PARTNER_DOCUMENT_SIZE_BYTES,
    MINUTES_PER_DAY,
    SHA256_PATTERN,
    PartnerDocumentUploadGrant,
    ScheduleExceptionInput,
    ScheduleRuleInput,
    _application_for_update,
    _assert_version,
    _base_application_is_complete,
    _latest_required_documents_are_approved,
    _record_transition,
    _required_consents_exist,
)
from .documents import (
    _assert_application_editable,
    _create_document_upload_intent,
    _document_upload_for_finalization,
    cleanup_stale_partner_document_uploads,
    create_partner_document_applicant_access,
    create_partner_document_review_access,
    finalize_partner_document_upload,
    issue_partner_document_upload,
    record_partner_document_scan_result,
    review_partner_document,
    scan_partner_document,
    scan_pending_partner_documents,
)
from .presence import (
    _assert_operational_eligibility,
    _presence_payload,
    _publish_presence,
    expire_expired_shifts,
    expire_missing_presence_sessions,
    go_offline,
    go_online,
    heartbeat_presence,
    sync_partner_push_subscription,
)
from .review import (
    claim_partner_application,
    release_partner_application_review,
    transition_partner_application,
)
from .schedule import (
    _minutes,
    _replace_schedule_for_application,
    _schedule_snapshot,
    _validate_schedule_rules,
    replace_partner_schedule,
    replace_partner_schedule_for_operations,
)

# `cache` and `get_document_storage` are re-exported, not used here: both were reachable as
# `apps.partners.services.<name>` while this was one module, and existing tests patch them at
# exactly that path.
__all__ = [
    "COORDINATE_QUANTUM",
    "DOCUMENT_CONTENT_TYPE_SUFFIXES",
    "MAX_PARTNER_DOCUMENT_SIZE_BYTES",
    "MINUTES_PER_DAY",
    "SHA256_PATTERN",
    "PartnerDocumentUploadGrant",
    "ScheduleExceptionInput",
    "ScheduleRuleInput",
    "_application_for_update",
    "_assert_application_editable",
    "_assert_operational_eligibility",
    "_assert_version",
    "_base_application_is_complete",
    "_create_document_upload_intent",
    "_document_upload_for_finalization",
    "_draft_application_for_update",
    "_ensure_partner_role",
    "_latest_required_documents_are_approved",
    "_minutes",
    "_presence_payload",
    "_publish_presence",
    "_record_partner_consents",
    "_record_transition",
    "_replace_schedule_for_application",
    "_required_consents_exist",
    "_resolve_application_service_areas",
    "_resolve_application_skills",
    "_resolve_application_variants",
    "_schedule_snapshot",
    "_set_active_service_areas",
    "_set_active_services",
    "_set_active_skills",
    "_update_partner_profile",
    "_validate_schedule_rules",
    "_validate_service_configuration",
    "cache",
    "claim_partner_application",
    "cleanup_stale_partner_document_uploads",
    "create_partner_document_applicant_access",
    "create_partner_document_review_access",
    "expire_expired_shifts",
    "expire_missing_presence_sessions",
    "finalize_partner_document_upload",
    "get_document_storage",
    "go_offline",
    "go_online",
    "heartbeat_presence",
    "issue_partner_document_upload",
    "record_partner_document_scan_result",
    "release_partner_application_review",
    "replace_partner_schedule",
    "replace_partner_schedule_for_operations",
    "review_partner_document",
    "scan_partner_document",
    "scan_pending_partner_documents",
    "submit_partner_application",
    "sync_partner_push_subscription",
    "transition_partner_application",
    "update_partner_application",
]
