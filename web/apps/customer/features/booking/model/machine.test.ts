import { describe, expect, it } from "vitest";

import { instantConflictsWithCart, workspaceReducer, type WorkspaceAction } from "./machine";
import {
  DURATION_ANSWER_KEY,
  blockedReason,
  canNavigateTo,
  durationOptions,
  initialState,
  isValidDuration,
  selectedDuration,
  type VariantRules,
  type WorkspaceState,
} from "./state";
import { sequenceContains, sequenceFor, STAGES_IMPLEMENTED_BY_B3 } from "./stages";

const rules: VariantRules = {
  variantId: "8a1f0c22-6d3e-4b71-9f52-1c0d7e4a9b83",
  variantCode: "standard",
  minimumDurationMinutes: 60,
  maximumDurationMinutes: 240,
  durationIncrementMinutes: 30,
  recommendedDurationMinutes: 90,
  requiredQuestionCodes: ["socket-count"],
};

const serviceableAddress = {
  id: "77777777-7777-4777-8777-777777777777",
  postalCode: "500072",
  isGeocoded: true,
  isServiceable: true,
};

function run(state: WorkspaceState, ...actions: WorkspaceAction[]): WorkspaceState {
  return actions.reduce(workspaceReducer, state);
}

/** A workspace configured and advanced to the point where sequences diverge. */
function atDurationComplete(fulfilment: "INSTANT" | "SCHEDULED"): WorkspaceState {
  return run(
    initialState("switch-socket-repair"),
    { type: "CONFIGURE", rules },
    { type: "SET_ADDRESS", address: serviceableAddress },
    { type: "ADVANCE" },
    { type: "SELECT_FULFILMENT", fulfilment },
    { type: "ADVANCE" },
    { type: "ANSWER", questionCode: "socket-count", value: 2 },
    { type: "ADVANCE" },
    { type: "SET_DURATION", minutes: 90 },
    { type: "ADVANCE" },
  );
}

describe("initial state", () => {
  it("preselects no booking type", () => {
    expect(initialState("x").fulfilment).toBeNull();
  });

  it("preselects no slot", () => {
    expect(initialState("x").slotId).toBeNull();
  });

  it("blocks leaving the type stage until a type is chosen", () => {
    const state = run(
      initialState("x"),
      { type: "CONFIGURE", rules },
      { type: "SET_ADDRESS", address: serviceableAddress },
      { type: "ADVANCE" },
    );
    expect(state.stage).toBe("type");
    expect(blockedReason(state)).toBe("FULFILMENT_NOT_CHOSEN");
  });
});

describe("address stage", () => {
  it("blocks on an unserviceable address rather than continuing", () => {
    const state = run(initialState("x"), {
      type: "SET_ADDRESS",
      address: { ...serviceableAddress, isServiceable: false },
    });
    expect(blockedReason(state)).toBe("ADDRESS_NOT_SERVICEABLE");
    expect(workspaceReducer(state, { type: "ADVANCE" }).stage).toBe("address");
  });

  it("invalidates slot, provider and hold when the address changes", () => {
    // Doc 03 §1. The regression this guards against is a hold surviving into a
    // booking for a different part of the city.
    const held: WorkspaceState = {
      ...atDurationComplete("SCHEDULED"),
      slotId: "slot_1",
      provider: { kind: "partner", partnerId: "p1" },
      holdId: "hold_1",
    };

    const moved = workspaceReducer(held, {
      type: "SET_ADDRESS",
      address: { ...serviceableAddress, id: "another-address", postalCode: "500081" },
    });

    expect(moved.slotId).toBeNull();
    expect(moved.provider).toBeNull();
    expect(moved.holdId).toBeNull();
  });

  it("keeps everything when the same address is set again", () => {
    const held: WorkspaceState = { ...atDurationComplete("SCHEDULED"), slotId: "slot_1" };
    const same = workspaceReducer(held, { type: "SET_ADDRESS", address: serviceableAddress });
    expect(same.slotId).toBe("slot_1");
    expect(same).toBe(held);
  });

  it("forgets visited stages whose answers were just discarded", () => {
    const reviewed = run(
      atDurationComplete("SCHEDULED"),
      { type: "SELECT_SLOT", slotId: "slot_1", isAvailable: true },
      { type: "ADVANCE" },
    );
    expect(reviewed.visited).toContain("slot");

    const moved = workspaceReducer(reviewed, {
      type: "SET_ADDRESS",
      address: { ...serviceableAddress, id: "elsewhere" },
    });
    expect(moved.visited).not.toContain("slot");
    expect(canNavigateTo(moved, "slot")).toBe(false);
  });
});

