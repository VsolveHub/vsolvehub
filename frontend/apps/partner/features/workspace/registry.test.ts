import type { WorkspaceGrant } from "@vsolve/query";
import { describe, expect, it } from "vitest";

import {
  BASE_NAV,
  LISTING_TAP_FIRST_NAV,
  LISTING_WORKSPACE,
  MAX_TAB_ITEMS,
  PROJECT_WORKSPACE,
  RENTAL_TAP_FIRST_NAV,
  RENTAL_WORKSPACE,
  STAY_TAP_FIRST_NAV,
  STAY_WORKSPACE,
  TAP_FIRST_NAV,
  WORKFORCE_WORKSPACE,
  activeWorkspace,
  dockNavFor,
  navigationFor,
  primaryShellNavFor,
  resolveWorkspaces,
} from "./registry";

/**
 * Navigation for A1, A3 and A5 — and the proof that an unknown key renders
 * nothing.
 *
 * Closes `M2-FE-115`.
 *
 * These are the tests the whole Partner column turns on. The registry's safety
 * property is negative — *it does not render things* — and a negative property
 * with no test is a comment. The specific failure being guarded against is a
 * future deployment authorizing a workspace this bundle has no screens for, and
 * a well-meaning fallback offering it as a generic tab that 404s.
 */

function grant(workspaceKey: string, actions: string[]): WorkspaceGrant {
  return { workspaceKey, commercialMode: null, actions };
}

const A3_ACTIONS = ["enquiry.view", "attendance.confirm", "crew.manage"];
const A5_ACTIONS = ["enquiry.view", "stage.submit_evidence"];

describe("TAP_FIRST_NAV", () => {
  // `partner-shell.tsx`'s bottom tab bar renders this directly now, in place
  // of `navigationFor(activeWorkspace(...))`. Everything below this block
  // still tests the older registry the rest of the app (M2 workspace
  // gating, notification routing, capability-request copy) still runs on —
  // see `TAP_FIRST_NAV`'s own doc comment in `registry.ts` for why that
  // stays rather than being deleted alongside the switcher.
  it("has exactly the tap-first destinations, in order", () => {
    expect(TAP_FIRST_NAV.map((item) => item.href)).toEqual([
      "/home",
      "/work/all",
      "/money",
      "#notifications",
      "/me",
    ]);
  });

  it("gives every destination a one-word label", () => {
    for (const item of TAP_FIRST_NAV) {
      expect(item.label.split(" ")).toHaveLength(1);
    }
  });
});

describe("A1 backward compatibility", () => {
  it("leaves an M1 partner's navigation exactly as it is", () => {
    // The overwhelming majority of Partners. M2 must be invisible to them, and
    // this is the regression check that says so — `M2-FE-111`.
    expect(resolveWorkspaces([])).toEqual([]);
    expect(navigationFor(null)).toEqual(BASE_NAV);
  });

  it("keeps Home, Jobs, Money and You in the base navigation", () => {
    // Named literally rather than counted. A test asserting "four tabs" would
    // pass after somebody replaced Jobs with something else.
    expect(BASE_NAV.map((item) => item.href)).toEqual([
      "/dashboard",
      "/jobs",
      "/earnings",
      "/profile",
    ]);
  });

  it("does not rename a lifecycle record to a generic noun", () => {
    // `M2-FE-111` forbids flattening a shift and a stage into "work item". The
    // registry is where that would happen first, because one generic label is
    // the cheapest way to make two workspaces share a screen.
    const labels = resolveWorkspaces([
      grant(WORKFORCE_WORKSPACE, A3_ACTIONS),
      grant(PROJECT_WORKSPACE, A5_ACTIONS),
    ]).flatMap((workspace) => workspace.nav.map((item) => item.label.toLowerCase()));

    for (const banned of ["work item", "work items", "job", "jobs", "work"]) {
      expect(labels, `a workspace tab is labelled "${banned}"`).not.toContain(banned);
    }
  });
});

