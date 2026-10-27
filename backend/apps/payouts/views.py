"""Ledger and payout surfaces: the Partner's own earnings, and Operations' payout runs.

## Two step-up gates, both deliberate

`approve` and `pay` both require `HasRecentOperationsStepUp` — a fresh OTP on the session before
money leaves. Maker-checker already means two different people are involved; the step-up means
neither of them can be a stolen session sitting open on an unlocked laptop. Approving a payout
run is the single largest money-moving action in the platform, and it is the one place where
being slower is obviously correct.

Proposing and cancelling do not require step-up. Proposing moves nothing, and cancelling only
returns money to the pool — making the *safe* direction harder than the dangerous one would
train people to leave batches sitting approved.

## The Partner sees their own ledger and nothing else

`/partner/earnings/` and `/partner/ledger/` resolve the Partner from the session. There is no
`partner_id` parameter to get wrong, which is the same reasoning that keeps `booking_group_id`
off the Partner booking projection: the safest filter is the one that cannot be supplied.
"""

import hashlib
import json
from typing import Any, cast
from uuid import UUID

from django.conf import settings
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import BaseThrottle, ScopedRateThrottle
from rest_framework.views import APIView

from apps.foundation.services import ResponseBody, execute_idempotent
from apps.identity.models import User
from apps.partners.models import PartnerProfile
from apps.partners.permissions import (
    HasRecentOperationsStepUp,
    IsOperationsUser,
    IsPartnerUser,
)
from apps.payouts.models import (
    PartnerLedgerEntry,
    PartnerPayoutAccount,
    PayoutBatch,
    PayoutBatchItem,
)
from apps.payouts.performance import partner_performance
from apps.payouts.providers import verify_razorpayx_signature
from apps.payouts.selectors import with_hold_flags
from apps.payouts.serializers import (
    DeclineWithdrawalRequestSerializer,
    LedgerAdjustmentRequestSerializer,
    OperationsPayoutAccountPageSerializer,
    OperationsPayoutAccountSerializer,
    OperationsWithdrawalPageSerializer,
    OperationsWithdrawalSerializer,
    PartnerBalanceSerializer,
    PartnerLedgerEntrySerializer,
    PartnerLedgerPageSerializer,
    PartnerPayoutAccountCreateSerializer,
    PartnerPayoutAccountSerializer,
    PartnerPerformanceSerializer,
    PartnerWithdrawalPageSerializer,
    PartnerWithdrawalPreviewSerializer,
    PartnerWithdrawalSerializer,
    PayoutBatchListSerializer,
    PayoutBatchPageSerializer,
    PayoutBatchSerializer,
    PayoutWebhookAcceptedSerializer,
    ProposePayoutBatchRequestSerializer,
    RejectPayoutAccountRequestSerializer,
    UnpayablePartnerSerializer,
    VersionedBatchCommandSerializer,
)
from apps.payouts.services import (
    apply_razorpayx_payout_event,
    approve_payout_batch,
    approve_withdrawal,
    cancel_payout_batch,
    decline_withdrawal,
    partner_balance_paise,
    propose_payout_batch,
    quote_withdrawal,
    record_adjustment,
    reject_payout_account,
    request_withdrawal,
    start_paying_batch,
    submit_partner_payout_account,
    unpayable_partner_ids,
    verify_payout_account,
    withdrawal_refusal_message,
)
from common.errors.serializers import ApiErrorSerializer
from common.pagination import StrictCursorPagination
from common.schema import IDEMPOTENCY_KEY_HEADER


class LedgerCursorPagination(StrictCursorPagination):
    """See `CaseCursorPagination`: ordering belongs to the paginator, not the queryset."""

    page_size = 50
    ordering = ("-created_at", "-id")


class PayoutBatchCursorPagination(StrictCursorPagination):
    page_size = 50
    ordering = ("-created_at", "-id")


class PayoutAccountCursorPagination(StrictCursorPagination):
    page_size = 50
    ordering = ("-created_at", "-id")


