// Ported from frontend/apps/partner/features/enquiry/model/requirement-facts.test.ts

import {
  budgetLine,
  formatAnswerValue,
  labelForCode,
  readAnswers,
  readDurationDays,
  readHeadcount,
  requirementFacts,
  unreadableAnswerCount,
} from "./requirement-facts";

/**
 * Reading a snapshot the client has no schema for.
 *
 * `EnquiryDetail.answers` arrives as `unknown` keyed by question codes the
 * Partner surface never receives a schema for. The property under test
 * throughout is that this module prints what the server sent and invents
 * nothing — no defaults for absent keys, no guessed units, no paraphrase of a
 * structure it does not understand.
 */

describe("narrowing the wire's unknown", () => {
  it("accepts an object", () => {
    expect(readAnswers({ worker_count: 6 })).toEqual({ worker_count: 6 });
  });

  it("treats anything else as no answers rather than throwing", () => {
    // A screen that crashes on a payload shape is worse than one that renders
    // the honest "no structured answers" state.
    expect(readAnswers(null)).toEqual({});
    expect(readAnswers(undefined)).toEqual({});
    expect(readAnswers("six")).toEqual({});
    expect(readAnswers([1, 2])).toEqual({});
  });
});

describe("the two codes the domain itself reads by name", () => {
  it("reads the headcount the customer asked for", () => {
    // `evaluate_candidates` compares this against the roster size, and
    // `accept_invitation` writes it onto the capacity hold.
    expect(readHeadcount({ worker_count: 6 })).toBe(6);
    expect(readHeadcount({ worker_count: "6" })).toBe(6);
  });

  it("reads the duration the capacity hold spans", () => {
    // `matching._requested_days` uses exactly this key.
    expect(readDurationDays({ duration_days: 4 })).toBe(4);
  });

  it("returns nothing rather than a default when the customer did not say", () => {
    // A default of 1 would prefill a composer with a headcount nobody asked
    // for, and the vendor would quote against it.
    expect(readHeadcount({})).toBeNull();
    expect(readDurationDays({})).toBeNull();
  });

  it("rejects values that are not positive whole counts", () => {
    expect(readHeadcount({ worker_count: 0 })).toBeNull();
    expect(readHeadcount({ worker_count: -3 })).toBeNull();
    expect(readHeadcount({ worker_count: 2.5 })).toBeNull();
    expect(readHeadcount({ worker_count: "many" })).toBeNull();
  });
});

describe("labels", () => {
  it("de-slugs a code without renaming it", () => {
    expect(labelForCode("site_access")).toBe("Site access");
    expect(labelForCode("shift-window")).toBe("Shift window");
  });
});

describe("values", () => {
  it("renders the primitives the customer actually sends", () => {
    expect(formatAnswerValue("Service lift")).toBe("Service lift");
    expect(formatAnswerValue(6)).toBe("6");
    expect(formatAnswerValue(true)).toBe("Yes");
    expect(formatAnswerValue(false)).toBe("No");
    expect(formatAnswerValue(["Mop", "Bucket"])).toBe("Mop, Bucket");
  });

  it("refuses to paraphrase a structure it does not understand", () => {
    // A nested object rendered as `[object Object]` or a JSON dump is worse
    // than an honest "this screen cannot show it" — the vendor is about to
    // price against it.
    expect(formatAnswerValue({ floors: 2 })).toBeNull();
    expect(formatAnswerValue(null)).toBeNull();
    expect(formatAnswerValue("   ")).toBeNull();
    expect(formatAnswerValue([])).toBeNull();
  });
});

describe("the fact list", () => {
  it("keeps the server's own ordering", () => {
    // The question schema decides what a vendor reads first. Re-sorting would
    // put this client in charge of an ordering the catalogue owns.
    const facts = requirementFacts({ zebra: "last", alpha: "first" });
    expect(facts.map((fact) => fact.code)).toEqual(["zebra", "alpha"]);
  });

  it("drops what it cannot render and counts it instead", () => {
    const answers = { worker_count: 6, layout: { floors: 2 } };
    expect(requirementFacts(answers)).toHaveLength(1);
    expect(unreadableAnswerCount(answers)).toBe(1);
  });
});

describe("the budget line", () => {
  it("shows a band when both ends are given", () => {
    expect(budgetLine(1_000_00, 4_000_00)).toBe("₹1,000 – ₹4,000");
  });

  it("shows a one-sided budget rather than nothing", () => {
    // A ceiling with no floor is the common case, and `classify_usability`
    // compares against the ceiling alone — a vendor who cannot see it is
    // quoting blind into an OUT_OF_BUDGET label.
    expect(budgetLine(null, 4_000_00)).toBe("Up to ₹4,000");
    expect(budgetLine(1_000_00, null)).toBe("From ₹1,000");
  });

  it("shows nothing when the customer stated no budget", () => {
    expect(budgetLine(null, null)).toBeNull();
  });
});
