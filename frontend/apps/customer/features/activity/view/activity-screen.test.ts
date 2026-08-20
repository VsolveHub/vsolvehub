import { describe, expect, it } from "vitest";

import {
  ACTIVITY_TABS,
  DEFAULT_ACTIVITY_TAB,
  activityTabHref,
  toActivityTab,
} from "./activity-screen";

/**
 * The hub's URL contract.
 *
 * `?tab=` is user input: it arrives from bookmarks, from notification deep
 * links, from a share that a chat client truncated, and from anyone who edits
 * the address bar. The property under test is that none of those can produce a
 * screen that is neither a segment nor a 404 — an unrecognised value is the
 * default, always, because landing somebody on the hub is a better answer to a
 * stale link than an error page.
 */
describe("toActivityTab", () => {
  it("accepts every segment the hub renders", () => {
    for (const tab of ACTIVITY_TABS) {
      expect(toActivityTab(tab)).toBe(tab);
    }
  });

  it("falls back to the default for anything it does not recognise", () => {
    // Next hands query values through as `string | string[] | undefined`, so all
    // three shapes reach this function in production.
    expect(toActivityTab(undefined)).toBe(DEFAULT_ACTIVITY_TAB);
    expect(toActivityTab("")).toBe(DEFAULT_ACTIVITY_TAB);
    expect(toActivityTab("Requests")).toBe(DEFAULT_ACTIVITY_TAB);
    expect(toActivityTab("workforce")).toBe(DEFAULT_ACTIVITY_TAB);
    expect(toActivityTab("__proto__")).toBe(DEFAULT_ACTIVITY_TAB);
  });

  it("reads the first value when the parameter is repeated", () => {
    // `?tab=requests&tab=projects` is legal and arrives as an array.
    expect(toActivityTab(["requests", "projects"])).toBe("requests");
    expect(toActivityTab([])).toBe(DEFAULT_ACTIVITY_TAB);
  });
});

describe("activityTabHref", () => {
  it("leaves the default segment off the URL", () => {
    // Two addresses for one screen is two things to keep in step, and the bare
    // `/activity` is the one the nav points at.
    expect(activityTabHref(DEFAULT_ACTIVITY_TAB)).toBe("/activity");
  });

  it("round-trips every non-default segment", () => {
    for (const tab of ACTIVITY_TABS) {
      const href = activityTabHref(tab);
      const value = new URL(href, "https://example.test").searchParams.get("tab");
      expect(toActivityTab(value ?? undefined)).toBe(tab);
    }
  });
});
