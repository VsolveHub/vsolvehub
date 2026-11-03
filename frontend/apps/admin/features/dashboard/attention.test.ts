import { describe, expect, it } from "vitest";

import { itemsToShow, pendingReviewCount } from "./attention";

describe("home attention strip", () => {
  it("counts only listings waiting on a decision", () => {
    expect(
      pendingReviewCount([
        { moderation_status: "PENDING" },
        { public_state: "PENDING_REVIEW" },
        { moderation_status: "APPROVED", public_state: "LIVE" },
      ]),
    ).toBe(2);
  });

  it("hides empty and unknown counts and puts the busiest first", () => {
    const shown = itemsToShow([
      { label: "a", href: "/a", count: 0 },
      { label: "b", href: "/b", count: null },
      { label: "c", href: "/c", count: 2 },
      { label: "d", href: "/d", count: 5 },
    ]);
    expect(shown.map((item) => item.href)).toEqual(["/d", "/c"]);
  });

  it("puts urgent items above review queues, whatever their size", () => {
    const shown = itemsToShow([
      { label: "applications", href: "/reviews", count: 9 },
      { label: "late cases", href: "/operations/cases", count: 1, tone: "urgent" },
      { label: "late visits", href: "/operations/dispatch", count: 3, tone: "urgent" },
    ]);
    expect(shown.map((item) => item.label)).toEqual(["late visits", "late cases", "applications"]);
  });
});
