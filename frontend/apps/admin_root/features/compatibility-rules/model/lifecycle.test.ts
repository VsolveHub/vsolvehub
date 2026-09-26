import { describe, expect, it } from "vitest";

import { OPERATOR_ID, PROPOSER_ID, rule } from "@/features/shared/fixtures";
import {
  availableActions,
  isAwaitingAnotherReviewer,
  isOwnProposal,
  isReasonAcceptable,
  validateDraft,
  type DraftInput,
} from "./lifecycle";

/**
 * Maker-checker, as the console must implement it.
 *
 * Django enforces separation of duties twice — `_validate_activation` refuses
 * `created_by_id == actor.id`, and the `carts_compatibility_maker_checker`
 * database constraint refuses the row even if the service is bypassed. These
 * tests exist so the console agrees with both, and specifically so the *absence*
 * of the affordance is a tested property rather than an emergent one. A disabled
 * Approve button would pass a "cannot approve" assertion written carelessly and
 * still invite a second attempt through a refresh or a stale tab.
 */

describe("who proposed it", () => {
  it("does not treat an unseeded rule as everybody's own proposal", () => {
    // `created_by_id` is null for rules that predate the lifecycle. Comparing
    // null to null would make every one of them permanently un-reviewable.
    expect(isOwnProposal(rule({ created_by_id: null }), { actorId: null })).toBe(false);
    expect(isOwnProposal(rule({ created_by_id: null }), { actorId: OPERATOR_ID })).toBe(false);
  });

  it("matches only on a real id on both sides", () => {
    expect(isOwnProposal(rule({ created_by_id: OPERATOR_ID }), { actorId: OPERATOR_ID })).toBe(
      true,
    );
    expect(isOwnProposal(rule({ created_by_id: PROPOSER_ID }), { actorId: OPERATOR_ID })).toBe(
      false,
    );
  });
});

describe("the proposer is never offered the decision", () => {
  it("gives a second reviewer both decisions on a draft", () => {
    const actions = availableActions(rule({ created_by_id: PROPOSER_ID }), {
      actorId: OPERATOR_ID,
    });

    expect(actions.map((action) => action.command)).toEqual(["activate", "reject"]);
  });

  it("removes both decisions for the person who proposed it", () => {
    const actions = availableActions(rule({ created_by_id: OPERATOR_ID }), {
      actorId: OPERATOR_ID,
    });

    expect(actions).toEqual([]);
  });

  it("fails closed while the signed-in user is still unknown", () => {
    // A null actor cannot be *shown* to be someone other than the proposer.
    // Withholding costs a reviewer one render; failing open shows the proposer
    // their own Activate button.
    expect(availableActions(rule({ created_by_id: PROPOSER_ID }), { actorId: null })).toEqual([]);
  });

  it("still offers Retire to the proposer of an active rule", () => {
    // A rule can only be ACTIVE because a second person activated it, so the
    // separation already happened. Gating Retire here would strand a bad rule
    // with nobody able to pull it.
    const actions = availableActions(
      rule({ lifecycle_status: "ACTIVE", created_by_id: OPERATOR_ID }),
      { actorId: OPERATOR_ID },
    );

    expect(actions.map((action) => action.command)).toEqual(["retire"]);
  });

  it("offers nothing on a terminal rule, to anyone", () => {
    for (const status of ["RETIRED", "REJECTED"] as const) {
      expect(
        availableActions(rule({ lifecycle_status: status }), { actorId: OPERATOR_ID }),
      ).toEqual([]);
    }
  });
});

describe("a draft with no actions still has to explain itself", () => {
  it("says the proposer's own draft is waiting on somebody else", () => {
    expect(
      isAwaitingAnotherReviewer(rule({ created_by_id: OPERATOR_ID }), { actorId: OPERATOR_ID }),
    ).toBe(true);
  });

  it("does not claim that about a rule that has already been decided", () => {
    expect(
      isAwaitingAnotherReviewer(
        rule({ lifecycle_status: "ACTIVE", created_by_id: OPERATOR_ID }),
        { actorId: OPERATOR_ID },
      ),
    ).toBe(false);
  });
});

describe("reasons Django will accept", () => {
  it("counts the trimmed length, not the typed one", () => {
    expect(isReasonAcceptable("         short         ")).toBe(false);
    expect(isReasonAcceptable(`${" ".repeat(20)}ten chars!${" ".repeat(20)}`)).toBe(true);
  });

  it("refuses one over Django's 500-character limit", () => {
    expect(isReasonAcceptable("a".repeat(500))).toBe(true);
    expect(isReasonAcceptable("a".repeat(501))).toBe(false);
  });
});

describe("what a draft can be refused for before it is sent", () => {
  const valid: DraftInput = {
    leftVariantId: "44444444-4444-4444-8444-444444444444",
    rightVariantId: "55555555-5555-4555-8555-555555555555",
    mode: "SAME_PARTNER_SEQUENTIAL",
    dependency: "LEFT_BEFORE_RIGHT",
    effectiveFrom: "2026-09-01T00:00",
    effectiveTo: "",
    changeReason: "Cleaning after a repair leaves the room usable.",
  };

  it("accepts a complete draft", () => {
    expect(validateDraft(valid)).toEqual({});
  });

  it("refuses a rule about one service and itself, whatever the casing", () => {
    const errors = validateDraft({
      ...valid,
      rightVariantId: valid.leftVariantId.toUpperCase(),
    });

    expect(errors.rightVariantId).toMatch(/two different services/i);
  });

  it("refuses parallel work that also has an order", () => {
    // Django refuses this pairing outright, so saying it here saves a round trip
    // that can only ever fail.
    const errors = validateDraft({ ...valid, mode: "PARALLEL_ALLOWED" });

    expect(errors.dependency).toMatch(/cannot also have an order/i);
    expect(validateDraft({ ...valid, mode: "PARALLEL_ALLOWED", dependency: "NONE" })).toEqual({});
  });

  it("refuses an end that does not come after the start", () => {
    expect(
      validateDraft({ ...valid, effectiveTo: valid.effectiveFrom }).effectiveTo,
    ).toMatch(/after the start/i);
  });

  it("checks nothing it would have to guess at", () => {
    // Whether a variant exists, is active, or already has an overlapping active
    // rule are all server facts. Guessing at them here would refuse valid
    // proposals; they arrive as named refusal reasons instead.
    const errors = validateDraft(valid);
    expect(Object.keys(errors)).toEqual([]);
  });
});
