"""Attachment presign, finalize, scan outcome and removal (`M2-BE-202`).

The upload handshake exists to answer one question: is the object in storage the file the client
said it was sending? So most of this file is about disagreement — a checksum that does not match, a
size that does not, an intent finalized twice, an intent finalized by the wrong Customer. The happy
path is one test; the refusals are the feature.

`INFECTED` gets its own tests because it is the state the frontend already models and the model
lacked until Wave C1, and because it is not `FAILED`: one offers a retry and the other must not.
"""

import uuid
from datetime import timedelta
from http import HTTPStatus

import pytest
from django.utils import timezone

from apps.foundation.storage import DocumentStorageError, VerifiedObject
from apps.requirements import attachments, services
from apps.requirements.models import (
    CustomerRequirement,
    RequirementAttachment,
    RequirementAttachmentUpload,
)
from tests.requirements.conftest import (
    FakeAttachmentStorage,
    M2World,
    draft_requirement,
    submitted_requirement,
)

pytestmark = pytest.mark.django_db

SHA256 = "c" * 64
OTHER_SHA256 = "d" * 64
IMAGE_BYTES = 4096
ONE_ATTACHMENT = 1


def _key() -> dict[str, str]:
    return {"HTTP_IDEMPOTENCY_KEY": uuid.uuid4().hex}


def _presign(
    world: M2World,
    requirement: CustomerRequirement,
    *,
    kind: str = "IMAGE",
    content_type: str = "image/jpeg",
    size_bytes: int = IMAGE_BYTES,
    sha256: str = SHA256,
    language: str = "",
) -> dict[str, object]:
    response = world.customer_client.post(
        f"/api/v1/requirements/{requirement.id}/attachments/uploads/",
        {
            "kind": kind,
            "content_type": content_type,
            "size_bytes": size_bytes,
            "sha256": sha256,
            "language": language,
        },
        format="json",
    )
    return {"status": response.status_code, "body": response.json()}


# ---------------------------------------------------------------------------
# Presign
# ---------------------------------------------------------------------------


def test_presign_records_an_intent_and_returns_a_signed_url(world: M2World) -> None:
    requirement = draft_requirement(world=world)

    result = _presign(world, requirement)

    assert result["status"] == HTTPStatus.CREATED
    body = result["body"]
    assert body["scan_status"] == "PENDING"
    assert body["upload_url"].startswith("https://storage.test/upload/")
    upload = RequirementAttachmentUpload.objects.get(id=body["id"])
    assert upload.status == RequirementAttachmentUpload.Status.ISSUED
    assert upload.requirement_id == requirement.id
    assert upload.size_bytes == IMAGE_BYTES
    assert upload.sha256 == SHA256


def test_the_object_key_is_server_generated_and_names_no_person(world: M2World) -> None:
    """A storage listing must not be a contact list.

    The requirement id is a UUID nobody can enumerate; a phone number or a name in the key would
    make the bucket itself readable as customer data.
    """
    requirement = draft_requirement(world=world)

    _presign(world, requirement)

    upload = RequirementAttachmentUpload.objects.get(requirement=requirement)
    assert upload.object_key.startswith(f"requirements/{requirement.id}/image/")
    assert upload.object_key.endswith(".jpg")
    assert world.customer.phone_number not in upload.object_key
    assert (world.customer.full_name or "") not in upload.object_key


def test_an_unsupported_media_type_is_refused_before_any_bytes_move(world: M2World) -> None:
    """An allow-list, per kind. A "document" that is really an SVG is a script."""
    requirement = draft_requirement(world=world)

    result = _presign(world, requirement, kind="DOCUMENT", content_type="image/svg+xml")

    assert result["status"] == HTTPStatus.BAD_REQUEST
    assert result["body"]["error"]["code"] == "m2_attachment_invalid"
    assert not RequirementAttachmentUpload.objects.filter(requirement=requirement).exists()


def test_a_pdf_cannot_be_attached_as_a_voice_note(world: M2World) -> None:
    """Kind-scoped rather than a single global allow-list.

    A voice note that is really a PDF is a client bug worth refusing: the transcription adapter and
    the language routing both read it as audio.
    """
    requirement = draft_requirement(world=world)

    result = _presign(world, requirement, kind="VOICE_NOTE", content_type="application/pdf")

    assert result["status"] == HTTPStatus.BAD_REQUEST


