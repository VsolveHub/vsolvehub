from django.urls import path

from apps.carts.views import AssistedCheckoutView, CartView, CheckoutView, QuoteView

urlpatterns = [
    path("cart/", CartView.as_view()),
    path("quotes/", QuoteView.as_view()),
    path("checkouts/", CheckoutView.as_view()),
    path("operations/assisted-checkouts/", AssistedCheckoutView.as_view()),
]
