/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  LISTING_WORKSPACE,
  RENTAL_WORKSPACE,
  STAY_WORKSPACE,
  WORKFORCE_WORKSPACE,
  primaryShellNavFor,
  resolveWorkspaces,
  type WorkspaceNavItem,
} from "@/features/workspace/registry";
import type { WorkspaceGrant } from "@vsolve/query";
import { withI18n } from "@/i18n/test-utils";

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

const { BottomTabBar, DesktopPrimaryNav, getPartnerChromeMode, hasOwnFocusedHeader } = await import(
  "./partner-shell"
);

function grant(workspaceKey: string, actions: string[] = []): WorkspaceGrant {
  return { workspaceKey, commercialMode: null, actions };
}

function navHrefs(items: readonly WorkspaceNavItem[]): string[] {
  return items.filter((item) => item.kind !== "notifications").map((item) => item.href);
}

describe("getPartnerChromeMode", () => {
  it("gives full chrome on the Listings home (dock visible)", () => {
    expect(getPartnerChromeMode("/listings")).toBe("full");
  });

  it("keeps listing detail focused (no dock over the inbox)", () => {
    expect(getPartnerChromeMode("/listings/abc")).toBe("focused");
  });

  it("gives full chrome to every stays and rentals destination", () => {
    // These stop being cards on one page and become destinations. A destination
    // with "focused" chrome has a back button and no dock, which is right for a
    // detail step and wrong for somewhere the nav points at.
    expect(getPartnerChromeMode("/stays")).toBe("full");
    expect(getPartnerChromeMode("/stays/enquiries")).toBe("full");
    expect(getPartnerChromeMode("/stays/bookings")).toBe("full");
    expect(getPartnerChromeMode("/rentals")).toBe("full");
    expect(getPartnerChromeMode("/rentals/bookings")).toBe("full");
  });

  it("does not mistake a same-prefix route for a workspace route", () => {
    // `/stays-archive` is not inside `/stays`. A bare `startsWith` says it is and
    // hands a stranger's route the partner dock.
    expect(getPartnerChromeMode("/stays-archive")).toBe("focused");
    expect(getPartnerChromeMode("/rentals-archive")).toBe("focused");
  });
});

describe("hasOwnFocusedHeader", () => {
  it("suppresses the shell's generic focused header where a route renders its own", () => {
    expect(hasOwnFocusedHeader("/listings/post")).toBe(true);
    expect(hasOwnFocusedHeader("/work/how-day-hire-works")).toBe(true);
    expect(hasOwnFocusedHeader("/work/jobs/abc")).toBe(true);
  });

  it("leaves every other focused route to FocusedHeader", () => {
    expect(hasOwnFocusedHeader("/work/offers")).toBe(false);
    expect(hasOwnFocusedHeader("/listings/abc")).toBe(false);
  });
});

describe("PartnerShell primary nav chrome", () => {
  it("BottomTabBar for A10-only grants does not offer /work/all or /jobs", () => {
    const workspaces = resolveWorkspaces([grant(LISTING_WORKSPACE)]);
    const items = primaryShellNavFor(workspaces);

    render(withI18n(<BottomTabBar items={items} workspaceKeys={workspaces.map((w) => w.key)} />));

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

    render(withI18n(<DesktopPrimaryNav items={items} workspaceKeys={workspaces.map((w) => w.key)} />));

    expect(screen.getByRole("link", { name: /Listings/i })).toHaveAttribute("href", "/listings");
    expect(screen.queryByRole("link", { name: /^Work$/i })).toBeNull();
  });

  it("mixed A10 + workforce still offers Work in the dock", () => {
    const workspaces = resolveWorkspaces([
      grant(LISTING_WORKSPACE),
      grant(WORKFORCE_WORKSPACE, ["enquiry.view"]),
    ]);
    const items = primaryShellNavFor(workspaces);

    render(withI18n(<BottomTabBar items={items} workspaceKeys={workspaces.map((w) => w.key)} />));

    const nav = screen.getByRole("navigation", { name: "Partner navigation" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(hrefs).toContain("/work/all");
    expect(hrefs).not.toContain("/listings");
  });

  it("stay host: the dock keeps five targets, Enquiries and Bookings live in the header", () => {
    const workspaces = resolveWorkspaces([grant(STAY_WORKSPACE)]);
    const items = primaryShellNavFor(workspaces);
    const workspaceKeys = workspaces.map((w) => w.key);

    render(withI18n(<BottomTabBar items={items} workspaceKeys={workspaceKeys} />));

    const dock = screen.getByRole("navigation", { name: "Partner navigation" });
    const dockHrefs = within(dock)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(dockHrefs).toContain("/stays");
    expect(dockHrefs).not.toContain("/stays/enquiries");
    expect(dockHrefs).not.toContain("/stays/bookings");

    render(withI18n(<DesktopPrimaryNav items={items} workspaceKeys={workspaceKeys} />));

    expect(screen.getByRole("link", { name: /Enquiries/i })).toHaveAttribute(
      "href",
      "/stays/enquiries",
    );
    expect(screen.queryByRole("link", { name: /Bookings/i })).not.toBeInTheDocument();
  });

  it("rental host: Bookings is offered and Enquiries never is", () => {
    const workspaces = resolveWorkspaces([grant(RENTAL_WORKSPACE)]);
    const items = primaryShellNavFor(workspaces);

    render(withI18n(<DesktopPrimaryNav items={items} workspaceKeys={workspaces.map((w) => w.key)} />));

    expect(screen.getByRole("link", { name: /Bookings/i })).toHaveAttribute(
      "href",
      "/rentals/bookings",
    );
    expect(screen.queryByRole("link", { name: /Enquiries/i })).toBeNull();
  });
});
