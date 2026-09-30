"""Ledger and payout routes.

`/partner/…` resolves the Partner from the session and takes no id — the safest filter is the one
a caller cannot supply. `/operations/…` is the batch machinery, and the two money-moving commands
on it also require a fresh OTP step-up.
"""

from django.urls import path

from apps.payouts.exports import PayoutBatchBankExportView
from apps.payouts.views import (
    LedgerAdjustmentView,
    PartnerEarningsView,
    PartnerLedgerView,
    PartnerPayoutAccountView,
    PartnerPerformanceView,
    PayoutBatchApproveView,
    PayoutBatchCancelView,
    PayoutBatchDetailView,
    PayoutBatchListView,
    PayoutBatchPayView,
    UnpayablePartnersView,
)

urlpatterns = [
    path("partner/earnings/", PartnerEarningsView.as_view(), name="partner-earnings"),
    path(
        "partner/performance/",
        PartnerPerformanceView.as_view(),
        name="partner-performance",
    ),
    path("partner/ledger/", PartnerLedgerView.as_view(), name="partner-ledger"),
    path(
        "partner/payout-account/",
        PartnerPayoutAccountView.as_view(),
        name="partner-payout-account",
    ),
    path(
        "operations/payout-batches/",
        PayoutBatchListView.as_view(),
        name="operations-payout-batches",
    ),
    path(
        "operations/payout-batches/<uuid:batch_id>/",
        PayoutBatchDetailView.as_view(),
        name="operations-payout-batch",
    ),
    path(
        "operations/payout-batches/<uuid:batch_id>/approve/",
        PayoutBatchApproveView.as_view(),
        name="operations-payout-batch-approve",
    ),
    path(
        "operations/payout-batches/<uuid:batch_id>/pay/",
        PayoutBatchPayView.as_view(),
        name="operations-payout-batch-pay",
    ),
    path(
        "operations/payout-batches/<uuid:batch_id>/cancel/",
        PayoutBatchCancelView.as_view(),
        name="operations-payout-batch-cancel",
    ),
    path(
        "operations/unpayable-partners/",
        UnpayablePartnersView.as_view(),
        name="operations-unpayable-partners",
    ),
    path(
        "operations/ledger-adjustments/",
        LedgerAdjustmentView.as_view(),
        name="operations-ledger-adjustments",
    ),
]
urlpatterns += [
    path(
        "operations/payout-batches/<uuid:pk>/bank-export.csv",
        PayoutBatchBankExportView.as_view(export_format="csv"),
        name="payout_bank_export_csv",
    ),
    path(
        "operations/payout-batches/<uuid:pk>/bank-export.xlsx",
        PayoutBatchBankExportView.as_view(export_format="xlsx"),
        name="payout_bank_export_xlsx",
    ),
]
