import {
  Bell,
  Briefcase,
  CalendarCheck,
  CalendarClock,
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
} from "lucide-react";

import type { WorkspaceGrant } from "@vsolve/query";

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
   *
   * Omitted for a workspace's own home, which is readable by anyone holding the
   * grant at all — there is no separate "view your own workspace" action, and
   * inventing one here would be the client asserting a permission Django never
   * published.
   */
  action?: string;
  /**
   * The path prefix this tab owns, when it is wider than its own `href`.
   *
   * The Work tab points at `/work/all` — the list is the destination — but it
   * owns the whole `/work` tree: `/work/jobs/{id}`, `/work/offers/{id}`,
   * `/work/enquiries/{id}/estimate`. Without this the tab bar would go
   * completely dark the moment a vendor opened a job, because no item's `href`
   * is a prefix of that path. A tab bar with nothing lit says "you are nowhere".
   */
  activePrefix?: string;
  /** Opens the notification panel instead of navigating. */
  kind?: "notifications";
  /**
   * Desktop header only. The phone dock does not render it.
   *
   * A workspace with more destinations than the dock has slots puts the extras
   * here and gives the phone a segmented sub-nav inside the workspace instead
   * (`features/workspace/view/section-nav.tsx`). The dock keeps its five
   * targets and its thumb reach; the wide header, which lays every item out
   * inline, shows all of them.
   *
   * Not a capability gate — `action` is. An item without `action` is shown to
   * anyone holding the grant.
   */
  desktopOnly?: boolean;
}

export interface WorkspaceDefinition {
  key: string;
  /** Shown in the switcher. Names the work, not the archetype code. */
  label: string;
  /** One line explaining what this workspace is for, for the switcher and empty states. */
  description: string;
  icon: LucideIcon;
  /** Where the switcher lands. */
  home: string;
  nav: WorkspaceNavItem[];
}

/**
 * The M1 navigation every signed-in Partner keeps.
 *
 * Not a grant-driven workspace and deliberately not keyed like one: A1 task
 * partners hold no M2 capability, so a registry lookup would render them an
 * empty shell. This is the floor; M2 workspaces are added on top of it.
 */
export const BASE_NAV: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/earnings", label: "Money", icon: Wallet },
  { href: "/profile", label: "You", icon: UserCircle },
];

/**
 * The tap-first navigation for Partners who hold A1 Work (or mixed A3/A5
 * workspaces that still live in the Work stack). Home / Work / Money / Alerts / Me.
 *
 * Used by `partner-shell.tsx` via `primaryShellNavFor` — not unconditionally.
 * A10_LISTING-only employers get `LISTING_TAP_FIRST_NAV` instead so they never
 * see `/work/all` or `/jobs`. Empty grants keep this array (M1 A1 floor —
 * inventing A1 from an empty grant list would hide Work from every legacy Partner).
 *
 * This supersedes `BASE_NAV` and `WorkspaceSwitcher` for that one call site
 * only — everything else in this file stays in place, because it still has
 * live consumers outside the tab bar:
 *
 *  - `WORKSPACE_REGISTRY` / `resolveWorkspaces` / `ResolvedWorkspace` gate
 *    every M2 workspace route (`features/workspace/view/workspace-route.tsx`,
 *    `features/workspace/model/session-guard.ts`) and drive the
 *    capability-request screen's "this would open the ___ workspace" copy
 *    (`features/capability/adapters/capability-options.ts`).
 *  - `WORKFORCE_WORKSPACE` / `PROJECT_WORKSPACE` are the app's canonical
 *    archetype-key constants, reused well beyond navigation — notification
 *    routing (`features/notifications/model/feed.ts`) and several
 *    per-archetype screens (`crew-offer`, `engagement`, `enquiry`, `shift`,
 *    `crew`, `proposal`) import them directly.
 *  - `activeWorkspace` / `navigationFor` / `BASE_NAV` (above) stay because
 *    `navigationFor` itself still reads `BASE_NAV` internally, even though
 *    `partner-shell.tsx` no longer calls either.
 *
 * Retiring those once every consumer above has a real replacement is a
 * separate, deliberately deferred follow-up — not done here. See
 * `docs/superpowers/specs/2026-08-19-partner-tap-first-redesign-design.md`
 * and task 4's report in `.superpowers/sdd/2026-08-19-partner-tap-first-redesign/`
 * for the full reasoning (notification `targetHref` in particular needs a
 * product decision this task cannot make: where should an `ENGAGEMENT`
 * notice link now that the shell no longer resolves a single active
 * workspace?).
 *
 * Nothing here decides authorization. `useWorkStack` (features/work-stack)
 * only ever surfaces a `WorkItem` the underlying query already returned,
 * and Django already scoped that query to what this Partner may see.
 */
