import hashlib
from datetime import timedelta
from secrets import token_urlsafe
from unittest.mock import MagicMock, patch

import pytest
import requests
from django.utils import timezone

from apps.foundation.storage import (
    DocumentStorageError,
    SupabaseDocumentStorage,
)


def _storage() -> SupabaseDocumentStorage:
    return SupabaseDocumentStorage(
        storage_url="https://project.supabase.co/storage/v1",
        service_role_key=token_urlsafe(32),
        bucket="partner-private",
        connect_timeout_seconds=2.0,
        read_timeout_seconds=15.0,
    )


def _response(*, status_code: int = 200) -> MagicMock:
    response = MagicMock(spec=requests.Response)
    response.status_code = status_code
    response.headers = {}
    return response


def test_signed_upload_uses_private_api_headers_and_exposes_tus_token() -> None:
    signed_token = token_urlsafe(16)
    response = _response()
    response.json.return_value = {
        "url": f"/object/upload/sign/partner-private/partners/id/file.pdf?token={signed_token}"
    }
    before = timezone.now()

    with patch("apps.foundation.storage.requests.post", return_value=response) as request:
        signed = _storage().create_signed_upload(object_key="partners/id/file.pdf")

    assert signed.upload_token == signed_token
    assert signed.upload_url.startswith(
        "https://project.supabase.co/storage/v1/object/upload/sign/"
    )
    assert signed.resumable_url == "https://project.supabase.co/storage/v1/upload/resumable"
    assert before + timedelta(hours=2) <= signed.expires_at
    kwargs = request.call_args.kwargs
    assert kwargs["timeout"] == (2.0, 15.0)
    assert kwargs["headers"]["Authorization"].startswith("Bearer ")
    assert kwargs["headers"]["apikey"]


def test_object_verification_streams_and_hashes_authoritative_bytes() -> None:
    body = (b"first chunk", b"second chunk")
    response = _response()
    response.headers = {
        "Content-Length": str(sum(len(chunk) for chunk in body)),
        "Content-Type": "application/pdf; charset=binary",
    }
    response.iter_content.return_value = body

    with patch("apps.foundation.storage.requests.get", return_value=response) as request:
        verified = _storage().verify_object(
            object_key="partners/id/file.pdf",
            maximum_size_bytes=1024,
        )

    assert verified.size_bytes == sum(len(chunk) for chunk in body)
    assert verified.content_type == "application/pdf"
    assert verified.sha256 == hashlib.sha256(b"".join(body)).hexdigest()
    assert request.call_args.kwargs["stream"] is True
    response.close.assert_called_once_with()


def test_object_verification_rejects_declared_oversize_and_closes_response() -> None:
    response = _response()
    response.headers = {"Content-Length": "1025", "Content-Type": "application/pdf"}

    with (
        patch("apps.foundation.storage.requests.get", return_value=response),
        pytest.raises(DocumentStorageError, match="exceeds"),
    ):
        _storage().verify_object(
            object_key="partners/id/file.pdf",
            maximum_size_bytes=1024,
        )

    response.iter_content.assert_not_called()
    response.close.assert_called_once_with()


def test_signed_review_is_short_lived_and_delete_is_idempotent_for_missing_object() -> None:
    review_token = token_urlsafe(16)
    signed_response = _response()
    signed_response.json.return_value = {
        "signedURL": f"/object/sign/partner-private/partners/id/file.pdf?token={review_token}"
    }
    missing_response = _response(status_code=404)

    with patch("apps.foundation.storage.requests.post", return_value=signed_response):
        signed = _storage().create_signed_review(
            object_key="partners/id/file.pdf",
            expires_in_seconds=300,
        )
    with patch(
        "apps.foundation.storage.requests.delete",
        return_value=missing_response,
    ) as delete_request:
        _storage().delete_object(object_key="partners/id/file.pdf")

    assert review_token in signed.review_url
    assert signed.expires_at <= timezone.now() + timedelta(seconds=301)
    missing_response.raise_for_status.assert_not_called()
    assert delete_request.call_args.args[0].endswith("/object/partner-private")
    assert delete_request.call_args.kwargs["json"] == {
        "prefixes": ["partners/id/file.pdf"],
    }
