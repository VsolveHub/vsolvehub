from typing import Any, cast

from django.conf import settings
from drf_spectacular.generators import SchemaGenerator


def _operation(schema: dict[str, Any], path: str, method: str) -> dict[str, Any]:
    paths = cast(dict[str, dict[str, dict[str, Any]]], schema["paths"])
    return paths[path][method]


def _required_idempotency_header(operation: dict[str, Any]) -> dict[str, Any]:
    header = next(
        parameter for parameter in operation["parameters"] if parameter["name"] == "Idempotency-Key"
    )
    assert header["in"] == "header"
    assert header["required"] is True
    return header


def test_browser_session_and_idempotency_contract_is_published() -> None:
    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))

    # Asserted against configuration rather than a literal. A hardcoded version here has to be
    # hand-edited on every release, which makes it noise rather than a check — and the real
    # guard against an unintended contract change is `quality.cmd`'s diff of the generated
    # schema against the committed `contracts/openapi/v1.yaml`. What this catches is the schema
    # and the settings disagreeing, which no other check would notice.
    assert schema["info"]["version"] == settings.SPECTACULAR_SETTINGS["VERSION"]
    session_user = schema["components"]["schemas"]["User"]["properties"]
    assert {"display_name", "full_name", "email", "phone_number", "date_joined"}.issubset(
        session_user
    )
    assert session_user["date_joined"]["format"] == "date-time"
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
    profile_read = _operation(schema, "/api/v1/auth/profile/", "get")
    assert profile_read["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/User"
    }
    profile_update = _operation(schema, "/api/v1/auth/profile/", "patch")
    profile_request = profile_update["requestBody"]["content"]["application/json"]["schema"]
    profile_component_name = profile_request["$ref"].rsplit("/", maxsplit=1)[-1]
    profile_component = schema["components"]["schemas"][profile_component_name]
    assert set(profile_component["properties"]) == {"display_name", "full_name", "email"}
    assert "required" not in profile_component

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


def _assert_removal_command_is_publishable(schema: dict[str, Any]) -> None:
    """Proposal 0007 — the body Django requires must appear in the document.

    The DELETE sibling is deliberately not asserted to carry a request body: the
    generator drops it, which is exactly why the POST command was published.
    """
    removal = _operation(schema, "/api/v1/cart/items/{item_id}/remove/", "post")
    assert removal["operationId"] == "cart_items_remove"
    assert removal["requestBody"]["required"] is True
    remove_request = removal["requestBody"]["content"]["application/json"]["schema"]
    remove_component = schema["components"]["schemas"][remove_request["$ref"].rsplit("/", 1)[-1]]
    assert set(remove_component["required"]) == {
        "expected_cart_version",
        "expected_item_version",
    }
    assert remove_component["properties"]["expected_cart_version"]["minimum"] == 1
    assert remove_component["properties"]["expected_item_version"]["minimum"] == 1
    assert removal["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/Cart"
    }
    assert removal["responses"]["409"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ApiError"
    }
    assert removal["security"] == [{"cookieAuth": []}, {}]
    assert not any(
        parameter["name"] == "Idempotency-Key" for parameter in removal.get("parameters", [])
    )


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
    _assert_removal_command_is_publishable(schema)

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


def test_partner_offer_projection_publishes_a_calibration_instant() -> None:
    """Proposal 0010 — an offer-first Partner session must be able to read server time."""
    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))

    offers = _operation(schema, "/api/v1/partner/offers/", "get")
    page_schema = offers["responses"]["200"]["content"]["application/json"]["schema"]
    page_component = schema["components"]["schemas"][page_schema["$ref"].rsplit("/", 1)[-1]]
    assert page_component["properties"]["server_now"]["format"] == "date-time"

    offer_component = schema["components"]["schemas"]["Offer"]
    assert {"expires_at", "undo_deadline", "server_now"}.issubset(offer_component["properties"])
    assert offer_component["properties"]["server_now"]["format"] == "date-time"


def test_bounded_list_operations_publish_the_cursor_they_already_read() -> None:
    """Proposal 0008 — `next` is unreachable through a generated client without this.

    The Operations review queue is the in-repo precedent, so the two Customer/Partner
    lists are asserted to publish the identical parameter rather than a lookalike.
    """
    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))

    def cursor_parameter(path: str) -> dict[str, Any]:
        operation = _operation(schema, path, "get")
        return next(
            parameter for parameter in operation["parameters"] if parameter["name"] == "cursor"
        )

    precedent = cursor_parameter("/api/v1/operations/partner-applications/")
    assert precedent["schema"] == {"type": "string", "minLength": 1}

    for path in ("/api/v1/booking-groups/", "/api/v1/partner/offers/"):
        operation = _operation(schema, path, "get")
        assert cursor_parameter(path) == precedent
        assert cursor_parameter(path).get("required", False) is False
        assert operation["responses"]["400"]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ApiError"
        }


