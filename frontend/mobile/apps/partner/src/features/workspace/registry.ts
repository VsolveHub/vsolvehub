// Ported from frontend/apps/partner/features/workspace/registry.ts
import type { WorkspaceGrant } from "@vsolve/query/native";
import {
  Bell,
  Briefcase,
  CalendarCheck,
  ClipboardList,
  FolderKanban,
  HardHat,
  Home,
  UserCircle,
  UserCircle2,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react-native";

/**
 * The typed workspace registry — which server key maps to which routes.
 *
 * Closes the frontend half of `M2-FE-007`, and the navigation rules in
 * `M2-FE-002` and `M2-FE-004`.
 *
 * ## The split with the backend
 *
 * Django publishes `{workspace_key, commercial_mode, actions[]}` and nothing
 * else — no routes, no labels, no icons. It authorizes; this file decides what
 * that authorization looks like. The two halves are deliberately unable to leak
 * into each other: adding a route here cannot widen permission, and renaming a
 * label there cannot move a Partner to a different screen.
 *
 * ## Unknown keys render nothing
 *
 * `resolveWorkspaces` drops any key absent from `WORKSPACE_REGISTRY`. A newer
 * deployment can authorize a workspace this bundle has no screens for, and the
 * tempting fallback — show it as a generic "Work" tab — puts a Partner in front
 * of routes that 404. Nothing is the honest rendering. Django refuses the
 * actions regardless; this only decides what is offered.
 *
 * ## Actions gate controls, not routes
 *
 * Each nav item may name the action that authorizes it. An item whose action is
 * missing from the grant is not rendered — not rendered disabled, which would
 * advertise a capability the Partner does not have and cannot obtain by
 * clicking. The screens behind these routes re-check with `hasWorkspaceAction`
 * before showing any command, because a route being reachable never implies its
 * buttons are.
 *
 * ## Known gap, deliberately left for FE1
 *
 * The base navigation below is unconditional, so a pure A3 agency still sees
 * Jobs and Money. That is today's M1 behaviour, not a regression introduced
 * here — M1 nav has never been capability-gated. Gating it is `M2-FE-111` and it
 * needs the A1 capability published alongside the M2 ones; guessing at it from
 * an empty M2 grant list would hide Jobs from every existing Partner the moment
 * this shipped.
 */

/** Server keys this build has screens for. Mirrors `partners.capabilities.WORKSPACE_ACTIONS`. */
export const WORKFORCE_WORKSPACE = "A3_TIME_BLOCK";
export const PROJECT_WORKSPACE = "A5_CUSTOM_PROJECT";
export const LISTING_WORKSPACE = "A10_LISTING";
export const RENTAL_WORKSPACE = "A7_RENTAL";
export const STAY_WORKSPACE = "A9_STAY";

export interface WorkspaceNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Action that authorizes this destination.
   */
  action?: string;
  activePrefix?: string;
  kind?: "notifications";
  desktopOnly?: boolean;
}

export interface WorkspaceDefinition {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  home: string;
  nav: WorkspaceNavItem[];
}

export const BASE_NAV: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/earnings", label: "Money", icon: Wallet },
  { href: "/profile", label: "You", icon: UserCircle },
];

export const TAP_FIRST_NAV: readonly WorkspaceNavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/work/all", label: "Work", icon: Users, activePrefix: "/work" },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "#notifications", label: "Alerts", icon: Bell, kind: "notifications" },
  { href: "/me", label: "Me", icon: UserCircle2 },
];

export const LISTING_TAP_FIRST_NAV: readonly WorkspaceNavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/listings", label: "Listings", icon: Briefcase, activePrefix: "/listings" },
  { href: "#notifications", label: "Alerts", icon: Bell, kind: "notifications" },
  { href: "/me", label: "Me", icon: UserCircle2 },
];

export const RENTAL_TAP_FIRST_NAV: readonly WorkspaceNavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/rentals", label: "Rentals", icon: HardHat, activePrefix: "/rentals" },
  { href: "/rentals/bookings", label: "Bookings", icon: CalendarCheck, desktopOnly: true },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "#notifications", label: "Alerts", icon: Bell, kind: "notifications" },
  { href: "/me", label: "Me", icon: UserCircle2 },
];

