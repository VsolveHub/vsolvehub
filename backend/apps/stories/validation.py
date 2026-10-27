"""Validation for Safety Stories media uploads."""

from __future__ import annotations

from typing import Any

from rest_framework.exceptions import ValidationError

from .models import (
    ALLOWED_IMAGE_CONTENT_TYPES,
    ALLOWED_VIDEO_CONTENT_TYPES,
    MAX_IMAGE_BYTES,
    MAX_VIDEO_BYTES,
    SafetyStory,
)

_WEBP_TAG_END = 12
#: An ISO base-media box header: 4 bytes of size, then the 4-byte box type at offset 4.
_BOX_TYPE_END = 8


def _looks_like_image(head: bytes) -> bool:
    """Validate image magic bytes."""
    if head.startswith(b"\xff\xd8\xff"):
        return True
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    return head[:4] == b"RIFF" and head[8:_WEBP_TAG_END] == b"WEBP"


def _looks_like_video(head: bytes) -> bool:
    """Validate video magic bytes (MP4, QuickTime/MOV, WebM)."""
    # MP4 and Quicktime contain 'ftyp' or 'moov' in first 32 bytes
    if len(head) >= _BOX_TYPE_END and head[4:_BOX_TYPE_END] in (b"ftyp", b"moov"):
        return True
    if b"ftyp" in head[:32]:
        return True
    # WebM EBML ID
    return head.startswith(b"\x1a\x45\xdf\xa3")


def validate_story_media(upload: Any) -> tuple[str, str, int]:
    """Validate an uploaded file for a Safety Story.

    Returns:
        tuple of (media_type, normalized_content_type, size_bytes)
    Raises:
        ValidationError if invalid type, empty, too large, or magic bytes mismatch.
    """
    if upload is None:
        raise ValidationError({"file": "No media file provided."})

    raw_content_type = getattr(upload, "content_type", "") or ""
    content_type = raw_content_type.split(";")[0].strip().lower()

    size = int(getattr(upload, "size", 0) or 0)
    if size <= 0:
        raise ValidationError({"file": "The uploaded media file is empty."})

    is_image = content_type in ALLOWED_IMAGE_CONTENT_TYPES
    is_video = content_type in ALLOWED_VIDEO_CONTENT_TYPES

    if not is_image and not is_video:
        raise ValidationError(
            {
                "file": (
                    f"Unsupported media type '{content_type}'. "
                    f"Allowed images: {', '.join(sorted(ALLOWED_IMAGE_CONTENT_TYPES))}. "
                    f"Allowed videos: {', '.join(sorted(ALLOWED_VIDEO_CONTENT_TYPES))}."
                )
            }
        )

    if is_image:
        if size > MAX_IMAGE_BYTES:
            raise ValidationError(
                {
                    "file": (
                        f"Image must be 15 MB or smaller (received {size / (1024 * 1024):.1f} MB)."
                    )
                }
            )
        media_type = SafetyStory.MediaType.IMAGE
    else:
        if size > MAX_VIDEO_BYTES:
            raise ValidationError(
                {
                    "file": (
                        f"Video must be 100 MB or smaller (received {size / (1024 * 1024):.1f} MB)."
                    )
                }
            )
        media_type = SafetyStory.MediaType.VIDEO

    # Inspect magic bytes
    try:
        upload.seek(0)
        head = upload.read(64)
        upload.seek(0)
    except Exception as exc:
        raise ValidationError({"file": "Could not read media file stream."}) from exc

    if is_image and not _looks_like_image(head):
        raise ValidationError(
            {"file": "The uploaded file does not match the expected image signature."}
        )

    if is_video and not _looks_like_video(head):
        raise ValidationError(
            {"file": "The uploaded file does not match the expected video signature."}
        )

    return media_type, content_type, size
