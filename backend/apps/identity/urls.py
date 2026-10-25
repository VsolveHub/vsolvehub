from django.urls import path

from apps.identity.views import (
    CommunicationPreferenceView,
    ConsentReceiptView,
    CsrfCookieView,
    CurrentSessionView,
    CustomerProfileView,
    FinanceStepUpView,
    FirebasePrecheckView,
    FirebaseVerifyView,
    LogoutView,
    OtpRequestView,
    OtpVerifyView,
    PrivacyRequestView,
    RoleSwitchView,
    SessionListView,
    SessionRevokeView,
)

app_name = "identity"

urlpatterns = [
    path("csrf/", CsrfCookieView.as_view(), name="csrf"),
    path("otp/request/", OtpRequestView.as_view(), name="otp-request"),
    path("otp/verify/", OtpVerifyView.as_view(), name="otp-verify"),
    path("firebase/precheck/", FirebasePrecheckView.as_view(), name="firebase-precheck"),
    path("firebase/verify/", FirebaseVerifyView.as_view(), name="firebase-verify"),
    path("session/", CurrentSessionView.as_view(), name="session"),
    path("profile/", CustomerProfileView.as_view(), name="profile"),
    path("sessions/", SessionListView.as_view(), name="session-list"),
    path("sessions/<uuid:session_id>/", SessionRevokeView.as_view(), name="session-revoke"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("roles/switch/", RoleSwitchView.as_view(), name="role-switch"),
    path("finance/step-up/", FinanceStepUpView.as_view(), name="finance-step-up"),
    path("privacy/consents/", ConsentReceiptView.as_view(), name="consent-receipts"),
    path("privacy/preferences/", CommunicationPreferenceView.as_view(), name="preferences"),
    path("privacy/requests/", PrivacyRequestView.as_view(), name="privacy-requests"),
]
