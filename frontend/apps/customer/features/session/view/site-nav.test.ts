import { describe, expect, it } from "vitest";

import { NAV_TARGETS, isCurrentTarget } from "./site-header";

/**
 * Which navigation item is lit, from any route in the app.
 *
 * This is the rule two chromes now share — the desktop bar and the phone tab
 * bar — so it is tested here rather than through either of them. The failure it
 * guards against is silent: nothing throws when nothing is marked current, the
 * screen just stops telling the reader where they are.
 *
 * The interesting half is that Activity owns four record trees it does not
 * share a path prefix with. `/requests/{id}` did not move when `My requests`
 * became a segment, so without the ownership map the entire request, booking,
 * project and engagement estate would light up nothing at all.
 */
describe("isCurrentTarget", () => {
  it("matches a target's own route", () => {
    for (const target of NAV_TARGETS) {
      expect(isCurrentTarget(target.href, target.href)).toBe(true);
    }
  });

  it("marks Activity current across every tree it took over", () => {
    for (const pathname of [
      "/activity",
      "/activity?tab=projects",
      "/bookings",
      "/bookings/abc/pay",
      "/bookings/abc/receipt",
      "/bookings/abc/visits/def",
      "/bookings/workforce",
      "/requests",
      "/requests/abc",
      "/requests/abc/quotes",
      "/requests/abc/visits/def",
      "/projects",
      "/engagements/abc",
      "/engagements/abc/receipt",
    ]) {
      // The query string is not part of the path Next reports, but asserting it
      // here documents that the rule must not start caring about one.
      expect(isCurrentTarget("/activity", pathname.split("?")[0]!)).toBe(true);
    }
  });

  it("does not mark a sibling whose href is a string prefix", () => {
    // `/catalog` must not match `/catalogue-of-something`. The boundary slash is
    // what makes the prefix test safe.
    expect(isCurrentTarget("/catalog", "/catalogue-of-something")).toBe(false);
    expect(isCurrentTarget("/cart", "/cartography")).toBe(false);
  });

  it("keeps the main targets mutually exclusive", () => {
    for (const pathname of ["/catalog/electrical", "/cart", "/requests/abc"]) {
      const lit = NAV_TARGETS.filter((target) => isCurrentTarget(target.href, pathname));
      // Two lit items is a navigation that contradicts itself; none is a
      // navigation that has stopped answering "where am I".
      expect(lit).toHaveLength(1);
    }
  });

  it("leaves profile in the header instead of duplicating it in main navigation", () => {
    // The tab bar lays these out in a single row on a 390px viewport. A third
    // target is a design decision, not an incidental one, and should fail here
    // first. (The basket left main navigation for the header icon; the cart
    // routes are owned by Services now.)
    expect(NAV_TARGETS).toHaveLength(5);
    expect(NAV_TARGETS.map((target) => target.href)).not.toContain("/account");
  });
});
