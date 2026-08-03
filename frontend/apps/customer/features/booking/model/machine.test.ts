import { describe, expect, it } from "vitest";

import { workspaceReducer, type WorkspaceAction } from "./machine";
import {
  blockedReason,
  canNavigateTo,
  initialState,
  totalTaskQuantity,
  type VariantRules,
  type WorkspaceState,
} from "./state";
import { STAGES_IMPLEMENTED, isCommitted, sequence, sequenceContains } from "./stages";

const rules: VariantRules = {
  variantId: "8a1f0c22-6d3e-4b71-9f52-1c0d7e4a9b83",
  variantCode: "fan-installation",
  requiredQuestionCodes: ["mount-type"],
  availableTaskCodes: ["fan-installation", "light-led-installation"],
};

const serviceableAddress = {
  id: "77777777-7777-4777-8777-777777777777",
  postalCode: "500032",
  isGeocoded: true,
  isServiceable: true,
};

function run(state: WorkspaceState, ...actions: WorkspaceAction[]): WorkspaceState {
  return actions.reduce(workspaceReducer, state);
}

/** A workspace configured and advanced to a complete scope. */
function atScopeComplete(): WorkspaceState {
  return run(
    initialState("fan-installation"),
    { type: "CONFIGURE", rules },
    { type: "SET_ADDRESS", address: serviceableAddress },
    { type: "ADVANCE" },
    { type: "SET_TASK_QUANTITY", taskCode: "fan-installation", quantity: 1 },
    { type: "ANSWER", questionCode: "mount-type", value: "ceiling" },
  );
}

/** A workspace with a window chosen, sitting on review. */
function atReview(): WorkspaceState {
  return run(
    atScopeComplete(),
    { type: "ADVANCE" },
    { type: "SELECT_WINDOW", windowId: "win_1", isAvailable: true },
    { type: "ADVANCE" },
  );
}

describe("sequence", () => {
  it("has exactly one sequence", () => {
    // ADR-018 deferred Instant to M4 and ADR-014 removed the provider picker, so
    // the branch that used to exist has nothing left to branch on.
    expect(sequence()).toEqual([
      "address",
      "scope",
      "window",
      "review",
      "login",
      "finding",
      "pay",
      "confirmed",
    ]);
  });

  it("puts the Partner search before payment", () => {
    // ADR-012, expressed as list position. This is the whole M1 ordering rule.
    const order = sequence();
    expect(order.indexOf("finding")).toBeLessThan(order.indexOf("pay"));
  });

  it("has no provider, hold, precheck or duration stage", () => {
    for (const removed of ["provider", "hold", "precheck", "duration", "type"]) {
      expect(sequenceContains(removed as never)).toBe(false);
    }
  });

  it("implements only the scope stage, because the rest belong to the group", () => {
    // Under the Booking Group model a service page configures one request and
    // appends it to the cart. Address, timing and review are settled once for
    // the whole group at `/cart`, where they can see every item rather than one.
    // The full `sequence()` above is deliberately unchanged: it still encodes
    // the ordering rule that payment cannot precede a committed Partner.
    expect(STAGES_IMPLEMENTED).toEqual(["scope"]);
  });

  it("treats everything from the search onward as committed", () => {
    expect(isCommitted("review")).toBe(false);
    expect(isCommitted("finding")).toBe(true);
    expect(isCommitted("pay")).toBe(true);
  });
});

describe("address stage", () => {
  it("blocks until an address is confirmed", () => {
    expect(blockedReason(initialState("fan-installation"))).toBe("ADDRESS_NOT_CONFIRMED");
  });

  it("blocks an unserviceable address", () => {
    const state = run(initialState("fan-installation"), {
      type: "SET_ADDRESS",
      address: { ...serviceableAddress, isServiceable: false },
    });
    expect(blockedReason(state)).toBe("ADDRESS_NOT_SERVICEABLE");
  });

  it("allows a serviceable address that never geocoded", () => {
    // M1 estimates travel from the service area, so a missing pin does not stop
    // a home-service booking.
    const state = run(initialState("fan-installation"), {
      type: "SET_ADDRESS",
      address: { ...serviceableAddress, isGeocoded: false },
    });
    expect(blockedReason(state)).toBeNull();
  });

  it("clears the chosen window when the address changes", () => {
    // A new address means a new area, new travel and a new eligible pool.
    const state = run(atReview(), {
      type: "SET_ADDRESS",
      address: { ...serviceableAddress, id: "different-address" },
    });
    expect(state.windowId).toBeNull();
    expect(state.visited).not.toContain("window");
  });
});

