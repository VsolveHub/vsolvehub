"""URL routes for customer V Coins and Referral programs."""

from django.urls import path

from apps.loyalty.ops_views import (
    OpsCoinAdjustmentView,
    OpsCoinBurnPolicyListView,
    OpsCoinGrantRuleDetailView,
    OpsCoinGrantRuleListView,
    OpsCustomerLedgerView,
    OpsLoyaltySettingsView,
    OpsReferralAttributionListView,
    OpsReferralProgramListView,
    OpsReferralRejectView,
    OpsReferralReverseView,
)
from apps.loyalty.views import (
    CustomerCoinsBurnPreviewView,
    CustomerCoinsView,
    CustomerCoinTransactionsView,
    CustomerReferralAttributionsView,
    CustomerReferralView,
    PublicReferralValidateView,
)

urlpatterns = [
    path("customer/coins/", CustomerCoinsView.as_view(), name="customer-coins"),
    path(
        "customer/coins/transactions/",
        CustomerCoinTransactionsView.as_view(),
        name="customer-coins-transactions",
    ),
    path(
        "customer/coins/preview-burn/",
        CustomerCoinsBurnPreviewView.as_view(),
        name="customer-coins-preview-burn",
    ),
    path("customer/referral/", CustomerReferralView.as_view(), name="customer-referral"),
    path(
        "customer/referral/attributions/",
        CustomerReferralAttributionsView.as_view(),
        name="customer-referral-attributions",
    ),
    path(
        "customer/referral/validate/",
        PublicReferralValidateView.as_view(),
        name="customer-referral-validate",
    ),
    path(
        "ops/loyalty/grant-rules/",
        OpsCoinGrantRuleListView.as_view(),
        name="ops-coin-grant-rules",
    ),
    path(
        "ops/loyalty/grant-rules/<uuid:rule_id>/",
        OpsCoinGrantRuleDetailView.as_view(),
        name="ops-coin-grant-rule",
    ),
    path(
        "ops/loyalty/burn-policies/",
        OpsCoinBurnPolicyListView.as_view(),
        name="ops-coin-burn-policies",
    ),
    path(
        "ops/referral/programs/",
        OpsReferralProgramListView.as_view(),
        name="ops-referral-programs",
    ),
    path(
        "ops/referral/attributions/",
        OpsReferralAttributionListView.as_view(),
        name="ops-referral-attributions",
    ),
    path(
        "ops/referral/attributions/<uuid:attribution_id>/reject/",
        OpsReferralRejectView.as_view(),
        name="ops-referral-reject",
    ),
    path(
        "ops/referral/attributions/<uuid:attribution_id>/reverse/",
        OpsReferralReverseView.as_view(),
        name="ops-referral-reverse",
    ),
    path("ops/loyalty/settings/", OpsLoyaltySettingsView.as_view(), name="ops-loyalty-settings"),
    path(
        "ops/loyalty/customer-ledger/",
        OpsCustomerLedgerView.as_view(),
        name="ops-loyalty-customer-ledger",
    ),
    path(
        "ops/loyalty/coin-adjustments/",
        OpsCoinAdjustmentView.as_view(),
        name="ops-loyalty-coin-adjustments",
    ),
]
