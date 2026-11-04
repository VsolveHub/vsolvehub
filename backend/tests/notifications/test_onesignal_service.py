"""Tests for OneSignal REST API client service."""

from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIClient

from apps.identity.models import User
from apps.notifications.onesignal import send_push_to_external_ids


@pytest.fixture(autouse=True)
def configure_onesignal_settings(settings):
    settings.ONESIGNAL_APP_ID = "test-app-id-12345"
    settings.ONESIGNAL_REST_API_KEY = "test-rest-key-99999"
    # The sender prefers the partner app's settings, which config/settings/test.py also sets.
    settings.ONESIGNAL_PARTNER_APP_ID = "test-app-id-12345"
    settings.ONESIGNAL_PARTNER_REST_API_KEY = "test-rest-key-99999"
    settings.ONESIGNAL_API_URL = "https://api.onesignal.com/notifications"
    settings.ONESIGNAL_ENV = "local"


@pytest.mark.parametrize("channel", ["offer-channel-uuid", None])
def test_android_channel_is_sent_only_when_given(channel: str | None) -> None:
    with patch("requests.Session.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200, content=b'{"id": "n-1"}')
        mock_post.return_value.json.return_value = {"id": "n-1"}

        send_push_to_external_ids(
            external_ids=["user-1"], heading="h", body="b", data={}, android_channel_id=channel
        )

    payload = mock_post.call_args.kwargs["json"]
    assert payload.get("android_channel_id") == channel
    assert "web_url" not in payload


def test_send_push_to_external_ids_correct_payload():
    external_ids = ["partner-uuid-1", "user-uuid-1"]
    heading = "New Instant job nearby"
    body = "Tap to review and accept this ASAP booking."
    data = {"type": "DISPATCH_OFFER", "offer_id": "offer-123"}
    launch_url = "http://localhost:3001/dispatch/offer-123"

    with patch("requests.Session.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'{"id": "notif-abc-123", "recipients": 2}'
        mock_response.json.return_value = {"id": "notif-abc-123", "recipients": 2}
        mock_post.return_value = mock_response

        result = send_push_to_external_ids(
            external_ids=external_ids,
            heading=heading,
            body=body,
            data=data,
            url=launch_url,
        )

        assert result["success"] is True
        assert result["notification_id"] == "notif-abc-123"
        assert result["errors"] == []

        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args.kwargs
        json_payload = call_kwargs["json"]
        headers = call_kwargs["headers"]

        # Verify payload fields match OneSignal v16 specification
        assert json_payload["app_id"] == "test-app-id-12345"
        assert json_payload["target_channel"] == "push"
        assert json_payload["include_aliases"] == {"external_id": ["partner-uuid-1", "user-uuid-1"]}
        assert json_payload["headings"] == {"en": heading}
        assert json_payload["contents"] == {"en": body}
        # The link rides in `data` for the apps and as `web_url` for browsers only: a phone
        # given `url` opens the browser instead of the app.
        assert json_payload["data"] == {**data, "url": launch_url}
        assert json_payload["web_url"] == launch_url
        assert "url" not in json_payload

        # Verify Authorization header uses server-side REST API key
        assert headers["Authorization"] == "Basic test-rest-key-99999"
        assert headers["Content-Type"] == "application/json; charset=utf-8"


def test_send_push_os_v2_key_authorization_header(settings):
    settings.ONESIGNAL_APP_ID = "test-app-id-12345"
    settings.ONESIGNAL_REST_API_KEY = "os_v2_app_real_api_key_here"
    settings.ONESIGNAL_PARTNER_REST_API_KEY = "os_v2_app_real_api_key_here"

    with patch("requests.Session.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'{"id": "notif-osv2-1", "recipients": 1}'
        mock_response.json.return_value = {"id": "notif-osv2-1", "recipients": 1}
        mock_post.return_value = mock_response

        result = send_push_to_external_ids(
            external_ids=["user-1"],
            heading="Title",
            body="Body",
            data={},
        )
        assert result["success"] is True
        headers = mock_post.call_args.kwargs["headers"]
        assert headers["Authorization"] == "Key os_v2_app_real_api_key_here"


def test_send_push_empty_external_ids_rejected():
    with patch("requests.Session.post") as mock_post:
        result = send_push_to_external_ids(
            external_ids=[],
            heading="Test",
            body="Test body",
            data={},
        )
        assert result["success"] is False
        assert "No valid external_ids provided" in result["errors"]
        mock_post.assert_not_called()


def test_send_push_api_error_response_handled():
    with patch("requests.Session.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.content = b'{"errors": ["All included players are not subscribed"]}'
        mock_response.json.return_value = {"errors": ["All included players are not subscribed"]}
        mock_post.return_value = mock_response

        result = send_push_to_external_ids(
            external_ids=["unknown-partner"],
            heading="Test",
            body="Test",
            data={},
        )

        assert result["success"] is False
        assert result["notification_id"] is None
        assert "All included players are not subscribed" in result["errors"]


def test_send_push_network_exception_handled():
    import requests

    with patch(
        "requests.Session.post", side_effect=requests.exceptions.ConnectTimeout("Network timeout")
    ):
        result = send_push_to_external_ids(
            external_ids=["partner-1"],
            heading="Test",
            body="Test",
            data={},
        )

        assert result["success"] is False
        assert result["notification_id"] is None
        assert any("Network timeout" in str(e) for e in result["errors"])


def test_send_push_with_collapse_id_web_push_topic_ttl_priority():
    with patch("requests.Session.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b'{"id": "notif-collapse-1"}'
        mock_response.json.return_value = {"id": "notif-collapse-1"}
        mock_post.return_value = mock_response

        result = send_push_to_external_ids(
            external_ids=["partner-1"],
            heading="Instant Job",
            body="New job nearby",
            data={"offer_id": "off-1"},
            collapse_id="dispatch_offer_off-1",
            web_push_topic="dispatch_off-1",
            ttl=45,
            priority=10,
            app_id="partner-app-999",
        )

        assert result["success"] is True
        assert result["notification_id"] == "notif-collapse-1"
        payload = mock_post.call_args.kwargs["json"]
        assert payload["app_id"] == "partner-app-999"
        assert payload["collapse_id"] == "dispatch_offer_off-1"
        assert payload["web_push_topic"] == "dispatch_off-1"
        assert payload["ttl"] == 45
        assert payload["priority"] == 10


# --- the local test-push endpoint ---------------------------------------------------------------

DEV_PUSH_URL = "/api/v1/dev/onesignal/test-push/"


@pytest.mark.django_db
def test_dev_test_push_is_gone_without_debug_whatever_onesignal_env_says(settings):
    settings.DEBUG = False
    settings.ONESIGNAL_ENV = "local"
    user = User.objects.create_user(phone_number="+919900000901", full_name="Anyone")
    client = APIClient()
    client.force_authenticate(user=user)

    with patch("apps.notifications.onesignal.send_push_to_external_ids") as send:
        response = client.post(DEV_PUSH_URL, {"external_id": "someone-else"}, format="json")

    assert response.status_code == 404
    send.assert_not_called()


@pytest.mark.django_db
def test_dev_test_push_needs_a_session_and_only_reaches_the_caller(settings):
    settings.DEBUG = True
    anonymous = APIClient().post(DEV_PUSH_URL, {"external_id": "someone-else"}, format="json")
    assert anonymous.status_code in (401, 403)

    user = User.objects.create_user(phone_number="+919900000902", full_name="Developer")
    client = APIClient()
    client.force_authenticate(user=user)
    with patch("apps.notifications.onesignal.send_push_to_external_ids") as send:
        send.return_value = {"success": True, "notification_id": "x", "errors": []}
        client.post(DEV_PUSH_URL, {"external_id": "someone-else"}, format="json")

    assert send.call_args.kwargs["external_ids"] == [str(user.id)]