/**
 * ## Why there are four tabs and not three
 *
 * The 2026-08-19 redesign collapsed eight nav targets into three, and the win
 * was real. But it left `/work` doing two jobs: a status screen (am I online,
 * what have I earned, is anything coming) and a ledger of every record the
 * vendor touches. On any account with history the ledger won, and the status —
 * the part checked twenty times a day — was pushed off the top of the screen.
 *
 * Splitting them is not a return to the old sprawl. It is one destination
 * becoming two because it was always two things, and each of the four now
 * answers a question a vendor actually asks:
 *
 * - **Home** — am I online, and what have I made? Plus anything that needs me.
 * - **Work** — the full list, grouped by whose move it is.
 * - **Money** — the ledger, payouts, the detail Home deliberately omits.
 * - **Me** — who I am and what I control.
 *
 * `Work` points at `/work/all` rather than `/work`: the tab is the list, and
 * `/work` redirects to `/home` so that a bookmark, a notification deep link or
 * a browser history entry from before the split still lands somewhere true.
 */
export const TAP_FIRST_NAV: readonly WorkspaceNavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/work/all", label: "Work", icon: Users, activePrefix: "/work" },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "#notifications", label: "Alerts", icon: Bell, kind: "notifications" },
  { href: "/me", label: "Me", icon: UserCircle2 },
];

/**
 * Shell chrome for A10_LISTING-only employers: same dock shape as
 * `TAP_FIRST_NAV`, with Listings in place of Work. Never `/work/all` or `/jobs`.
 *
 * Money and Alerts stay — billing/subscription UI still lives on listings, but
 * Money is a shared ledger surface and Alerts is shared notification chrome.
 * `LISTING_NAV` below stays the shorter workspace-registry shape for
 * `navigationFor` / authorizedNav; the live shell uses this array via
 * `primaryShellNavFor`.
 */
export const LISTING_TAP_FIRST_NAV: readonly WorkspaceNavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/listings", label: "Listings", icon: Briefcase, activePrefix: "/listings" },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "#notifications", label: "Alerts", icon: Bell, kind: "notifications" },
  { href: "/me", label: "Me", icon: UserCircle2 },
];

/**
 * Shell chrome for A7 rental hosts: Home / Rentals / Bookings / Money / Alerts / Me
 * on a wide screen, and the five-target dock on a phone.
 *
 * Bookings is the demand side of a rental ad and used to sit at the foot of the
 * same page as the ads grid, where a partner with any history scrolled past
 * their listings to reach it. It is its own destination now — desktop-only,
 * because `SectionNav` gives the phone the same split one level down.
 */
export const RENTAL_TAP_FIRST_NAV: readonly WorkspaceNavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/rentals", label: "Rentals", icon: HardHat, activePrefix: "/rentals" },
  { href: "/rentals/bookings", label: "Bookings", icon: CalendarCheck, desktopOnly: true },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "#notifications", label: "Alerts", icon: Bell, kind: "notifications" },
  { href: "/me", label: "Me", icon: UserCircle2 },
];

/**
 * Shell chrome for A9 stay hosts — the same shape as `RENTAL_TAP_FIRST_NAV`
 * with the two demand-side destinations a stay has.
 *
 * Guest enquiries and paid reservations were both cards at the bottom of the
 * property page. Neither is about the property, and a host with a week of
 * bookings had to scroll past the listing form to see who was arriving. They
 * are separate destinations now.
 *
 * `Stays` keeps `activePrefix: "/stays"` so the dock still lights it while the
 * partner is inside a sub-route — the phone has no separate tab for these, so a
 * bar with nothing lit would say "you are nowhere".
 */