class WithdrawalCursorPagination(StrictCursorPagination):
    page_size = 25
    ordering = ("-created_at", "-id")


class WithdrawalQueuePagination(StrictCursorPagination):
    """The review queue reads oldest first: a Partner has been waiting longest on the top one."""

    page_size = 50
    ordering = ("created_at", "id")


PARTNER_TAG = "Partner"
OPERATIONS_TAG = "Operations"

_ERRORS = {
    400: ApiErrorSerializer,
    403: ApiErrorSerializer,
    404: ApiErrorSerializer,
    409: ApiErrorSerializer,
}


def _required_key(request: Request) -> str:
    key = request.headers.get("Idempotency-Key")
    if not key:
        raise ValidationError(
            {"Idempotency-Key": "This header is required."}, code="idempotency_key_required"
        )
    return key


def _partner_profile(user: User) -> PartnerProfile:
    profile = PartnerProfile.objects.filter(user=user).first()
    if profile is None:
        raise PermissionDenied("This account has no Partner profile.")
    return profile


def _batch_projection(batch_id: UUID) -> ResponseBody:
    batch = PayoutBatch.objects.prefetch_related("items__entries").get(id=batch_id)
    return cast(ResponseBody, PayoutBatchSerializer(batch).data)


def _partner_withdrawals() -> QuerySet[PayoutBatchItem]:
    return (
        PayoutBatchItem.objects.filter(is_withdrawal=True)
        .select_related("batch", "payout_account")
        .prefetch_related("entries__ledger_entry")
    )


def _operations_withdrawals() -> QuerySet[PayoutBatch]:
    return PayoutBatch.objects.filter(kind=PayoutBatch.Kind.WITHDRAWAL).prefetch_related(
        "items__payout_account", "items__partner__user", "items__entries__ledger_entry"
    )


def _withdrawal_projection(batch_id: UUID) -> ResponseBody:
    return cast(
        ResponseBody,
        OperationsWithdrawalSerializer(_operations_withdrawals().get(id=batch_id)).data,
    )


# --------------------------------------------------------------------------------------------
# Partner
# --------------------------------------------------------------------------------------------