describe("scope stage", () => {
  it("blocks until every required question is answered", () => {
    const state = run(
      initialState("x"),
      { type: "CONFIGURE", rules },
      { type: "SET_ADDRESS", address: serviceableAddress },
      { type: "ADVANCE" },
      { type: "SELECT_FULFILMENT", fulfilment: "SCHEDULED" },
      { type: "ADVANCE" },
    );
    expect(state.stage).toBe("scope");
    expect(blockedReason(state)).toBe("REQUIRED_QUESTION_UNANSWERED");

    const answered = workspaceReducer(state, {
      type: "ANSWER",
      questionCode: "socket-count",
      value: 2,
    });
    expect(blockedReason(answered)).toBeNull();
  });

  it("treats blank text and empty selections as unanswered", () => {
    const base = run(
      initialState("x"),
      { type: "CONFIGURE", rules },
      { type: "SET_ADDRESS", address: serviceableAddress },
      { type: "ADVANCE" },
      { type: "SELECT_FULFILMENT", fulfilment: "SCHEDULED" },
      { type: "ADVANCE" },
    );

    for (const value of ["", "   ", []]) {
      const state = workspaceReducer(base, {
        type: "ANSWER",
        questionCode: "socket-count",
        value,
      });
      expect(blockedReason(state)).toBe("REQUIRED_QUESTION_UNANSWERED");
    }

    // `false` is a real answer to a BOOLEAN question, not an absent one.
    const answeredFalse = workspaceReducer(base, {
      type: "ANSWER",
      questionCode: "socket-count",
      value: false,
    });
    expect(blockedReason(answeredFalse)).toBeNull();
  });

  it("keeps notes when quantity changes", () => {
    // Doc 03 §3.
    const state = run(
      atDurationComplete("SCHEDULED"),
      { type: "SET_NOTES", notes: "Second bedroom." },
      { type: "SET_QUANTITY", quantity: 3 },
    );
    expect(state.notes).toBe("Second bedroom.");
    expect(state.quantity).toBe(3);
  });
});

describe("duration", () => {
  it("defaults to the configured recommendation, not to a hardcoded hour", () => {
    const state = workspaceReducer(initialState("x"), { type: "CONFIGURE", rules });
    expect(selectedDuration(state)).toBe(90);
  });

  it("does not overwrite a duration the customer already chose", () => {
    const state = run(
      initialState("x"),
      { type: "CONFIGURE", rules },
      { type: "SET_DURATION", minutes: 120 },
      { type: "CONFIGURE", rules },
    );
    expect(selectedDuration(state)).toBe(120);
  });

  it("rejects durations off the configured increment", () => {
    expect(isValidDuration(75, rules)).toBe(false);
    expect(isValidDuration(90, rules)).toBe(true);
  });

  it("rejects durations outside the configured bounds", () => {
    expect(isValidDuration(30, rules)).toBe(false);
    expect(isValidDuration(270, rules)).toBe(false);
  });

  it("offers only in-bounds options on the increment", () => {
    expect(durationOptions(rules)).toEqual([60, 90, 120, 150, 180, 210, 240]);
  });

  it("invalidates availability when the duration changes", () => {
    // A slot found for 90 minutes is not a slot for 150.
    const held: WorkspaceState = {
      ...atDurationComplete("SCHEDULED"),
      slotId: "slot_1",
      provider: { kind: "auto" },
      holdId: "hold_1",
    };
    const relengthened = workspaceReducer(held, { type: "SET_DURATION", minutes: 150 });
    expect(relengthened.slotId).toBeNull();
    expect(relengthened.provider).toBeNull();
    expect(relengthened.holdId).toBeNull();
  });

  it("ignores an ANSWER aimed at the reserved duration key", () => {
    const state = run(
      initialState("x"),
      { type: "CONFIGURE", rules },
      { type: "ANSWER", questionCode: DURATION_ANSWER_KEY, value: 9999 },
    );
    expect(selectedDuration(state)).toBe(90);
  });
});

