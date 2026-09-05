import { describe, expect, it } from "vitest";

import { crewGenderLabel, fillsNoGenderedSlot } from "./crew-gender";

/**
 * The two helpers the roster badge and the shift-day picker share.
 *
 * `fillsNoGenderedSlot` is the one worth pinning: three of the five values fill a headcount and no
 * gendered slot, and only one of them is blank. A future edit that treats "recorded" as
 * "countable" would pass every obvious test and be wrong for `OTHER` and `UNDISCLOSED`.
 */

describe("crewGenderLabel", () => {
  it("names every value the contract publishes", () => {
    expect(crewGenderLabel("MAN")).toBe("Man");
    expect(crewGenderLabel("WOMAN")).toBe("Woman");
    expect(crewGenderLabel("OTHER")).toBe("Other");
    expect(crewGenderLabel("UNDISCLOSED")).toBe("Prefers not to say");
  });

  it("calls a blank 'Not recorded' rather than leaving it nameless", () => {
    expect(crewGenderLabel("")).toBe("Not recorded");
  });
});

describe("fillsNoGenderedSlot", () => {
  it("is true for a blank, because nobody has asked", () => {
    expect(fillsNoGenderedSlot("")).toBe(true);
  });

  /**
   * The consequence a Partner is most likely to be surprised by. A worker who answered, and whose
   * answer was not one of the two the Customer's question offers, still cannot be counted toward
   * "three women" -- and that is a real cost to a real person, so the roster screen states it
   * rather than letting it surface at an assignment refusal.
   */
  it("is true for OTHER and UNDISCLOSED, which are recorded and still count toward neither", () => {
    expect(fillsNoGenderedSlot("OTHER")).toBe(true);
    expect(fillsNoGenderedSlot("UNDISCLOSED")).toBe(true);
  });

  it("is false only for the two the Customer can ask for", () => {
    expect(fillsNoGenderedSlot("MAN")).toBe(false);
    expect(fillsNoGenderedSlot("WOMAN")).toBe(false);
  });
});