def test_an_oversized_file_is_refused_with_the_limit_in_the_message(world: M2World) -> None:
    requirement = draft_requirement(world=world)
    over = attachments.MAXIMUM_SIZE_BYTES[RequirementAttachment.Kind.IMAGE] + 1

    result = _presign(world, requirement, size_bytes=over)

    assert result["status"] == HTTPStatus.BAD_REQUEST
    assert "MB" in result["body"]["error"]["message"]


def test_the_size_ceiling_differs_by_kind(world: M2World) -> None:
    """A 30 MB site video is real; a 30 MB photograph is an unresized camera dump.

    One global ceiling would either refuse the video or accept the dump.
    """
    requirement = draft_requirement(world=world)
    thirty_megabytes = 30 * 1024 * 1024

    as_image = _presign(world, requirement, size_bytes=thirty_megabytes)
    as_video = _presign(
        world,
        requirement,
        kind="VIDEO",
        content_type="video/mp4",
        size_bytes=thirty_megabytes,
        sha256=OTHER_SHA256,
    )

    assert as_image["status"] == HTTPStatus.BAD_REQUEST
    assert as_video["status"] == HTTPStatus.CREATED


def test_a_malformed_checksum_is_refused(world: M2World) -> None:
    requirement = draft_requirement(world=world)

    result = _presign(world, requirement, sha256="not-a-sha")

    assert result["status"] == HTTPStatus.BAD_REQUEST


def test_the_attachment_count_is_bounded(world: M2World) -> None:
    """A vendor reading forty photographs on a phone reads none of them.

    And every attachment is storage the platform pays for on a requirement that is free.
    """
    requirement = draft_requirement(world=world)
    for index in range(attachments.MAXIMUM_ATTACHMENTS_PER_REQUIREMENT):
        RequirementAttachment.objects.create(
            requirement=requirement,
            kind=RequirementAttachment.Kind.IMAGE,
            object_key=f"requirements/{requirement.id}/image/{index}.jpg",
            content_type="image/jpeg",
            size_bytes=IMAGE_BYTES,
            sha256=SHA256,
        )

    result = _presign(world, requirement)

    assert result["status"] == HTTPStatus.BAD_REQUEST
    assert (
        str(attachments.MAXIMUM_ATTACHMENTS_PER_REQUIREMENT) in (result["body"]["error"]["message"])
    )


def test_attachments_are_refused_once_the_requirement_has_left_draft(world: M2World) -> None:
    """After submission a vendor has been shown a snapshot.

    A photograph appearing afterwards is a scope change arriving through the back door;
    `M2-BE-209`'s post-acceptance edit path is where that belongs, and it is not built.
    """
    requirement = submitted_requirement(world=world)

    result = _presign(world, requirement)

    assert result["status"] == HTTPStatus.CONFLICT
    assert result["body"]["error"]["code"] == "m2_requirement_locked"


def test_a_storage_outage_marks_the_intent_failed_and_is_retryable(
    world: M2World,
    attachment_storage: FakeAttachmentStorage,
) -> None:
    """An intent nothing can ever be uploaded against is not pending.

    Leaving it `ISSUED` would make the orphan sweep the only thing that ever noticed.
    """
    requirement = draft_requirement(world=world)
    attachment_storage.fail_next_signed_upload = True

    result = _presign(world, requirement)

    assert result["status"] == HTTPStatus.SERVICE_UNAVAILABLE
    assert result["body"]["error"]["code"] == "m2_attachment_unavailable"
    assert result["body"]["error"]["retryable"] is True
    upload = RequirementAttachmentUpload.objects.get(requirement=requirement)
    assert upload.status == RequirementAttachmentUpload.Status.FAILED
    assert upload.failure_code == "provider_unavailable"


# ---------------------------------------------------------------------------
# Finalize
# ---------------------------------------------------------------------------


def _finalize(world: M2World, requirement: CustomerRequirement, upload_id: object) -> object:
    return world.customer_client.post(
        f"/api/v1/requirements/{requirement.id}/attachments/",
        {"upload_id": str(upload_id)},
        format="json",
        **_key(),
    )


