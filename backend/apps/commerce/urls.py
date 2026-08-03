from django.urls import path

from apps.commerce.views import (
    CheckoutPaymentView,
    FinanceRefundCollectionView,
    FinanceRefundReconcileView,
    OrderDetailView,
    PaymentAttemptCollectionView,
    PaymentAttemptDetailView,
    PaymentAttemptReconcileView,
    RazorpayWebhookView,
    RefundDetailView,
    TaxDocumentDetailView,
)

urlpatterns = [
    path("payment-attempts/", PaymentAttemptCollectionView.as_view()),
    path("payment-attempts/<uuid:attempt_id>/", PaymentAttemptDetailView.as_view()),
    path(
        "payment-attempts/<uuid:attempt_id>/reconcile/",
        PaymentAttemptReconcileView.as_view(),
    ),
    path("checkouts/<uuid:checkout_id>/payment/", CheckoutPaymentView.as_view()),
    path("payment-webhooks/razorpay/", RazorpayWebhookView.as_view()),
    path("finance/refunds/", FinanceRefundCollectionView.as_view()),
    path("finance/refunds/<uuid:refund_id>/reconcile/", FinanceRefundReconcileView.as_view()),
    path("refunds/<uuid:refund_id>/", RefundDetailView.as_view()),
    path("orders/<uuid:order_id>/", OrderDetailView.as_view()),
    path("tax-documents/<uuid:document_id>/", TaxDocumentDetailView.as_view()),
]
