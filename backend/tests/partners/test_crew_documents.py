"""A crew member's identity evidence, and the timestamp it decides.

`PartnerCrewMembership.documents_verified_at` gates real doorsteps — `assign_crew` refuses an
unverified worker outright and `verified_roster_size` counts only verified memberships when it
sizes a vendor's roster against a customer's headcount. It had a writer with an actor and an audit
event, and nothing anywhere in the system to look at. These are the rules that make the timestamp
mean something:

* the stored object is checked against what was declared, so a reviewer never sees bytes nobody
  verified arrived;
* approving the last required kind verifies the membership, so a fully-approved worker is never
  silently still excluded;
* rejecting a required kind withdraws it, carrying the reason.
"""

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone

from apps.identity.models import Role, User, UserRole
from apps.partners import crew_documents
from apps.partners.capabilities import add_crew_to_roster
from apps.partners.exceptions import CrewDocumentError
from apps.partners.models import (
    CrewDocument,
    PartnerCrewMembership,
    PartnerProfile,
)
from apps.partners.storage import (
    DocumentStorageError,
    SignedReview,
    SignedUpload,
    VerifiedObject,
)

pytestmark = pytest.mark.django_db


@dataclass
class FakeCrewStorage:
    """Answers with whatever was declared, unless a test says otherwise."""

    mismatch: VerifiedObject | None = None
    fail_upload: bool = False
    fail_review: bool = False
    deleted: list[str] | None = None

    def create_signed_upload(self, *, object_key: str) -> SignedUpload:
        if self.fail_upload:
            raise DocumentStorageError("down")
        return SignedUpload(
            upload_url=f"https://storage.test/upload/{object_key}?token=t",
            upload_token="t",  # noqa: S106 — a fake storage token, not a credential
            resumable_url="https://storage.test/upload/resumable",
            expires_at=timezone.now() + timedelta(hours=2),
        )

    def verify_object(self, *, object_key: str, maximum_size_bytes: int) -> VerifiedObject:
        del maximum_size_bytes
        if self.mismatch is not None:
            return self.mismatch
        document = CrewDocument.objects.get(object_key=object_key)
        return VerifiedObject(
            size_bytes=document.size_bytes,
            content_type=document.content_type,
            sha256=document.sha256,
        )

    def create_signed_review(self, *, object_key: str, expires_in_seconds: int) -> SignedReview:
        if self.fail_review:
            raise DocumentStorageError("down")
        return SignedReview(
            review_url=f"https://storage.test/review/{object_key}",
            expires_at=timezone.now() + timedelta(seconds=expires_in_seconds),
        )

    def delete_object(self, *, object_key: str) -> None:
        if self.deleted is None:
            self.deleted = []
        self.deleted.append(object_key)


SHA = "a" * 64


@pytest.fixture
def storage() -> FakeCrewStorage:
    return FakeCrewStorage()


@pytest.fixture
def membership() -> PartnerCrewMembership:
    user = User.objects.create_user(phone_number="+919000000001", full_name="Agency Owner")
    partner = PartnerProfile.objects.create(user=user, display_name="Sharma Manpower")
    return add_crew_to_roster(
        partner=partner,
        display_name="Ramesh Kumr",
        phone_e164="+917030203002",
    ).membership


@pytest.fixture
def reviewer() -> User:
    user = User.objects.create_user(phone_number="+919900000009", full_name="Ops Reviewer")
    role, _ = Role.objects.get_or_create(
        code="operations", defaults={"name": "Operations", "is_system": True}
    )
    UserRole.objects.create(user=user, role=role)
    return user


def _upload(
    membership: PartnerCrewMembership,
    storage: FakeCrewStorage,
    kind: str = CrewDocument.Kind.GOVERNMENT_ID,
    **overrides: Any,
) -> CrewDocument:
    grant = crew_documents.start_crew_document_upload(
        membership=membership,
        kind=kind,
        content_type=overrides.get("content_type", "image/jpeg"),
        size_bytes=overrides.get("size_bytes", 1024),
        sha256=overrides.get("sha256", SHA),
        storage=storage,
    )
    return grant.document


def test_a_declared_upload_is_invisible_to_a_reviewer_until_the_bytes_land(
    membership: PartnerCrewMembership, storage: FakeCrewStorage
) -> None:
    document = _upload(membership, storage)

    assert document.status == CrewDocument.Status.AWAITING_UPLOAD
    assert crew_documents.current_crew_documents(membership=membership) == []


def test_submitting_promotes_the_document_into_the_review_queue(
    membership: PartnerCrewMembership, storage: FakeCrewStorage
) -> None:
    document = _upload(membership, storage)

    submitted = crew_documents.submit_crew_document(
        membership=membership, document_id=document.id, storage=storage
    )

    assert submitted.status == CrewDocument.Status.PENDING
    assert [entry.id for entry in crew_documents.current_crew_documents(membership=membership)] == [
        document.id
    ]


def test_a_stored_object_that_does_not_match_what_was_declared_is_refused(
    membership: PartnerCrewMembership, storage: FakeCrewStorage
) -> None:
    """The party claiming the upload succeeded is the party that benefits from the claim."""
    document = _upload(membership, storage)
    storage.mismatch = VerifiedObject(size_bytes=9999, content_type="image/jpeg", sha256=SHA)

    with pytest.raises(CrewDocumentError):
        crew_documents.submit_crew_document(
            membership=membership, document_id=document.id, storage=storage
        )

    document.refresh_from_db()
    assert document.status == CrewDocument.Status.FAILED
    assert document.failure_code == "metadata_mismatch"


