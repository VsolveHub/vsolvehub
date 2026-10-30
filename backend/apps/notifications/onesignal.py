"""OneSignal REST API client for targeted push notifications."""

import logging
from typing import Any
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from django.conf import settings

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 10


def _build_retry_session(retries: int = 3, backoff_factor: float = 0.5) -> requests.Session:
    session = requests.Session()
    retry_strategy = Retry(
        total=retries,
        backoff_factor=backoff_factor,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["POST"],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def send_push_to_external_ids(
    external_ids: list[str],
    heading: str,
    body: str,
    data: dict[str, Any],
    url: str | None = None,
) -> dict[str, Any]:
    """Send a push notification to specific users identified by their external_id aliases.

    Follows OneSignal REST API v1/v16 specifications using `include_aliases`.
    Stores REST API key strictly on the server.
    """
    cleaned_external_ids = [str(eid).strip() for eid in external_ids if str(eid).strip()]
    if not cleaned_external_ids:
        logger.warning("[OneSignal] Push attempted with empty external_ids list")
        return {
            "success": False,
            "notification_id": None,
            "errors": ["No valid external_ids provided"],
            "raw_response": {},
        }

    app_id = getattr(settings, "ONESIGNAL_APP_ID", "")
    rest_api_key = getattr(settings, "ONESIGNAL_REST_API_KEY", "")
    api_url = getattr(settings, "ONESIGNAL_API_URL", "https://api.onesignal.com/notifications")

    if not app_id:
        logger.error("[OneSignal] ONESIGNAL_APP_ID is not configured in settings")
        return {
            "success": False,
            "notification_id": None,
            "errors": ["ONESIGNAL_APP_ID not configured"],
            "raw_response": {},
        }

    payload: dict[str, Any] = {
        "app_id": app_id,
        "target_channel": "push",
        "include_aliases": {
            "external_id": cleaned_external_ids,
        },
        "headings": {"en": heading},
        "contents": {"en": body},
        "data": data,
    }

    if url:
        payload["url"] = url

    auth_prefix = "Key" if rest_api_key.startswith("os_v2_") else "Basic"
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": f"{auth_prefix} {rest_api_key}",
    }

    session = _build_retry_session()
    try:
        response = session.post(
            api_url,
            json=payload,
            headers=headers,
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
        raw_data = response.json() if response.content else {}
    except requests.exceptions.RequestException as exc:
        logger.error(
            "[OneSignal] Failed to send push to %d external_ids: %s",
            len(cleaned_external_ids),
            exc,
        )
        return {
            "success": False,
            "notification_id": None,
            "errors": [str(exc)],
            "raw_response": {},
        }

    # OneSignal success status is 200 with "id" field in JSON response
    notification_id = raw_data.get("id")
    errors = raw_data.get("errors") or []
    if isinstance(errors, str):
        errors = [errors]
    elif isinstance(errors, dict):
        errors = [f"{k}: {v}" for k, v in errors.items()]

    success = response.status_code == 200 and bool(notification_id) and not errors

    if success:
        logger.info(
            "[OneSignal] Sent push notification %s to %d recipient(s)",
            notification_id,
            len(cleaned_external_ids),
        )
    else:
        logger.warning(
            "[OneSignal] Notification response code %d, errors: %s, payload id: %s",
            response.status_code,
            errors,
            notification_id,
        )

    return {
        "success": success,
        "notification_id": notification_id,
        "errors": errors,
        "raw_response": raw_data,
    }
