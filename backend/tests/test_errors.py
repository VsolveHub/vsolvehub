from http import HTTPStatus

from django.test import Client, override_settings


@override_settings(ROOT_URLCONF="tests.urls", ALLOWED_HOSTS=["testserver"])
def test_validation_error_uses_stable_envelope() -> None:
    response = Client().get("/validation/", headers={"X-Request-ID": "validation-123"})

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json() == {
        "error": {
            "code": "validation_error",
            "message": "Request validation failed.",
            "details": {
                "phone": [
                    {
                        "message": "Enter a valid phone number.",
                        "code": "invalid",
                    },
                ],
            },
            "request_id": "validation-123",
        },
    }


@override_settings(ROOT_URLCONF="tests.urls", ALLOWED_HOSTS=["testserver"])
def test_expected_api_error_does_not_expose_internal_shape() -> None:
    response = Client().get("/not-found/")
    payload = response.json()["error"]

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert payload["code"] == "not_found"
    assert payload["message"] == "Not Found"
    assert payload["details"] == {
        "message": "Booking was not found.",
        "code": "not_found",
    }


@override_settings(ROOT_URLCONF="tests.urls", ALLOWED_HOSTS=["testserver"])
def test_unexpected_error_is_sanitised() -> None:
    response = Client(raise_request_exception=False).get("/unexpected/")
    payload = response.json()["error"]

    assert response.status_code == HTTPStatus.INTERNAL_SERVER_ERROR
    assert payload["code"] == "internal_error"
    assert payload["message"] == "An unexpected error occurred."
    assert "sensitive implementation detail" not in response.content.decode()
