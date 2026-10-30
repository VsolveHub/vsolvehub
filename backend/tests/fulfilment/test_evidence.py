"""Work evidence: signed upload, then a server-side verify that never trusts the client."""

from datetime import timedelta
from secrets import token_urlsafe

import pytest
from django.utils import timezone

from apps.foundation.storage import SignedReview, SignedUpload, VerifiedObject
from apps.fulfilment.evidence import (
    WorkEvidenceUploadError,
    record_work_evidence,
    request_work_evidence_upload,
)
from apps.fulfilment.models import WorkEvidence
from apps.fulfilment.services import mark_arrived, mark_en_route
from apps.identity.models import User
from tests.fulfilment.conftest import BookedGroup, create_booked_group

pytestmark = [
    pytest.mark.django_db(transaction=True),
    # Walks visits booked for tomorrow through en route and arrival; the clock gates on those
    # steps are tested in tests/fulfilment/test_partner_time_gates.py.
    pytest.mark.usefixtures("partner_gates_open"),
]


class FakeEvidenceStorage:
    def __init__(self) -> None:
        self.verification_overrides: dict[str, VerifiedObject] = {}
        self.upload_token = token_urlsafe(16)

    def create_signed_upload(self, *, object_key: str) -> SignedUpload:
        return SignedUpload(
            upload_url=f"https://storage.test/upload/{object_key}?token={self.upload_token}",
            upload_token=self.upload_token,
            resumable_url="https://storage.test/upload/resumable",
            expires_at=timezone.now() + timedelta(hours=2),
        )

    def verify_object(self, *, object_key: str, maximum_size_bytes: int) -> VerifiedObject:
        del maximum_size_bytes
        return self.verification_overrides[object_key]

    def create_signed_review(self, *, object_key: str, expires_in_seconds: int) -> SignedReview:
        return SignedReview(
            review_url=f"https://storage.test/review/{object_key}",
            expires_at=timezone.now() + timedelta(seconds=expires_in_seconds),
        )

    def delete_object(self, *, object_key: str) -> None:
        pass


def _in_progress_booking(key_prefix: str) -> BookedGroup:
    booked = create_booked_group(key_prefix=key_prefix)
    booking = mark_en_route(
        booking_id=booked.booking.id,
        partner_id=booked.partner.id,
        expected_version=booked.booking.version,
    )
    mark_arrived(
        booking_id=booking.id, partner_id=booked.partner.id, expected_version=booking.version
    )
    return booked


def test_request_upload_rejects_an_unsupported_content_type() -> None:
    booked = _in_progress_booking("evidence-bad-type")
    with pytest.raises(WorkEvidenceUploadError):
        request_work_evidence_upload(
            booking_id=booked.booking.id,
            requested_by=booked.partner.user,
            kind=WorkEvidence.Kind.BEFORE,
            content_type="video/mp4",
            size_bytes=1024,
            storage=FakeEvidenceStorage(),
        )


def test_request_then_record_evidence_marks_it_clean_when_metadata_matches() -> None:
    booked = _in_progress_booking("evidence-happy")
    storage = FakeEvidenceStorage()
    grant = request_work_evidence_upload(
        booking_id=booked.booking.id,
        requested_by=booked.partner.user,
        kind=WorkEvidence.Kind.BEFORE,
        content_type="image/jpeg",
        size_bytes=2048,
        storage=storage,
    )
    sha256 = "a" * 64
    storage.verification_overrides[grant.object_key] = VerifiedObject(
        size_bytes=2048, content_type="image/jpeg", sha256=sha256
    )

    evidence = record_work_evidence(
        booking_id=booked.booking.id,
        uploaded_by=booked.partner.user,
        kind=WorkEvidence.Kind.BEFORE,
        object_key=grant.object_key,
        content_type="image/jpeg",
        size_bytes=2048,
        sha256=sha256,
        storage=storage,
    )
    assert evidence.processing_status == WorkEvidence.ProcessingStatus.CLEAN
    assert evidence.booking_id == booked.booking.id


def test_record_evidence_marks_it_failed_when_metadata_does_not_match() -> None:
    booked = _in_progress_booking("evidence-mismatch")
    storage = FakeEvidenceStorage()
    grant = request_work_evidence_upload(
        booking_id=booked.booking.id,
        requested_by=booked.partner.user,
        kind=WorkEvidence.Kind.SAFETY,
        content_type="image/png",
        size_bytes=4096,
        storage=storage,
    )
    declared_sha = "b" * 64
    storage.verification_overrides[grant.object_key] = VerifiedObject(
        size_bytes=1, content_type="image/png", sha256=declared_sha
    )

    evidence = record_work_evidence(
        booking_id=booked.booking.id,
        uploaded_by=booked.partner.user,
        kind=WorkEvidence.Kind.SAFETY,
        object_key=grant.object_key,
        content_type="image/png",
        size_bytes=4096,
        sha256=declared_sha,
        storage=storage,
    )
    assert evidence.processing_status == WorkEvidence.ProcessingStatus.FAILED


