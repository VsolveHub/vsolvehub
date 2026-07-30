"""One-way hashing for request metadata and server-side session references."""

import hashlib
import hmac

from django.conf import settings


def keyed_hash(value: str) -> str:
    return hmac.new(
        key=settings.SECRET_KEY.encode(),
        msg=value.encode(),
        digestmod=hashlib.sha256,
    ).hexdigest()
