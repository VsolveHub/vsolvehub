import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({}) }));

const { isBrowsingPath } = await import("./welcome-reward-strip");

describe("where the welcome reward strip shows", () => {
  it("shows on home, the catalogue and a service's booking page", () => {
    for (const path of ["/", "/catalog", "/catalog/cleaning/deep-clean", "/book/ac-repair"]) {
      expect(isBrowsingPath(path)).toBe(true);
    }
  });

  it("stays off account, checkout and the screens that already show the full banner", () => {
    for (const path of ["/account", "/checkout", "/account/referral", "/bookings"]) {
      expect(isBrowsingPath(path)).toBe(false);
    }
  });
});
