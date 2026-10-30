import {
  BarChart3,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  Calendar,
  Coins,
  FileCheck2,
  FileText,
  HardHat,
  Home,
  Inbox,
  IndianRupee,
  MessageSquareHeart,
  Percent,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sliders,
  Tag,
  ToggleLeft,
  Truck,
  Upload,
  User,
  UserCheck,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** A key of the case-queue summary whose count is shown beside the link. */
  badgeKey?: "requests_open" | "mine_open";
  /** Highlight for every path under this prefix, when it differs from `href`. */
  activePrefix?: string;
};

export type NavGroup = { label: string; links: NavLink[] };

/**
 * The console, by area. Each group is one kind of work an operator comes in to do, named the way
 * they would say it, so "a rental delivery is stuck" leads to Rentals and "pay the partners" leads
 * to Money without knowing which milestone built which screen.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Today",
    links: [
      { href: "/", label: "Home", icon: Home },
      { href: "/operations/cases", label: "Cases", icon: Briefcase, badgeKey: "mine_open" },
    ],
  },
  {
    label: "Home services",
    links: [
      { href: "/operations/visits", label: "Visit lookup", icon: Search },
      { href: "/operations/dispatch", label: "Dispatch", icon: Truck },
      { href: "/operations/manual-offers", label: "Manual offers", icon: Tag },
      { href: "/operations/assisted-checkouts", label: "Book for a customer", icon: ShoppingCart },
      { href: "/operations/compatibility-rules", label: "Service rules", icon: Sliders },
    ],
  },
  {
    label: "Workforce & projects",
    links: [
      { href: "/operations/requests", label: "Requests", icon: Inbox, badgeKey: "requests_open" },
      { href: "/operations/work-items", label: "Work items", icon: Wrench },
      { href: "/operations/rate-cards", label: "Crew rate cards", icon: IndianRupee },
    ],
  },
  {
    label: "Marketplace",
    links: [
      { href: "/operations/rentals", label: "Rentals", icon: HardHat },
      { href: "/operations/stays", label: "Stays", icon: Building2 },
      { href: "/operations/listings", label: "Jobs", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Partners",
    links: [
      { href: "/reviews", label: "Applications", icon: UserCheck },
      { href: "/operations/partners", label: "All partners", icon: Users },
      { href: "/operations/crew-documents", label: "Crew documents", icon: FileCheck2 },
      { href: "/operations/partner-availability", label: "Availability", icon: Calendar },
      // Job plans live on Jobs › Plans, next to the jobs they sell; stay plans on Stays › Plans.
      { href: "/operations/partners/import", label: "Import partners", icon: Upload },
    ],
  },
  {
    label: "Customers",
    links: [
      { href: "/operations/stories", label: "Safety stories", icon: ShieldCheck },
      { href: "/operations/loyalty", label: "Wallet and rewards", icon: Coins },
      { href: "/operations/feedback", label: "Service feedback", icon: MessageSquareHeart },
    ],
  },
  {
    label: "Money",
    links: [
      { href: "/finance", label: "Refunds", icon: RotateCcw },
      { href: "/operations/payouts", label: "Payouts", icon: Wallet },
      { href: "/operations/commercial-policy", label: "Commission and tax", icon: Percent },
      { href: "/operations/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Insights",
    links: [
      {
        href: "/operations/dashboards/overview",
        label: "Dashboards",
        icon: BarChart3,
        activePrefix: "/operations/dashboards",
      },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/operations/kill-switches", label: "Kill switches", icon: ToggleLeft },
      { href: "/operations/profile", label: "My profile", icon: User },
    ],
  },
];

const ALL_HREFS = NAV_GROUPS.flatMap((group) => group.links.map((link) => link.href));

/**
 * Whether a link is the current page. A link with another link nested under it ("All partners"
 * over "Import partners") matches exactly, so only one entry is ever lit.
 */
export function isNavLinkActive(link: Pick<NavLink, "href" | "activePrefix">, pathname: string): boolean {
  if (link.href === "/") return pathname === "/";
  const prefix = link.activePrefix ?? link.href;
  if (pathname === link.href || pathname === prefix) return true;
  if (!pathname.startsWith(`${prefix}/`)) return false;
  return !ALL_HREFS.some((other) => other !== link.href && other.startsWith(`${prefix}/`) && pathname.startsWith(other));
}
