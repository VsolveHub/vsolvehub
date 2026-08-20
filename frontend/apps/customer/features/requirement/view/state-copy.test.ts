import { describe, expect, it } from "vitest";

import { splitLede } from "../model/request-state";
import { REQUEST_STATE_COPY } from "./request-state";

/**
 * The state table, checked against the way the detail screen renders it.
 *
 * ## The bug these guard
 *
 * The request detail shows a state's first sentence large and the rest of it
 * underneath. That was briefly two hand-written strings per state, and three of
 * the fourteen had a `headline` written identically to their own `explanation`
 * — so a booked request rendered "The professional confirmed. The work is
 * arranged." in 20px bold and then again, verbatim, in 14px grey directly
 * beneath. Four more repeated it as a prefix.
 *
 * There is one string now and the split is computed, which makes the duplicate
 * unrepresentable rather than merely fixed. These tests hold that property
 * down, because the failure is silent: nothing throws, the page just says
 * everything twice.
 */
describe("splitLede", () => {
  it("takes the first sentence and leaves the rest", () => {
    expect(splitLede("One thing happened. Then another did.")).toEqual({
      lede: "One thing happened.",
      rest: "Then another did.",
    });
  });

  it("returns no remainder when the text is a single sentence", () => {
    // This is the exact case that used to render twice.
    expect(splitLede("This request was cancelled.")).toEqual({
      lede: "This request was cancelled.",
      rest: "",
    });
  });

  it("keeps every sentence after the first together", () => {
    const { lede, rest } = splitLede("First. Second. Third.");
    expect(lede).toBe("First.");
    expect(rest).toBe("Second. Third.");
  });

  it("does not cut on a full stop that is not a sentence boundary", () => {
    // A lower-case word after the stop is an abbreviation, not a new sentence.
    // Splitting here would put "500 was refunded." in the headline slot.
    expect(splitLede("We refunded Rs. 500 to you. It clears in five days.")).toEqual({
      lede: "We refunded Rs. 500 to you.",
      rest: "It clears in five days.",
    });
  });

  it("tolerates surrounding whitespace", () => {
    expect(splitLede("  Only this.  ")).toEqual({ lede: "Only this.", rest: "" });
  });
});

describe("REQUEST_STATE_COPY", () => {
  const states = Object.entries(REQUEST_STATE_COPY);

  it("never renders the same sentence twice on one card", () => {
    for (const [state, copy] of states) {
      const { lede, rest } = splitLede(copy.explanation);
      // `rest` is a suffix of the string `lede` came from, so this can only
      // fail if `splitLede` stops being a split — which is the regression.
      expect(rest, `${state} repeats its own lede`).not.toContain(lede);
    }
  });

  it("gives every state a lede that stands on its own", () => {
    for (const [state, copy] of states) {
      const { lede } = splitLede(copy.explanation);
      expect(lede.length, `${state} has an empty lede`).toBeGreaterThan(0);
      // A lede is the headline of the card. One that runs past a line and a
      // half stops being scannable, which is the whole reason it is split out.
      expect(lede.length, `${state} lede is too long to scan`).toBeLessThanOrEqual(110);
      expect(lede.endsWith("."), `${state} lede is not a whole sentence`).toBe(true);
    }
  });

  it("never restates the badge in the lede", () => {
    // The chip has already said "Quotes ready". A lede that opens with the same
    // words spends the reader's first line saying nothing new.
    for (const [state, copy] of states) {
      const { lede } = splitLede(copy.explanation);
      expect(
        lede.toLowerCase().startsWith(copy.label.toLowerCase()),
        `${state} lede opens by repeating its own badge`,
      ).toBe(false);
    }
  });

  it("keeps the next step out of the explanation", () => {
    // They are rendered in different places and different weights. A next step
    // duplicated inside the explanation is the same defect in a new field.
    for (const [state, copy] of states) {
      if (copy.nextStep === null) continue;
      expect(copy.explanation, `${state} repeats its next step`).not.toContain(copy.nextStep);
    }
  });
});
