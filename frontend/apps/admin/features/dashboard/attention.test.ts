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
});