def test_an_unsupported_file_type_is_refused_before_a_key_is_issued(
    membership: PartnerCrewMembership, storage: FakeCrewStorage
) -> None:
    with pytest.raises(CrewDocumentError):
        _upload(membership, storage, content_type="application/zip")

    assert not CrewDocument.objects.filter(membership=membership).exists()


def test_approving_the_last_required_document_verifies_the_membership(
    membership: PartnerCrewMembership, storage: FakeCrewStorage, reviewer: User
) -> None:
    """The failure mode this closes: a fully-approved worker still excluded from every offer."""
    document = _upload(membership, storage)
    crew_documents.submit_crew_document(
        membership=membership, document_id=document.id, storage=storage
    )
    assert membership.documents_verified_at is None

    crew_documents.review_crew_document(document_id=document.id, actor=reviewer, approved=True)

    membership.refresh_from_db()
    assert membership.documents_verified_at is not None


def test_rejecting_a_required_document_withdraws_verification_with_its_reason(
    membership: PartnerCrewMembership, storage: FakeCrewStorage, reviewer: User
) -> None:
    document = _upload(membership, storage)
    crew_documents.submit_crew_document(
        membership=membership, document_id=document.id, storage=storage
    )
    crew_documents.review_crew_document(document_id=document.id, actor=reviewer, approved=True)
    membership.refresh_from_db()
    assert membership.documents_verified_at is not None

    crew_documents.review_crew_document(
        document_id=document.id,
        actor=reviewer,
        approved=False,
        reason="The photo is too blurred to read the number.",
    )

    membership.refresh_from_db()
    assert membership.documents_verified_at is None
    document.refresh_from_db()
    assert document.review_reason == "The photo is too blurred to read the number."


def test_rejecting_without_a_reason_is_refused(
    membership: PartnerCrewMembership, storage: FakeCrewStorage, reviewer: User
) -> None:
    """A rejection with no reason is a loop: the partner cannot tell what to send instead."""
    document = _upload(membership, storage)
    crew_documents.submit_crew_document(
        membership=membership, document_id=document.id, storage=storage
    )

    with pytest.raises(CrewDocumentError):
        crew_documents.review_crew_document(
            document_id=document.id, actor=reviewer, approved=False, reason="   "
        )

    document.refresh_from_db()
    assert document.status == CrewDocument.Status.PENDING


def test_an_optional_document_alone_does_not_verify_anybody(
    membership: PartnerCrewMembership, storage: FakeCrewStorage, reviewer: User
) -> None:
    document = _upload(membership, storage, kind=CrewDocument.Kind.ADDRESS_PROOF)
    crew_documents.submit_crew_document(
        membership=membership, document_id=document.id, storage=storage
    )

    crew_documents.review_crew_document(document_id=document.id, actor=reviewer, approved=True)

    membership.refresh_from_db()
    assert membership.documents_verified_at is None
    assert crew_documents.missing_required_crew_document_kinds(membership=membership) == [
        "GOVERNMENT_ID"
    ]


def test_replacing_an_approved_document_does_not_un_verify_anybody_on_upload(
    membership: PartnerCrewMembership, storage: FakeCrewStorage, reviewer: User
) -> None:
    """A worker already named on Tuesday's shift must not fall off it because a file was resent."""
    first = _upload(membership, storage)
    crew_documents.submit_crew_document(
        membership=membership, document_id=first.id, storage=storage
    )
    crew_documents.review_crew_document(document_id=first.id, actor=reviewer, approved=True)

    second = _upload(membership, storage)
    crew_documents.submit_crew_document(
        membership=membership, document_id=second.id, storage=storage
    )

    membership.refresh_from_db()
    assert membership.documents_verified_at is not None
    first.refresh_from_db()
    assert first.status == CrewDocument.Status.APPROVED


def test_a_review_link_is_none_rather_than_an_error_when_storage_is_down(
    membership: PartnerCrewMembership, storage: FakeCrewStorage
) -> None:
    """One missing preview beats an error page hiding the other nine people in the queue."""
    document = _upload(membership, storage)
    storage.fail_review = True

    assert crew_documents.crew_document_review_url(document=document, storage=storage) is None


def test_a_storage_outage_at_upload_time_leaves_a_failed_row_not_a_hole(
    membership: PartnerCrewMembership,
) -> None:
    """The version number stays spent, so a retry cannot collide on the unique index."""
    storage = FakeCrewStorage(fail_upload=True)

    with pytest.raises(CrewDocumentError):
        _upload(membership, storage)

    document = CrewDocument.objects.get(membership=membership)
    assert document.status == CrewDocument.Status.FAILED
    assert document.failure_code == "provider_unavailable"


def test_an_archived_member_cannot_have_documents_uploaded(
    membership: PartnerCrewMembership, storage: FakeCrewStorage
) -> None:
    membership.status = PartnerCrewMembership.Status.ARCHIVED
    membership.archived_at = timezone.now()
    membership.save(update_fields=("status", "archived_at"))

    with pytest.raises(CrewDocumentError):
        _upload(membership, storage)
