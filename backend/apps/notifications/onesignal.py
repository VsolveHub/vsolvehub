"""OneSignal REST API client for targeted push notifications."""

import logging
from http import HTTPStatus
from typing import Any, Literal

import requests
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 10

#: Each audience has its own OneSignal app, shared by its website and mobile app.
Audience = Literal["PARTNER", "CUSTOMER"]


def app_credentials(audience: Audience) -> tuple[str, str]:
    """The OneSignal app ID and REST API key for one audience.

    Partner and customer are separate OneSignal apps, and there is deliberately no shared
    default: a push that does not say which app it is for must fail, not go to the wrong one.
    """
    if audience == "CUSTOMER":
        return settings.ONESIGNAL_CUSTOMER_APP_ID, settings.ONESIGNAL_CUSTOMER_REST_API_KEY
    return settings.ONESIGNAL_PARTNER_APP_ID, settings.ONESIGNAL_PARTNER_REST_API_KEY


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


def send_push_to_external_ids(  # noqa: PLR0917
    external_ids: list[str],
    heading: str,
    body: str,
    data: dict[str, Any],
    url: str | None = None,
    *,
    app_id: str,
    rest_api_key: str,
    collapse_id: str | None = None,
    web_push_topic: str | None = None,
    ttl: int | None = None,
    priority: int | None = 10,
    android_channel_id: str | None = None,
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

    api_url = getattr(settings, "ONESIGNAL_API_URL", "https://api.onesignal.com/notifications")

    # No fallback: the caller names the app (see `app_credentials`).
    if not app_id or not rest_api_key:
        logger.error("[OneSignal] Target app ID or REST API key is not configured")
        return {
            "success": False,
            "notification_id": None,
            "errors": ["Target app ID or REST API key not configured"],
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
        "data": {**data, "url": data.get("url") or url} if url else data,
    }

    # `web_url`, not `url`: a phone would open `url` in the browser instead of the app. The
    # apps route from `data` (its `url`, `target` or offer id) to their own screen.
    optional_fields = {
        "web_url": url,
        "android_channel_id": android_channel_id,
        "collapse_id": collapse_id,
        "web_push_topic": web_push_topic,
    }
    payload.update({name: value for name, value in optional_fields.items() if value})
    if ttl is not None:
        payload["ttl"] = ttl
    if priority is not None:
        payload["priority"] = priority

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
            "http_status": 504 if "timeout" in str(exc).lower() else 500,
        }

    # OneSignal success status is 200 with "id" field in JSON response
    notification_id = raw_data.get("id")
    errors = raw_data.get("errors") or []
    if isinstance(errors, str):
        errors = [errors]
    elif isinstance(errors, dict):
        errors = [f"{k}: {v}" for k, v in errors.items()]

    success = response.status_code == HTTPStatus.OK and bool(notification_id) and not errors

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
        "http_status": response.status_code,
    }


def get_notification_view_metrics(
    notification_id: str,
    app_id: str,
    rest_api_key: str,
) -> dict[str, Any]:
    """Query OneSignal View Message API: GET /notifications/{notification_id}?app_id={app_id}."""
    if not notification_id or not app_id or not rest_api_key:
        return {"success": False, "error": "Missing notification_id, app_id, or rest_api_key"}

    auth_prefix = "Key" if rest_api_key.startswith("os_v2_") else "Basic"
    headers = {
        "Authorization": f"{auth_prefix} {rest_api_key}",
    }
    api_url = f"https://api.onesignal.com/notifications/{notification_id}?app_id={app_id}"
    session = _build_retry_session(retries=1)
    try:
        response = session.get(api_url, headers=headers, timeout=DEFAULT_TIMEOUT_SECONDS)
        if response.status_code == HTTPStatus.OK:
            data = response.json()
            return {
                "success": True,
                "data": data,
                "successful": data.get("successful", 0),
                "failed": data.get("failed", 0),
                "errored": data.get("errored", 0),
                "converted": data.get("converted", 0),
                "received": data.get("received", 0),
                "remaining": data.get("remaining", 0),
                "http_status": 200,
            }
        return {
            "success": False,
            "error": f"OneSignal returned {response.status_code}",
            "http_status": response.status_code,
            "data": response.json() if response.content else {},
        }
    except requests.exceptions.RequestException as exc:
        return {
            "success": False,
            "error": str(exc),
            "http_status": 504 if "timeout" in str(exc).lower() else 500,
        }
