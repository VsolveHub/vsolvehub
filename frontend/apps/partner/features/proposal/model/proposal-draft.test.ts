import { describe, expect, it } from "vitest";

import {
  A3_COMPOSER_FIELDS,
  EMPTY_A3_DRAFT,
  EMPTY_A5_DRAFT,
  a3Total,
  a5Total,
  hasErrors,
  paiseToRupeeInput,
  readCount,
  rupeesToPaise,
  toA3Request,
  toA5Request,
  validateA3,
  validateA5,
  type A3Draft,
  type A5Draft,
} from "./proposal-draft";

/**
 * The two composers' arithmetic and refusals.
 *
 * Every validation below mirrors one in `apps/requirements/proposals.py` or
 * `ProposalCreateSerializer`. The client's copy exists to say what is wrong
 * *before* a vendor commits a price; the server's copy is what decides.
 */

function a3(overrides: Partial<A3Draft> = {}): A3Draft {
  return {
    ...EMPTY_A3_DRAFT,
    ratePaisePerWorkerDay: 90_000,
    minimumDays: 4,
    workerCount: 6,
    inclusions: ["Own tools"],
    taxBasis: "INCLUSIVE",
    ...overrides,
  };
}

function a5(overrides: Partial<A5Draft> = {}): A5Draft {
  return {
    ...EMPTY_A5_DRAFT,
    stages: [
      { title: "Preparation", deliverable: "Site cleared", amountPaise: 500_000, endsOn: null },
      { title: "Build", deliverable: "Structure up", amountPaise: 1_500_000, endsOn: null },
    ],
    taxBasis: "INCLUSIVE",
    ...overrides,
  };
}

describe("the A3 one-screen budget", () => {
  it("is five fields, and the list is the assertion", () => {
    // The flow-weight budget is a hard constraint, not a target. Rate, days and
    // inclusions are the budget's own three; headcount is forced by
    // `_assert_a3_shape` and tax basis by `ProposalCreateSerializer`. A sixth
    // entry here should fail review — and this test is what makes somebody look.
    expect(A3_COMPOSER_FIELDS).toEqual([
      "ratePaisePerWorkerDay",
      "minimumDays",
      "workerCount",
      "inclusions",
      "taxBasis",
    ]);
  });
});

describe("the A3 total", () => {
  it("is rate times days times headcount", () => {
    expect(a3Total(a3())).toBe(90_000 * 4 * 6);
  });

  it("is nothing at all while a field is missing", () => {
    // Zero reads as "free". A composer that shows one while a field is empty
    // has told the vendor something untrue about a quote in progress.
    expect(a3Total(a3({ minimumDays: null }))).toBeNull();
    expect(a3Total(a3({ ratePaisePerWorkerDay: null }))).toBeNull();
    expect(a3Total(a3({ workerCount: null }))).toBeNull();
  });

  it("refuses a non-positive input rather than producing a zero total", () => {
    expect(a3Total(a3({ workerCount: 0 }))).toBeNull();
  });
});

describe("the A5 total", () => {
  it("is the stage amounts added up", () => {
    expect(a5Total(a5())).toBe(2_000_000);
  });

  it("is nothing while a stage has no amount", () => {
    expect(
      a5Total(a5({ stages: [{ title: "One", deliverable: "", amountPaise: null, endsOn: null }] })),
    ).toBeNull();
  });

  it("is nothing when there are no stages", () => {
    // `_assert_a5_shape`: "A project quote needs at least one stage."
    expect(a5Total(a5({ stages: [] }))).toBeNull();
  });
});

describe("A3 validation", () => {
  it("passes a complete quote", () => {
    expect(hasErrors(validateA3(a3()))).toBe(false);
  });

  it("names each of the three fields `_assert_a3_shape` requires", () => {
    const errors = validateA3(EMPTY_A3_DRAFT);
    expect(errors.ratePaisePerWorkerDay).toBeDefined();
    expect(errors.minimumDays).toBeDefined();
    expect(errors.workerCount).toBeDefined();
  });

  it("requires the vendor to say what the rate covers", () => {
    const errors = validateA3(a3({ inclusions: ["  "] }));
    expect(errors.inclusions).toMatch(/what the rate covers/i);
  });

  it("requires a tax basis, because the customer compares on one", () => {
    expect(validateA3(a3({ taxBasis: null })).taxBasis).toBeDefined();
  });

  it("refuses tax larger than the total", () => {
    // Mirrors `ProposalCreateSerializer.validate`.
    const errors = validateA3(a3({ taxBasis: "EXCLUSIVE", taxPaise: 99_999_999 }));
    expect(errors.taxPaise).toMatch(/more than the quoted total/i);
  });
});

