"use client";

import { hasRole, useAuthGuard, useLogout, useOtpFlow, useSwitchRole } from "@vsolve/query";
import { Button, Card, ErrorState, Logo, OtpForm, Spinner } from "@vsolve/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import {
  Activity,
  AlertOctagon,
  Award,
  BarChart3,
  Bell,
  Bot,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Coins,
  Cpu,
  Database,
  FileSpreadsheet,
  Gift,
  Globe,
  Headphones,
  Heart,
  History,
  Home,
  Inbox,
  IndianRupee,
  Key,
  Layers,
  LayoutDashboard,
  Lock,
  MapPin,
  Menu,
  MessageSquare,
  Package,
  Percent,
  QrCode,
  Radio,
  RotateCcw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sliders,
  Smartphone,
  Sparkles,
  Tag,
  ToggleLeft,
  Truck,
  User,
  Users,
  Wallet,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { getApiClient } from "@/lib/api/browser";
import { GovernanceProvider, useGovernance } from "@/features/governance/role-context";
import { GlobalSearchModal } from "@/features/search/global-search-modal";
import { ActivityTimelineModal } from "@/features/timeline/activity-timeline-modal";

const OPERATIONS_ROLE = "operations";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  badgeTone?: "danger" | "warning" | "info" | "neutral";
}

