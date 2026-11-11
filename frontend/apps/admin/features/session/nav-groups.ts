import {
  BarChart3,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  Car,
  Coins,
  Contact,
  FileText,
  HardHat,
  Home,
  Inbox,
  MessageSquareHeart,
  Percent,
  RotateCcw,
  ShieldCheck,
  ToggleLeft,
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
    // One page per service, each with the same tabs: its bookings, its money, its settings.
    label: "Services",
    links: [
      {
        href: "/operations/home-services",
        label: "Home services",
        icon: Wrench,
        // A visit opened from the bookings list keeps Home services lit.
        activePrefix: "/operations/visits",
      },
      { href: "/operations/requests", label: "Crew & projects", icon: Inbox, badgeKey: "requests_open" },
      { href: "/operations/rentals", label: "Rentals", icon: HardHat },
      { href: "/operations/stays", label: "Stays", icon: Building2 },
      { href: "/operations/rides", label: "Rides", icon: Car },
      { href: "/operations/listings", label: "Jobs", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Partners",
    links: [
      // Applications and crew documents: both "check a partner's papers" queues, as two tabs.
      { href: "/reviews", label: "Applications", icon: UserCheck },
      { href: "/operations/partners", label: "All partners", icon: Users },
      // Working hours are edited on a partner's record (All partners), not from a menu item.
      // Job plans live on Jobs › Plans, next to the jobs they sell; stay plans on Stays › Plans.
      { href: "/operations/partners/import", label: "Import partners", icon: Upload },
    ],
  },
  {
    label: "Customers",
    links: [
      { href: "/operations/customers", label: "All customers", icon: Contact },
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
      { href: "/operations/reports", label: "Reports", icon: FileText },
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
