/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  LISTING_WORKSPACE,
  PROJECT_WORKSPACE,
  WORKFORCE_WORKSPACE,
  primaryShellNavFor,
  resolveWorkspaces,
  type WorkspaceNavItem,
} from "@/features/workspace/registry";
import type { WorkspaceGrant } from "@vsolve/query";

vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
}));

vi.mock("@/features/notifications/view/notification-bell", () => ({
  NotificationNavTab: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

vi.mock("@/features/notifications/view/booking-alert-audio", () => ({
  prepareBookingAlertsFromGesture: () => undefined,
}));

const { BottomTabBar, DesktopPrimaryNav, getPartnerChromeMode } = await import(
  "./partner-shell"
);

function grant(workspaceKey: string, actions: string[] = []): WorkspaceGrant {
  return { workspaceKey, commercialMode: null, actions };
}

function navHrefs(items: readonly WorkspaceNavItem[]): string[] {
  return items.filter((item) => item.kind !== "notifications").map((item) => item.href);
}

function renderedNavHrefs(): Array<string | null> {
  const nav = screen.getByRole("navigation", { name: "Partner navigation" });
  return within(nav)
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
}

describe("getPartnerChromeMode", () => {
  it("gives full chrome on the Listings home (dock visible)", () => {
    expect(getPartnerChromeMode("/listings")).toBe("full");
  });

  it("keeps listing detail focused (no dock over the inbox)", () => {
    expect(getPartnerChromeMode("/listings/abc")).toBe("focused");
  });

  it("gives full chrome to every other top-level destination", () => {
    for (const pathname of ["/home", "/work/all", "/rentals", "/stays", "/money", "/me", "/me/rate-card"]) {
      expect(getPartnerChromeMode(pathname)).toBe("full");
    }
  });

  it("keeps onboarding and task routes chrome-free or focused", () => {
    expect(getPartnerChromeMode("/apply")).toBe("onboarding");
    expect(getPartnerChromeMode("/apply/business")).toBe("onboarding");
    expect(getPartnerChromeMode("/work/offers/abc")).toBe("focused");
    expect(getPartnerChromeMode("/rentals/abc")).toBe("focused");
    expect(getPartnerChromeMode("/stays/abc")).toBe("focused");
  });
});

describe("PartnerShell primary nav chrome", () => {
  it("BottomTabBar for A10-only grants does not offer /work/all or /jobs", () => {
    const workspaces = resolveWorkspaces([grant(LISTING_WORKSPACE)]);
    const items = primaryShellNavFor(workspaces);

    render(<BottomTabBar items={items} workspaceKeys={workspaces.map((w) => w.key)} />);

    const nav = screen.getByRole("navigation", { name: "Partner navigation" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(hrefs).toContain("/listings");
    expect(hrefs).not.toContain("/work/all");
    expect(hrefs).not.toContain("/jobs");
    expect(navHrefs(items)).not.toContain("/work/all");
  });

  it("DesktopPrimaryNav for A10-only grants offers Listings, not Work", () => {
    const workspaces = resolveWorkspaces([grant(LISTING_WORKSPACE)]);
    const items = primaryShellNavFor(workspaces);

    render(<DesktopPrimaryNav items={items} workspaceKeys={workspaces.map((w) => w.key)} />);

    expect(screen.getByRole("link", { name: /Listings/i })).toHaveAttribute("href", "/listings");
    expect(screen.queryByRole("link", { name: /^Work$/i })).toBeNull();
  });

  it("mixed A10 + workforce still offers Work in the dock", () => {
    const workspaces = resolveWorkspaces([
      grant(LISTING_WORKSPACE),
      grant(WORKFORCE_WORKSPACE, ["enquiry.view"]),
    ]);
    const items = primaryShellNavFor(workspaces);

    render(<BottomTabBar items={items} workspaceKeys={workspaces.map((w) => w.key)} />);

    const nav = screen.getByRole("navigation", { name: "Partner navigation" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(hrefs).toContain("/work/all");
    expect(hrefs).not.toContain("/listings");
  });

  it("BottomTabBar for A10-only grants keeps the shared dock around Listings", () => {
    const workspaces = resolveWorkspaces([grant(LISTING_WORKSPACE)]);
    const items = primaryShellNavFor(workspaces);

    render(<BottomTabBar items={items} workspaceKeys={workspaces.map((w) => w.key)} />);

    expect(renderedNavHrefs()).toEqual(
      expect.arrayContaining(["/home", "/listings", "/money", "/me"]),
    );
    // The Alerts destination stays — it opens the panel rather than navigating.
    const nav = screen.getByRole("navigation", { name: "Partner navigation" });
    expect(within(nav).getByRole("button", { name: "Alerts" })).toBeInTheDocument();
  });

  it("BottomTabBar keeps Work for empty grants (M1 A1 floor)", () => {
    // No M2 grants is the legacy A1 Partner, not a specialty employer. The dock
    // must keep Work and must not flash Listings.
    const workspaces = resolveWorkspaces([]);
    const items = primaryShellNavFor(workspaces);

    render(<BottomTabBar items={items} workspaceKeys={workspaces.map((w) => w.key)} />);

    const hrefs = renderedNavHrefs();
    expect(hrefs).toContain("/work/all");
    expect(hrefs).not.toContain("/listings");
  });

  it("DesktopPrimaryNav for A10-only grants keeps Home, Money and Me around Listings", () => {
    const workspaces = resolveWorkspaces([grant(LISTING_WORKSPACE)]);
    const items = primaryShellNavFor(workspaces);

    render(<DesktopPrimaryNav items={items} workspaceKeys={workspaces.map((w) => w.key)} />);

    const hrefs = renderedNavHrefs();
    expect(hrefs).toEqual(expect.arrayContaining(["/home", "/listings", "/money", "/me"]));
    expect(hrefs).not.toContain("/work/all");
    expect(hrefs).not.toContain("/jobs");
  });

  it("mixed A10 + A5 project still offers Work in the dock", () => {
    const workspaces = resolveWorkspaces([
      grant(LISTING_WORKSPACE),
      grant(PROJECT_WORKSPACE, ["enquiry.view"]),
    ]);
    const items = primaryShellNavFor(workspaces);

    render(<BottomTabBar items={items} workspaceKeys={workspaces.map((w) => w.key)} />);

    const hrefs = renderedNavHrefs();
    expect(hrefs).toContain("/work/all");
    expect(hrefs).not.toContain("/listings");
  });
});