describe("scope stage", () => {
  it("blocks until at least one task is chosen", () => {
    const state = run(
      initialState("fan-installation"),
      { type: "CONFIGURE", rules },
      { type: "SET_ADDRESS", address: serviceableAddress },
      { type: "ADVANCE" },
    );
    expect(blockedReason(state)).toBe("NO_TASK_SELECTED");
  });

  it("blocks until required questions are answered", () => {
    const state = run(
      initialState("fan-installation"),
      { type: "CONFIGURE", rules },
      { type: "SET_ADDRESS", address: serviceableAddress },
      { type: "ADVANCE" },
      { type: "SET_TASK_QUANTITY", taskCode: "fan-installation", quantity: 1 },
    );
    expect(blockedReason(state)).toBe("REQUIRED_QUESTION_UNANSWERED");
  });

  it("passes once tasks and required answers are present", () => {
    expect(blockedReason(atScopeComplete())).toBeNull();
  });

  it("removes a task line at quantity zero rather than storing a zero", () => {
    const state = run(atScopeComplete(), {
      type: "SET_TASK_QUANTITY",
      taskCode: "fan-installation",
      quantity: 0,
    });
    expect(state.taskLines).toHaveLength(0);
    expect(totalTaskQuantity(state)).toBe(0);
  });

  it("refuses a negative quantity", () => {
    const state = run(atScopeComplete(), {
      type: "SET_TASK_QUANTITY",
      taskCode: "fan-installation",
      quantity: -3,
    });
    expect(state.taskLines).toHaveLength(0);
  });

  it("clears the chosen window when task lines change", () => {
    // The duration estimate follows the task lines, and availability was
    // searched for the old estimate.
    const state = run(atReview(), {
      type: "SET_TASK_QUANTITY",
      taskCode: "light-led-installation",
      quantity: 2,
    });
    expect(state.windowId).toBeNull();
    expect(state.visited).not.toContain("window");
  });

  it("keeps notes when task lines change", () => {
    const state = run(
      atScopeComplete(),
      { type: "SET_NOTES", notes: "Gate code 4432" },
      { type: "SET_TASK_QUANTITY", taskCode: "fan-installation", quantity: 2 },
    );
    expect(state.notes).toBe("Gate code 4432");
  });
});

describe("window stage", () => {
  it("blocks until a window is chosen", () => {
    const state = run(atScopeComplete(), { type: "ADVANCE" });
    expect(blockedReason(state)).toBe("WINDOW_NOT_CHOSEN");
  });

  it("refuses to record an unavailable window", () => {
    // The refusal is what makes "no unavailable window allows progression"
    // structural rather than a rule the view has to remember.
    const state = run(atScopeComplete(), { type: "ADVANCE" }, {
      type: "SELECT_WINDOW",
      windowId: "win_taken",
      isAvailable: false,
    });
    expect(state.windowId).toBeNull();
    expect(blockedReason(state)).toBe("WINDOW_NOT_CHOSEN");
  });

  it("records an available window", () => {
    const state = run(atScopeComplete(), { type: "ADVANCE" }, {
      type: "SELECT_WINDOW",
      windowId: "win_1",
      isAvailable: true,
    });
    expect(state.windowId).toBe("win_1");
    expect(blockedReason(state)).toBeNull();
  });

  it("returns to window selection when the window is lost", () => {
    const state = run(atReview(), { type: "WINDOW_LOST" });
    expect(state.stage).toBe("window");
    expect(state.windowId).toBeNull();
  });
});

