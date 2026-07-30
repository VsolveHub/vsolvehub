from django.urls import path

from apps.identity.views import (
    CsrfCookieView,
    CurrentSessionView,
    LogoutView,
    OtpRequestView,
    OtpVerifyView,
    SessionListView,
    SessionRevokeView,
)

app_name = "identity"

urlpatterns = [
    path("csrf/", CsrfCookieView.as_view(), name="csrf"),
    path("otp/request/", OtpRequestView.as_view(), name="otp-request"),
    path("otp/verify/", OtpVerifyView.as_view(), name="otp-verify"),
    path("session/", CurrentSessionView.as_view(), name="session"),
    path("sessions/", SessionListView.as_view(), name="session-list"),
    path("sessions/<uuid:session_id>/", SessionRevokeView.as_view(), name="session-revoke"),
    path("logout/", LogoutView.as_view(), name="logout"),
]
