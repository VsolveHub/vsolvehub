import { describe, expect, it } from "vitest";

import {
  OPTIONAL_DETAIL_DEFAULTS,
  OPTIONAL_NOTE_MAX,
  firstInvalidOptionalDetail,
  isOptionalDetailSet,
  readOptionalDetail,
  validateOptionalDetail,
} from "./optional-details";
import { OPTIONAL_DETAILS } from "./screens";
import { blockedReason, initialDraftState } from "./state";

/**
 * `M2-FE-207`. The rules that decide what the review screen says the Customer
 * asked for, and the one rule that stops a half-said constraint being sent.
 */

describe("reading the optional-details bag", () => {
  it("returns a usable value for a key that was never written", () => {
    expect(readOptionalDetail({}, "callback_preference")).toEqual(
      OPTIONAL_DETAIL_DEFAULTS.callback_preference,
    );
    expect(readOptionalDetail({}, "access_constraints").constraints).toEqual([]);
  });

  it("falls back field by field rather than discarding the whole value", () => {
    // A bag written by an older build, or hand-edited in devtools. The good half
    // survives — losing a paragraph of access notes because a sibling key went
    // bad is the failure this normalisation exists to prevent.
    const bag = { access_constraints: { constraints: "not an array", note: "Gate code 4412" } };

    expect(readOptionalDetail(bag, "access_constraints")).toEqual({
      constraints: [],
      note: "Gate code 4412",
    });
  });

  it("drops codes it does not recognise and deduplicates the rest", () => {
    const bag = {
      access_constraints: { constraints: ["NO_LIFT", "NO_LIFT", "TELEPORTER"], note: "" },
    };

    expect(readOptionalDetail(bag, "access_constraints").constraints).toEqual(["NO_LIFT"]);
  });

  it("caps a restored note at the same length the control enforces", () => {
    const bag = { site_visit_interest: { requested: true, note: "x".repeat(1000) } };

    expect(readOptionalDetail(bag, "site_visit_interest").note).toHaveLength(OPTIONAL_NOTE_MAX);
  });

  it("survives a bag whose value is not an object at all", () => {
    for (const key of OPTIONAL_DETAILS) {
      expect(() => readOptionalDetail({ [key]: null }, key)).not.toThrow();
      expect(() => readOptionalDetail({ [key]: 7 }, key)).not.toThrow();
    }
  });
});

describe("whether the Customer actually said something", () => {
  it("is false for every panel on an untouched draft", () => {
    for (const key of OPTIONAL_DETAILS) {
      expect(isOptionalDetailSet({}, key), key).toBe(false);
    }
  });

  it("is false for a panel opened and closed without a choice", () => {
    // Three of the four open on a default. Reporting that default back as an
    // answer would be the screen telling the Customer they asked for a call
    // they never asked for.
    const bag = {
      callback_preference: OPTIONAL_DETAIL_DEFAULTS.callback_preference,
      preferred_communication: OPTIONAL_DETAIL_DEFAULTS.preferred_communication,
    };

    expect(isOptionalDetailSet(bag, "callback_preference")).toBe(false);
    expect(isOptionalDetailSet(bag, "preferred_communication")).toBe(false);
  });

  it("is true once a channel other than the default is chosen", () => {
    expect(isOptionalDetailSet({ preferred_communication: { channel: "WHATSAPP" } }, "preferred_communication")).toBe(
      true,
    );
  });

  it("counts a note on its own, with no box ticked", () => {
    expect(
      isOptionalDetailSet({ access_constraints: { constraints: [], note: "Ask for Sunil" } }, "access_constraints"),
    ).toBe(true);
    expect(
      isOptionalDetailSet({ site_visit_interest: { requested: false, note: "Side gate" } }, "site_visit_interest"),
    ).toBe(true);
  });

  it("does not count whitespace as a note", () => {
    expect(
      isOptionalDetailSet({ access_constraints: { constraints: [], note: "   \n " } }, "access_constraints"),
    ).toBe(false);
  });
});

describe("the restricted-hours rule", () => {
  it("refuses restricted hours with nothing said about which hours", () => {
    const bag = { access_constraints: { constraints: ["RESTRICTED_HOURS"], note: "" } };

    expect(validateOptionalDetail(bag, "access_constraints")).toBe("RESTRICTED_HOURS_NEED_DETAIL");
    expect(firstInvalidOptionalDetail(bag)).toBe("access_constraints");
  });

  it("accepts it once the hours are described", () => {
    const bag = {
      access_constraints: { constraints: ["RESTRICTED_HOURS"], note: "Nothing noisy before 9am" },
    };

    expect(validateOptionalDetail(bag, "access_constraints")).toBeNull();
    expect(firstInvalidOptionalDetail(bag)).toBeNull();
  });

  it("leaves every other constraint alone", () => {
    const bag = { access_constraints: { constraints: ["NO_LIFT", "PETS_ON_SITE"], note: "" } };

    expect(firstInvalidOptionalDetail(bag)).toBeNull();
  });

  it("finds nothing wrong with a draft that never opened a panel", () => {
    expect(firstInvalidOptionalDetail({})).toBeNull();
  });
});

describe("the submit guard on review", () => {
  const TODAY = "2026-08-11";

  function reviewReady() {
    return {
      ...initialDraftState("housekeeping-staff"),
      screen: "review" as const,
      addressId: "addr-1",
      serviceBy: "2026-08-24",
    };
  }

  it("does not block a Customer who left all four extras alone", () => {
    expect(blockedReason(reviewReady(), TODAY)).toBeNull();
  });

  it("blocks a half-said access constraint, and says which kind of problem it is", () => {
    const state = {
      ...reviewReady(),
      optionalDetails: { access_constraints: { constraints: ["RESTRICTED_HOURS"], note: "" } },
    };

    expect(blockedReason(state, TODAY)).toBe("OPTIONAL_DETAIL_INCOMPLETE");
  });

  it("unblocks as soon as the constraint is described or removed", () => {
    const described = {
      ...reviewReady(),
      optionalDetails: {
        access_constraints: { constraints: ["RESTRICTED_HOURS"], note: "Weekdays after 10am" },
      },
    };
    const removed = { ...reviewReady(), optionalDetails: { access_constraints: { constraints: [], note: "" } } };

    expect(blockedReason(described, TODAY)).toBeNull();
    expect(blockedReason(removed, TODAY)).toBeNull();
  });

  it("reports the earlier problem first when the requirement itself is incomplete", () => {
    // An optional extra must never mask a missing address. It is checked last
    // for exactly this reason.
    const state = {
      ...reviewReady(),
      addressId: null,
      optionalDetails: { access_constraints: { constraints: ["RESTRICTED_HOURS"], note: "" } },
    };

    expect(blockedReason(state, TODAY)).toBe("ADDRESS_NOT_CHOSEN");
  });
});