export const STAY_TAP_FIRST_NAV: readonly WorkspaceNavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/stays", label: "Stays", icon: FolderKanban, activePrefix: "/stays" },
  { href: "/stays/enquiries", label: "Enquiries", icon: ClipboardList, desktopOnly: true },
  { href: "/stays/visits", label: "Visits", icon: CalendarCheck, desktopOnly: true },
  { href: "/stays/bookings", label: "Bookings", icon: CalendarCheck, desktopOnly: true },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "#notifications", label: "Alerts", icon: Bell, kind: "notifications" },
  { href: "/me", label: "Me", icon: UserCircle2 },
];

export function specialtyShellHome(
  workspaces: readonly { readonly key: string }[],
): "listings" | "rentals" | "stays" | null {
  if (workspaces.length !== 1) return null;
  const key = workspaces[0]?.key;
  if (key === LISTING_WORKSPACE) return "listings";
  if (key === RENTAL_WORKSPACE) return "rentals";
  if (key === STAY_WORKSPACE) return "stays";
  return null;
}

export function isListingOnlyShell(
  workspaces: readonly { readonly key: string }[],
): boolean {
  return specialtyShellHome(workspaces) === "listings";
}

export function primaryShellNavFor(
  workspaces: readonly { readonly workspaceKey: string }[],
): readonly WorkspaceNavItem[] {
  const mapped = workspaces.map((w) => ({ key: w.workspaceKey }));
  const home = specialtyShellHome(mapped);
  if (home === "listings") return LISTING_TAP_FIRST_NAV;
  if (home === "rentals") return RENTAL_TAP_FIRST_NAV;
  if (home === "stays") return STAY_TAP_FIRST_NAV;
  return TAP_FIRST_NAV;
}

export function dockNavFor(
  items: readonly WorkspaceNavItem[],
): readonly WorkspaceNavItem[] {
  return items.filter((item) => item.desktopOnly !== true);
}

export const WORKSPACE_REGISTRY: Record<string, WorkspaceDefinition> = {
  [WORKFORCE_WORKSPACE]: {
    key: WORKFORCE_WORKSPACE,
    label: "Workforce",
    description: "Supply crew by the day or shift. You are paid directly by the customer.",
    icon: Users,
    home: "/workforce",
    nav: [
      { href: "/workforce", label: "Workforce", icon: Users },
      { href: "/workforce/offers", label: "Offers", icon: Zap, action: "enquiry.accept" },
      { href: "/workforce/enquiries", label: "Enquiries", icon: ClipboardList, action: "enquiry.view" },
      { href: "/workforce/shifts", label: "Shifts", icon: CalendarCheck, action: "attendance.confirm" },
      { href: "/workforce/crew", label: "Crew", icon: HardHat, action: "crew.manage" },
    ],
  },
  [PROJECT_WORKSPACE]: {
    key: PROJECT_WORKSPACE,
    label: "Projects",
    description: "Quote for a defined outcome. Vsolve holds each stage until it is approved.",
    icon: FolderKanban,
    home: "/projects",
    nav: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/projects/enquiries", label: "Enquiries", icon: ClipboardList, action: "enquiry.view" },
      { href: "/projects/stages", label: "Stages", icon: CalendarCheck, action: "stage.submit_evidence" },
    ],
  },
  [RENTAL_WORKSPACE]: {
    key: RENTAL_WORKSPACE,
    label: "Rentals",
    description: "List rental assets, manage bookings, handover and deposit release.",
    icon: HardHat,
    home: "/rentals",
    nav: [
      { href: "/home", label: "Home", icon: Home },
      { href: "/rentals", label: "Rentals", icon: HardHat, activePrefix: "/rentals" },
      { href: "/rentals/bookings", label: "Bookings", icon: CalendarCheck },
      { href: "/me", label: "Me", icon: UserCircle2, activePrefix: "/me" },
    ],
  },
  [STAY_WORKSPACE]: {
    key: STAY_WORKSPACE,
    label: "Stays",
    description: "Host properties and respond to guest enquiries.",
    icon: FolderKanban,
    home: "/stays",
    nav: [
      { href: "/home", label: "Home", icon: Home },
      { href: "/stays", label: "Stays", icon: FolderKanban, activePrefix: "/stays" },
      { href: "/stays/enquiries", label: "Enquiries", icon: ClipboardList },
      { href: "/stays/visits", label: "Visits", icon: CalendarCheck },
      { href: "/stays/bookings", label: "Bookings", icon: CalendarCheck },
      { href: "/me", label: "Me", icon: UserCircle2, activePrefix: "/me" },
    ],
  },
  [LISTING_WORKSPACE]: {
    key: LISTING_WORKSPACE,
    label: "Listings",
    description: "Post jobs, screen applicants, and manage recruitment pipeline.",
    icon: Briefcase,
    home: "/listings",
    nav: [
      { href: "/home", label: "Home", icon: Home },
      { href: "/listings", label: "Listings", icon: Briefcase, activePrefix: "/listings" },
      { href: "/me", label: "Me", icon: UserCircle2, activePrefix: "/me" },
    ],
  },
};