describe("A5 validation", () => {
  it("passes a complete quote", () => {
    expect(hasErrors(validateA5(a5()))).toBe(false);
  });

  it("requires at least one stage", () => {
    expect(validateA5(a5({ stages: [] })).stages).toMatch(/at least one stage/i);
  });

  it("requires every stage to carry an amount", () => {
    const errors = validateA5(
      a5({
        stages: [
          { title: "One", deliverable: "", amountPaise: 500_000, endsOn: null },
          { title: "Two", deliverable: "", amountPaise: null, endsOn: null },
        ],
      }),
    );
    expect(errors.stages).toMatch(/add up to your total/i);
  });

  it("requires every stage to be named", () => {
    const errors = validateA5(
      a5({
        stages: [
          { title: "One", deliverable: "", amountPaise: 500_000, endsOn: null },
          { title: "  ", deliverable: "", amountPaise: 500_000, endsOn: null },
        ],
      }),
    );
    expect(errors.stages).toMatch(/Name every stage/i);
  });
});

describe("what goes on the wire", () => {
  it("sends the computed total, never a typed one", () => {
    const body = toA3Request({ invitationId: "inv-1", draft: a3() });
    expect(body.total_paise).toBe(90_000 * 4 * 6);
  });

  it("never sends stages on a workforce quote", () => {
    // `_assert_a3_shape` refuses one that carries any: "A workforce quote does
    // not have project stages."
    const body = toA3Request({ invitationId: "inv-1", draft: a3() });
    expect(body.stages).toBeUndefined();
  });

  it("zeroes the tax when the price already includes it", () => {
    const body = toA3Request({
      invitationId: "inv-1",
      draft: a3({ taxBasis: "INCLUSIVE", taxPaise: 5_000 }),
    });
    expect(body.tax_paise).toBe(0);
  });

  it("drops blank inclusion lines rather than sending empty strings", () => {
    const body = toA3Request({
      invitationId: "inv-1",
      draft: a3({ inclusions: ["Own tools", "  ", ""] }),
    });
    expect(body.inclusions).toEqual(["Own tools"]);
  });

  it("sends stage amounts that reconcile with the total", () => {
    const body = toA5Request({ invitationId: "inv-1", draft: a5() });
    const stages = body.stages as { amount_paise: number }[];
    expect(stages.reduce((sum, stage) => sum + stage.amount_paise, 0)).toBe(body.total_paise);
  });

  it("refuses to build a request out of an incomplete draft", () => {
    // Reachable only past a missing guard, and the failure it prevents is a
    // real quote for no money.
    expect(() => toA3Request({ invitationId: "inv-1", draft: EMPTY_A3_DRAFT })).toThrow();
    expect(() => toA5Request({ invitationId: "inv-1", draft: EMPTY_A5_DRAFT })).toThrow();
  });

  it("does not send a commission treatment it invented", () => {
    // `commission_treatment` is a 24-character free field with no published
    // vocabulary and no M2 policy behind it. A made-up code would be compared
    // against codes other clients made up differently.
    const body = toA3Request({ invitationId: "inv-1", draft: a3() });
    expect(body.commission_treatment).toBeUndefined();
  });
});

describe("money entry", () => {
  it("converts rupees to paise", () => {
    expect(rupeesToPaise("900")).toBe(90_000);
    expect(rupeesToPaise("1,250")).toBe(125_000);
  });

  it("rounds rather than truncating, so half a rupee is not lost", () => {
    expect(rupeesToPaise("1250.5")).toBe(125_050);
  });

  it("returns nothing for what is not a price", () => {
    expect(rupeesToPaise("")).toBeNull();
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("nine hundred")).toBeNull();
  });

  it("round-trips back to a rupee string", () => {
    expect(paiseToRupeeInput(90_000)).toBe("900");
    expect(paiseToRupeeInput(null)).toBe("");
  });

  it("reads a count only when it is a positive whole number", () => {
    expect(readCount("6")).toBe(6);
    expect(readCount("0")).toBeNull();
    expect(readCount("2.5")).toBeNull();
    expect(readCount("")).toBeNull();
  });
});