def test_finalizing_a_matching_object_creates_a_pending_attachment(world: M2World) -> None:
    """`PENDING`, not `VERIFIED`.

    The bytes are the ones the client promised; whether they are *safe* is a separate question the
    scanner answers. Conflating "matches the checksum" with "clean" is how a scanner becomes
    decoration.
    """
    requirement = draft_requirement(world=world)
    upload_id = _presign(world, requirement)["body"]["id"]

    response = _finalize(world, requirement, upload_id)

    assert response.status_code == HTTPStatus.CREATED
    body = response.json()
    assert body["scan_status"] == "PENDING"
    assert body["kind"] == "IMAGE"
    assert RequirementAttachmentUpload.objects.get(id=upload_id).status == (
        RequirementAttachmentUpload.Status.VERIFIED
    )


def test_a_voice_notes_language_survives_finalization(world: M2World) -> None:
    """A vendor who cannot understand the note is a silent matching failure, so the tag is carried.

    There is no transcription adapter yet, and this is what makes the language usable without one.
    """
    requirement = draft_requirement(world=world)
    upload_id = _presign(
        world,
        requirement,
        kind="VOICE_NOTE",
        content_type="audio/webm",
        size_bytes=200_000,
        language="te-IN",
    )["body"]["id"]

    response = _finalize(world, requirement, upload_id)

    assert response.status_code == HTTPStatus.CREATED
    assert response.json()["language"] == "te-IN"


def test_a_checksum_mismatch_refuses_and_records_why(
    world: M2World,
    attachment_storage: FakeAttachmentStorage,
) -> None:
    """The whole point of the intent row.

    Without something to compare against, "verify the upload" degrades to "believe the client", and
    the client is the party whose file we are suspicious of.
    """
    requirement = draft_requirement(world=world)
    upload_id = _presign(world, requirement)["body"]["id"]
    upload = RequirementAttachmentUpload.objects.get(id=upload_id)
    attachment_storage.verification_overrides[upload.object_key] = VerifiedObject(
        size_bytes=IMAGE_BYTES,
        content_type="image/jpeg",
        sha256=OTHER_SHA256,
    )

    response = _finalize(world, requirement, upload_id)

    upload.refresh_from_db()
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert upload.status == RequirementAttachmentUpload.Status.FAILED
    assert upload.failure_code == "metadata_mismatch"
    assert not RequirementAttachment.objects.filter(requirement=requirement).exists()


def test_a_size_mismatch_refuses(
    world: M2World,
    attachment_storage: FakeAttachmentStorage,
) -> None:
    requirement = draft_requirement(world=world)
    upload_id = _presign(world, requirement)["body"]["id"]
    upload = RequirementAttachmentUpload.objects.get(id=upload_id)
    attachment_storage.verification_overrides[upload.object_key] = VerifiedObject(
        size_bytes=IMAGE_BYTES * 2,
        content_type="image/jpeg",
        sha256=SHA256,
    )

    response = _finalize(world, requirement, upload_id)

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_a_content_type_mismatch_refuses(
    world: M2World,
    attachment_storage: FakeAttachmentStorage,
) -> None:
    """The declared type and the stored type must agree.

    A file uploaded as `image/jpeg` and stored as something else is the case an allow-list on the
    *declared* type alone cannot catch.
    """
    requirement = draft_requirement(world=world)
    upload_id = _presign(world, requirement)["body"]["id"]
    upload = RequirementAttachmentUpload.objects.get(id=upload_id)
    attachment_storage.verification_overrides[upload.object_key] = VerifiedObject(
        size_bytes=IMAGE_BYTES,
        content_type="application/octet-stream",
        sha256=SHA256,
    )

    response = _finalize(world, requirement, upload_id)

    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_an_expired_intent_cannot_be_finalized(world: M2World) -> None:
    requirement = draft_requirement(world=world)
    upload_id = _presign(world, requirement)["body"]["id"]
    RequirementAttachmentUpload.objects.filter(id=upload_id).update(
        expires_at=timezone.now() - timedelta(minutes=1),
    )

    response = _finalize(world, requirement, upload_id)

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert RequirementAttachmentUpload.objects.get(id=upload_id).status == (
        RequirementAttachmentUpload.Status.EXPIRED
    )


