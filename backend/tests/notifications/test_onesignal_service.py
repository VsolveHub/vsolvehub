"""Tests for OneSignal REST API client service."""

from unittest.mock import MagicMock, patch
import pytest
from apps.notifications.onesignal import send_push_to_external_ids



@pytest.fixture(autouse=True)
def configure_onesignal_settings(settings):
    settings.ONESIGNAL_APP_ID = "test-app-id-12345"
    settings.ONESIGNAL_REST_API_KEY = "test-rest-key-99999"
    settings.ONESIGNAL_API_URL = "https://api.onesignal.com/notifications"
    settings.ONESIGNAL_ENV = "local"


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
        assert json_payload["data"] == data
        assert json_payload["url"] == launch_url

        # Verify Authorization header uses server-side REST API key
        assert headers["Authorization"] == "Basic test-rest-key-99999"
        assert headers["Content-Type"] == "application/json; charset=utf-8"


def test_send_push_os_v2_key_authorization_header(settings):
    settings.ONESIGNAL_APP_ID = "test-app-id-12345"
    settings.ONESIGNAL_REST_API_KEY = "os_v2_app_real_api_key_here"

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

    with patch("requests.Session.post", side_effect=requests.exceptions.ConnectTimeout("Network timeout")):
        result = send_push_to_external_ids(
            external_ids=["partner-1"],
            heading="Test",
            body="Test",
            data={},
        )

        assert result["success"] is False
        assert result["notification_id"] is None
        assert any("Network timeout" in str(e) for e in result["errors"])
