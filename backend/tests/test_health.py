from http import HTTPStatus
from unittest.mock import Mock, patch

from django.test import Client, override_settings


@override_settings(ALLOWED_HOSTS=["testserver"])
def test_liveness_returns_request_id() -> None:
    response = Client().get("/api/v1/health/live/")

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {"status": "ok", "service": "vsolve-hub-api"}
    assert response.headers["X-Request-ID"]


@override_settings(ALLOWED_HOSTS=["testserver"])
def test_liveness_preserves_safe_request_id() -> None:
    response = Client().get(
        "/api/v1/health/live/",
        headers={"X-Request-ID": "customer-web:request-123"},
    )

    assert response.headers["X-Request-ID"] == "customer-web:request-123"


@override_settings(ALLOWED_HOSTS=["testserver"])
def test_liveness_replaces_unsafe_request_id() -> None:
    response = Client().get(
        "/api/v1/health/live/",
        headers={"X-Request-ID": "invalid request id"},
    )

    assert response.headers["X-Request-ID"] != "invalid request id"


@override_settings(ALLOWED_HOSTS=["testserver"])
@patch("apps.health.views.caches")
@patch("apps.health.views.connections")
def test_readiness_reports_healthy_dependencies(
    mock_connections: Mock,
    mock_caches: Mock,
) -> None:
    mock_cache = mock_caches.__getitem__.return_value
    mock_cache.get.return_value = "ok"

    response = Client().get("/api/v1/health/ready/")

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {
        "status": "ok",
        "checks": {"database": "ok", "cache": "ok"},
    }
    mock_connections.__getitem__.return_value.ensure_connection.assert_called_once_with()


@override_settings(ALLOWED_HOSTS=["testserver"])
@patch("apps.health.views.caches")
@patch("apps.health.views.connections")
def test_readiness_reports_unavailable_dependency(
    mock_connections: Mock,
    mock_caches: Mock,
) -> None:
    mock_connections.__getitem__.return_value.ensure_connection.side_effect = OSError
    mock_caches.__getitem__.return_value.set.side_effect = OSError

    response = Client().get("/api/v1/health/ready/")

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json() == {
        "status": "degraded",
        "checks": {"database": "unavailable", "cache": "unavailable"},
    }
