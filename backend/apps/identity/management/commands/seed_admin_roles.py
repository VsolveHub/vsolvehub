"""Seed script for Phase 0: 12 Canonical Enterprise Administrative Roles and Permissions.

Idempotent: safe to run repeatedly across environments.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.identity.models import AdminPermission, Role, User, UserRole


CANONICAL_PERMISSIONS = [
    # Command Center
    ("cmd_view_dashboard", "View Command Center Dashboard", "COMMAND_CENTER", "Access executive KPI dashboard"),
    ("cmd_view_live_ops", "View Live Operations Map", "COMMAND_CENTER", "Access real-time geospatial partner map"),
    ("cmd_manage_approvals", "Manage Approval Center", "COMMAND_CENTER", "Act on approval and dual-auth queues"),
    
    # Users & Identity
    ("users_view_customers", "View Customer Directory", "USERS", "Search and view customer accounts"),
    ("users_edit_customers", "Edit Customer Status", "USERS", "Suspend, activate, or adjust customer details"),
    ("users_view_partners", "View Partner Directory", "USERS", "View partner profiles, trades, and documents"),
    ("users_manage_partners", "Manage Partners", "USERS", "Onboard, verify, tier, or suspend service partners"),
    ("users_verify_kyc", "Process KYC Documents", "USERS", "Approve, reject, or mark partner KYC documents"),
    ("users_moderate_reviews", "Moderate Reviews & Ratings", "USERS", "Approve, edit, or hide ratings and reviews"),
    
    # Marketplace & Catalog
    ("mkt_view_catalog", "View Catalog & Categories", "MARKETPLACE", "View service categories and dynamic forms"),
    ("mkt_manage_catalog", "Manage Catalog & Categories", "MARKETPLACE", "Create and publish categories and services"),
    ("mkt_configure_pricing", "Configure Pricing Matrices", "MARKETPLACE", "Edit pricing rules, slabs, and overrides"),
    ("mkt_manage_bookings", "Manage Bookings & Dispatches", "MARKETPLACE", "View, reassign, cancel, or override bookings"),
    ("mkt_manage_quotes", "Manage Complex Quotes & BOQs", "MARKETPLACE", "Review, revise, and approve quotations"),
    
    # Money & Financials
    ("money_view_payments", "View Payments & Transactions", "MONEY", "Access gateway transaction histories"),
    ("money_manage_payouts", "Manage Partner Payouts", "MONEY", "Generate and approve partner settlement batches"),
    ("money_process_refunds", "Process Customer Refunds", "MONEY", "Authorize standard and high-value refunds"),
    ("money_export_reports", "Export Financial Ledgers", "MONEY", "Download settlement and tax deduction reports"),
    
    # Growth & Marketing
    ("growth_manage_vcoins", "Manage V Coins", "GROWTH", "Configure accrual rates and manual adjustments"),
    ("growth_manage_campaigns", "Manage Campaigns & Referrals", "GROWTH", "Create QR campaigns, referrals, and promo rules"),
    ("growth_manage_cms", "Manage CMS & Banners", "GROWTH", "Publish homepage and app hero banners"),
    
    # Specialized Verticals
    ("svc_manage_rides", "Manage Vehicle & Ride Center", "SERVICES", "Fleet, captain tracking, and ride dispatch"),
    ("svc_manage_construction", "Manage Construction Center", "SERVICES", "Milestone stage reviews and site visits"),
    ("svc_manage_stays", "Manage Stays & Hostels", "SERVICES", "Property reservations and unit allocations"),
    ("svc_manage_rentals", "Manage Rentals & Tools", "SERVICES", "Asset checkouts, returns, and damages"),
    
    # Support
    ("support_manage_cases", "Manage Support Tickets & Cases", "SUPPORT", "Triage, escalate, and resolve customer issues"),
    
    # AI & Copilot
    ("ai_manage_models", "Manage AI Control Center", "AI", "Configure prompts, inspect model queries and limits"),
    
    # Analytics & Reports
    ("analytics_view_reports", "View Reports & Metrics", "ANALYTICS", "Access standard operational and financial BI reports"),
    ("analytics_custom_builder", "Use Custom Report Builder", "ANALYTICS", "Build and export custom SQL/tabular queries"),
    
    # System Governance & Security
    ("sys_view_audit_logs", "View Immutable Audit Logs", "SYSTEM", "Inspect system-wide change and access logs"),
    ("sys_manage_rbac", "Manage Admin Roles & Permissions", "SYSTEM", "Assign roles and configure permissions"),
    ("sys_manage_security", "Manage Super Admin Security", "SYSTEM", "Active sessions, IP whitelists, and 2FA settings"),
    ("sys_manage_system", "Manage System Health & Switches", "SYSTEM", "Toggle kill switches and maintenance mode"),
    ("sys_dual_auth_approve", "Execute Dual-Authorization", "SYSTEM", "Provide second-eye approval for high-risk actions"),
]

CANONICAL_ROLES = {
    "super_admin": {
        "name": "Super Admin",
        "description": "Master command across all platform systems, dual-authorization overrides, and security policies.",
        "permissions": "ALL",
    },
    "admin": {
        "name": "Platform Admin",
        "description": "General administrative management across users, marketplace, and operational configurations.",
        "permissions": [
            "cmd_view_dashboard", "cmd_view_live_ops", "cmd_manage_approvals",
            "users_view_customers", "users_edit_customers", "users_view_partners", "users_manage_partners",
            "users_verify_kyc", "users_moderate_reviews", "mkt_view_catalog", "mkt_manage_catalog",
            "mkt_configure_pricing", "mkt_manage_bookings", "mkt_manage_quotes", "money_view_payments",
            "money_manage_payouts", "money_process_refunds", "growth_manage_vcoins", "growth_manage_campaigns",
            "growth_manage_cms", "svc_manage_rides", "svc_manage_construction", "svc_manage_stays",
            "svc_manage_rentals", "support_manage_cases", "analytics_view_reports", "sys_view_audit_logs",
            "sys_manage_system",
        ],
    },
    "operations": {
        "name": "Operations Lead",
        "description": "Real-time dispatch, booking lifecycle management, operational cases, and vertical tracking.",
        "permissions": [
            "cmd_view_dashboard", "cmd_view_live_ops", "cmd_manage_approvals",
            "users_view_customers", "users_view_partners", "mkt_view_catalog",
            "mkt_manage_bookings", "mkt_manage_quotes", "svc_manage_rides",
            "svc_manage_construction", "svc_manage_stays", "svc_manage_rentals",
            "support_manage_cases", "money_view_payments",
        ],
    },
    "finance": {
        "name": "Finance Controller",
        "description": "Clearinghouse, payment gateways, partner settlements, high-value refunds, and tax compliance.",
        "permissions": [
            "cmd_view_dashboard", "money_view_payments", "money_manage_payouts",
            "money_process_refunds", "money_export_reports", "analytics_view_reports",
            "sys_view_audit_logs",
        ],
    },
    "customer_support": {
        "name": "Customer Support",
        "description": "Customer inquiry resolution, booking assistance, and review moderation.",
        "permissions": [
            "cmd_view_dashboard", "users_view_customers", "mkt_view_catalog",
            "mkt_manage_bookings", "support_manage_cases", "users_moderate_reviews",
        ],
    },
    "partner_management": {
        "name": "Partner Management",
        "description": "Vendor onboarding, trade skill certification, tiering, and KYC document verification.",
        "permissions": [
            "cmd_view_dashboard", "cmd_manage_approvals", "users_view_partners",
            "users_manage_partners", "users_verify_kyc", "analytics_view_reports",
        ],
    },
    "marketing": {
        "name": "Marketing & Growth",
        "description": "Acquisition campaigns, V Coins reward allocations, referrals, and promotional banners.",
        "permissions": [
            "cmd_view_dashboard", "growth_manage_vcoins", "growth_manage_campaigns",
            "growth_manage_cms", "analytics_view_reports",
        ],
    },
    "hr": {
        "name": "Human Resources",
        "description": "Internal administrative staff directory and personnel authorization tracking.",
        "permissions": [
            "cmd_view_dashboard", "sys_manage_rbac", "sys_view_audit_logs",
        ],
    },
    "category_manager": {
        "name": "Category Manager",
        "description": "Service taxonomy, no-code form schemas, rate cards, and pricing rules.",
        "permissions": [
            "cmd_view_dashboard", "mkt_view_catalog", "mkt_manage_catalog",
            "mkt_configure_pricing", "analytics_view_reports",
        ],
    },
    "city_manager": {
        "name": "City Manager",
        "description": "Territory geospatial boundaries, local category whitelists, and regional fee overrides.",
        "permissions": [
            "cmd_view_dashboard", "cmd_view_live_ops", "users_view_partners",
            "mkt_view_catalog", "mkt_manage_bookings", "analytics_view_reports",
        ],
    },
    "auditor": {
        "name": "Auditor & Compliance",
        "description": "Read-only access to immutable audit trails, ledger transactions, and compliance records.",
        "permissions": [
            "cmd_view_dashboard", "sys_view_audit_logs", "money_view_payments",
            "money_export_reports", "analytics_view_reports",
        ],
    },
    "analyst": {
        "name": "Business Analyst",
        "description": "Aggregated metrics, operational reports, data exports, and custom queries.",
        "permissions": [
            "cmd_view_dashboard", "analytics_view_reports", "analytics_custom_builder",
        ],
    },
}


class Command(BaseCommand):
    help = "Seed Phase 0 canonical enterprise administrative roles and permissions."

    @transaction.atomic
    def handle(self, *args: object, **options: object) -> None:
        self.stdout.write("Seeding canonical administrative permissions...")
        perm_map = {}
        for code, name, category, desc in CANONICAL_PERMISSIONS:
            perm, created = AdminPermission.objects.update_or_create(
                code=code,
                defaults={
                    "name": name,
                    "category": category,
                    "description": desc,
                },
            )
            perm_map[code] = perm
            if created:
                self.stdout.write(f"  + Permission: {code}")

        self.stdout.write("Seeding canonical administrative roles...")
        all_perms = list(perm_map.values())
        for code, data in CANONICAL_ROLES.items():
            role, created = Role.objects.update_or_create(
                code=code,
                defaults={
                    "name": data["name"],
                    "description": data["description"],
                    "is_system": True,
                },
            )
            if data["permissions"] == "ALL":
                role.permissions.set(all_perms)
            else:
                assigned = [perm_map[p] for p in data["permissions"] if p in perm_map]
                role.permissions.set(assigned)

            action_str = "Created" if created else "Updated"
            self.stdout.write(f"  * {action_str} Role: {code} ({role.permissions.count()} permissions)")

        # Seed representative staff profiles across all 12 canonical roles
        STAFF_SEED_PROFILES = [
            ("+918019013032", "Priya Nair", ["super_admin", "operations", "admin"]),
            ("+919849010001", "Vikram Reddy", ["admin"]),
            ("+919849010002", "Rajesh Varma", ["operations"]),
            ("+919849010003", "Ananya Sharma", ["finance"]),
            ("+919849010004", "Sunita Rao", ["customer_support"]),
            ("+919849010005", "Karthik Iyer", ["partner_management"]),
            ("+919849010006", "Neha Kapoor", ["marketing"]),
            ("+919849010007", "Arvind Swamy", ["hr"]),
            ("+919849010008", "Deepa Mehta", ["category_manager"]),
            ("+919849010009", "Suresh Kumar", ["city_manager"]),
            ("+919849010010", "Meenakshi Sundaram", ["auditor"]),
            ("+919849010011", "Rohan Gupta", ["analyst"]),
        ]

        for phone, full_name, role_codes in STAFF_SEED_PROFILES:
            user, u_created = User.objects.get_or_create(
                phone_number=phone,
                defaults={
                    "full_name": full_name,
                    "is_staff": True,
                    "is_active": True,
                },
            )
            if not u_created and not user.is_staff:
                user.is_staff = True
                user.full_name = full_name
                user.save(update_fields=["is_staff", "full_name"])

            for r_code in role_codes:
                role_obj = Role.objects.get(code=r_code)
                UserRole.objects.get_or_create(
                    user=user,
                    role=role_obj,
                    revoked_at=None,
                )
            self.stdout.write(f"  + Configured staff member: {full_name} ({phone}) -> {role_codes}")

        self.stdout.write(self.style.SUCCESS("Successfully seeded Phase 0 administrative roles, permissions, and 12-role staff roster."))