/** A workspace the Partner holds, with only the destinations they are authorized for. */
export interface ResolvedWorkspace extends WorkspaceDefinition {
  grant: WorkspaceGrant;
  /** `nav` filtered to the authorized actions. Never empty — home carries no action. */
  authorizedNav: WorkspaceNavItem[];
}

/**
 * Turns server grants into renderable workspaces, dropping what this build
 * cannot show.
 *
 * Registry order rather than payload order, so the switcher does not reorder
 * itself between requests. Two Partners with the same capabilities see the same
 * tabs in the same places, which is what makes muscle memory possible.
 */
export function resolveWorkspaces(grants: readonly WorkspaceGrant[]): ResolvedWorkspace[] {
  const held = new Map(grants.map((grant) => [grant.workspaceKey, grant]));

  return Object.values(WORKSPACE_REGISTRY).flatMap((definition) => {
    const grant = held.get(definition.key);
    if (!grant) return [];

    const authorizedNav = definition.nav.filter(
      (item) => item.action === undefined || grant.actions.includes(item.action),
    );

    return [{ ...definition, grant, authorizedNav }];
  });
}

/**
 * Which workspace the current path belongs to, or null for the base app.
 *
 * Longest prefix wins, so `/workforce/crew` resolves to Workforce rather than to
 * whichever definition happened to be declared first. Only resolved workspaces
 * are considered: navigating to a route whose capability was suspended
 * mid-session must not keep highlighting it as the active workspace.
 */
export function activeWorkspace(
  workspaces: readonly ResolvedWorkspace[],
  pathname: string,
): ResolvedWorkspace | null {
  let best: ResolvedWorkspace | null = null;

  for (const workspace of workspaces) {
    const matches = pathname === workspace.home || pathname.startsWith(`${workspace.home}/`);
    if (!matches) continue;
    if (!best || workspace.home.length > best.home.length) best = workspace;
  }

  return best;
}

/**
 * The tab bar for the current context: base navigation, plus the active
 * workspace's own destinations.
 *
 * The base tabs stay visible inside a workspace on purpose. A Partner mid-shift
 * still needs Money and their profile, and a workspace that swallows the whole
 * shell is one a person can get stranded in on a phone.
 *
 * Capped at six. Past that the labels truncate on a small Android viewport and
 * the tab bar stops being scannable — the switcher, not more tabs, is how a
 * Partner with several capabilities moves between them.
 *
 * ## What gets dropped when the cap bites, and what never does
 *
 * The cap was a trailing `slice`, which was correct while every workspace had
 * four destinations or fewer. The A3 workspace gained a fifth at revision 4
 * (Offers, the rate-card front door) and a trailing slice would have dropped
 * **You** — the profile tab — because it is composed last. That is the one item
 * the docblock above says must survive: a Partner who cannot reach their own
 * profile from inside a workspace is stranded there on a phone.
 *
 * So the budget is taken out of the workspace's own destinations instead, from
 * the tail, in registry order. A dropped destination is not unreachable: the
 * workspace home lists every authorized destination and is itself always the
 * first workspace tab, so it is one tap away rather than zero.
 */
export const MAX_TAB_ITEMS = 6;

export function navigationFor(workspace: ResolvedWorkspace | null): WorkspaceNavItem[] {
  if (!workspace) return BASE_NAV;

  // Home and You from the base, then the workspace's own. Jobs and Money belong
  // to the A1 lifecycle and would read as this workspace's records if they sat
  // between its tabs.
  const base = BASE_NAV.filter(
    (item) => item.href === "/dashboard" || item.href === "/profile",
  ).filter((item): item is WorkspaceNavItem => item !== undefined);

  const budget = Math.max(MAX_TAB_ITEMS - base.length, 0);
  const [home, profile] = base;
  const own = workspace.authorizedNav.slice(0, budget);

  return [home, ...own, profile].filter((item): item is WorkspaceNavItem => item !== undefined);
}
