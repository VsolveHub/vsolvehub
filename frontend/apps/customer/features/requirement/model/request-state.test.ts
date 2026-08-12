import { describe, expect, it } from "vitest";

import {
  isClosedState,
  isOurFailure,
  requestState,
  showsQuoteDeadline,
} from "./request-state";

/**
 * `M2-FE-215`. The one derived state, and the two things it must never become.
 */

describe("the delayed-match state", () => {
  it("stays 'finding professionals' while the promise is still live", () => {
    expect(requestState({ status: "MATCHING", quoteDeadlineRemainingMs: 3_600_000 })).toBe(
      "MATCHING",
    );
  });

  it("becomes delayed the moment the promise passes", () => {
    expect(requestState({ status: "MATCHING", quoteDeadlineRemainingMs: 0 })).toBe(
      "MATCHING_DELAYED",
    );
    expect(requestState({ status: "MATCHING", quoteDeadlineRemainingMs: -1 })).toBe(
      "MATCHING_DELAYED",
    );
  });

  it("never claims the SLA is breached", () => {
    // The distinction the whole module exists for. `CLOSED_SLA_BREACH` is a
    // server transition with a refund attached; a client-side countdown may not
    // assert it, however far past the deadline it gets.
    const wayPast = requestState({ status: "MATCHING", quoteDeadlineRemainingMs: -86_400_000 });

    expect(wayPast).toBe("MATCHING_DELAYED");
    expect(wayPast).not.toBe("CLOSED_SLA_BREACH");
  });

  it("leaves a requirement with no deadline exactly as the server described it", () => {
    expect(requestState({ status: "MATCHING", quoteDeadlineRemainingMs: null })).toBe("MATCHING");
  });

  it("never derives a delay for a status that has moved on", () => {
    // A deadline that lapsed while quotes were already in is history, not a
    // problem. Only `MATCHING` can be late.
    for (const status of ["QUOTES_READY", "UNLOCKED", "SELECTED", "ENGAGED"] as const) {
      expect(requestState({ status, quoteDeadlineRemainingMs: -1 }), status).toBe(status);
    }
  });

  it("passes every closed status straight through", () => {
    for (const status of [
      "CLOSED_NO_SUPPLY",
      "CLOSED_SLA_BREACH",
      "CLOSED_EXPIRED",
      "CLOSED_ABANDONED",
      "CLOSED_COMPLETE",
      "CLOSED_CANCELLED",
    ] as const) {
      expect(requestState({ status, quoteDeadlineRemainingMs: -1 }), status).toBe(status);
      expect(isClosedState(status), status).toBe(true);
    }
  });
});

describe("what a state is allowed to show", () => {
  it("only counts down while the promise can still be kept", () => {
    expect(showsQuoteDeadline("MATCHING")).toBe(true);
    // A negative countdown on a broken promise reads as a debt being paid off,
    // and on a closed request it counts down to something that already failed.
    expect(showsQuoteDeadline("MATCHING_DELAYED")).toBe(false);
    expect(showsQuoteDeadline("CLOSED_SLA_BREACH")).toBe(false);
  });

  it("leads to support only where we are the reason there is nothing to show", () => {
    expect(isOurFailure("MATCHING_DELAYED")).toBe(true);
    expect(isOurFailure("CLOSED_SLA_BREACH")).toBe(true);
    // Nobody covering the work yet is a fact about the market. Routing it to
    // support would waste the Customer's call.
    expect(isOurFailure("CLOSED_NO_SUPPLY")).toBe(false);
    expect(isOurFailure("CLOSED_EXPIRED")).toBe(false);
    expect(isOurFailure("MATCHING")).toBe(false);
  });

  it("does not treat a live requirement as closed", () => {
    for (const state of ["DRAFT", "MATCHING", "MATCHING_DELAYED", "QUOTES_READY", "UNLOCKED", "SELECTED", "ENGAGED"] as const) {
      expect(isClosedState(state), state).toBe(false);
    }
  });
});