describe("slot selection", () => {
  it("refuses to record an unavailable slot", () => {
    const state = workspaceReducer(atDurationComplete("SCHEDULED"), {
      type: "SELECT_SLOT",
      slotId: "slot_taken",
      isAvailable: false,
    });
    expect(state.slotId).toBeNull();
  });

  it("blocks progression while no slot is chosen", () => {
    const state = atDurationComplete("SCHEDULED");
    expect(state.stage).toBe("slot");
    expect(blockedReason(state)).toBe("SLOT_NOT_CHOSEN");
    expect(workspaceReducer(state, { type: "ADVANCE" }).stage).toBe("slot");
  });

  it("releases the provider and hold when a different slot is chosen", () => {
    const held: WorkspaceState = {
      ...atDurationComplete("SCHEDULED"),
      slotId: "slot_1",
      provider: { kind: "partner", partnerId: "p1" },
      holdId: "hold_1",
    };
    const moved = workspaceReducer(held, {
      type: "SELECT_SLOT",
      slotId: "slot_2",
      isAvailable: true,
    });
    expect(moved.provider).toBeNull();
    expect(moved.holdId).toBeNull();
  });
});

describe("provider and hold", () => {
  it("releases the hold when a different provider is chosen", () => {
    const held: WorkspaceState = {
      ...atDurationComplete("SCHEDULED"),
      slotId: "slot_1",
      provider: { kind: "auto" },
      holdId: "hold_1",
    };
    const swapped = workspaceReducer(held, {
      type: "SELECT_PROVIDER",
      provider: { kind: "partner", partnerId: "p9" },
    });
    expect(swapped.holdId).toBeNull();
  });

  it("returns to slot selection when the hold is lost", () => {
    const held: WorkspaceState = {
      ...atDurationComplete("SCHEDULED"),
      stage: "review",
      slotId: "slot_1",
      provider: { kind: "auto" },
      holdId: "hold_1",
    };
    const lost = workspaceReducer(held, { type: "HOLD_LOST" });
    expect(lost.stage).toBe("slot");
    expect(lost.slotId).toBeNull();
    expect(lost.holdId).toBeNull();
  });
});