class PartnerPerformanceView(APIView):
    """The numbers the Partner home screen is built from.

    Separate from `earnings/`, which answers "what am I owed" — a balance by
    state. This answers "how am I doing" — throughput and revenue over time.
    Performance includes direct customer payments recorded by mutually confirmed
    A3 day settlements. The balance remains ledger-only because direct-paid money
    is not a debt Vsolve can reserve or pay out.

    No `partner_id`: the Partner is resolved from the session, which is the one
    filter a caller cannot get wrong.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[PARTNER_TAG],
        operation_id="partner_performance_retrieve",
        responses={200: PartnerPerformanceSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile(cast(User, request.user))
        return Response(PartnerPerformanceSerializer(partner_performance(profile)).data)


class PartnerEarningsView(APIView):
    """What the Partner is owed, split by state.

    One number would be a lie: money held behind an open quality case is not money you can plan
    around. Whether that money can be withdrawn right now is a separate question with its own
    rules, answered by `/partner/withdrawals/preview/` rather than guessed from these numbers.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[PARTNER_TAG],
        operation_id="partner_earnings_retrieve",
        responses={200: PartnerBalanceSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile(cast(User, request.user))
        balance = partner_balance_paise(profile)
        return Response(
            PartnerBalanceSerializer(
                {**balance, "currency": "INR", "server_now": timezone.now()}
            ).data
        )


class PartnerLedgerView(APIView):
    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[PARTNER_TAG],
        operation_id="partner_ledger_list",
        parameters=[OpenApiParameter("cursor", str, description="Opaque page cursor.")],
        responses={200: PartnerLedgerPageSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile(cast(User, request.user))
        queryset = with_hold_flags(PartnerLedgerEntry.objects.filter(partner=profile))
        paginator = LedgerCursorPagination()
        page = paginator.paginate_queryset(queryset, request, self)
        return paginator.get_paginated_response(
            PartnerLedgerEntrySerializer(page or [], many=True).data
        )


class PartnerPayoutAccountView(APIView):
    """The Partner's own account, masked, and the way to add or change it.

    Adding or changing an account starts a cooling period and is the event an account-takeover
    investigation begins from, so a submission is never payable on its own: it is `PENDING` until
    Operations verifies it (`/operations/payout-accounts/`), and payable only once its cooling
    period has also passed. Submissions are rate-limited; reads are not.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "payout_account"

    def get_throttles(self) -> list[BaseThrottle]:
        return [ScopedRateThrottle()] if self.request.method == "POST" else []

    @extend_schema(
        tags=[PARTNER_TAG],
        operation_id="partner_payout_account_submit",
        request=PartnerPayoutAccountCreateSerializer,
        responses={
            201: PartnerPayoutAccountSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            429: ApiErrorSerializer,
            503: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        user = cast(User, request.user)
        profile = _partner_profile(user)
        serializer = PartnerPayoutAccountCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        account = submit_partner_payout_account(
            partner=profile,
            account_number=data["account_number"],
            ifsc=data["ifsc"],
            holder_name=data["holder_name"],
            actor=user,
        )
        return Response(
            PartnerPayoutAccountSerializer(account).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(
        tags=[PARTNER_TAG],
        operation_id="partner_payout_account_retrieve",
        responses={
            200: PartnerPayoutAccountSerializer,
            403: ApiErrorSerializer,
            404: ApiErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile(cast(User, request.user))
        account = (
            PartnerPayoutAccount.objects.filter(partner=profile)
            .exclude(status=PartnerPayoutAccount.Status.REPLACED)
            .order_by("-created_at")
            .first()
        )
        if account is None:
            return Response(
                {"detail": "No payout account is registered."}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(PartnerPayoutAccountSerializer(account).data)


class PartnerWithdrawalPreviewView(APIView):
    """What tapping Withdraw would do right now: allowed or why not, how much, any fee.

    Built by the same function the request runs (`quote_withdrawal`), so the button the app
    draws from this can never promise what the request then refuses.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)

    @extend_schema(
        tags=[PARTNER_TAG],
        operation_id="partner_withdrawal_preview",
        responses={200: PartnerWithdrawalPreviewSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile(cast(User, request.user))
        now = timezone.now()
        quote = quote_withdrawal(partner=profile, now=now)
        account = quote.account
        payable_from = (
            account.effective_from if account is not None and account.effective_from > now else None
        )
        return Response(
            PartnerWithdrawalPreviewSerializer(
                {
                    "is_enabled": settings.PAYOUT_WITHDRAW_ENABLED,
                    "can_withdraw": not quote.refusal,
                    "refusal_reason": quote.refusal or None,
                    "refusal_message": (
                        withdrawal_refusal_message(quote.refusal) if quote.refusal else None
                    ),
                    "amount_paise": quote.amount_paise,
                    "fee_paise": quote.fee_paise,
                    "send_paise": quote.send_paise,
                    "needs_review": bool(quote.review_reasons),
                    "review_reasons": list(quote.review_reasons),
                    "minimum_paise": settings.PAYOUT_WITHDRAWAL_MIN_PAISE,
                    "maximum_paise": settings.PAYOUT_WITHDRAWAL_MAX_PAISE,
                    "withdrawals_left_today": quote.withdrawals_left_today,
                    "free_withdrawals_left_this_week": quote.free_withdrawals_left_this_week,
                    "account_last4": account.account_last4 if account is not None else None,
                    "account_payable_from": payable_from,
                    "currency": "INR",
                    "server_now": now,
                }
            ).data
        )


class PartnerWithdrawalListView(APIView):
    """The Partner's own withdrawals, newest first, and the Withdraw tap itself.

    The tap takes no body: the amount is always the whole available balance, decided on the
    server from the locked ledger, so there is nothing for a client to get wrong. It needs an
    `Idempotency-Key`, so a retried tap replays the first answer instead of withdrawing twice,
    and it is rate-limited on top of the daily limit, which is the real rule.
    """

    permission_classes = (IsAuthenticated, IsPartnerUser)
    throttle_scope = "payout_withdrawal"

    def get_throttles(self) -> list[BaseThrottle]:
        return [ScopedRateThrottle()] if self.request.method == "POST" else []

    @extend_schema(
        tags=[PARTNER_TAG],
        operation_id="partner_withdrawals_list",
        parameters=[OpenApiParameter("cursor", str, description="Opaque page cursor.")],
        responses={200: PartnerWithdrawalPageSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        profile = _partner_profile(cast(User, request.user))
        paginator = WithdrawalCursorPagination()
        page = paginator.paginate_queryset(
            _partner_withdrawals().filter(partner=profile), request, self
        )
        return paginator.get_paginated_response(
            PartnerWithdrawalSerializer(page or [], many=True).data
        )

    @extend_schema(
        tags=[PARTNER_TAG],
        operation_id="partner_withdrawal_request",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=None,
        responses={
            201: PartnerWithdrawalSerializer,
            400: ApiErrorSerializer,
            403: ApiErrorSerializer,
            409: ApiErrorSerializer,
            429: ApiErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        actor = cast(User, request.user)
        profile = _partner_profile(actor)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            item = request_withdrawal(partner=profile, actor=actor)
            return status.HTTP_201_CREATED, cast(
                ResponseBody,
                PartnerWithdrawalSerializer(_partner_withdrawals().get(id=item.id)).data,
            )

        result = execute_idempotent(
            actor=actor,
            operation="payouts.request_withdrawal",
            key=key,
            request_payload={"partner_id": str(profile.id)},
            command=command,
        )
        return Response(result.body, status=result.status_code)


# --------------------------------------------------------------------------------------------
# Operations
# --------------------------------------------------------------------------------------------


class OperationsWithdrawalListView(APIView):
    """Partner withdrawals. Defaults to the queue: the ones the rules sent to a person."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_withdrawals_list",
        parameters=[
            OpenApiParameter(
                "status",
                str,
                description=(
                    "PENDING_APPROVAL (default, oldest first), PAYING, PAID, FAILED or CANCELLED "
                    "(newest first)."
                ),
            ),
            OpenApiParameter("cursor", str, description="Opaque page cursor."),
        ],
        responses={200: OperationsWithdrawalPageSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        wanted = request.query_params.get("status") or PayoutBatch.Status.PENDING_APPROVAL
        if wanted not in PayoutBatch.Status.values or wanted == PayoutBatch.Status.DRAFT:
            raise ValidationError({"status": ["That is not a withdrawal status."]})
        paginator = (
            WithdrawalQueuePagination()
            if wanted == PayoutBatch.Status.PENDING_APPROVAL
            else WithdrawalCursorPagination()
        )
        page = paginator.paginate_queryset(
            _operations_withdrawals().filter(status=wanted), request, self
        )
        return paginator.get_paginated_response(
            OperationsWithdrawalSerializer(page or [], many=True).data
        )


class OperationsWithdrawalApproveView(APIView):
    """Lets a queued withdrawal through and queues it to send. Step-up: money leaves on it."""

    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_withdrawal_approve",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedBatchCommandSerializer,
        responses={200: OperationsWithdrawalSerializer, 401: ApiErrorSerializer, **_ERRORS},
    )
    def post(self, request: Request, batch_id: UUID) -> Response:
        serializer = VersionedBatchCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        batch = get_object_or_404(PayoutBatch, id=batch_id, kind=PayoutBatch.Kind.WITHDRAWAL)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            approve_withdrawal(
                batch_id=batch.id,
                expected_version=serializer.validated_data["expected_version"],
                actor=actor,
            )
            return status.HTTP_200_OK, _withdrawal_projection(batch.id)

        result = execute_idempotent(
            actor=actor,
            operation="payouts.approve_withdrawal",
            key=key,
            request_payload={"batch_id": str(batch.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsWithdrawalDeclineView(APIView):
    """No step-up, like cancelling a run: declining only puts the money back in the balance."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_withdrawal_decline",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=DeclineWithdrawalRequestSerializer,
        responses={200: OperationsWithdrawalSerializer, **_ERRORS},
    )
    def post(self, request: Request, batch_id: UUID) -> Response:
        serializer = DeclineWithdrawalRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        batch = get_object_or_404(PayoutBatch, id=batch_id, kind=PayoutBatch.Kind.WITHDRAWAL)
        key = _required_key(request)
        data = serializer.validated_data

        def command() -> tuple[int, ResponseBody]:
            decline_withdrawal(
                batch_id=batch.id,
                expected_version=data["expected_version"],
                actor=actor,
                reason=data["reason"],
            )
            return status.HTTP_200_OK, _withdrawal_projection(batch.id)

        result = execute_idempotent(
            actor=actor,
            operation="payouts.decline_withdrawal",
            key=key,
            request_payload={"batch_id": str(batch.id), **data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class OperationsPayoutAccountListView(APIView):
    """Bank accounts for review. Defaults to the ones waiting on a decision."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_accounts_list",
        parameters=[
            OpenApiParameter(
                "status",
                str,
                description="PENDING (default), VERIFIED, REJECTED or REPLACED.",
            ),
            OpenApiParameter("cursor", str, description="Opaque page cursor."),
        ],
        responses={200: OperationsPayoutAccountPageSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        wanted = request.query_params.get("status") or PartnerPayoutAccount.Status.PENDING
        if wanted not in PartnerPayoutAccount.Status.values:
            raise ValidationError({"status": ["That is not a payout account status."]})
        queryset = PartnerPayoutAccount.objects.filter(status=wanted).select_related(
            "partner__user"
        )
        paginator = PayoutAccountCursorPagination()
        page = paginator.paginate_queryset(queryset, request, self)
        return paginator.get_paginated_response(
            OperationsPayoutAccountSerializer(page or [], many=True).data
        )


class OperationsPayoutAccountVerifyView(APIView):
    """Confirms where a Partner's money goes. Step-up, because it is a money destination."""

    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_account_verify",
        request=None,
        responses={200: OperationsPayoutAccountSerializer, 401: ApiErrorSerializer, **_ERRORS},
    )
    def post(self, request: Request, account_id: UUID) -> Response:
        get_object_or_404(PartnerPayoutAccount, id=account_id)
        account = verify_payout_account(account_id=account_id, actor=cast(User, request.user))
        return Response(OperationsPayoutAccountSerializer(account).data)


class OperationsPayoutAccountRejectView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_account_reject",
        request=RejectPayoutAccountRequestSerializer,
        responses={200: OperationsPayoutAccountSerializer, 401: ApiErrorSerializer, **_ERRORS},
    )
    def post(self, request: Request, account_id: UUID) -> Response:
        get_object_or_404(PartnerPayoutAccount, id=account_id)
        serializer = RejectPayoutAccountRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account = reject_payout_account(
            account_id=account_id,
            actor=cast(User, request.user),
            reason=serializer.validated_data["reason"],
        )
        return Response(OperationsPayoutAccountSerializer(account).data)


class RazorpayXPayoutWebhookView(APIView):
    """`payout.*` events from RazorpayX, verified against `RAZORPAYX_WEBHOOK_SECRET`.

    Applied inline: settling one item is a few row updates. A failure returns 5xx, which
    RazorpayX retries, and `reconcile_payouts` still polls anything left in flight.
    """

    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Payout Webhooks"],
        operation_id="payout_webhook_razorpayx",
        request=OpenApiTypes.OBJECT,
        parameters=[
            OpenApiParameter(
                "X-Razorpay-Signature",
                str,
                location=OpenApiParameter.HEADER,
                required=True,
                description="HMAC-SHA256 of the raw body with the RazorpayX webhook secret.",
            ),
            OpenApiParameter(
                "X-Razorpay-Event-Id",
                str,
                location=OpenApiParameter.HEADER,
                required=False,
                description=(
                    "RazorpayX's id for this event. A redelivery with an id already recorded "
                    "changes nothing."
                ),
            ),
        ],
        responses={200: PayoutWebhookAcceptedSerializer, 400: ApiErrorSerializer},
        auth=[],
    )
    def post(self, request: Request) -> Response:
        raw_body = request._request.body
        signature = request.headers.get("X-Razorpay-Signature", "")
        if not verify_razorpayx_signature(body=raw_body, signature=signature):
            raise ValidationError("Webhook signature is invalid.", code="webhook_signature_invalid")
        try:
            decoded = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValidationError("Webhook JSON is invalid.", code="webhook_invalid") from exc
        if not isinstance(decoded, dict):
            raise ValidationError("Webhook JSON is invalid.", code="webhook_invalid")
        payload_sha256 = hashlib.sha256(raw_body).hexdigest()
        # RazorpayX names every delivery in `X-Razorpay-Event-Id`, and a redelivery carries the
        # same id. Without it, the body's own hash stands in: an identical body is the same event.
        event_id = request.headers.get("X-Razorpay-Event-Id", "").strip()[:128] or payload_sha256
        item = apply_razorpayx_payout_event(
            decoded, event_id=event_id, payload_sha256=payload_sha256
        )
        return Response({"accepted": True, "applied": item is not None})


class PayoutBatchListView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_batches_list",
        parameters=[
            OpenApiParameter("status", str, description="Filter by batch status."),
            OpenApiParameter(
                "kind",
                str,
                description="RUN or WITHDRAWAL. Omitted, both are listed.",
            ),
            OpenApiParameter("cursor", str, description="Opaque page cursor."),
        ],
        responses={200: PayoutBatchPageSerializer, 403: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        queryset = PayoutBatch.objects.all()
        if value := request.query_params.get("status"):
            queryset = queryset.filter(status=value)
        if kind := request.query_params.get("kind"):
            if kind not in PayoutBatch.Kind.values:
                raise ValidationError({"kind": ["That is not a payout batch kind."]})
            queryset = queryset.filter(kind=kind)
        paginator = PayoutBatchCursorPagination()
        page = paginator.paginate_queryset(queryset, request, self)
        return paginator.get_paginated_response(
            PayoutBatchListSerializer(page or [], many=True).data
        )

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_batch_propose",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=ProposePayoutBatchRequestSerializer,
        responses={201: PayoutBatchSerializer, **_ERRORS},
    )
    def post(self, request: Request) -> Response:
        serializer = ProposePayoutBatchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _required_key(request)
        data = serializer.validated_data

        def command() -> tuple[int, ResponseBody]:
            batch = propose_payout_batch(
                reference=data["reference"],
                period_start=data["period_start"],
                period_end=data["period_end"],
                actor=actor,
            )
            return status.HTTP_201_CREATED, _batch_projection(batch.id)

        result = execute_idempotent(
            actor=actor,
            operation="payouts.propose_batch",
            key=key,
            request_payload=dict(data),
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PayoutBatchDetailView(APIView):
    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_batch_retrieve",
        responses={200: PayoutBatchSerializer, 403: ApiErrorSerializer, 404: ApiErrorSerializer},
    )
    def get(self, _request: Request, batch_id: UUID) -> Response:
        get_object_or_404(PayoutBatch, id=batch_id)
        return Response(_batch_projection(batch_id))


class PayoutBatchApproveView(APIView):
    """Maker-checker plus a fresh OTP.

    Two different people is a control against one person acting alone. The step-up is a control
    against neither of them actually being present — an unlocked laptop with an Operations
    session open should not be able to release a week of payouts.
    """

    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_batch_approve",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedBatchCommandSerializer,
        responses={200: PayoutBatchSerializer, 401: ApiErrorSerializer, **_ERRORS},
    )
    def post(self, request: Request, batch_id: UUID) -> Response:
        serializer = VersionedBatchCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        batch = get_object_or_404(PayoutBatch, id=batch_id)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            approve_payout_batch(
                batch_id=batch.id,
                expected_version=serializer.validated_data["expected_version"],
                actor=actor,
            )
            return status.HTTP_200_OK, _batch_projection(batch.id)

        result = execute_idempotent(
            actor=actor,
            operation="payouts.approve_batch",
            key=key,
            request_payload={"batch_id": str(batch.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PayoutBatchPayView(APIView):
    """The moment money starts leaving. Step-up again, because approval and payment can be
    hours apart and the second decision deserves its own proof of presence."""

    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_batch_pay",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedBatchCommandSerializer,
        responses={200: PayoutBatchSerializer, 401: ApiErrorSerializer, **_ERRORS},
    )
    def post(self, request: Request, batch_id: UUID) -> Response:
        serializer = VersionedBatchCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        batch = get_object_or_404(PayoutBatch, id=batch_id)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            start_paying_batch(
                batch_id=batch.id,
                expected_version=serializer.validated_data["expected_version"],
            )
            return status.HTTP_200_OK, _batch_projection(batch.id)

        result = execute_idempotent(
            actor=actor,
            operation="payouts.pay_batch",
            key=key,
            request_payload={"batch_id": str(batch.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class PayoutBatchCancelView(APIView):
    """No step-up: cancelling only returns money to the pool.

    Making the safe direction as heavy as the dangerous one trains people to leave batches
    sitting approved rather than cancel a bad one.
    """

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_payout_batch_cancel",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=VersionedBatchCommandSerializer,
        responses={200: PayoutBatchSerializer, **_ERRORS},
    )
    def post(self, request: Request, batch_id: UUID) -> Response:
        serializer = VersionedBatchCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        batch = get_object_or_404(PayoutBatch, id=batch_id)
        key = _required_key(request)

        def command() -> tuple[int, ResponseBody]:
            cancel_payout_batch(
                batch_id=batch.id,
                expected_version=serializer.validated_data["expected_version"],
                actor=actor,
            )
            return status.HTTP_200_OK, _batch_projection(batch.id)

        result = execute_idempotent(
            actor=actor,
            operation="payouts.cancel_batch",
            key=key,
            request_payload={"batch_id": str(batch.id), **serializer.validated_data},
            command=command,
        )
        return Response(result.body, status=result.status_code)


class UnpayablePartnersView(APIView):
    """Who is owed money and cannot be paid. The list a run is chased from."""

    permission_classes = (IsAuthenticated, IsOperationsUser)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_unpayable_partners",
        parameters=[
            OpenApiParameter("period_start", str, required=True),
            OpenApiParameter("period_end", str, required=True),
        ],
        responses={200: UnpayablePartnerSerializer, 400: ApiErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        start = parse_datetime(request.query_params.get("period_start", "") or "")
        end = parse_datetime(request.query_params.get("period_end", "") or "")
        if start is None or end is None:
            raise ValidationError({"period": "period_start and period_end are required."})
        return Response(
            UnpayablePartnerSerializer(
                {"partner_ids": unpayable_partner_ids(period_start=start, period_end=end)}
            ).data
        )


class LedgerAdjustmentView(APIView):
    """Correct the ledger by adding to it. Step-up, because an adjustment moves what is owed."""

    permission_classes = (IsAuthenticated, IsOperationsUser, HasRecentOperationsStepUp)

    @extend_schema(
        tags=[OPERATIONS_TAG],
        operation_id="operations_ledger_adjust",
        parameters=[IDEMPOTENCY_KEY_HEADER],
        request=LedgerAdjustmentRequestSerializer,
        responses={201: PartnerLedgerEntrySerializer, 401: ApiErrorSerializer, **_ERRORS},
    )
    def post(self, request: Request) -> Response:
        serializer = LedgerAdjustmentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = cast(User, request.user)
        key = _required_key(request)
        data: dict[str, Any] = serializer.validated_data

        entry = record_adjustment(
            partner_id=data["partner_id"],
            corrects_id=data.get("corrects_id"),
            net_paise=data["net_paise"],
            reason=data["reason"],
            actor=actor,
            idempotency_key=key,
        )
        return Response(PartnerLedgerEntrySerializer(entry).data, status=status.HTTP_201_CREATED)
