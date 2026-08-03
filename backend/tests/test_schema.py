from typing import Any, cast

from drf_spectacular.generators import SchemaGenerator


def _operation(schema: dict[str, Any], path: str, method: str) -> dict[str, Any]:
    paths = cast(dict[str, dict[str, dict[str, Any]]], schema["paths"])
    return paths[path][method]


def test_browser_session_and_idempotency_contract_is_published() -> None:
    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))

    assert schema["info"]["version"] == "1.10.0"
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


def test_a1_booking_window_and_complete_quote_contract_is_published() -> None:
    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))

    windows = _operation(schema, "/api/v1/booking/windows/", "post")
    assert windows["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/BookingWindows"
    }

    quote = _operation(schema, "/api/v1/quotes/", "post")
    request_schema = quote["requestBody"]["content"]["application/json"]["schema"]
    request_component_name = request_schema["$ref"].rsplit("/", maxsplit=1)[-1]
    request_component = schema["components"]["schemas"][request_component_name]
    assert set(request_component["required"]) == {"address_id", "window_id"}
    assert "requested_start" not in request_component["properties"]
    assert "total_paise" not in request_component["properties"]

    response_schema = quote["responses"]["201"]["content"]["application/json"]["schema"]
    response_component_name = response_schema["$ref"].rsplit("/", maxsplit=1)[-1]
    response_component = schema["components"]["schemas"][response_component_name]
    assert {
        "arrival_window",
        "cancellation_policy",
        "expires_at",
        "lines",
        "platform_fee",
        "server_now",
        "subtotal",
        "tax",
        "total",
        "version",
    }.issubset(response_component["properties"])

    cart = _operation(schema, "/api/v1/cart/", "put")
    assert "409" in cart["responses"]


def test_multi_item_fulfilment_plan_and_group_quote_contract_is_published() -> None:
    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))

    cart = _operation(schema, "/api/v1/cart/", "get")
    assert cart["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/Cart"
    }
    add_item = _operation(schema, "/api/v1/cart/items/", "post")
    add_request = add_item["requestBody"]["content"]["application/json"]["schema"]
    add_component = schema["components"]["schemas"][add_request["$ref"].rsplit("/", 1)[-1]]
    assert set(add_component["required"]) == {
        "expected_cart_version",
        "quantity",
        "variant_id",
    }
    _operation(schema, "/api/v1/cart/merge/", "post")

    plans = _operation(schema, "/api/v1/fulfilment-plan-sets/", "post")
    assert plans["responses"]["201"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/FulfilmentPlanSet"
    }
    assert any(
        parameter["name"] == "Idempotency-Key" and parameter["required"] is True
        for parameter in plans["parameters"]
    )
    _operation(schema, "/api/v1/fulfilment-plan-sets/{plan_set_id}/", "get")

    quote = _operation(schema, "/api/v1/plan-quotes/", "post")
    assert quote["responses"]["201"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/GroupQuote"
    }
    assert any(
        parameter["name"] == "Idempotency-Key" and parameter["required"] is True
        for parameter in quote["parameters"]
    )
    _operation(schema, "/api/v1/plan-quotes/{quote_id}/", "get")


def test_group_payment_refund_webhook_and_document_contract_is_published() -> None:
    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))

    create_payment = _operation(schema, "/api/v1/payment-attempts/", "post")
    request_schema = create_payment["requestBody"]["content"]["application/json"]["schema"]
    request_component = schema["components"]["schemas"][request_schema["$ref"].rsplit("/", 1)[-1]]
    assert set(request_component["required"]) == {
        "checkout_id",
        "expected_checkout_version",
    }
    assert any(
        parameter["name"] == "Idempotency-Key" and parameter["required"] is True
        for parameter in create_payment["parameters"]
    )
    _operation(schema, "/api/v1/payment-attempts/{attempt_id}/", "get")
    _operation(schema, "/api/v1/payment-attempts/{attempt_id}/reconcile/", "post")
    _operation(schema, "/api/v1/checkouts/{checkout_id}/payment/", "get")

    webhook = _operation(schema, "/api/v1/payment-webhooks/razorpay/", "post")
    assert {parameter["name"] for parameter in webhook["parameters"]} == {
        "X-Razorpay-Event-Id",
        "X-Razorpay-Signature",
    }
    assert webhook.get("security", []) == []

    refund = _operation(schema, "/api/v1/finance/refunds/", "post")
    assert any(
        parameter["name"] == "Idempotency-Key" and parameter["required"] is True
        for parameter in refund["parameters"]
    )
    _operation(schema, "/api/v1/finance/refunds/{refund_id}/reconcile/", "post")
    _operation(schema, "/api/v1/refunds/{refund_id}/", "get")
    _operation(schema, "/api/v1/orders/{order_id}/", "get")
    _operation(schema, "/api/v1/tax-documents/{document_id}/", "get")
