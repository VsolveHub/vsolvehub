from django.urls import path

from apps.identity.views import (
    CommunicationPreferenceView,
    ConsentReceiptView,
    CsrfCookieView,
    CurrentSessionView,
    CustomerProfileView,
    FinanceStepUpView,
    LogoutView,
    OtpRequestView,
    OtpVerifyView,
    PrivacyRequestView,
    RoleSwitchView,
    SessionListView,
    SessionRevokeView,
)

from apps.identity.views_governance import (
    AdminAuditLogListView,
    AdminRoleListView,
    AdminUserRoleListView,
    ConfigVersionListView,
    DualAuthApproveView,
    DualAuthPendingListView,
)

app_name = "identity"

urlpatterns = [
    path("csrf/", CsrfCookieView.as_view(), name="csrf"),
    path("otp/request/", OtpRequestView.as_view(), name="otp-request"),
    path("otp/verify/", OtpVerifyView.as_view(), name="otp-verify"),
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
    # Phase 0 Enterprise Governance & RBAC
    path("admin/roles/", AdminRoleListView.as_view(), name="admin-role-list"),
    path("admin/users/", AdminUserRoleListView.as_view(), name="admin-user-list"),
    path("admin/audit-logs/", AdminAuditLogListView.as_view(), name="admin-audit-log-list"),
    path("admin/dual-auth/", DualAuthPendingListView.as_view(), name="admin-dual-auth-list"),
    path("admin/dual-auth/<uuid:request_id>/action/", DualAuthApproveView.as_view(), name="admin-dual-auth-action"),
    path("admin/config-versions/", ConfigVersionListView.as_view(), name="admin-config-version-list"),
]
