import { describe, expect, it } from "vitest";

import { PARTNER_TABS } from "./tab-bar";

/**
 * The four destinations.
 *
 * Ported from `features/workspace/registry.test.ts` when `TAP_FIRST_NAV` moved
 * out of the workspace registry and became `PARTNER_TABS` beside the component
 * that renders it — see the note left in `registry.ts` for why navigation
 * chrome does not belong next to the capability-grant machinery.
 */
describe("PARTNER_TABS", () => {
  it("has exactly the four tap-first destinations, in order", () => {
    expect(PARTNER_TABS.map((tab) => tab.href)).toEqual([
      "/home",
      "/work/all",
      "/money",
      "/me",
    ]);
  });

  it("gives every destination a one-word label", () => {
    // Two words truncate at 360px in a four-up bar. This is the constraint the
    // labels are written against, not a style preference.
    for (const tab of PARTNER_TABS) {
      expect(tab.label.split(" ")).toHaveLength(1);
    }
  });

  it("gives every tab a distinct icon", () => {
    /*
      The set this replaced used `Users` for Work and `UserCircle2` for Me —
      two person glyphs side by side, distinguished only by a circle, under
      10px labels. A Partner scanning the bar with their thumb over half of it
      could not tell them apart.
    */
    const icons = new Set(PARTNER_TABS.map((tab) => tab.icon));
    expect(icons.size).toBe(PARTNER_TABS.length);
  });

  it("gives Work a prefix wide enough to own its whole tree", () => {
    /*
      Without this the bar goes completely dark the moment a Partner opens a
      job: no tab's own `href` is a prefix of `/work/jobs/{id}`, and a tab bar
      with nothing lit says "you are nowhere".
    */
    const work = PARTNER_TABS.find((tab) => tab.href === "/work/all");
    expect(work?.activePrefix).toBe("/work");
  });
});
