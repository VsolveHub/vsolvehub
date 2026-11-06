"""The one bounded HTTP call both vendor adapters make.

Request bodies carry the Customer's words, so nothing here logs a body. Errors carry the status
code and the vendor's own short error message, which is what an operator needs to tell a bad key
from a renamed model.
"""

import uuid
from typing import Any, cast

import requests

from .types import ChatModelRejectedError, ChatModelUnavailableError, JsonObject

HTTP_TOO_MANY_REQUESTS = 429
HTTP_SERVER_ERROR = 500
HTTP_CLIENT_ERROR = 400
_MAX_ERROR_DETAIL = 200


def new_call_id() -> str:
    """A tool-call id for vendors that do not issue one. Short: some vendors cap the length."""

    return f"call_{uuid.uuid4().hex[:20]}"


def _vendor_error_detail(response: requests.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return ""
    if not isinstance(body, dict):
        return ""
    error = body.get("error")
    if isinstance(error, dict) and isinstance(error.get("message"), str):
        return cast(str, error["message"])[:_MAX_ERROR_DETAIL]
    return ""


def post_json(
    *,
    url: str,
    headers: dict[str, str],
    body: JsonObject,
    timeout: tuple[float, float],
    vendor: str,
) -> JsonObject:
    try:
        response = requests.post(url, headers=headers, json=body, timeout=timeout)
    except (requests.Timeout, requests.ConnectionError) as exc:
        raise ChatModelUnavailableError(f"{vendor} did not respond in time.") from exc
    status = response.status_code
    if status == HTTP_TOO_MANY_REQUESTS or status >= HTTP_SERVER_ERROR:
        raise ChatModelUnavailableError(
            f"{vendor} returned HTTP {status}. {_vendor_error_detail(response)}".strip()
        )
    if status >= HTTP_CLIENT_ERROR:
        detail = _vendor_error_detail(response)
        raise ChatModelRejectedError(
            f"{vendor} rejected the request (HTTP {status}). {detail}".strip()
        )
    try:
        data: Any = response.json()
    except ValueError as exc:
        raise ChatModelUnavailableError(f"{vendor} returned a body that is not JSON.") from exc
    if not isinstance(data, dict):
        raise ChatModelUnavailableError(f"{vendor} returned an unexpected body shape.")
    return cast(JsonObject, data)
