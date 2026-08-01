from typing import Any, cast

from drf_spectacular.generators import SchemaGenerator


def _operation(schema: dict[str, Any], path: str, method: str) -> dict[str, Any]:
    paths = cast(dict[str, dict[str, dict[str, Any]]], schema["paths"])
    return paths[path][method]


def test_browser_session_and_idempotency_contract_is_published() -> None:
    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))

    assert schema["info"]["version"] == "1.5.0"
    csrf = _operation(schema, "/api/v1/auth/csrf/", "get")
    assert csrf["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/CsrfToken"
    }

    otp_request = _operation(schema, "/api/v1/auth/otp/request/", "post")
    throttle_examples = otp_request["responses"]["429"]["content"]["application/json"]["examples"]
    throttle_example = next(iter(throttle_examples.values()))
    assert throttle_example["value"]["error"]["details"] == {"retry_after_seconds": 47}

    checkout = _operation(schema, "/api/v1/checkouts/", "post")
    idempotency_header = next(
        parameter for parameter in checkout["parameters"] if parameter["name"] == "Idempotency-Key"
    )
    assert idempotency_header["in"] == "header"
    assert idempotency_header["required"] is True

    session = _operation(schema, "/api/v1/auth/session/", "get")
    assert session["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/SessionState"
    }

    _operation(schema, "/api/v1/service-areas/", "get")
    _operation(schema, "/api/v1/partner/skills/", "get")
    _operation(schema, "/api/v1/partner/required-consents/", "get")
    application_patch = _operation(schema, "/api/v1/partner/application/", "patch")
    request_schema = application_patch["requestBody"]["content"]["application/json"]["schema"]
    request_component_name = request_schema["$ref"].rsplit("/", maxsplit=1)[-1]
    request_component = schema["components"]["schemas"][request_component_name]
    assert "required" not in request_component


def test_private_partner_document_and_operations_queue_contract_is_published() -> None:
    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))

    upload = _operation(schema, "/api/v1/partner/application/documents/uploads/", "post")
    upload_request = upload["requestBody"]["content"]["application/json"]["schema"]
    upload_component_name = upload_request["$ref"].rsplit("/", maxsplit=1)[-1]
    upload_component = schema["components"]["schemas"][upload_component_name]
    assert set(upload_component["required"]) == {
        "content_type",
        "expected_version",
        "kind",
        "sha256",
        "size_bytes",
    }
    assert "object_key" not in upload_component["properties"]

    finalize = _operation(schema, "/api/v1/partner/application/documents/", "post")
    finalize_request = finalize["requestBody"]["content"]["application/json"]["schema"]
    finalize_component_name = finalize_request["$ref"].rsplit("/", maxsplit=1)[-1]
    finalize_component = schema["components"]["schemas"][finalize_component_name]
    assert set(finalize_component["required"]) == {"expected_version", "upload_id"}

    queue = _operation(schema, "/api/v1/operations/partner-applications/", "get")
    assert queue["responses"]["200"]["content"]["application/json"]["schema"]
    _operation(schema, "/api/v1/operations/partner-applications/{application_id}/", "get")
    _operation(
        schema,
        "/api/v1/operations/partner-applications/{application_id}/claim/",
        "post",
    )
    _operation(
        schema,
        "/api/v1/operations/partner-documents/{document_id}/access/",
        "post",
    )
