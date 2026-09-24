"""URL routes for customer V Coins and Referral programs."""

from django.urls import path

from apps.loyalty.ops_views import (
    OpsCoinBurnPolicyListView,
    OpsCoinEarnTierListView,
    OpsCoinGrantRuleDetailView,
    OpsCoinGrantRuleListView,
    OpsReferralAttributionListView,
    OpsReferralProgramListView,
)
from apps.loyalty.views import (
    CustomerCoinsBurnPreviewView,
    CustomerCoinsView,
    CustomerCoinTransactionsView,
    CustomerReferralApplyView,
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
        "customer/referral/apply/",
        CustomerReferralApplyView.as_view(),
        name="customer-referral-apply",
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
        "ops/loyalty/grant-rules/<uuid:rule_id>/tiers/",
        OpsCoinEarnTierListView.as_view(),
        name="ops-coin-earn-tiers",
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
]