describe("instant sequence", () => {
  it("has no provider or hold stage at any point", () => {
    // The B3 acceptance criterion, asserted against the sequence itself rather
    // than against a rendered screen.
    expect(sequenceContains("INSTANT", "provider")).toBe(false);
    expect(sequenceContains("INSTANT", "hold")).toBe(false);
    expect(sequenceFor("INSTANT")).not.toContain("provider");
  });

  it("cannot navigate to the provider stage even deliberately", () => {
    const state: WorkspaceState = {
      ...atDurationComplete("INSTANT"),
      visited: ["address", "type", "scope", "duration", "provider"],
    };
    expect(canNavigateTo(state, "provider")).toBe(false);
    expect(workspaceReducer(state, { type: "GO_TO_STAGE", stage: "provider" }).stage).not.toBe(
      "provider",
    );
  });

  it("places login before the pre-check, unlike scheduled", () => {
    const instant = sequenceFor("INSTANT");
    const scheduled = sequenceFor("SCHEDULED");
    expect(instant.indexOf("login")).toBeLessThan(instant.indexOf("precheck"));
    expect(instant.indexOf("login")).toBeLessThan(instant.indexOf("review"));
    // Scheduled reviews first and authenticates only when the action needs it.
    expect(scheduled.indexOf("review")).toBeLessThan(scheduled.indexOf("login"));
  });

  it("refuses the pre-check without a geocoded address", () => {
    // Doc 11 §2.1 — and the reason must be the geocode, not "nobody available".
    const state: WorkspaceState = {
      ...atDurationComplete("INSTANT"),
      stage: "precheck",
      address: { ...serviceableAddress, isGeocoded: false },
    };
    expect(blockedReason(state)).toBe("ADDRESS_NOT_GEOCODED");
  });

  it("blocks the pre-check stage until the pool check passes", () => {
    const state: WorkspaceState = { ...atDurationComplete("INSTANT"), stage: "precheck" };
    expect(blockedReason(state)).toBe("PRECHECK_NOT_PASSED");

    const refused = workspaceReducer(state, { type: "PRECHECK_RESULT", canDispatch: false });
    expect(blockedReason(refused)).toBe("PRECHECK_NOT_PASSED");

    const passed = workspaceReducer(state, { type: "PRECHECK_RESULT", canDispatch: true });
    expect(blockedReason(passed)).toBeNull();
  });

  it("cannot leave review for payment without a geocoded serviceable address", () => {
    const state: WorkspaceState = {
      ...atDurationComplete("INSTANT"),
      stage: "review",
      preCheck: "passed",
      address: { ...serviceableAddress, isGeocoded: false },
    };
    expect(blockedReason(state)).toBe("ADDRESS_NOT_GEOCODED");
    expect(workspaceReducer(state, { type: "ADVANCE" }).stage).toBe("review");
  });

  it("lets scheduled review proceed without a geocode", () => {
    // The gate is Instant-specific; doc 11 §2.1 says so explicitly.
    const state: WorkspaceState = {
      ...atDurationComplete("SCHEDULED"),
      stage: "review",
      address: { ...serviceableAddress, isGeocoded: false },
    };
    expect(blockedReason(state)).toBeNull();
  });
});

describe("instant and scheduled never mix in one checkout", () => {
  // Doc 10 §14.
  it("conflicts when adding instant to a cart that already has items", () => {
    expect(instantConflictsWithCart("INSTANT", ["SCHEDULED"])).toBe(true);
    expect(instantConflictsWithCart("INSTANT", ["INSTANT"])).toBe(true);
  });

  it("conflicts when adding scheduled to a cart holding an instant item", () => {
    expect(instantConflictsWithCart("SCHEDULED", ["INSTANT"])).toBe(true);
  });

  it("does not conflict between scheduled items", () => {
    expect(instantConflictsWithCart("SCHEDULED", ["SCHEDULED", "SCHEDULED"])).toBe(false);
  });

  it("does not conflict against an empty cart", () => {
    expect(instantConflictsWithCart("INSTANT", [])).toBe(false);
  });
});

describe("navigation", () => {
  it("allows going back to a visited stage", () => {
    const state = atDurationComplete("SCHEDULED");
    expect(canNavigateTo(state, "scope")).toBe(true);
    expect(workspaceReducer(state, { type: "GO_TO_STAGE", stage: "scope" }).stage).toBe("scope");
  });

  it("refuses to skip forward past a guard", () => {
    const state = atDurationComplete("SCHEDULED");
    expect(canNavigateTo(state, "review")).toBe(false);
    expect(workspaceReducer(state, { type: "GO_TO_STAGE", stage: "review" }).stage).toBe("slot");
  });

  it("steps back through the sequence in order", () => {
    const state = atDurationComplete("SCHEDULED");
    expect(workspaceReducer(state, { type: "BACK" }).stage).toBe("duration");
  });
});

describe("stage ownership", () => {
  it("claims exactly the stages B3 implements", () => {
    // A guard on scope creep in both directions: adding a stage to B3 without
    // deciding it belongs here fails, and so does quietly dropping one.
    expect([...STAGES_IMPLEMENTED_BY_B3]).toEqual([
      "address",
      "type",
      "scope",
      "duration",
      "slot",
      "provider",
      "hold",
      "precheck",
      "review",
    ]);
  });
});