def test_partner_offer_command_publishes_a_retry_safe_typed_contract() -> None:
    """Proposal 0009 — the command a Partner uses to take work must be fully described."""
    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))

    command = _operation(schema, "/api/v1/partner/offers/{offer_id}/{action}/", "post")
    parameters = {parameter["name"]: parameter for parameter in command["parameters"]}

    assert parameters["Idempotency-Key"]["in"] == "header"
    assert parameters["Idempotency-Key"]["required"] is True

    assert parameters["action"]["in"] == "path"
    assert parameters["action"]["schema"] == {"$ref": "#/components/schemas/OfferActionEnum"}
    assert sorted(schema["components"]["schemas"]["OfferActionEnum"]["enum"]) == [
        "accept",
        "commit",
        "decline",
        "undo",
    ]

    assert command["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/Offer"
    }
    for status_code in ("400", "403", "404", "409"):
        assert command["responses"][status_code]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ApiError"
        }


def test_fulfilment_surface_publishes_its_command_contract() -> None:
    """B8's published surface, checked at the contract rather than only in the views.

    A command that quietly stopped requiring `Idempotency-Key` or `expected_version` would
    still pass every behavioural test — it would simply be less safe, and the first sign would
    be a duplicate refund in production. These are the properties a client builds on, so they
    are asserted where a client reads them.
    """

    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))

    versioned_commands = [
        ("/api/v1/bookings/{booking_id}/cancel/", "post"),
        ("/api/v1/bookings/{booking_id}/reschedule/", "post"),
        ("/api/v1/bookings/{booking_id}/completion/confirm/", "post"),
        ("/api/v1/bookings/{booking_id}/completion/dispute/", "post"),
        ("/api/v1/booking-groups/{group_id}/cancel-booked/", "post"),
        ("/api/v1/booking-groups/{group_id}/reschedule/", "post"),
        ("/api/v1/partner/bookings/{booking_id}/en-route/", "post"),
        ("/api/v1/partner/bookings/{booking_id}/arrived/", "post"),
        ("/api/v1/partner/bookings/{booking_id}/start-otp/verify/", "post"),
        ("/api/v1/partner/bookings/{booking_id}/completion/", "post"),
        ("/api/v1/partner/bookings/{booking_id}/abort/", "post"),
        ("/api/v1/partner/bookings/{booking_id}/release/", "post"),
        ("/api/v1/operations/bookings/{booking_id}/assisted-start/", "post"),
        ("/api/v1/operations/bookings/{booking_id}/recover/", "post"),
    ]
    for path, method in versioned_commands:
        operation = _operation(schema, path, method)
        _required_idempotency_header(operation)
        body = operation["requestBody"]["content"]["application/json"]["schema"]
        component = schema["components"]["schemas"][body["$ref"].rsplit("/", 1)[-1]]
        assert "expected_version" in component["required"], path


def test_the_partner_projection_publishes_no_route_to_a_sibling_unit() -> None:
    """G7 as a contract property, not only a runtime one.

    The Partner projection must not carry `booking_group_id` or `order_id`. Absence is the
    guarantee: with no identifier for the group, there is nothing for a Partner client to ask
    a sibling-unit question with, however it is written.
    """

    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))
    partner_booking = schema["components"]["schemas"]["PartnerBooking"]["properties"]

    assert "booking_group_id" not in partner_booking
    assert "order_id" not in partner_booking
    # Operations is the one actor that legitimately sees both sides.
    operations_booking = schema["components"]["schemas"]["OperationsBooking"]["properties"]
    assert "booking_group_id" in operations_booking


def test_the_richest_projection_fields_are_typed_rather_than_unknown() -> None:
    """An unannotated `SerializerMethodField` publishes `{}` — which a generated TypeScript
    client renders as `unknown`, handing every consumer the least useful type for the most
    useful data. Each of these carries a real schema."""

    schema = cast(dict[str, Any], SchemaGenerator().get_schema(public=True))
    customer = schema["components"]["schemas"]["CustomerBooking"]["properties"]
    partner = schema["components"]["schemas"]["PartnerBooking"]["properties"]

    assert customer["work_tasks"]["type"] == "array"
    assert customer["work_tasks"]["items"]["$ref"].endswith("/WorkTask")
    assert "$ref" in str(customer["active_amendment"])
    assert "$ref" in str(customer["completion"])
    assert partner["display_title"]["type"] == "string"
    assert partner["display_title"]["nullable"] is True
    assert partner["approximate_area"]["type"] == "string"
    assert partner["approximate_area"]["nullable"] is True
    assert partner["service_lines"]["type"] == "array"
    assert partner["service_lines"]["items"]["$ref"].endswith("/PartnerBookingServiceLine")
    assert partner["requirements"]["type"] == "array"
    assert partner["requirements"]["items"]["type"] == "string"
    assert "$ref" in str(partner["estimated_earning"])
    assert "$ref" in str(partner["earning"])