describe("unknown workspace keys", () => {
  it("renders nothing at all — no tab, no fallback", () => {
    // The headline requirement of `M2-FE-115`. A key the build does not know
    // must produce no navigation whatsoever.
    const resolved = resolveWorkspaces([grant("A9_SOMETHING_NEW", ["enquiry.view"])]);

    expect(resolved).toEqual([]);
    expect(navigationFor(null)).toEqual(BASE_NAV);
  });

  it("does not fall back to Jobs when every key is unknown", () => {
    // The specific wrong answer named in the task: treating an unrenderable
    // capability as if it were the A1 task lifecycle. `/jobs` is still present
    // because it is *base* navigation — what must not happen is a workspace
    // resolving to it.
    const resolved = resolveWorkspaces([grant("A9_SOMETHING_NEW", ["enquiry.view"])]);
    expect(resolved.map((workspace) => workspace.home)).not.toContain("/jobs");
  });

  it("still renders the keys it does know alongside one it does not", () => {
    // Partial ignorance must not be total. A deployment adding a fourth
    // workspace cannot be allowed to blank the two that work.
    const resolved = resolveWorkspaces([
      grant(WORKFORCE_WORKSPACE, A3_ACTIONS),
      grant("A9_SOMETHING_NEW", ["enquiry.view"]),
    ]);

    expect(resolved.map((workspace) => workspace.key)).toEqual([WORKFORCE_WORKSPACE]);
  });
});

describe("A3 workforce navigation", () => {
  const [workforce] = resolveWorkspaces([grant(WORKFORCE_WORKSPACE, A3_ACTIONS)]);

  it("resolves to its own home and label", () => {
    expect(workforce?.home).toBe("/workforce");
    expect(workforce?.label).toBe("Workforce");
  });

  it("hides a destination whose action was not granted", () => {
    // Hidden, never disabled. A disabled control advertises a capability the
    // Partner does not have and cannot obtain by clicking it.
    const [limited] = resolveWorkspaces([grant(WORKFORCE_WORKSPACE, ["enquiry.view"])]);

    const hrefs = limited?.authorizedNav.map((item) => item.href) ?? [];
    expect(hrefs).toContain("/workforce/enquiries");
    expect(hrefs).not.toContain("/workforce/crew");
    expect(hrefs).not.toContain("/workforce/shifts");
  });

  it("keeps its home reachable with no actions at all", () => {
    // A suspension expressed as an empty action array (0012 §A1) must degrade to
    // a readable workspace, not to a workspace with no way into it.
    const [stripped] = resolveWorkspaces([grant(WORKFORCE_WORKSPACE, [])]);
    expect(stripped?.authorizedNav.map((item) => item.href)).toEqual(["/workforce"]);
  });
});

describe("A5 project navigation", () => {
  it("keeps stages under their own noun", () => {
    const [projects] = resolveWorkspaces([grant(PROJECT_WORKSPACE, A5_ACTIONS)]);

    expect(projects?.home).toBe("/projects");
    expect(projects?.authorizedNav.map((item) => item.label)).toContain("Stages");
  });
});

describe("A10 listing navigation", () => {
  it("resolves Career/Jobs partners to /listings, not /jobs", () => {
    const [listing] = resolveWorkspaces([
      grant(LISTING_WORKSPACE, ["listing.create", "listing.moderate"]),
    ]);

    expect(listing?.key).toBe(LISTING_WORKSPACE);
    expect(listing?.home).toBe("/listings");
    expect(listing?.authorizedNav.map((item) => item.href)).toContain("/listings");
    expect(navigationFor(listing ?? null).map((item) => item.href)).not.toContain("/jobs");
  });

  it("keeps Listings reachable when listing actions are empty", () => {
    // LISTING_NAV items carry no action gate — suspension must not blank the workspace.
    const [listing] = resolveWorkspaces([grant(LISTING_WORKSPACE, [])]);
    expect(listing?.authorizedNav.map((item) => item.href)).toEqual([
      "/home",
      "/listings",
      "/me",
    ]);
  });
});

