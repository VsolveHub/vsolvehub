"""Cloudflare R2: private documents through signed links, and photo links from either storage."""

import hashlib
from typing import Any

import pytest
from django.core.files.storage import default_storage
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings

from apps.foundation import storage as storage_module
from apps.foundation.storage import (
    SIGNED_UPLOAD_LIFETIME,
    DocumentStorageError,
    R2DocumentStorage,
    get_document_storage,
    public_stored_name,
)

PRIVATE_BUCKET = "vsolve-private"
SIZE_LIMIT = 10
REVIEW_SECONDS = 300


class _Body:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.closed = False

    def iter_chunks(self, chunk_size: int) -> Any:
        for start in range(0, len(self.data), chunk_size):
            yield self.data[start : start + chunk_size]

    def close(self) -> None:
        self.closed = True


class _Client:
    """Just enough of boto3's S3 client to exercise R2DocumentStorage."""

    def __init__(self, data: bytes = b"hello") -> None:
        self.data = data
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.body = _Body(data)

    def generate_presigned_url(self, operation: str, **kwargs: Any) -> str:
        self.calls.append((operation, kwargs))
        return f"https://account.r2.cloudflarestorage.com/{kwargs['Params']['Key']}?sig=1"

    def get_object(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("get_object", kwargs))
        return {"Body": self.body, "ContentLength": len(self.data), "ContentType": "image/JPEG"}

    def delete_object(self, **kwargs: Any) -> None:
        self.calls.append(("delete_object", kwargs))


def _storage(client: _Client) -> R2DocumentStorage:
    return R2DocumentStorage(client=client, bucket=PRIVATE_BUCKET, folder="partner-kyc")


def test_signed_upload_is_a_plain_put_into_the_documents_folder():
    client = _Client()
    signed = _storage(client).create_signed_upload(object_key="p1/doc.jpg")

    operation, kwargs = client.calls[0]
    assert operation == "put_object"
    assert kwargs["Params"] == {"Bucket": PRIVATE_BUCKET, "Key": "partner-kyc/p1/doc.jpg"}
    assert kwargs["ExpiresIn"] == int(SIGNED_UPLOAD_LIFETIME.total_seconds())
    assert signed.upload_url.startswith("https://")
    assert signed.method == "PUT"
    assert signed.upload_token == ""


def test_verify_streams_the_object_back():
    client = _Client(b"x" * SIZE_LIMIT)
    verified = _storage(client).verify_object(
        object_key="p1/doc.jpg", maximum_size_bytes=SIZE_LIMIT
    )

    assert verified.size_bytes == SIZE_LIMIT
    assert verified.sha256 == hashlib.sha256(b"x" * SIZE_LIMIT).hexdigest()
    assert verified.content_type == "image/jpeg"
    assert client.body.closed


def test_verify_refuses_an_oversized_object():
    client = _Client(b"x" * (SIZE_LIMIT + 1))
    with pytest.raises(DocumentStorageError):
        _storage(client).verify_object(object_key="p1/doc.jpg", maximum_size_bytes=SIZE_LIMIT)
    assert client.body.closed


def test_review_link_expires_and_delete_targets_the_folder():
    client = _Client()
    review = _storage(client).create_signed_review(
        object_key="p1/doc.jpg", expires_in_seconds=REVIEW_SECONDS
    )
    _storage(client).delete_object(object_key="p1/doc.jpg")

    assert review.review_url.startswith("https://")
    assert client.calls[0][0] == "get_object"  # the signed GET
    assert client.calls[0][1]["ExpiresIn"] == REVIEW_SECONDS
    assert client.calls[1] == (
        "delete_object",
        {"Bucket": PRIVATE_BUCKET, "Key": "partner-kyc/p1/doc.jpg"},
    )


def test_r2_is_chosen_when_configured(monkeypatch):
    client = _Client()
    monkeypatch.setattr(storage_module, "r2_client", lambda: client)
    with override_settings(
        DOCUMENT_STORAGE_PROVIDER="r2", R2_PRIVATE_ENABLED=True, R2_PRIVATE_BUCKET=PRIVATE_BUCKET
    ):
        chosen = get_document_storage(bucket="crew-identity")
    assert isinstance(chosen, R2DocumentStorage)
    assert chosen.folder == "crew-identity"


def test_local_photo_links_resolve_to_their_stored_name():
    assert public_stored_name("/media/stay-ads/p/a.jpg", folder="stay-ads/") == "stay-ads/p/a.jpg"
    assert (
        public_stored_name("http://testserver/media/stay-ads/p/a.jpg", folder="stay-ads/")
        == "stay-ads/p/a.jpg"
    )
    assert public_stored_name("/media/rental-ads/p/a.jpg", folder="stay-ads/") is None
    assert public_stored_name("https://evil.example/stay-ads/p/a.jpg", folder="stay-ads/") is None


def test_r2_photo_links_resolve_to_their_stored_name(monkeypatch):
    monkeypatch.setattr(default_storage, "url", lambda name: f"https://media.example.test/{name}")
    link = "https://media.example.test/stay-ads/p/a.jpg"
    assert public_stored_name(link, folder="stay-ads/") == "stay-ads/p/a.jpg"
    # The old local address no longer matches once photos are served from R2.
    assert public_stored_name("/media/stay-ads/p/a.jpg", folder="stay-ads/") is None


def test_copy_command_refuses_without_r2_settings():
    with (
        override_settings(R2_PUBLIC_ENABLED=False, R2_PRIVATE_ENABLED=False),
        pytest.raises(CommandError),
    ):
        call_command("copy_files_to_r2", "--dry-run")
