"""Customer wallet DRF views (Proposal 0020)."""

from typing import cast

from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.models import User
from apps.partners.permissions import IsOperationsUser
from apps.wallet.excel import workbook_bytes
from apps.wallet.models import WalletAccount, WalletTransaction
from apps.wallet.serializers import (
    WalletAccountSerializer,
    WalletLiabilityReportSerializer,
    WalletTopUpRequestSerializer,
    WalletTopUpResponseSerializer,
    WalletTransactionSerializer,
)
from apps.wallet.services import (
    WalletTopUpPolicyViolationError,
    calculate_platform_wallet_liability_paise,
    get_or_create_wallet,
    initiate_wallet_top_up,
)


class CustomerWalletView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        summary="Customer wallet balance and policy",
        responses={200: WalletAccountSerializer},
        tags=["wallet"],
    )
    def get(self, request: Request) -> Response:
        wallet = get_or_create_wallet(cast(User, request.user))
        serializer = WalletAccountSerializer(wallet)
        return Response(serializer.data)


class CustomerWalletTransactionsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        summary="Customer wallet transaction ledger",
        responses={200: WalletTransactionSerializer(many=True)},
        tags=["wallet"],
    )
    def get(self, request: Request) -> Response:
        wallet = get_or_create_wallet(cast(User, request.user))
        paginator = LimitOffsetPagination()
        paginator.default_limit = 20
        paginator.max_limit = 100
        txns = wallet.transactions.all()
        page = paginator.paginate_queryset(txns, request, view=self)
        serializer = WalletTransactionSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class CustomerWalletTopUpView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    @extend_schema(
        summary="Initiate wallet top-up payment attempt",
        request=WalletTopUpRequestSerializer,
        responses={202: WalletTopUpResponseSerializer},
        tags=["wallet"],
    )
    def post(self, request: Request) -> Response:
        serializer = WalletTopUpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        amount_paise = serializer.validated_data["amount_paise"]
        idempotency_key = serializer.validated_data.get("idempotency_key", "")

        try:
            attempt = initiate_wallet_top_up(
                user=cast(User, request.user),
                amount_paise=amount_paise,
                idempotency_key=idempotency_key,
            )
        except WalletTopUpPolicyViolationError as exc:
            raise ValidationError({"amount_paise": str(exc)}) from exc

        response_data = {
            "payment_attempt_id": attempt.id,
            "purpose": attempt.purpose,
            "amount_paise": attempt.amount_paise,
            "currency": attempt.currency,
            "provider": attempt.provider,
            "provider_order_id": attempt.provider_order_id,
            "status": attempt.status,
        }
        return Response(response_data, status=status.HTTP_202_ACCEPTED)


class OpsWalletLiabilityView(APIView):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)

    @extend_schema(
        summary="Total platform customer wallet liability",
        responses={200: WalletLiabilityReportSerializer},
        tags=["operations"],
    )
    def get(self, request: Request) -> Response:  # noqa: ARG002
        total = calculate_platform_wallet_liability_paise()
        count = WalletAccount.objects.count()
        return Response(
            {
                "total_liability_paise": total,
                "currency": "INR",
                "active_wallets_count": count,
            }
        )


class OpsWalletLiabilityExcelView(APIView):
    """Operations download of captured wallet rows. Excluded from the JSON contract."""

    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)

    @extend_schema(exclude=True)
    def get(self, request: Request) -> HttpResponse:  # noqa: ARG002
        rows = [
            [
                str(txn.wallet.customer_id),
                txn.kind,
                txn.status,
                txn.amount_paise,
                txn.created_at.isoformat(),
            ]
            for txn in WalletTransaction.objects.select_related("wallet").order_by("-created_at")[
                :5000
            ]
        ]
        payload = workbook_bytes(
            sheet_name="Wallet ledger",
            headers=["customer_id", "kind", "status", "amount_paise", "created_at"],
            rows=rows,
        )
        response = HttpResponse(
            payload,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="wallet-ledger.xlsx"'
        return response
