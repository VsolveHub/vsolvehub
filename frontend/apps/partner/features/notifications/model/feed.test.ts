import { describe, expect, it } from "vitest";

import { PROJECT_WORKSPACE, WORKFORCE_WORKSPACE } from "@/features/workspace/registry";

import { targetHref, unreadBadgeDisplay, unreadBadgeLabel } from "./feed";

/**
 * The two pure decisions behind the bell.
 *
 * ## The defects these exist to prevent
 *
 * 1. **A badge that states a count nothing checked.** `unread-count` is polled, so
 *    there are long stretches where the browser holds no answer — before the first
 *    response, and after a failed refetch. Rendering `0` in either window is a
 *    claim about somebody's inbox made from nothing, and it is the exact class of
 *    fake-data defect this codebase has been burned by before.
 * 2. **A link composed from a guess.** `NotificationTarget` is `{kind, id}` with no
 *    archetype, and the Partner app routes an A3 booking and an A5 project to
 *    different screens with deliberately different vocabulary. Guessing between
 *    them puts a project on a screen that talks about shift-days — the flattening
 *    `M2-FE-111` forbids — and composing a Partner path from a *requirement* id
 *    produces a URL no route accepts.
 */

const ENGAGEMENT = { kind: "ENGAGEMENT", id: "eng-1" };
const REQUIREMENT = { kind: "REQUIREMENT", id: "req-1" };

describe("the unread badge", () => {
  it("draws nothing at all when the count is unknown", () => {
    // Not a zero. Before the first response and after a failed refetch the
    // browser has no answer, and a badge is a statement.
    expect(unreadBadgeDisplay(null)).toBeNull();
  });

  it("draws nothing when there is genuinely nothing unread", () => {
    // Same rendering as unknown, and deliberately so: an empty badge and a "0"
    // badge say the same thing, and only one of them adds clutter to a top bar.
    expect(unreadBadgeDisplay(0)).toBeNull();
  });

  it("draws the real number while it fits", () => {
    expect(unreadBadgeDisplay(1)).toBe("1");
    expect(unreadBadgeDisplay(99)).toBe("99");
  });

  it("stops being a number once it stops fitting", () => {
    // Two digits is what fits in the pill on a 360px Android viewport without
    // pushing Sign Out off the row.
    expect(unreadBadgeDisplay(100)).toBe("99+");
    expect(unreadBadgeDisplay(4213)).toBe("99+");
  });
});

describe("what the bell is called", () => {
  it("says only what it is when the count is unknown", () => {
    // Never "0 unread", which would be a lie, and never an error message dressed
    // as a label on a control that still works.
    expect(unreadBadgeLabel(null)).toBe("Notifications");
  });

  it("says there is nothing unread when the server said so", () => {
    expect(unreadBadgeLabel(0)).toBe("Notifications, nothing unread");
  });

  it("carries the real count, uncapped, in the accessible name", () => {
    // The visible pill caps at 99+ because of space. Nothing about saying "213
    // unread" out loud is expensive, so the name does not cap.
    expect(unreadBadgeLabel(1)).toBe("Notifications, 1 unread");
    expect(unreadBadgeLabel(213)).toBe("Notifications, 213 unread");
  });
});

describe("where a notice leads", () => {
  it("leads nowhere when the server said it leads nowhere", () => {
    // `null` is a published answer, not a missing field: a notice about a closed
    // request has no page to open.
    expect(targetHref(null, [WORKFORCE_WORKSPACE])).toBeNull();
  });

  it("sends every engagement to the one job route, whatever the Partner holds", () => {
    /*
      This block used to assert four different answers — `/workforce/shifts/…`
      for an A3 grant, `/projects/stages/…` for an A5 one, and `null` for both
      "holds neither" and "holds both". All four were consequences of a route
      table where the two archetypes had separate screens and
      `NotificationTarget` carried nothing to choose between them.

      `/work/jobs/[id]` resolves both record kinds itself, so there is no longer
      a choice to get wrong. The capability list no longer changes the answer,
      which is the whole point: the previous version's headline negative was a
      Partner with *both* capabilities getting an unlinked row.
    */
    for (const held of [
      [],
      [WORKFORCE_WORKSPACE],
      [PROJECT_WORKSPACE],
      [WORKFORCE_WORKSPACE, PROJECT_WORKSPACE],
      ["A9_SOMETHING_NEW"],
    ]) {
      expect(targetHref(ENGAGEMENT, held)).toBe("/work/jobs/eng-1");
    }
    // And with the argument omitted entirely.
    expect(targetHref(ENGAGEMENT)).toBe("/work/jobs/eng-1");
  });

  it("sends both invitation kinds to the one enquiry route", () => {
    /*
      `/workforce/enquiries/{id}` and `/projects/enquiries/{id}` are both 308
      redirects to this path now. Composing the old ones spent a round trip on
      the surface whose entire job is to be the shortest way to the work.
    */
    expect(targetHref({ kind: "WORKFORCE_INVITATION", id: "inv-1" })).toBe(
      "/work/enquiries/inv-1",
    );
    expect(targetHref({ kind: "PROJECT_INVITATION", id: "inv-1" })).toBe(
      "/work/enquiries/inv-1",
    );
  });

  it("never composes a Partner path from a requirement id", () => {
    // The Partner's door into a customer request is the *invitation*, and an
    // invitation id is not a requirement id. Building
    // `/workforce/enquiries/{requirement_id}` resolves to a 404 at best.
    for (const held of [
      [WORKFORCE_WORKSPACE],
      [PROJECT_WORKSPACE],
      [WORKFORCE_WORKSPACE, PROJECT_WORKSPACE],
    ]) {
      expect(targetHref(REQUIREMENT, held)).toBeNull();
    }
  });

  it("opens invitation notices on the enquiry they actually refer to", () => {
    // The id is an invitation id and the route is keyed by one — that part was
    // always right and is unchanged. Only the path moved, off the redirect.
    expect(
      targetHref({ kind: "PROJECT_INVITATION", id: "invite-1" }, [
        WORKFORCE_WORKSPACE,
        PROJECT_WORKSPACE,
      ]),
    ).toBe("/work/enquiries/invite-1");
    expect(
      targetHref({ kind: "WORKFORCE_INVITATION", id: "invite-2" }, [
        WORKFORCE_WORKSPACE,
        PROJECT_WORKSPACE,
      ]),
    ).toBe("/work/enquiries/invite-2");
  });

  it("opens a crew offer notice on the offer's own screen", () => {
    // The id is the invitation id — the same key `work-item.ts`'s
    // `CREW_OFFER_HREF` composes — and the offer is on a two-minute clock, so
    // the notice has to land on the accept button, not on the stack.
    expect(targetHref({ kind: "CREW_OFFER", id: "inv-9" })).toBe("/work/offers/inv-9");
    expect(targetHref({ kind: "CREW_OFFER", id: "inv-9" }, [WORKFORCE_WORKSPACE])).toBe(
      "/work/offers/inv-9",
    );
  });

  it("leads nowhere for a kind this build has never heard of", () => {
    // `kind` is published as a bare string, so a future target type reaches this
    // bundle as an unknown word. Nothing is the honest rendering.
    expect(targetHref({ kind: "PAYOUT", id: "pay-1" }, [WORKFORCE_WORKSPACE])).toBeNull();
  });
});
