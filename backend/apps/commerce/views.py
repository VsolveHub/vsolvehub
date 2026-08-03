"""Authorized payment, webhook, refund and financial-document HTTP APIs."""

import hashlib
import json
from typing import cast
from uuid import UUID

from django.db.models import Prefetch
from django.db.models.query import QuerySet
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.commerce.exceptions import PaymentConflictError, PaymentProviderUnavailableError
from apps.commerce.models import Order, PaymentAttempt, Refund, TaxDocument
from apps.commerce.providers import PaymentProviderError, get_payment_provider
from apps.commerce.serializers import (
    OrderSerializer,
    PaymentAttemptCreateSerializer,
    PaymentAttemptSerializer,
    RefundCreateSerializer,
    RefundSerializer,
    TaxDocumentSerializer,
    WebhookAcceptedSerializer,
)
from apps.commerce.services import (
    initiate_payment_attempt,
    reconcile_payment_attempt,
    reconcile_refund,
    record_verified_webhook,
    request_unit_refund,
)
from apps.foundation.services import execute_idempotent
from apps.identity.models import User
from apps.partners.permissions import HasRecentFinanceStepUp
from common.errors.serializers import ApiErrorSerializer
from common.schema import IDEMPOTENCY_KEY_HEADER

RAZORPAY_SIGNATURE_HEADER = OpenApiParameter(
    name="X-Razorpay-Signature",
    type=OpenApiTypes.STR,
    location=OpenApiParameter.HEADER,
    required=True,
)
RAZORPAY_EVENT_ID_HEADER = OpenApiParameter(
    name="X-Razorpay-Event-Id",
    type=OpenApiTypes.STR,
    location=OpenApiParameter.HEADER,
    required=True,
)


def _required_idempotency_key(request: Request) -> str:
    key = request.headers.get("Idempotency-Key", "").strip()
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."},
            code="idempotency_key_required",
        )
    return key


def _payment_attempt_queryset() -> QuerySet[PaymentAttempt]:
    return PaymentAttempt.objects.prefetch_related(
        "allocations__fulfilment_unit",
        "allocations__fulfilment_line",
    )


