import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({}) }));

const { CASE_VIEWS, viewCount } = await import("./case-workspace");

const summary = {
  server_now: "2026-11-03T10:00:00Z",
  breaching_sla: 7,
  oldest_overdue_minutes: 120,
  mine_open: 2,
  mine_due_soon: 1,
  holding_payout: 5,
  teams: [
    { owner_team: "DISPATCH", open: 4, unclaimed: 3 },
    { owner_team: "FINANCE", open: 2, unclaimed: 0 },
  ],
};

describe("case queue views", () => {
  it("opens on cases nobody has picked up, among every still-open state", () => {
    expect(CASE_VIEWS[0].key).toBe("pick-up");
    expect(CASE_VIEWS[0].filters).toEqual({ status: "OPEN,IN_PROGRESS,WAITING", owner: "unclaimed" });
  });

  it("counts each view from the server's summary, never from loaded rows", () => {
    expect(viewCount("pick-up", summary as never)).toBe(3);
    expect(viewCount("mine", summary as never)).toBe(2);
    expect(viewCount("late", summary as never)).toBe(7);
    expect(viewCount("open", summary as never)).toBe(6);
    expect(viewCount("closed", summary as never)).toBeNull();
    expect(viewCount("chargebacks", summary as never)).toBeNull();
    expect(viewCount("mine", undefined)).toBeNull();
  });

  it("has one-click views for off-platform payment claims and chargebacks, open only", () => {
    const byKey = Object.fromEntries(CASE_VIEWS.map((view) => [view.key, view.filters]));
    expect(byKey["off-platform"]).toEqual({ status: "OPEN,IN_PROGRESS,WAITING", kind: "OFF_PLATFORM" });
    expect(byKey.chargebacks).toEqual({ status: "OPEN,IN_PROGRESS,WAITING", kind: "CHARGEBACK" });
  });
});