describe("primaryShellNavFor — live PartnerShell chrome", () => {
  it("gives A10-only employers Listings instead of Work/Jobs", () => {
    const workspaces = resolveWorkspaces([grant(LISTING_WORKSPACE, [])]);
    const hrefs = primaryShellNavFor(workspaces).map((item) => item.href);

    expect(hrefs).toEqual(LISTING_TAP_FIRST_NAV.map((item) => item.href));
    expect(hrefs).toContain("/listings");
    expect(hrefs).not.toContain("/work/all");
    expect(hrefs).not.toContain("/jobs");
  });

  it("keeps TAP_FIRST Work for empty grants (A1 floor)", () => {
    const hrefs = primaryShellNavFor([]).map((item) => item.href);
    expect(hrefs).toEqual(TAP_FIRST_NAV.map((item) => item.href));
    expect(hrefs).toContain("/work/all");
  });

  it("keeps TAP_FIRST Work when A10 is mixed with workforce", () => {
    const workspaces = resolveWorkspaces([
      grant(LISTING_WORKSPACE, []),
      grant(WORKFORCE_WORKSPACE, A3_ACTIONS),
    ]);
    const hrefs = primaryShellNavFor(workspaces).map((item) => item.href);

    expect(hrefs).toContain("/work/all");
    expect(hrefs).not.toContain("/listings");
  });

  it("gives A7-only partners Rentals instead of Work", () => {
    const workspaces = resolveWorkspaces([grant(RENTAL_WORKSPACE, [])]);
    const hrefs = primaryShellNavFor(workspaces).map((item) => item.href);
    expect(hrefs).toContain("/rentals");
    expect(hrefs).not.toContain("/work/all");
  });

  it("gives A9-only partners Stays instead of Work", () => {
    const workspaces = resolveWorkspaces([grant(STAY_WORKSPACE, [])]);
    const hrefs = primaryShellNavFor(workspaces).map((item) => item.href);
    expect(hrefs).toContain("/stays");
    expect(hrefs).not.toContain("/work/all");
  });
});

describe("the specialty nav is specialised per workspace", () => {
  // Enquiries and Bookings stopped being cards on one page and became
  // destinations. An A9 stay and an A7 rental do not have the same set of them,
  // so the two arrays must not converge — a rental host has no enquiry stage at
  // all (`apps/rental` has no enquiry model), and a stay host takes paid
  // reservations as well as enquiries.

  it("offers Enquiries to a stay host only", () => {
    const stayHrefs = primaryShellNavFor(resolveWorkspaces([grant(STAY_WORKSPACE, [])])).map(
      (item) => item.href,
    );
    const rentalHrefs = primaryShellNavFor(resolveWorkspaces([grant(RENTAL_WORKSPACE, [])])).map(
      (item) => item.href,
    );

    expect(stayHrefs).toContain("/stays/enquiries");
    expect(rentalHrefs).not.toContain("/stays/enquiries");
    expect(RENTAL_TAP_FIRST_NAV.map((item) => item.label)).not.toContain("Enquiries");
  });

  it("gives each host their own Bookings, never the other's", () => {
    // Rentals have a paid Bookings list; stays are enquiry-only and have none. A stay
    // host must never be offered the rental one.
    const stayHrefs = STAY_TAP_FIRST_NAV.map((item) => item.href);
    const rentalHrefs = RENTAL_TAP_FIRST_NAV.map((item) => item.href);

    expect(stayHrefs).not.toContain("/stays/bookings");
    expect(stayHrefs).not.toContain("/rentals/bookings");
    expect(rentalHrefs).toContain("/rentals/bookings");
    expect(rentalHrefs).not.toContain("/stays/bookings");
  });

  it("keeps the new destinations out of the phone dock", () => {
    // The dock is a raised centre Home and two slots either side. The two extra
    // stay destinations would not fit, so they are desktop-only and reached on a
    // phone through `SectionNav` inside the workspace instead.
    const stayDock = dockNavFor(STAY_TAP_FIRST_NAV).map((item) => item.href);
    const rentalDock = dockNavFor(RENTAL_TAP_FIRST_NAV).map((item) => item.href);

    expect(stayDock).toEqual(["/home", "/stays", "/money", "#notifications", "/me"]);
    expect(rentalDock).toEqual(["/home", "/rentals", "/money", "#notifications", "/me"]);
  });

  it("keeps them in the wide header", () => {
    const stayDesktop = STAY_TAP_FIRST_NAV.map((item) => item.href);
    expect(stayDesktop).toEqual([
      "/home",
      "/stays",
      "/stays/enquiries",
      "/stays/visits",
      "/money",
      "#notifications",
      "/me",
    ]);
  });
});

