import { createTranslator } from "@vsolve/ui";
import { describe, expect, it } from "vitest";

import type { GateStatus } from "./wire";
import { blockingGate, describeGate, explainBlock, outstandingGates, parseGates } from "./gates";
import { catalogs } from "@/i18n/catalogs";

const t = createTranslator("en-IN", catalogs["en-IN"]).t;

/**
 * Progressive gates: browse freely, prove at the moment of the action.
 *
 * Closes the gate half of `M2-FE-114`.
 *
 * The fixtures here are the only place these shapes appear as values. Nothing in
 * application code holds one — with no endpoint, a screen shows its real loading
 * state and then its real error state.
 */

const KYC: GateStatus = {
  gate: "KYC",
  is_satisfied: false,
  blocks: ["enquiry.accept"],
  reason: "We check identity before you accept your first job, so customers know who is coming.",
  next_action: "SUBMIT_APPLICATION",
};

const PAYOUT: GateStatus = {
  gate: "PAYOUT_DETAILS",
  is_satisfied: false,
  blocks: ["payout.receive"],
  reason: "We need a verified bank account before money can leave Vsolve.",
  next_action: "ADD_PAYOUT_ACCOUNT",
};

const CREW: GateStatus = {
  gate: "CREW_ROSTER",
  is_satisfied: false,
  blocks: ["crew.assign"],
  reason: "Add the people you are sending before you assign them to a day.",
  next_action: "ADD_CREW_MEMBER",
};

const ALL = [KYC, PAYOUT, CREW];

describe("browsing is never gated", () => {
  it("blocks no read action even with every gate outstanding", () => {
    // `FLOW-06`: supply is the scarce side. A Partner browses masked demand
    // after phone, name, one service and one city, and no gate may stand before
    // that. These are the actions a browsing screen performs.
    for (const action of ["enquiry.view", "demand.view", "workspace.view"]) {
      expect(blockingGate(ALL, action), `"${action}" was gated`).toBeNull();
    }
  });

  it("gates only the exact action it names", () => {
    expect(blockingGate(ALL, "enquiry.accept")?.gate).toBe("KYC");
    expect(blockingGate(ALL, "enquiry.decline")).toBeNull();
  });
});

describe("each gate blocks its own action", () => {
  it("blocks accepting without KYC", () => {
    expect(blockingGate(ALL, "enquiry.accept")?.gate).toBe("KYC");
  });

  it("blocks a payout without bank details", () => {
    expect(blockingGate(ALL, "payout.receive")?.gate).toBe("PAYOUT_DETAILS");
  });

  it("blocks a crew assignment without a roster", () => {
    expect(blockingGate(ALL, "crew.assign")?.gate).toBe("CREW_ROSTER");
  });

  it("does not block building the roster the gate is asking for", () => {
    // `crew.assign` and `crew.manage` share a namespace and only one needs a
    // roster. A prefix match would stop a Partner from doing the very thing that
    // clears the gate.
    expect(blockingGate(ALL, "crew.manage")).toBeNull();
  });

  it("stops blocking once the gate is satisfied", () => {
    const satisfied = ALL.map((gate) =>
      gate.gate === "KYC" ? { ...gate, is_satisfied: true } : gate,
    );
    expect(blockingGate(satisfied, "enquiry.accept")).toBeNull();
  });
});

describe("the explanation", () => {
  it("uses the server's sentence verbatim", () => {
    // 0013 §D1 requires the same string on the refusal. Two wordings for one
    // rule read as two rules.
    expect(describeGate(KYC, t)?.reason).toBe(KYC.reason);
  });

  it("carries a route and a label the frontend owns", () => {
    const explanation = describeGate(CREW, t);
    expect(explanation?.actionHref).toBe("/me/crew");
    expect(explanation?.actionLabel).toBeTruthy();
  });

  it("says something usable when the server sent no reason", () => {
    // A contract violation (0013 §D1 criterion 6). An empty paragraph reads as a
    // broken screen the Partner cannot act on.
    const explanation = describeGate({ ...KYC, reason: "   " }, t);
    expect(explanation?.reason.trim().length).toBeGreaterThan(0);
  });

  it("has nothing to say about a satisfied gate", () => {
    expect(describeGate({ ...KYC, is_satisfied: true }, t)).toBeNull();
  });

  it("returns null from explainBlock when nothing is in the way", () => {
    expect(explainBlock(ALL, "enquiry.view", t)).toBeNull();
  });
});

describe("parsing the payload", () => {
  it("keeps the three known gates", () => {
    expect(parseGates({ gates: ALL }).map((gate) => gate.gate)).toEqual([
      "KYC",
      "PAYOUT_DETAILS",
      "CREW_ROSTER",
    ]);
  });

  it("drops a gate this build has no control for", () => {
    // A newer deployment adding a fourth gate must not produce a demand the
    // Partner cannot act on. The command still refuses server-side.
    const parsed = parseGates({
      gates: [KYC, { ...KYC, gate: "BACKGROUND_CHECK" }],
    });
    expect(parsed).toHaveLength(1);
  });

  it("treats a missing satisfied flag as blocking", () => {
    // Fails closed. Over-explaining costs a sentence; wrongly reporting a gate
    // as met invites a Partner to press something that will refuse.
    const [parsed] = parseGates({ gates: [{ ...KYC, is_satisfied: undefined }] });
    expect(parsed?.is_satisfied).toBe(false);
  });

  it("drops an unrecognised next action rather than routing nowhere", () => {
    const [parsed] = parseGates({ gates: [{ ...KYC, next_action: "DO_A_BACKFLIP" }] });
    expect(parsed?.next_action).toBeNull();
    expect(describeGate(parsed!, t)?.actionHref).toBeNull();
  });

  it("survives a garbled payload without throwing", () => {
    expect(parseGates(null)).toEqual([]);
    expect(parseGates({ gates: "nope" })).toEqual([]);
    expect(parseGates({ gates: [null, 7, "x"] })).toEqual([]);
  });
});

describe("the outstanding list", () => {
  it("is only used to answer a question the Partner asked", () => {
    const satisfied = ALL.map((gate) => ({ ...gate, is_satisfied: gate.gate !== "KYC" }));
    expect(outstandingGates(satisfied).map((gate) => gate.gate)).toEqual(["KYC"]);
  });
});
