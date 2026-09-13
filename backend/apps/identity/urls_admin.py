"""Central Admin REST API router mounted at /api/v1/admin/."""

from django.urls import path

from apps.identity.views_governance import (
    AdminAuditLogListView,
    AdminCustomerActionView,
    AdminCustomerListView,
    AdminPartnerListView,
    AdminRoleListView,
    AdminUserRoleListView,
    AdminZoneListView,
    ConfigVersionListView,
    DualAuthApproveView,
    DualAuthPendingListView,
)
from apps.identity.views_operations_all import (
    AdminActivityTimelineView,
    AdminAiControlView,
    AdminBookingsLifecycleView,
    AdminCategoriesView,
    AdminCommissionRulesView,
    AdminGlobalSearchView,
    AdminGrowthView,
    AdminKycActionView,
    AdminKycListView,
    AdminLiveOpsView,
    AdminPartnerRankingView,
    AdminPaymentsView,
    AdminPricingMatrixView,
    AdminQuotesView,
    AdminSettlementsView,
    AdminSupportTicketsView,
    AdminSystemHealthView,
    AdminVerticalsOverview,
)

app_name = "admin_governance"

urlpatterns = [
    # RBAC & System Governance (§38, §39, §40, §55)
    path("roles/", AdminRoleListView.as_view(), name="admin-roles"),
    path("users/", AdminUserRoleListView.as_view(), name="admin-users"),
    path("audit-logs/", AdminAuditLogListView.as_view(), name="admin-audit-logs"),
    path("dual-auth/", DualAuthPendingListView.as_view(), name="admin-dual-auth"),
    path("dual-auth/<uuid:request_id>/action/", DualAuthApproveView.as_view(), name="admin-dual-auth-action"),
    path("config-versions/", ConfigVersionListView.as_view(), name="admin-config-versions"),

    # Phase 1: Master Identities & Geo (§4, §5, §6, §19)
    path("customers/", AdminCustomerListView.as_view(), name="admin-customers"),
    path("customers/<uuid:customer_id>/action/", AdminCustomerActionView.as_view(), name="admin-customer-action"),
    path("partners/", AdminPartnerListView.as_view(), name="admin-partners"),
    path("kyc/", AdminKycListView.as_view(), name="admin-kyc-list"),
    path("kyc/<uuid:partner_id>/action/", AdminKycActionView.as_view(), name="admin-kyc-action"),
    path("zones/", AdminZoneListView.as_view(), name="admin-zones"),

    # Phase 2: Dynamic Marketplace & Pricing (§7, §8, §12, §13, §33)
    path("categories/", AdminCategoriesView.as_view(), name="admin-categories"),
    path("pricing-matrix/", AdminPricingMatrixView.as_view(), name="admin-pricing-matrix"),
    path("commission-rules/", AdminCommissionRulesView.as_view(), name="admin-commission-rules"),
    path("partner-ranking/", AdminPartnerRankingView.as_view(), name="admin-partner-ranking"),

    # Phase 3: Bookings, Quotes, Live Ops, Search & Timeline (§3, §9, §10, §11, §48, §49)
    path("bookings/", AdminBookingsLifecycleView.as_view(), name="admin-bookings"),
    path("quotes/", AdminQuotesView.as_view(), name="admin-quotes"),
    path("live-ops/", AdminLiveOpsView.as_view(), name="admin-live-ops"),
    path("global-search/", AdminGlobalSearchView.as_view(), name="admin-global-search"),
    path("activity-timeline/", AdminActivityTimelineView.as_view(), name="admin-activity-timeline"),

    # Phase 4 & 5: Money, Growth, Risk (§14, §15, §16, §17, §18, §34)
    path("payments/", AdminPaymentsView.as_view(), name="admin-payments"),
    path("settlements/", AdminSettlementsView.as_view(), name="admin-settlements"),
    path("growth/", AdminGrowthView.as_view(), name="admin-growth"),

    # Phase 6: Specialized Verticals (§20-§26)
    path("verticals-overview/", AdminVerticalsOverview.as_view(), name="admin-verticals-overview"),

    # Phase 7 & 8: Support Desk, AI Assistant (§28, §35)
    path("support-tickets/", AdminSupportTicketsView.as_view(), name="admin-support-tickets"),
    path("ai-control/", AdminAiControlView.as_view(), name="admin-ai-control"),

    # Phase 9: System Health (§41-§47)
    path("system-health/", AdminSystemHealthView.as_view(), name="admin-system-health"),
]