def test_one_intent_produces_one_attachment_under_a_replayed_finalize(world: M2World) -> None:
    """Two finalizes of one intent must not make two attachments.

    Guarded twice: the idempotency key replays the original response, and the intent's own status
    check refuses a second attempt under a fresh key. A browser that retried on a dropped connection
    exercises the first; a client that generated a new key exercises the second.
    """
    requirement = draft_requirement(world=world)
    upload_id = _presign(world, requirement)["body"]["id"]
    key = _key()

    first = world.customer_client.post(
        f"/api/v1/requirements/{requirement.id}/attachments/",
        {"upload_id": str(upload_id)},
        format="json",
        **key,
    )
    replayed = world.customer_client.post(
        f"/api/v1/requirements/{requirement.id}/attachments/",
        {"upload_id": str(upload_id)},
        format="json",
        **key,
    )
    under_a_new_key = _finalize(world, requirement, upload_id)

    assert first.status_code == HTTPStatus.CREATED
    assert replayed.status_code == HTTPStatus.CREATED
    assert replayed.json() == first.json()
    assert under_a_new_key.status_code == HTTPStatus.BAD_REQUEST
    assert RequirementAttachment.objects.filter(requirement=requirement).count() == ONE_ATTACHMENT


def test_a_customer_cannot_finalize_another_customers_intent(world: M2World) -> None:
    mine = draft_requirement(world=world)
    theirs = draft_requirement(world=world, customer=world.other_customer)
    foreign_upload = attachments.issue_attachment_upload(
        requirement=theirs,
        kind="IMAGE",
        content_type="image/jpeg",
        size_bytes=IMAGE_BYTES,
        sha256=SHA256,
    )

    response = _finalize(world, mine, foreign_upload.upload.id)

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert not RequirementAttachment.objects.filter(requirement=mine).exists()
    assert not RequirementAttachment.objects.filter(requirement=theirs).exists()


# ---------------------------------------------------------------------------
# The scan outcome
# ---------------------------------------------------------------------------


def _attached(world: M2World, requirement: CustomerRequirement) -> RequirementAttachment:
    upload_id = _presign(world, requirement)["body"]["id"]
    _finalize(world, requirement, upload_id)
    return RequirementAttachment.objects.get(requirement=requirement)


def test_a_clean_scan_verifies_the_attachment(world: M2World) -> None:
    requirement = draft_requirement(world=world)
    attachment = _attached(world, requirement)

    decided = attachments.record_attachment_scan_result(
        attachment_id=attachment.id,
        is_clean=True,
    )

    assert decided.processing_status == RequirementAttachment.ProcessingStatus.VERIFIED
    assert decided.failure_reason == ""


def test_an_infected_file_gets_its_own_state_and_a_reason(world: M2World) -> None:
    """`INFECTED` is not `FAILED`, and the difference is the recovery.

    A mismatched checksum is the Customer's upload going wrong and the answer is "try again".
    Malware is not, and the answer is "this file is gone and no vendor ever saw it". One status for
    both would have offered a retry button for the second case.
    """
    requirement = draft_requirement(world=world)
    attachment = _attached(world, requirement)

    decided = attachments.record_attachment_scan_result(
        attachment_id=attachment.id,
        is_clean=False,
        failure_reason="EICAR test signature",
    )

    assert decided.processing_status == RequirementAttachment.ProcessingStatus.INFECTED
    assert decided.failure_reason == "EICAR test signature"
    assert (
        RequirementAttachment.ProcessingStatus.INFECTED
        not in RequirementAttachment.SHAREABLE_STATUSES
    )


def test_the_scan_result_is_published_to_the_customer(world: M2World) -> None:
    requirement = draft_requirement(world=world)
    attachment = _attached(world, requirement)
    attachments.record_attachment_scan_result(
        attachment_id=attachment.id,
        is_clean=False,
        failure_reason="EICAR test signature",
    )

    response = world.customer_client.get(f"/api/v1/requirements/{requirement.id}/")

    assert response.status_code == HTTPStatus.OK
    published = response.json()["attachments"][0]
    assert published["scan_status"] == "INFECTED"
    assert published["scan_failure_reason"] == "EICAR test signature"


