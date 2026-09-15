/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  LISTING_WORKSPACE,
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

describe("getPartnerChromeMode", () => {
  it("gives full chrome on the Listings home (dock visible)", () => {
    expect(getPartnerChromeMode("/listings")).toBe("full");
  });

  it("keeps listing detail focused (no dock over the inbox)", () => {
    expect(getPartnerChromeMode("/listings/abc")).toBe("focused");
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
});