def test_record_evidence_rejects_an_invalid_checksum_format() -> None:
    booked = _in_progress_booking("evidence-bad-hash")
    with pytest.raises(WorkEvidenceUploadError):
        record_work_evidence(
            booking_id=booked.booking.id,
            uploaded_by=booked.partner.user,
            kind=WorkEvidence.Kind.AFTER,
            object_key="fulfilment/x/before/does-not-matter.jpg",
            content_type="image/jpeg",
            size_bytes=10,
            sha256="not-a-real-hash",
            storage=FakeEvidenceStorage(),
        )


# --- authorization ----------------------------------------------------------------------------


def test_a_stranger_cannot_mint_an_upload_url_for_someone_elses_booking() -> None:
    booked = _in_progress_booking("evidence-authz-request")
    stranger = User.objects.create_user(phone_number="+919000000101")

    with pytest.raises(PermissionError):
        request_work_evidence_upload(
            booking_id=booked.booking.id,
            requested_by=stranger,
            kind=WorkEvidence.Kind.BEFORE,
            content_type="image/jpeg",
            size_bytes=1024,
            storage=FakeEvidenceStorage(),
        )


def test_a_stranger_cannot_record_evidence_against_someone_elses_booking() -> None:
    booked = _in_progress_booking("evidence-authz-record")
    storage = FakeEvidenceStorage()
    grant = request_work_evidence_upload(
        booking_id=booked.booking.id,
        requested_by=booked.partner.user,
        kind=WorkEvidence.Kind.BEFORE,
        content_type="image/jpeg",
        size_bytes=2048,
        storage=storage,
    )
    sha256 = "c" * 64
    storage.verification_overrides[grant.object_key] = VerifiedObject(
        size_bytes=2048, content_type="image/jpeg", sha256=sha256
    )
    stranger = User.objects.create_user(phone_number="+919000000102")

    with pytest.raises(PermissionError):
        record_work_evidence(
            booking_id=booked.booking.id,
            uploaded_by=stranger,
            kind=WorkEvidence.Kind.BEFORE,
            object_key=grant.object_key,
            content_type="image/jpeg",
            size_bytes=2048,
            sha256=sha256,
            storage=storage,
        )
    assert not WorkEvidence.objects.filter(booking=booked.booking).exists()


def test_the_customer_may_also_upload_evidence_for_their_own_booking() -> None:
    """Damage and dispute evidence comes from the Customer, not only the Partner."""

    booked = _in_progress_booking("evidence-authz-customer")
    storage = FakeEvidenceStorage()
    grant = request_work_evidence_upload(
        booking_id=booked.booking.id,
        requested_by=booked.customer,
        kind=WorkEvidence.Kind.DAMAGE,
        content_type="image/jpeg",
        size_bytes=2048,
        storage=storage,
    )
    sha256 = "d" * 64
    storage.verification_overrides[grant.object_key] = VerifiedObject(
        size_bytes=2048, content_type="image/jpeg", sha256=sha256
    )

    evidence = record_work_evidence(
        booking_id=booked.booking.id,
        uploaded_by=booked.customer,
        kind=WorkEvidence.Kind.DAMAGE,
        object_key=grant.object_key,
        content_type="image/jpeg",
        size_bytes=2048,
        sha256=sha256,
        storage=storage,
    )

    assert evidence.processing_status == WorkEvidence.ProcessingStatus.CLEAN
    assert evidence.uploaded_by_id == booked.customer.id


def test_evidence_minted_for_one_booking_cannot_be_recorded_against_another() -> None:
    """The object key is server-minted and carries the Booking id. Honour it."""

    first = _in_progress_booking("evidence-crosslink-a")
    second = create_booked_group(slugs=("tap-repair",), key_prefix="evidence-crosslink-b")
    storage = FakeEvidenceStorage()
    grant = request_work_evidence_upload(
        booking_id=first.booking.id,
        requested_by=first.partner.user,
        kind=WorkEvidence.Kind.AFTER,
        content_type="image/jpeg",
        size_bytes=2048,
        storage=storage,
    )
    sha256 = "e" * 64
    storage.verification_overrides[grant.object_key] = VerifiedObject(
        size_bytes=2048, content_type="image/jpeg", sha256=sha256
    )

    with pytest.raises(WorkEvidenceUploadError):
        record_work_evidence(
            booking_id=second.booking.id,
            uploaded_by=second.partner.user,
            kind=WorkEvidence.Kind.AFTER,
            object_key=grant.object_key,
            content_type="image/jpeg",
            size_bytes=2048,
            sha256=sha256,
            storage=storage,
        )
