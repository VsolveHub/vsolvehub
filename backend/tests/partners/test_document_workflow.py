from datetime import timedelta
from http import HTTPStatus
from typing import Any, cast

import pytest
from django.utils import timezone

from apps.partners.models import PartnerApplication, PartnerDocument, PartnerDocumentUpload
from apps.partners.services import cleanup_stale_partner_document_uploads
from apps.partners.storage import DocumentStorageError, VerifiedObject
from tests.partners.conftest import FakeDocumentStorage, PartnerSetup, application_payload

pytestmark = pytest.mark.django_db


def _create_application(setup: PartnerSetup) -> dict[str, Any]:
    response = setup.client.patch(
        "/api/v1/partner/application/",
        application_payload(setup),
        format="json",
    )
    assert response.status_code == HTTPStatus.CREATED
    return cast(dict[str, Any], response.json())


def _issue_upload(setup: PartnerSetup, *, expected_version: int) -> dict[str, Any]:
    response = setup.client.post(
        "/api/v1/partner/application/documents/uploads/",
        {
            "expected_version": expected_version,
            "kind": PartnerDocument.Kind.GOVERNMENT_ID,
            "content_type": "application/pdf",
            "size_bytes": 512,
            "sha256": "a" * 64,
        },
        format="json",
    )
    assert response.status_code == HTTPStatus.CREATED
    return cast(dict[str, Any], response.json())


def test_upload_grants_use_random_server_owned_private_object_keys(
    partner_setup: PartnerSetup,
) -> None:
    application = _create_application(partner_setup)

    first = _issue_upload(partner_setup, expected_version=int(application["version"]))
    second = _issue_upload(partner_setup, expected_version=int(application["version"]))

    assert first["object_key"] != second["object_key"]
    assert str(first["object_key"]).startswith(
        f"partners/{application['partner_id']}/government_id/"
    )
    assert str(first["object_key"]).endswith(".pdf")
    assert first["upload_url"].startswith("https://storage.test/")
    assert first["resumable_url"] == "https://storage.test/upload/resumable"
    assert first["upload_token"]


def test_finalize_rejects_metadata_mismatch_and_cannot_be_replayed(
    partner_setup: PartnerSetup,
    document_storage: FakeDocumentStorage,
) -> None:
    application = _create_application(partner_setup)
    upload_payload = _issue_upload(
        partner_setup,
        expected_version=int(application["version"]),
    )
    upload = PartnerDocumentUpload.objects.get(id=upload_payload["id"])
    document_storage.verification_overrides[upload.object_key] = VerifiedObject(
        size_bytes=upload.size_bytes,
        content_type=upload.content_type,
        sha256="b" * 64,
    )
    finalize_payload = {
        "expected_version": application["version"],
        "upload_id": upload_payload["id"],
    }

    mismatch = partner_setup.client.post(
        "/api/v1/partner/application/documents/",
        finalize_payload,
        format="json",
    )
    replay = partner_setup.client.post(
        "/api/v1/partner/application/documents/",
        finalize_payload,
        format="json",
    )

    assert mismatch.status_code == HTTPStatus.CONFLICT
    assert mismatch.json()["error"]["code"] == "partner_document_upload_invalid"
    assert replay.status_code == HTTPStatus.CONFLICT
    upload.refresh_from_db()
    assert upload.status == PartnerDocumentUpload.Status.FAILED
    assert upload.failure_code == "metadata_mismatch"
    assert not PartnerDocument.objects.filter(application=upload.application).exists()
    current_version = PartnerApplication.objects.get(id=upload.application_id).version
    assert current_version == application["version"]


def test_expired_and_provider_failed_uploads_fail_closed(
    partner_setup: PartnerSetup,
    document_storage: FakeDocumentStorage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    application = _create_application(partner_setup)
    expired_payload = _issue_upload(
        partner_setup,
        expected_version=int(application["version"]),
    )
    PartnerDocumentUpload.objects.filter(id=expired_payload["id"]).update(
        expires_at=timezone.now() - timedelta(seconds=1),
    )
    expired = partner_setup.client.post(
        "/api/v1/partner/application/documents/",
        {
            "expected_version": application["version"],
            "upload_id": expired_payload["id"],
        },
        format="json",
    )

    def unavailable(*, object_key: str) -> object:
        del object_key
        raise DocumentStorageError("provider unavailable")

    monkeypatch.setattr(document_storage, "create_signed_upload", unavailable)
    provider_failed = partner_setup.client.post(
        "/api/v1/partner/application/documents/uploads/",
        {
            "expected_version": application["version"],
            "kind": PartnerDocument.Kind.GOVERNMENT_ID,
            "content_type": "image/jpeg",
            "size_bytes": 100,
            "sha256": "c" * 64,
        },
        format="json",
    )

    assert expired.status_code == HTTPStatus.CONFLICT
    assert provider_failed.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert provider_failed.json()["error"]["retryable"] is True
    failed_intent = PartnerDocumentUpload.objects.exclude(id=expired_payload["id"]).get()
    assert failed_intent.status == PartnerDocumentUpload.Status.FAILED
    assert failed_intent.failure_code == "provider_unavailable"


def test_orphan_cleanup_is_delayed_and_idempotent(
    partner_setup: PartnerSetup,
    document_storage: FakeDocumentStorage,
    settings: Any,
) -> None:
    application = _create_application(partner_setup)
    payload = _issue_upload(partner_setup, expected_version=int(application["version"]))
    upload = PartnerDocumentUpload.objects.get(id=payload["id"])
    upload.status = PartnerDocumentUpload.Status.FAILED
    upload.failure_code = "metadata_mismatch"
    upload.save(update_fields=("status", "failure_code", "updated_at"))
    retention_hours = 24
    settings.PARTNER_DOCUMENT_ORPHAN_RETENTION_HOURS = retention_hours

    assert cleanup_stale_partner_document_uploads(storage=document_storage) == 0
    PartnerDocumentUpload.objects.filter(id=upload.id).update(
        updated_at=timezone.now() - timedelta(hours=retention_hours + 1),
    )

    assert cleanup_stale_partner_document_uploads(storage=document_storage) == 1
    assert cleanup_stale_partner_document_uploads(storage=document_storage) == 0
    upload.refresh_from_db()
    assert upload.object_deleted_at is not None
    assert document_storage.deleted_keys == [upload.object_key]
