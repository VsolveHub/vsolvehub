import { describe, expect, it } from "vitest";

import {
  isUnread,
  targetHref,
  unreadBadgeDisplay,
  unreadBadgeLabel,
  type NotificationTarget,
} from "./feed";

/**
 * The two answers that fail silently in a component.
 *
 * A name that omits the count leaves a button that never changes for anyone
 * reading it non-visually, and a href guessed from an unknown `kind` is a link
 * to a 404 that looks exactly like a link to a record. Neither is visible in a
 * screenshot, so both are asserted here where no DOM is needed.
 */

function target(overrides: Partial<NotificationTarget> = {}): NotificationTarget {
  return { kind: "ENGAGEMENT", id: "eng-1", ...overrides };
}

describe("targetHref", () => {
  it("routes an engagement to the agreement it is about", () => {
    expect(targetHref(target({ kind: "ENGAGEMENT", id: "eng-9" }))).toBe("/engagements/eng-9");
  });

  it("routes a requirement to the request it is about", () => {
    expect(targetHref(target({ kind: "REQUIREMENT", id: "req-9" }))).toBe("/requests/req-9");
  });

  it("leads nowhere when the server says the notice is about no record", () => {
    // `null` is a real answer, not a missing field: an account-level notice is
    // about nothing that has a page. Inventing `/requests` here would be a guess
    // dressed as a link.
    expect(targetHref(null)).toBeNull();
  });

  it("leads nowhere for a kind this build has never heard of", () => {
    // `kind` is published as `string`, not an enum, so the server may add one.
    // The row still renders — it is just not a link, because the only href this
    // app could build for it is one it made up.
    expect(targetHref(target({ kind: "PAYOUT_BATCH" }))).toBeNull();
    expect(targetHref(target({ kind: "" }))).toBeNull();
  });

  it("does not treat a lowercase kind as a match", () => {
    // The contract publishes uppercase. Case-folding here would be this app
    // deciding what the server meant, and the first kind whose lowercase form
    // collides with another would route to the wrong record.
    expect(targetHref(target({ kind: "engagement" }))).toBeNull();
  });

  it("refuses to build a record route from an empty id", () => {
    // `/requests/` is the list, not the record. A row that silently navigates to
    // the wrong page is worse than one that does not navigate at all.
    expect(targetHref(target({ kind: "REQUIREMENT", id: "" }))).toBeNull();
  });
});

describe("unreadBadgeLabel", () => {
  it("carries the exact count in the accessible name", () => {
    expect(unreadBadgeLabel(3)).toBe("Notifications, 3 unread");
    expect(unreadBadgeLabel(1)).toBe("Notifications, 1 unread");
  });

  it("says none rather than zero when the server answered zero", () => {
    expect(unreadBadgeLabel(0)).toBe("Notifications, none unread");
  });

  it("claims nothing at all when the count is not known", () => {
    // The regression that matters: pending and failed are not zero. Announcing
    // "none unread" over a read that never landed is the one fake count that
    // tells somebody to stop looking.
    expect(unreadBadgeLabel(null)).toBe("Notifications");
  });

  it("stays unbounded, so a large count is never rounded in the name", () => {
    expect(unreadBadgeLabel(1284)).toBe("Notifications, 1284 unread");
  });
});

describe("unreadBadgeDisplay", () => {
  it("draws nothing when there is nothing unread and nothing known", () => {
    expect(unreadBadgeDisplay(0)).toBeNull();
    expect(unreadBadgeDisplay(null)).toBeNull();
  });

  it("draws the count up to the cap", () => {
    expect(unreadBadgeDisplay(1)).toBe("1");
    expect(unreadBadgeDisplay(99)).toBe("99");
  });

  it("caps the drawn digits rather than letting CSS truncate them", () => {
    // `128` clipped to two characters renders as `12`, which is a wrong number
    // rather than an abbreviated one.
    expect(unreadBadgeDisplay(100)).toBe("99+");
    expect(unreadBadgeDisplay(1284)).toBe("99+");
  });
});

describe("isUnread", () => {
  it("reads the server's stamp rather than deciding locally", () => {
    expect(isUnread({ read_at: null })).toBe(true);
    expect(isUnread({ read_at: "2026-08-15T10:00:00Z" })).toBe(false);
  });
});