describe("the active workspace", () => {
  const workspaces = resolveWorkspaces([
    grant(WORKFORCE_WORKSPACE, A3_ACTIONS),
    grant(PROJECT_WORKSPACE, A5_ACTIONS),
  ]);

  it("is null on the base app", () => {
    expect(activeWorkspace(workspaces, "/dashboard")).toBeNull();
    expect(activeWorkspace(workspaces, "/jobs")).toBeNull();
  });

  it("resolves a nested route to its own workspace", () => {
    expect(activeWorkspace(workspaces, "/workforce/crew")?.key).toBe(WORKFORCE_WORKSPACE);
    expect(activeWorkspace(workspaces, "/projects/stages")?.key).toBe(PROJECT_WORKSPACE);
  });

  it("does not match a route that merely starts with the same characters", () => {
    // `/projects-archive` is not inside `/projects`. A bare `startsWith` would
    // say it is, and the tab bar would light up the wrong workspace.
    expect(activeWorkspace(workspaces, "/projects-archive")).toBeNull();
  });

  it("is null for a workspace the Partner no longer holds", () => {
    // Mid-session suspension. Someone standing on `/workforce/shifts` after the
    // grant is withdrawn must not keep seeing it highlighted as where they are.
    const remaining = resolveWorkspaces([grant(PROJECT_WORKSPACE, A5_ACTIONS)]);
    expect(activeWorkspace(remaining, "/workforce/shifts")).toBeNull();
  });
});

describe("the tab budget", () => {
  it("never exceeds six tabs", () => {
    // Past six the labels truncate on a small Android viewport. The switcher,
    // not more tabs, is how a multi-capability Partner moves between them.
    const [workforce] = resolveWorkspaces([grant(WORKFORCE_WORKSPACE, A3_ACTIONS)]);
    const [projects] = resolveWorkspaces([grant(PROJECT_WORKSPACE, A5_ACTIONS)]);

    expect(navigationFor(workforce ?? null).length).toBeLessThanOrEqual(MAX_TAB_ITEMS);
    expect(navigationFor(projects ?? null).length).toBeLessThanOrEqual(MAX_TAB_ITEMS);
  });

  it("keeps Home and You reachable from inside a workspace", () => {
    // A Partner mid-shift still needs their profile, and a workspace that
    // swallows the whole shell is one a person can get stranded in on a phone.
    const [workforce] = resolveWorkspaces([grant(WORKFORCE_WORKSPACE, A3_ACTIONS)]);
    const hrefs = navigationFor(workforce ?? null).map((item) => item.href);

    expect(hrefs[0]).toBe("/dashboard");
    expect(hrefs).toContain("/profile");
  });

  it("does not put Jobs between a workspace's own tabs", () => {
    // Jobs belongs to the A1 lifecycle. Sitting it among the workforce tabs
    // would make it read as this workspace's records.
    const [workforce] = resolveWorkspaces([grant(WORKFORCE_WORKSPACE, A3_ACTIONS)]);
    expect(navigationFor(workforce ?? null).map((item) => item.href)).not.toContain("/jobs");
  });
});
