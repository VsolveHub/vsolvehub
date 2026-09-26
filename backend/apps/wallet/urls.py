"""URL routes for customer wallet and top-up."""

from django.urls import path

from apps.wallet.ops_views import OpsWalletAdjustmentView, OpsWalletPolicyListView
from apps.wallet.views import (
    CustomerWalletTopUpView,
    CustomerWalletTransactionsView,
    CustomerWalletView,
    OpsWalletLiabilityExcelView,
    OpsWalletLiabilityView,
)

urlpatterns = [
    path("customer/wallet/", CustomerWalletView.as_view(), name="customer-wallet"),
    path(
        "customer/wallet/transactions/",
        CustomerWalletTransactionsView.as_view(),
        name="customer-wallet-transactions",
    ),
    path(
        "customer/wallet/top-up/",
        CustomerWalletTopUpView.as_view(),
        name="customer-wallet-top-up",
    ),
    path(
        "ops/wallet/liability/",
        OpsWalletLiabilityView.as_view(),
        name="ops-wallet-liability",
    ),
    path(
        "ops/wallet/liability.xlsx",
        OpsWalletLiabilityExcelView.as_view(),
        name="ops-wallet-liability-excel",
    ),
    path(
        "ops/wallet/policies/",
        OpsWalletPolicyListView.as_view(),
        name="ops-wallet-policies",
    ),
    path(
        "ops/wallet/adjustments/",
        OpsWalletAdjustmentView.as_view(),
        name="ops-wallet-adjustments",
    ),
]