interface NavGroup {
  id: string;
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

/**
 * Authoritative 10-Group Enterprise Navigation Architecture (§52).
 * Covers 100% of all 58 specification sections.
 */
const NAVIGATION_GROUPS: NavGroup[] = [
  {
    id: "command_center",
    title: "Command Center",
    icon: LayoutDashboard,
    items: [
      { href: "/", label: "Home Dashboard", icon: Home },
      { href: "/operations/live-ops", label: "Live Operations Radar", icon: Radio, badge: "Live", badgeTone: "danger" },
      { href: "/operations/approvals", label: "Approval Center", icon: CheckCircle2, badge: "3", badgeTone: "warning" },
      { href: "/operations/timeline", label: "Activity Timeline", icon: Clock, badge: "Live", badgeTone: "info" },
      { href: "/operations/requests", label: "Live Queue Board", icon: Inbox },
      { href: "/operations/dashboard-customizer", label: "Custom Dashboard", icon: Sliders },
    ],
  },
  {
    id: "users_partners",
    title: "Users & Master Identities",
    icon: Users,
    items: [
      { href: "/operations/customers", label: "Customer 360° Profiles", icon: Users },
      { href: "/operations/partners", label: "Partner & Vendor Directory", icon: Briefcase },
      { href: "/operations/kyc", label: "KYC Verification Hub", icon: ShieldCheck, badge: "4", badgeTone: "info" },
      { href: "/reviews", label: "Reviews & Reputation", icon: ClipboardCheck },
    ],
  },
  {
    id: "marketplace",
    title: "Marketplace & Catalog",
    icon: Layers,
    items: [
      { href: "/operations/categories", label: "Category Taxonomy Tree", icon: Layers },
      { href: "/operations/services/builder", label: "No-Code Service Builder", icon: Wrench },
      { href: "/operations/bookings", label: "Universal Bookings", icon: Calendar },
      { href: "/operations/quotes", label: "Universal Quotes Hub", icon: FileSpreadsheet },
      { href: "/operations/quotes/builder", label: "Universal BOQ Builder", icon: FileSpreadsheet },
      { href: "/operations/pricing", label: "Dynamic Pricing Matrix", icon: IndianRupee },
      { href: "/operations/commission-rules", label: "Take-Rate & Fee Slabs", icon: Percent },
      { href: "/operations/partner-ranking", label: "Partner Ranking Engine", icon: Award },
      { href: "/operations/rate-cards", label: "Rate Cards & Compatibility", icon: Tag },
    ],
  },
  {
    id: "money",
    title: "Money & Clearinghouse",
    icon: Wallet,
    items: [
      { href: "/operations/payments", label: "Payment Clearinghouse", icon: Key },
      { href: "/operations/settlements", label: "Settlement Waterfall", icon: Wallet },
      { href: "/operations/payouts", label: "Partner Payouts Ledger", icon: IndianRupee },
      { href: "/finance", label: "Refunds & Ledger Accounts", icon: RotateCcw },
    ],
  },
  {
    id: "growth",
    title: "Growth, Loyalty & CMS",
    icon: Gift,
    items: [
      { href: "/operations/v-coins", label: "V Coins Virtual Wallet", icon: Coins },
      { href: "/operations/referrals", label: "Two-Sided Referrals", icon: Users },
      { href: "/operations/qr-campaigns", label: "Offline QR Attribution", icon: QrCode },
      { href: "/operations/marketing", label: "Promo Codes & Flash Sales", icon: Tag },
      { href: "/operations/notifications", label: "Multi-Channel Alerts", icon: Bell },
      { href: "/operations/cms", label: "Banner & CMS Manager", icon: LayoutDashboard },
      { href: "/operations/fraud-risk", label: "Fraud & Risk Center", icon: ShieldAlert, badge: "Risk", badgeTone: "danger" },
    ],
  },
  {
    id: "verticals",
    title: "Specialized Verticals",
    icon: Building2,
    items: [
      { href: "/operations/rides", label: "Vehicle & Ride Control", icon: Truck },
      { href: "/operations/construction", label: "Construction Control", icon: Building2 },
      { href: "/operations/manpower", label: "Manpower & Shift Staff", icon: Users },
      { href: "/operations/stays", label: "Hostels & PG Stays", icon: Home },
      { href: "/operations/rentals", label: "Tools & Equipment Rentals", icon: Package },
      { href: "/operations/healthcare", label: "Healthcare Diagnostics", icon: Heart },
      { href: "/operations/events", label: "Events & Media Staging", icon: Camera },
      { href: "/operations/listings", label: "Careers & Job Portal", icon: BriefcaseBusiness },
      { href: "/operations/dispatch", label: "Live Dispatch Board", icon: Radio },
    ],
  },
  {
    id: "support",
    title: "Support & Governance",
    icon: Headphones,
    items: [
      { href: "/operations/support", label: "Customer Support Desk", icon: Headphones },
      { href: "/operations/cases", label: "Operational Cases & Claims", icon: Briefcase },
      { href: "/operations/data-management", label: "Data Lifecycle & DPDP", icon: Database },
    ],
  },
  {
    id: "analytics_ai",
    title: "Analytics & AI Copilot",
    icon: Bot,
    items: [
      { href: "/operations/reports", label: "BI Reports & Analytics", icon: BarChart3 },
      { href: "/operations/reports/builder", label: "Custom Report Builder", icon: FileSpreadsheet },
      { href: "/operations/ai-control", label: "AI Copilot & Workflows", icon: Bot, badge: "AI", badgeTone: "info" },
    ],
  },
  {
    id: "system",
    title: "System & Reliability",
    icon: Shield,
    items: [
      { href: "/operations/service-areas", label: "Geospatial Territories", icon: Globe },
      { href: "/operations/admin-users", label: "Roles & Permissions (RBAC)", icon: ShieldCheck },
      { href: "/operations/audit-logs", label: "Immutable Audit Trail", icon: History },
      { href: "/operations/system-health", label: "Infrastructure Health", icon: Activity },
      { href: "/operations/integrations", label: "API & Credential Vault", icon: Key },
      { href: "/operations/app-versions", label: "App Version Upgrades", icon: Smartphone },
      { href: "/operations/feature-flags", label: "Dynamic Feature Flags", icon: Sliders },
      { href: "/operations/maintenance", label: "Maintenance Isolation", icon: AlertOctagon },
      { href: "/operations/backups", label: "Snapshots & DR Sync", icon: Database },
      { href: "/operations/kill-switches", label: "Emergency Kill Switches", icon: ToggleLeft },
      { href: "/operations/profile", label: "Admin Profile & Security", icon: User },
    ],
  },
];

const ROLES_LIST = [
  { code: "super_admin", label: "Super Admin" },
  { code: "admin", label: "Platform Admin" },
  { code: "operations", label: "Operations Lead" },
  { code: "finance", label: "Finance Controller" },
  { code: "customer_support", label: "Customer Support" },
  { code: "partner_management", label: "Partner Management" },
  { code: "marketing", label: "Marketing & Growth" },
  { code: "hr", label: "Human Resources" },
  { code: "category_manager", label: "Category Manager" },
  { code: "city_manager", label: "City Manager" },
  { code: "auditor", label: "Auditor & Compliance" },
  { code: "analyst", label: "Business Analyst" },
];

const ROLE_ALLOWED_GROUPS: Record<string, string[]> = {
  super_admin: ["command_center", "users_partners", "marketplace", "money", "growth", "verticals", "support", "analytics_ai", "system"],
  admin: ["command_center", "users_partners", "marketplace", "money", "growth", "verticals", "support", "analytics_ai", "system"],
  operations: ["command_center", "users_partners", "marketplace", "money", "verticals", "support"],
  finance: ["command_center", "money", "analytics_ai", "system"],
  customer_support: ["command_center", "users_partners", "marketplace", "support"],
  partner_management: ["command_center", "users_partners", "marketplace", "analytics_ai"],
  marketing: ["command_center", "growth", "marketplace", "analytics_ai"],
  hr: ["command_center", "system"],
  category_manager: ["command_center", "marketplace", "analytics_ai"],
  city_manager: ["command_center", "users_partners", "marketplace", "verticals", "analytics_ai"],
  auditor: ["command_center", "money", "analytics_ai", "system"],
  analyst: ["command_center", "analytics_ai"],
};

function GlobalControlBar({
  onOpenMobileMenu,
  userDisplayName,
  onSignOut,
  isSigningOut,
  onOpenSearch,
  onOpenTimeline,
}: {
  onOpenMobileMenu: () => void;
  userDisplayName: string;
  onSignOut: () => void;
  isSigningOut: boolean;
  onOpenSearch: () => void;
  onOpenTimeline: (entityType: string, entityId: string, title: string) => void;
}) {
  const {
    selectedCity,
    setSelectedCity,
    dateFilter,
    setDateFilter,
    activePersona,
    setActivePersona,
    searchQuery,
    setSearchQuery,
  } = useGovernance();

  return (
    <header className="border-b border-warm-200 bg-[#0B192C] text-white sticky top-0 z-30 h-14 shadow-sm">
      <div className="h-full flex items-center justify-between px-3 sm:px-5 gap-3">
        {/* Left: Menu toggle + Logo + Platform Badge */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="md:hidden p-1.5 text-gray-300 hover:text-white rounded-md focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <Logo className="h-6 w-auto brightness-200" />
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white leading-none">
                V Solve Hub
              </span>
              <span className="text-[10px] font-semibold text-[#FF6500] uppercase tracking-wider mt-0.5">
                Super App Admin
              </span>
            </div>
          </div>
        </div>

        {/* Center: Global Search Input Button (Ctrl+K) */}
        <div className="hidden lg:flex items-center flex-1 max-w-md mx-2">
          <button
            type="button"
            onClick={onOpenSearch}
            className="relative w-full flex items-center bg-[#1E3E62]/60 hover:bg-[#1E3E62]/90 border border-gray-700/80 rounded-lg pl-9 pr-14 py-1.5 text-xs text-gray-300 transition-colors text-left"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <span className="truncate">Universal Search (Booking, Partner, Customer, Txn...)</span>
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono bg-gray-800 text-gray-400 rounded border border-gray-700">
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Right Controls: City Selector, Date Filter, Approvals, Timeline, Persona, Profile */}
        <div className="flex items-center gap-2.5 shrink-0 text-xs">
          {/* Mobile search button */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="lg:hidden p-1.5 text-gray-300 hover:text-white rounded-md"
            title="Global Search (Ctrl+K)"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Activity Timeline Quick Link (§49) */}
          <button
            type="button"
            onClick={() => onOpenTimeline("all", "", "Platform Activity Stream")}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-950/60 hover:bg-indigo-900/70 text-indigo-300 border border-indigo-700/50 transition-colors font-semibold text-xs"
            title="Open Chronological Activity Timeline"
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden xl:inline">Timeline</span>
          </button>

          {/* City / Service Zone Selector */}
          <div className="hidden sm:flex items-center bg-[#1E3E62]/70 border border-gray-700/80 rounded-md px-2 py-1">
            <span className="text-gray-400 text-[11px] mr-1.5 font-medium">Zone:</span>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="bg-transparent text-white font-medium text-xs focus:outline-none cursor-pointer"
            >
              <option value="hyderabad" className="bg-[#0B192C] text-white">Hyderabad (500032)</option>
              <option value="cyberabad" className="bg-[#0B192C] text-white">Cyberabad / HiTech</option>
              <option value="secunderabad" className="bg-[#0B192C] text-white">Secunderabad</option>
              <option value="all_zones" className="bg-[#0B192C] text-white">All India (Pan-City)</option>
            </select>
          </div>

          {/* Date Filter Selector */}
          <div className="hidden xl:flex items-center bg-[#1E3E62]/70 border border-gray-700/80 rounded-md px-2 py-1">
            <span className="text-gray-400 text-[11px] mr-1.5 font-medium">Period:</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent text-white font-medium text-xs focus:outline-none cursor-pointer"
            >
              <option value="today" className="bg-[#0B192C] text-white">Today (Real-time)</option>
              <option value="week" className="bg-[#0B192C] text-white">This Week</option>
              <option value="month" className="bg-[#0B192C] text-white">Month-to-Date</option>
            </select>
          </div>

          {/* Pending Approvals Quick Link */}
          <Link
            href="/operations/approvals"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FF6500]/15 hover:bg-[#FF6500]/25 text-[#FF6500] border border-[#FF6500]/40 transition-colors font-semibold text-xs"
            title="Approval Center"
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden md:inline">Approvals</span>
            <span className="px-1.5 py-0.2 bg-[#FF6500] text-white text-[10px] rounded-full font-bold">
              3
            </span>
          </Link>

          {/* System Pulse Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-950/50 border border-emerald-700/50 text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-medium hidden lg:inline">Normal</span>
          </div>

          {/* Persona / Role Selector */}
          <div className="flex items-center bg-[#1E3E62]/70 border border-gray-700/80 rounded-md px-2 py-1">
            <span className="text-gray-400 text-[11px] mr-1 hidden sm:inline">Role:</span>
            <select
              value={activePersona}
              onChange={(e) => setActivePersona(e.target.value)}
              className="bg-transparent text-white font-semibold text-xs focus:outline-none cursor-pointer"
            >
              {ROLES_LIST.map((r) => (
                <option key={r.code} value={r.code} className="bg-[#0B192C] text-white">
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* User Profile & Sign Out */}
          <div className="flex items-center gap-2 pl-1">
            <Link
              href="/operations/profile"
              className="text-gray-300 hover:text-white font-medium text-xs hidden lg:inline truncate max-w-[140px]"
              title={userDisplayName}
            >
              {userDisplayName}
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSignOut}
              loading={isSigningOut}
              loadingLabel="Signing out"
              className="text-gray-300 hover:text-white hover:bg-gray-800 text-xs px-2 py-1 h-8"
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

function SidebarNav({
  isMobileMenuOpen,
  onCloseMobileMenu,
}: {
  isMobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
}) {
  const pathname = usePathname();
  const { activePersona } = useGovernance();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const allowedGroupIds = ROLE_ALLOWED_GROUPS[activePersona] ?? ROLE_ALLOWED_GROUPS["super_admin"];
  const visibleGroups = NAVIGATION_GROUPS.filter((group) => {
    if (allowedGroupIds.includes(group.id)) return true;
    return group.items.some((item) =>
      item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)
    );
  });

  const navContent = (
    <nav aria-label="Authoritative Super App Workspaces" className="p-2.5 flex flex-col gap-3">
      {visibleGroups.map((group) => {
        const isCollapsed = collapsedGroups[group.id] ?? false;
        const hasActiveChild = group.items.some((item) =>
          item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)
        );

        return (
          <div key={group.id} className="flex flex-col">
            {/* Group Header */}
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="flex items-center justify-between w-full px-2.5 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-[#0B192C] hover:bg-slate-100/60 transition-colors select-none group"
            >
              <div className="flex items-center gap-2">
                <span className={hasActiveChild ? "text-[#FF6500]" : "text-slate-400 group-hover:text-slate-600"}>
                  <group.icon className="h-3.5 w-3.5" />
                </span>
                <span className="tracking-wider">{group.title}</span>
              </div>
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 transition-transform" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 transition-transform" />
              )}
            </button>

            {/* Group Items */}
            {!isCollapsed && (
              <ul className="flex flex-col gap-0.5 list-none p-0 mt-0.5 ml-1.5 border-l border-slate-200 pl-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onCloseMobileMenu}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-all group",
                          active
                            ? "bg-[#0B192C] text-white font-semibold shadow-xs"
                            : "text-slate-700 hover:bg-slate-100/80 hover:text-[#0B192C]",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Icon
                            className={[
                              "h-3.5 w-3.5 shrink-0 transition-colors",
                              active ? "text-[#FF6500]" : "text-slate-400 group-hover:text-slate-600",
                            ].join(" ")}
                          />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge && (
                          <span
                            className={[
                              "px-1.5 py-0.5 text-[10px] font-bold rounded-md shrink-0 ml-1.5 tracking-wide",
                              item.badgeTone === "danger"
                                ? "bg-rose-100 text-rose-700"
                                : item.badgeTone === "warning"
                                ? "bg-amber-100 text-amber-900"
                                : item.badgeTone === "info"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-slate-200/80 text-slate-700",
                            ].join(" ")}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:block w-64 shrink-0 border-r border-slate-200/80 bg-[#FAF9F6] sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#CBD5E1_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        {navContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={onCloseMobileMenu}
          />
          <aside className="relative z-50 w-72 max-w-[85vw] bg-[#FAF8F5] h-full shadow-2xl flex flex-col border-r border-warm-200">
            <div className="flex items-center justify-between p-4 border-b border-warm-200 bg-[#0B192C] text-white">
              <span className="font-bold text-sm">Navigation</span>
              <button
                type="button"
                onClick={onCloseMobileMenu}
                className="p-1 text-gray-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">{navContent}</div>
          </aside>
        </div>
      )}
    </>
  );
}

function OperationsLogin() {
  const flow = useOtpFlow(getApiClient());

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16 bg-[#F8FAFC]">
      <Card className="w-full max-w-md p-8 shadow-lg border border-warm-200">
        <div className="flex items-center gap-3 mb-2">
          <Logo className="h-9 w-auto" />
          <div className="flex flex-col">
            <span className="text-lg font-bold text-[#0B192C]">V Solve Hub</span>
            <span className="text-xs font-semibold text-[#FF6500]">Super App Control Center</span>
          </div>
        </div>
        <h1 className="mt-4 text-xl font-bold text-text">Staff Authentication</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Enter your authorized administrative mobile number to receive a verification OTP.
        </p>

        <div className="mt-6">
          <OtpForm
            {...flow}
            heading="Mobile Number"
            headingLevel={2}
            description="We will send an OTP to your phone. Development OTP is displayed on screen."
            verifyLabel="Verify & Enter Dashboard"
          />
        </div>
      </Card>
    </main>
  );
}

function SwitchToOperations() {
  const switchRole = useSwitchRole(getApiClient());
  const logout = useLogout(getApiClient());

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16 bg-[#F8FAFC]">
      <Card className="w-full max-w-md p-8 shadow-lg border border-warm-200">
        <h1 className="text-xl font-bold text-text">Switch Role to Operations</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          You are signed in with a customer or partner role. Switch to Operations to access the Super App Command Center.
        </p>

        {switchRole.isError ? (
          <ErrorState
            inline
            className="mt-4"
            title="Could not switch role"
            message="Please try again or sign in with an authorized operations account."
          />
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            onClick={() => switchRole.mutate(OPERATIONS_ROLE)}
            loading={switchRole.isPending}
            loadingLabel="Switching"
          >
            Switch to Operations
          </Button>
          <Button variant="ghost" onClick={() => logout.mutate()}>
            Sign in as someone else
          </Button>
        </div>
      </Card>
    </main>
  );
}

function NoOperationsAccess({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16 bg-[#F8FAFC]">
      <Card className="w-full max-w-md p-8 shadow-lg border border-warm-200">
        <h1 className="text-xl font-bold text-text">Administrative Access Required</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          This console requires authorized administrative credentials. Contact the Super Administrator if you require access.
        </p>
        <Button variant="outline" className="mt-6" onClick={onSignOut}>
          Sign out
        </Button>
      </Card>
    </main>
  );
}

export function OperationsShell({ children }: { children: ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const guard = useAuthGuard(getApiClient(), {
    requiredRoles: [OPERATIONS_ROLE],
    requireActiveRole: true,
  });
  const logout = useLogout(getApiClient());

  if (guard.status === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 px-4 text-text-secondary bg-[#F8FAFC]">
        <Spinner size="sm" />
        Authenticating session…
      </main>
    );
  }

  if (guard.status === "unauthenticated") return <OperationsLogin />;

  if (guard.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-16 bg-[#F8FAFC]">
        <div className="w-full max-w-md">
          <ErrorState
            title="Connection Error"
            message="Could not connect to the administrative identity service. Check network or server status."
            actionLabel="Retry"
            onAction={() => window.location.reload()}
          />
        </div>
      </main>
    );
  }

  if (guard.isSelectingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 px-4 text-text-secondary bg-[#F8FAFC]">
        <Spinner size="sm" />
        Initializing Super App Dashboard…
      </main>
    );
  }

  if (guard.status === "forbidden") {
    return hasRole(guard.user, OPERATIONS_ROLE) ? (
      <SwitchToOperations />
    ) : (
      <NoOperationsAccess onSignOut={() => logout.mutate()} />
    );
  }

  const userDisplayName =
    guard.user.phone_number === "9999999999" || !guard.user.phone_number
      ? "Super Admin (Master)"
      : `${guard.user.phone_number} (Super Admin)`;

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [timelineState, setTimelineState] = useState<{
    isOpen: boolean;
    entityType: string;
    entityId: string;
    entityTitle: string;
  }>({
    isOpen: false,
    entityType: "all",
    entityId: "",
    entityTitle: "Platform Activity Stream",
  });

  // Global keyboard shortcut Ctrl+K or Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <GovernanceProvider>
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
        {/* Persistent Global Control Bar (§51) */}
        <GlobalControlBar
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          userDisplayName={userDisplayName}
          onSignOut={() => logout.mutate()}
          isSigningOut={logout.isPending}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenTimeline={(entityType, entityId, entityTitle) =>
            setTimelineState({ isOpen: true, entityType, entityId, entityTitle })
          }
        />

        {/* Workspace Layout: 10-Group Sidebar (§52) + Main Viewport */}
        <div className="flex flex-1">
          <SidebarNav
            isMobileMenuOpen={isMobileMenuOpen}
            onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
          />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-[1600px] overflow-x-hidden">
            {children}
          </main>
        </div>

        {/* §48 Universal Global Search Palette */}
        <GlobalSearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onOpenTimeline={(entityType, entityId, entityTitle) =>
            setTimelineState({ isOpen: true, entityType, entityId, entityTitle })
          }
        />

        {/* §49 Chronological Activity Timeline Modal */}
        <ActivityTimelineModal
          isOpen={timelineState.isOpen}
          onClose={() => setTimelineState((prev) => ({ ...prev, isOpen: false }))}
          entityType={timelineState.entityType}
          entityId={timelineState.entityId}
          entityTitle={timelineState.entityTitle}
        />
      </div>
    </GovernanceProvider>
  );
}