def test_a_repeated_scan_verdict_is_a_no_op_not_a_re_decision(world: M2World) -> None:
    """The caller is a scanner webhook, so a duplicate callback is expected.

    A second identical verdict must not flip a file back through `PENDING` and re-open a vendor's
    access to it.
    """
    requirement = draft_requirement(world=world)
    attachment = _attached(world, requirement)
    attachments.record_attachment_scan_result(attachment_id=attachment.id, is_clean=False)

    again = attachments.record_attachment_scan_result(
        attachment_id=attachment.id,
        is_clean=False,
    )

    assert again.processing_status == RequirementAttachment.ProcessingStatus.INFECTED


def test_a_contradictory_scan_verdict_is_refused(world: M2World) -> None:
    """Two scanners disagreeing is an Operations problem, not a last-writer-wins race.

    Letting a `clean` callback overwrite `INFECTED` would make the safety of a file depend on
    callback arrival order.
    """
    requirement = draft_requirement(world=world)
    attachment = _attached(world, requirement)
    attachments.record_attachment_scan_result(attachment_id=attachment.id, is_clean=False)

    with pytest.raises(attachments.AttachmentRejectedError):
        attachments.record_attachment_scan_result(attachment_id=attachment.id, is_clean=True)


# ---------------------------------------------------------------------------
# Removal
# ---------------------------------------------------------------------------


def test_removing_a_draft_attachment_deletes_the_row_and_the_object(
    world: M2World,
    attachment_storage: FakeAttachmentStorage,
) -> None:
    requirement = draft_requirement(world=world)
    attachment = _attached(world, requirement)
    object_key = attachment.object_key

    response = world.customer_client.delete(
        f"/api/v1/requirements/{requirement.id}/attachments/{attachment.id}/"
    )

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert not RequirementAttachment.objects.filter(id=attachment.id).exists()
    assert object_key in attachment_storage.deleted_keys


def test_removal_is_refused_after_a_vendor_has_seen_the_requirement(world: M2World) -> None:
    """Removing a photograph a vendor quoted on rewrites the question after the answer."""
    requirement = draft_requirement(world=world)
    attachment = _attached(world, requirement)
    services.submit_requirement(
        requirement=requirement,
        actor=world.customer,
        allow_duplicate=True,
    )

    response = world.customer_client.delete(
        f"/api/v1/requirements/{requirement.id}/attachments/{attachment.id}/"
    )

    assert response.status_code == HTTPStatus.CONFLICT
    assert RequirementAttachment.objects.filter(id=attachment.id).exists()


def test_an_infected_attachment_is_removable_in_any_state(world: M2World) -> None:
    """Keeping malware attached to a live requirement for the sake of an audit trail is not a trade.

    The transition log records that it existed; the bytes do not need to.
    """
    requirement = draft_requirement(world=world)
    attachment = _attached(world, requirement)
    attachments.record_attachment_scan_result(attachment_id=attachment.id, is_clean=False)
    services.submit_requirement(
        requirement=requirement,
        actor=world.customer,
        allow_duplicate=True,
    )

    response = world.customer_client.delete(
        f"/api/v1/requirements/{requirement.id}/attachments/{attachment.id}/"
    )

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert not RequirementAttachment.objects.filter(id=attachment.id).exists()


def test_a_storage_deletion_failure_still_removes_the_record(
    world: M2World,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The row is what serves the file. Once it is gone, nothing reads the object.

    A byte range the provider would not delete is an orphan for housekeeping, not a reason to put
    the attachment back in front of the Customer.
    """
    requirement = draft_requirement(world=world)
    attachment = _attached(world, requirement)

    def _refuse(*, object_key: str) -> None:
        del object_key
        raise DocumentStorageError("delete refused")

    monkeypatch.setattr(
        attachments.get_attachment_storage(),
        "delete_object",
        _refuse,
    )

    response = world.customer_client.delete(
        f"/api/v1/requirements/{requirement.id}/attachments/{attachment.id}/"
    )

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert not RequirementAttachment.objects.filter(id=attachment.id).exists()