export const STAY_TAP_FIRST_NAV: readonly WorkspaceNavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/stays", label: "Stays", icon: FolderKanban, activePrefix: "/stays" },
  // Every stay is an enquiry the host follows up by phone, so there is no paid "Bookings"
  // list to show. `/stays/bookings` still opens for reservations made before that change.
  { href: "/stays/enquiries", label: "Enquiries", icon: ClipboardList, desktopOnly: true },
  { href: "/stays/visits", label: "Visits", icon: CalendarClock, desktopOnly: true },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "#notifications", label: "Alerts", icon: Bell, kind: "notifications" },
  { href: "/me", label: "Me", icon: UserCircle2 },
];

/**
 * Routes and labels per known workspace.
 *
 * Records stay in their own lifecycle vocabulary. An A3 shift-day is a shift and
 * an A5 milestone is a stage, and flattening both into "work item" — which is
 * what a single generic workspace would force — is exactly the erasure
 * `M2-FE-111` forbids. One spine in the backend does not mean one noun in the UI.
 */
/**
 * Dedicated navigation for career & hiring partners (A10_LISTING).
 * Home / Listings; Billing stays a subscription modal on the listings page.
 * Never reuse `/jobs` or `/work/*` — those are A1 task visits.
 */
export const LISTING_NAV: readonly WorkspaceNavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/listings", label: "Listings", icon: Briefcase, activePrefix: "/listings" },
  { href: "/me", label: "Me", icon: UserCircle2, activePrefix: "/me" },
];

/**
 * Whether resolved workspaces are a single specialty surface (A10/A7/A9 only).
 *
 * Empty list is *not* specialty — that is the M1 A1 floor (no M2 grants yet).
 * Mixed specialty + A3/A5 keeps Work chrome via `TAP_FIRST_NAV`.
 */
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

/**
 * Primary dock / desktop nav for `PartnerShell`.
 *
 * A10/A7/A9-only → specialty tap-first (never Work/Jobs).
 * Otherwise → `TAP_FIRST_NAV` (including empty grants = legacy A1 Work).
 */
export function primaryShellNavFor(
  workspaces: readonly { readonly key: string }[],
): readonly WorkspaceNavItem[] {
  const home = specialtyShellHome(workspaces);
  if (home === "listings") return LISTING_TAP_FIRST_NAV;
  if (home === "rentals") return RENTAL_TAP_FIRST_NAV;
  if (home === "stays") return STAY_TAP_FIRST_NAV;
  return TAP_FIRST_NAV;
}

/**
 * What the phone dock renders: the primary nav minus its desktop-only items.
 *
 * `BottomTabBar` calls this rather than filtering inline, so the dock's
 * composition is testable without rendering it — the dock has a raised centre
 * Home and two slots either side, and which destinations survive that budget is
 * a navigation decision, not a layout one.
 *
 * `DesktopPrimaryNav` deliberately does not call it. The wide header lays every
 * item out inline and has room for all of them.
 */
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
      // The A3 primary path since ADR-0009 revision 4, and first because it is
      // the one destination with a clock on it: a crew offer runs on the M1
      // dispatch clock, in minutes. Enquiries stays directly beneath it — that
      // is the thin-supply quote fallback, not a dead surface, and a lead whose
      // city has no published rate card yet lives entirely in it.
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
  [LISTING_WORKSPACE]: {
    key: LISTING_WORKSPACE,
    label: "Job Listings",
    description: "Post job opportunities, review applications, and manage hiring.",
    icon: Briefcase,
    home: "/listings",
    nav: [...LISTING_NAV],
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
      { href: "/rentals/bookings", label: "Bookings", icon: CalendarCheck, desktopOnly: true },
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
      { href: "/stays/enquiries", label: "Enquiries", icon: ClipboardList, desktopOnly: true },
      { href: "/stays/visits", label: "Visits", icon: CalendarClock, desktopOnly: true },
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
