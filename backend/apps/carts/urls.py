from django.urls import path

from apps.carts.views import (
    AssistedCheckoutView,
    BookingGroupCancelView,
    BookingGroupCollectionView,
    BookingGroupDetailView,
    BookingWindowsView,
    CartItemCollectionView,
    CartItemDetailView,
    CartItemRemoveView,
    CartMergeView,
    CartSchedulingGroupsView,
    CartView,
    CheckoutView,
    FulfilmentPlanSetDetailView,
    FulfilmentPlanSetView,
    OperationsCompatibilityRuleActivateView,
    OperationsCompatibilityRuleCollectionView,
    OperationsCompatibilityRuleDetailView,
    OperationsCompatibilityRuleRejectView,
    OperationsCompatibilityRuleRetireView,
    PlanQuoteDetailView,
    PlanQuoteView,
    QuoteView,
)

urlpatterns = [
    path("booking-groups/", BookingGroupCollectionView.as_view()),
    path("booking-groups/<uuid:group_id>/", BookingGroupDetailView.as_view()),
    path(
        "booking-groups/<uuid:group_id>/cancel/",
        BookingGroupCancelView.as_view(),
    ),
    path("cart/", CartView.as_view()),
    path("cart/items/", CartItemCollectionView.as_view()),
    path("cart/items/<uuid:item_id>/", CartItemDetailView.as_view()),
    path("cart/items/<uuid:item_id>/remove/", CartItemRemoveView.as_view()),
    path("cart/merge/", CartMergeView.as_view()),
    path("cart/scheduling-groups/", CartSchedulingGroupsView.as_view()),
    path("booking/windows/", BookingWindowsView.as_view()),
    path("fulfilment-plan-sets/", FulfilmentPlanSetView.as_view()),
    path(
        "fulfilment-plan-sets/<uuid:plan_set_id>/",
        FulfilmentPlanSetDetailView.as_view(),
    ),
    path("plan-quotes/", PlanQuoteView.as_view()),
    path("plan-quotes/<uuid:quote_id>/", PlanQuoteDetailView.as_view()),
    path(
        "operations/compatibility-rules/",
        OperationsCompatibilityRuleCollectionView.as_view(),
    ),
    path(
        "operations/compatibility-rules/<uuid:rule_id>/",
        OperationsCompatibilityRuleDetailView.as_view(),
    ),
    path(
        "operations/compatibility-rules/<uuid:rule_id>/activate/",
        OperationsCompatibilityRuleActivateView.as_view(),
    ),
    path(
        "operations/compatibility-rules/<uuid:rule_id>/reject/",
        OperationsCompatibilityRuleRejectView.as_view(),
    ),
    path(
        "operations/compatibility-rules/<uuid:rule_id>/retire/",
        OperationsCompatibilityRuleRetireView.as_view(),
    ),
    path("quotes/", QuoteView.as_view()),
    path("checkouts/", CheckoutView.as_view()),
    path("operations/assisted-checkouts/", AssistedCheckoutView.as_view()),
]