describe("navigation", () => {
  it("allows going back to a visited stage", () => {
    expect(canNavigateTo(atReview(), "scope")).toBe(true);
  });

  it("refuses jumping forward to an unvisited stage", () => {
    expect(canNavigateTo(atScopeComplete(), "review")).toBe(false);
  });

  it("refuses navigating to a stage that no longer exists", () => {
    expect(canNavigateTo(atReview(), "provider" as never)).toBe(false);
  });

  it("freezes navigation once the Partner search has begun", () => {
    // A Partner has been offered this exact job. Editing it behind their back is
    // how a customer ends up with someone committed to work that changed.
    const searching = { ...atReview(), stage: "finding" as const };
    expect(canNavigateTo(searching, "scope")).toBe(false);
  });

  it("ignores edits once the Partner search has begun", () => {
    const searching = { ...atReview(), stage: "finding" as const };
    const edited = run(searching, {
      type: "SET_TASK_QUANTITY",
      taskCode: "fan-installation",
      quantity: 9,
    });
    expect(edited).toBe(searching);
  });

  it("refuses to go back out of a committed stage", () => {
    const searching = { ...atReview(), stage: "finding" as const };
    expect(run(searching, { type: "BACK" }).stage).toBe("finding");
  });

  it("still advances through committed stages", () => {
    // The search resolving, payment succeeding and the booking confirming are
    // all forward moves and must not be frozen.
    const searching = { ...atReview(), stage: "finding" as const };
    expect(run(searching, { type: "ADVANCE" }).stage).toBe("pay");
  });

  it("does not advance while blocked", () => {
    const blocked = run(initialState("fan-installation"), { type: "ADVANCE" });
    expect(blocked.stage).toBe("address");
  });
});

describe("login interrupt", () => {
  it("raises login from wherever it was needed and remembers where to go back", () => {
    const anonymous = run(initialState("fan-installation"), {
      type: "REQUIRE_LOGIN",
      returnTo: "address",
    });

    expect(anonymous.stage).toBe("login");
    expect(anonymous.resumeStage).toBe("address");
  });

  it("keeps everything the customer configured", () => {
    // The whole point of the interrupt: being asked to log in must not cost
    // someone the form they have already filled in.
    const before = atScopeComplete();
    const after = run(before, { type: "REQUIRE_LOGIN", returnTo: "scope" });

    expect(after.taskLines).toEqual(before.taskLines);
    expect(after.answers).toEqual(before.answers);
    expect(after.notes).toBe(before.notes);
    expect(after.address).toEqual(before.address);
    expect(after.rules).toEqual(before.rules);
  });

  it("returns to the origin stage once Django issues a session", () => {
    const resumed = run(
      atScopeComplete(),
      { type: "REQUIRE_LOGIN", returnTo: "scope" },
      { type: "LOGIN_COMPLETED" },
    );

    expect(resumed.stage).toBe("scope");
    expect(resumed.resumeStage).toBeNull();
    expect(totalTaskQuantity(resumed)).toBe(1);
  });

  it("returns to the origin stage when login is cancelled, not to the previous stage", () => {
    // `login` sits after `review` in the sequence, so an ordinary BACK would
    // send someone who was interrupted at `address` forward to `review`.
    const cancelled = run(
      initialState("fan-installation"),
      { type: "REQUIRE_LOGIN", returnTo: "address" },
      { type: "BACK" },
    );

    expect(cancelled.stage).toBe("address");
    expect(cancelled.resumeStage).toBeNull();
  });

  it("ignores a second interrupt while already logging in", () => {
    const once = run(atReview(), { type: "REQUIRE_LOGIN", returnTo: "review" });
    expect(run(once, { type: "REQUIRE_LOGIN", returnTo: "address" })).toBe(once);
  });

  it("ignores a completion that no login raised", () => {
    const configured = atScopeComplete();
    expect(run(configured, { type: "LOGIN_COMPLETED" })).toBe(configured);
  });

  it("refuses to advance out of login with the ordinary Continue", () => {
    // Advancing from `login` lands on `finding`, where a Partner is offered real
    // work. Only an established session may move the customer past this point.
    const waiting = run(atReview(), { type: "REQUIRE_LOGIN", returnTo: "review" });
    expect(run(waiting, { type: "ADVANCE" })).toBe(waiting);
  });

  it("remembers the interrupted stage as visited, so back navigation still works", () => {
    const resumed = run(
      atReview(),
      { type: "REQUIRE_LOGIN", returnTo: "review" },
      { type: "LOGIN_COMPLETED" },
    );

    expect(canNavigateTo(resumed, "scope")).toBe(true);
  });
});
