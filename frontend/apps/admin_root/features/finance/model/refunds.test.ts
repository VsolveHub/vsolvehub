import { describe, expect, it } from "vitest";

import {
  MAX_UNITS,
  RECONCILIATION_LABEL,
  STATUS_LABEL,
  STATUS_MEANING,
  isOutcomeUnknown,
  parseUnitIds,
  validateRefund,
  type RefundDraft,
} from "./refunds";
import { refund } from "../../shared/fixtures";

/**
 * What Finance may say about a refund.
 *
 * The one sentence this module exists to prevent is "refunded" over a refund
 * that Django has only accepted. `POST /finance/refunds/` answers `202` with a
 * `REQUESTED` refund; `submit_refund` reaches the provider afterwards and the
 * provider decides. An operator who reads "done" at that moment tells a Customer
 * their money is on the way, and the next operator issues it again.
 */

const ORDER = "20202020-2020-4020-8020-202020202020";
const UNIT_A = "21212121-2121-4121-8121-212121212121";
const UNIT_B = "22222222-2222-4222-8222-222222222299";

function draft(overrides: Partial<RefundDraft> = {}): RefundDraft {
  return {
    orderId: ORDER,
    unitIds: UNIT_A,
    reasonCode: "service-not-delivered",
    ...overrides,
  };
}

describe("nothing claims the money moved before it did", () => {
  it("describes a requested refund as not yet sent anywhere", () => {
    expect(STATUS_LABEL.REQUESTED).not.toMatch(/refunded|paid|complete/i);
    expect(STATUS_MEANING.REQUESTED).toMatch(/no money has moved/i);
  });

  it("reserves the settled wording for the provider's own confirmation", () => {
    expect(STATUS_MEANING.SUCCEEDED).toMatch(/provider confirmed/i);
  });

  it("says a failed refund returned nothing to the Customer", () => {
    expect(STATUS_MEANING.FAILED).toMatch(/nothing was returned/i);
  });

  it("tells an operator not to issue a second refund when the outcome is unknown", () => {
    // The expensive mistake this whole surface guards against.
    expect(STATUS_MEANING.UNDER_REVIEW).toMatch(/do not issue another refund/i);
  });
});

describe("the outcome-unknown question, answered once", () => {
  it("is true for every state before the provider has settled it", () => {
    for (const status of ["REQUESTED", "SUBMITTED", "PROCESSING", "UNDER_REVIEW"] as const) {
      expect(isOutcomeUnknown(refund({ status })), status).toBe(true);
    }
  });

  it("is false once the provider has answered either way", () => {
    expect(isOutcomeUnknown(refund({ status: "SUCCEEDED" }))).toBe(false);
    expect(isOutcomeUnknown(refund({ status: "FAILED" }))).toBe(false);
  });
});

describe("reconciliation is a second, independent fact", () => {
  it("has its own words, so a successful refund can still not balance", () => {
    // `SUCCEEDED` + `NEEDS_ATTENTION` is real: the money moved and the books do
    // not agree. Collapsing the two into one badge hides the case Finance
    // exists to catch.
    expect(RECONCILIATION_LABEL.NEEDS_ATTENTION).toMatch(/does not match the provider/i);
    expect(RECONCILIATION_LABEL.IN_SYNC).not.toBe(STATUS_LABEL.SUCCEEDED);
  });
});

describe("what the client checks before spending a request", () => {
  it("accepts a well-formed refund", () => {
    expect(validateRefund(draft())).toEqual({});
  });

  it("takes ids one per line, and tolerates commas and blank lines", () => {
    expect(parseUnitIds(`${UNIT_A}\n\n  ${UNIT_B} ,\n`)).toEqual([UNIT_A, UNIT_B]);
  });

  it("refuses an empty visit list rather than sending one", () => {
    expect(validateRefund(draft({ unitIds: "   " })).unitIds).toMatch(/at least one visit/i);
  });

  it("refuses more visits than Django will take", () => {
    const many = Array.from({ length: MAX_UNITS + 1 }, (_, index) =>
      `${index.toString().padStart(8, "0")}-2121-4121-8121-212121212121`,
    ).join("\n");

    expect(validateRefund(draft({ unitIds: many })).unitIds).toMatch(/split it/i);
  });

  it("catches the same visit listed twice", () => {
    // Django would refund it once; the operator would have meant two.
    expect(validateRefund(draft({ unitIds: `${UNIT_A}\n${UNIT_A}` })).unitIds).toMatch(
      /listed twice/i,
    );
  });

  it("catches an id that is not an id", () => {
    expect(validateRefund(draft({ unitIds: `${UNIT_A}\nnot-a-uuid` })).unitIds).toMatch(
      /not a fulfilment unit id/i,
    );
  });

  it("holds the reason code to Django's character set", () => {
    expect(validateRefund(draft({ reasonCode: "service not delivered" })).reasonCode).toMatch(
      /no spaces/i,
    );
    expect(validateRefund(draft({ reasonCode: "a".repeat(81) })).reasonCode).toBeTruthy();
    expect(validateRefund(draft({ reasonCode: "goodwill_2026" }))).toEqual({});
  });

  it("checks nothing it would have to guess at", () => {
    // Whether the Order exists, whether the units belong to it, whether payment
    // was captured and whether anything is left to refund are all server facts
    // with named refusals. Guessing would block legitimate refunds.
    expect(validateRefund(draft())).toEqual({});
  });
});