class PaymentAttemptCollectionView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Payments"],
        request=PaymentAttemptCreateSerializer,
        parameters=[IDEMPOTENCY_KEY_HEADER],
        responses={202: PaymentAttemptSerializer, 409: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = PaymentAttemptCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        key = _required_idempotency_key(request)

        def command() -> tuple[int, dict[str, object]]:
            try:
                attempt = initiate_payment_attempt(
                    checkout_id=serializer.validated_data["checkout_id"],
                    customer_id=user.id,
                    expected_checkout_version=serializer.validated_data[
                        "expected_checkout_version"
                    ],
                    idempotency_key=key,
                )
            except (PaymentAttempt.DoesNotExist, ValueError) as exc:
                raise PaymentConflictError(str(exc)) from exc
            attempt = _payment_attempt_queryset().get(id=attempt.id)
            return status.HTTP_202_ACCEPTED, cast(
                dict[str, object], PaymentAttemptSerializer(attempt).data
            )

        result = execute_idempotent(
            actor=user,
            operation="payment_attempt.create",
            key=key,
            request_payload=serializer.validated_data,
            command=command,
        )
        response = Response(result.body, status=result.status_code)
        if result.replayed:
            response["Idempotent-Replay"] = "true"
        return response


class PaymentAttemptDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(tags=["Payments"], responses={200: PaymentAttemptSerializer})
    def get(self, request: Request, attempt_id: UUID) -> Response:
        user = cast(User, request.user)
        attempt = get_object_or_404(
            _payment_attempt_queryset(),
            id=attempt_id,
            checkout__customer=user,
        )
        return Response(PaymentAttemptSerializer(attempt).data)


class CheckoutPaymentView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(tags=["Payments"], responses={200: PaymentAttemptSerializer})
    def get(self, request: Request, checkout_id: UUID) -> Response:
        user = cast(User, request.user)
        attempt = (
            _payment_attempt_queryset()
            .filter(checkout_id=checkout_id, checkout__customer=user)
            .order_by("-created_at")
            .first()
        )
        if attempt is None:
            raise NotFound("No payment attempt exists for this checkout.")
        return Response(PaymentAttemptSerializer(attempt).data)


class PaymentAttemptReconcileView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Payments"],
        request=None,
        parameters=[IDEMPOTENCY_KEY_HEADER],
        responses={200: PaymentAttemptSerializer, 503: ApiErrorSerializer},
    )
    def post(self, request: Request, attempt_id: UUID) -> Response:
        user = cast(User, request.user)
        attempt = get_object_or_404(
            PaymentAttempt,
            id=attempt_id,
            checkout__customer=user,
        )
        key = _required_idempotency_key(request)

        def command() -> tuple[int, dict[str, object]]:
            try:
                reconciled = reconcile_payment_attempt(attempt_id=attempt.id)
            except PaymentProviderError as exc:
                raise PaymentProviderUnavailableError from exc
            reconciled = _payment_attempt_queryset().get(id=reconciled.id)
            return status.HTTP_200_OK, cast(
                dict[str, object], PaymentAttemptSerializer(reconciled).data
            )

        result = execute_idempotent(
            actor=user,
            operation="payment_attempt.reconcile",
            key=key,
            request_payload={"payment_attempt_id": str(attempt.id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


def _mapping(value: object, name: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValidationError(f"Webhook {name} must be an object.", code="webhook_invalid")
    return cast(dict[str, object], value)


def _positive_amount(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValidationError("Webhook amount is invalid.", code="webhook_invalid")
    return value


def _normalise_webhook(payload: dict[str, object]) -> tuple[str, dict[str, object]]:
    event_type = payload.get("event")
    if not isinstance(event_type, str):
        raise ValidationError("Webhook event is missing.", code="webhook_invalid")
    event_payload = _mapping(payload.get("payload"), "payload")
    if event_type.startswith("payment."):
        entity = _mapping(_mapping(event_payload.get("payment"), "payment").get("entity"), "entity")
        status_by_event = {
            "payment.authorized": "authorized",
            "payment.captured": "captured",
            "payment.failed": "failed",
        }
        if event_type not in status_by_event:
            return event_type, {}
        return event_type, {
            "provider_payment_id": str(entity.get("id", "")),
            "provider_order_id": str(entity.get("order_id", "")),
            "amount_paise": _positive_amount(entity.get("amount")),
            "currency": str(entity.get("currency", "")),
            "status": status_by_event[event_type],
        }
    if event_type.startswith("refund."):
        entity = _mapping(_mapping(event_payload.get("refund"), "refund").get("entity"), "entity")
        status_by_event = {"refund.processed": "processed", "refund.failed": "failed"}
        if event_type not in status_by_event:
            return event_type, {}
        return event_type, {
            "provider_refund_id": str(entity.get("id", "")),
            "provider_payment_id": str(entity.get("payment_id", "")),
            "amount_paise": _positive_amount(entity.get("amount")),
            "currency": str(entity.get("currency") or "INR"),
            "status": status_by_event[event_type],
        }
    return event_type, {}


class RazorpayWebhookView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Payment Webhooks"],
        request=OpenApiTypes.OBJECT,
        parameters=[RAZORPAY_SIGNATURE_HEADER, RAZORPAY_EVENT_ID_HEADER],
        responses={202: WebhookAcceptedSerializer, 400: ApiErrorSerializer},
        auth=[],
    )
    def post(self, request: Request) -> Response:
        raw_body = request._request.body
        signature = request.headers.get("X-Razorpay-Signature", "")
        event_id = request.headers.get("X-Razorpay-Event-Id", "")
        if not signature or not event_id:
            raise ValidationError("Webhook signature and event ID are required.")
        provider = get_payment_provider(provider_code="razorpay")
        if not provider.verify_webhook(body=raw_body, signature=signature):
            raise ValidationError("Webhook signature is invalid.", code="webhook_signature_invalid")
        try:
            decoded = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValidationError("Webhook JSON is invalid.", code="webhook_invalid") from exc
        payload = _mapping(decoded, "body")
        event_type, event_data = _normalise_webhook(payload)
        webhook, created = record_verified_webhook(
            provider="razorpay",
            event_id=event_id,
            event_type=event_type,
            payload_sha256=hashlib.sha256(raw_body).hexdigest(),
            event_data=event_data,
        )
        del webhook
        return Response(
            {"accepted": True, "duplicate": not created},
            status=status.HTTP_202_ACCEPTED if created else status.HTTP_200_OK,
        )


class FinanceRefundCollectionView(APIView):
    permission_classes = (IsAuthenticated, HasRecentFinanceStepUp)

    @extend_schema(
        tags=["Finance"],
        request=RefundCreateSerializer,
        parameters=[IDEMPOTENCY_KEY_HEADER],
        responses={202: RefundSerializer, 409: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = RefundCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        key = _required_idempotency_key(request)

        def command() -> tuple[int, dict[str, object]]:
            try:
                refund = request_unit_refund(
                    order_id=serializer.validated_data["order_id"],
                    unit_ids=serializer.validated_data["fulfilment_unit_ids"],
                    reason_code=serializer.validated_data["reason_code"],
                    idempotency_key=key,
                    requested_by_id=user.id,
                )
            except (Order.DoesNotExist, ValueError) as exc:
                raise PaymentConflictError(str(exc)) from exc
            refund = Refund.objects.prefetch_related(
                "allocations__payment_allocation__fulfilment_unit"
            ).get(id=refund.id)
            return status.HTTP_202_ACCEPTED, cast(dict[str, object], RefundSerializer(refund).data)

        result = execute_idempotent(
            actor=user,
            operation="refund.create",
            key=key,
            request_payload=serializer.validated_data,
            command=command,
        )
        return Response(result.body, status=result.status_code)


class RefundDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(tags=["Payments"], responses={200: RefundSerializer})
    def get(self, request: Request, refund_id: UUID) -> Response:
        user = cast(User, request.user)
        refund = get_object_or_404(
            Refund.objects.prefetch_related("allocations__payment_allocation__fulfilment_unit"),
            id=refund_id,
            order__customer=user,
        )
        return Response(RefundSerializer(refund).data)


class FinanceRefundReconcileView(APIView):
    permission_classes = (IsAuthenticated, HasRecentFinanceStepUp)

    @extend_schema(
        tags=["Finance"],
        request=None,
        parameters=[IDEMPOTENCY_KEY_HEADER],
        responses={200: RefundSerializer, 503: ApiErrorSerializer},
    )
    def post(self, request: Request, refund_id: UUID) -> Response:
        refund = get_object_or_404(Refund, id=refund_id)
        user = cast(User, request.user)
        key = _required_idempotency_key(request)

        def command() -> tuple[int, dict[str, object]]:
            try:
                reconciled = reconcile_refund(refund_id=refund.id)
            except PaymentProviderError as exc:
                raise PaymentProviderUnavailableError from exc
            reconciled = Refund.objects.prefetch_related(
                "allocations__payment_allocation__fulfilment_unit"
            ).get(id=reconciled.id)
            return status.HTTP_200_OK, cast(dict[str, object], RefundSerializer(reconciled).data)

        result = execute_idempotent(
            actor=user,
            operation="refund.reconcile",
            key=key,
            request_payload={"refund_id": str(refund.id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OrderDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(tags=["Orders"], responses={200: OrderSerializer})
    def get(self, request: Request, order_id: UUID) -> Response:
        user = cast(User, request.user)
        order = get_object_or_404(
            Order.objects.prefetch_related(
                "bookings",
                Prefetch("tax_documents", queryset=TaxDocument.objects.prefetch_related("lines")),
            ),
            id=order_id,
            customer=user,
        )
        return Response(OrderSerializer(order).data)


class TaxDocumentDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(tags=["Orders"], responses={200: TaxDocumentSerializer})
    def get(self, request: Request, document_id: UUID) -> Response:
        user = cast(User, request.user)
        document = get_object_or_404(
            TaxDocument.objects.prefetch_related("lines"),
            id=document_id,
            order__customer=user,
        )
        return Response(TaxDocumentSerializer(document).data)
