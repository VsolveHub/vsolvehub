import { describe, expect, it } from "vitest";

import type { RequirementQuestionView } from "../adapters";
import { activeScreens, firstScreen, stepNumber } from "./active-screens";
import { requirementReducer } from "./machine";
import { SCREENS } from "./screens";
import { advance, briefSectionBlocks, initialDraftState } from "./state";

/**
 * The visit-first brief: a variant that publishes no questions skips step 1.
 * The budget (`SCREENS`) stays three; only the *active* sequence shrinks.
 */

function question(code: string): RequirementQuestionView {
  return { code, label: code, kind: "choice", required: true, options: [] };
}

describe("activeScreens", () => {
  it("walks two screens when the variant publishes no questions", () => {
    expect(activeScreens([])).toEqual(["where_when", "visits_send"]);
  });

  it("walks all three when there is anything to ask", () => {
    expect(activeScreens([question("rooms")])).toEqual(SCREENS);
    expect(activeScreens([question("a"), question("b"), question("c")])).toEqual(SCREENS);
  });

  it("never touches the budget", () => {
    activeScreens([]);
    expect(SCREENS).toEqual(["what", "where_when", "visits_send"]);
  });
});

describe("step numbering", () => {
  const two = activeScreens([]);
  const three = activeScreens([question("rooms")]);

  it("counts 'Where and when' as step 1 of 2 on a visit-first brief", () => {
    expect(stepNumber(two, "where_when")).toBe(1);
    expect(stepNumber(two, "visits_send")).toBe(2);
    expect(two.length).toBe(2);
  });

  it("keeps 'Where and when' as step 2 of 3 when step 1 exists", () => {
    expect(stepNumber(three, "what")).toBe(1);
    expect(stepNumber(three, "where_when")).toBe(2);
    expect(stepNumber(three, "visits_send")).toBe(3);
  });

  it("opens on the first active screen", () => {
    expect(firstScreen(two)).toBe("where_when");
    expect(firstScreen(three)).toBe("what");
  });
});

describe("navigation over the active sequence", () => {
  const two = activeScreens([]);

  it("advances from Where and when straight to Choose visits & send", () => {
    const state = initialDraftState("plumbing", firstScreen(two));
    expect(state.screen).toBe("where_when");
    expect(advance(state, two).screen).toBe("visits_send");
  });

  it("has nowhere to go back to from the first active screen", () => {
    // The container leaves the flow (router.back) instead.
    const state = initialDraftState("plumbing", firstScreen(two));
    expect(requirementReducer(state, { type: "BACK", screens: two })).toBe(state);
  });

  it("does not resurrect step 1 as a visited screen after a reload", () => {
    const state = initialDraftState("plumbing", firstScreen(two));
    const restored = requirementReducer(state, {
      type: "RESTORE_SCREEN",
      screen: "visits_send",
      screens: two,
    });
    expect(restored.visited).toEqual(["where_when"]);
    expect(requirementReducer(restored, { type: "BACK", screens: two }).screen).toBe("where_when");
  });

  it("does not hold the send on a step the brief never asked", () => {
    const blocks = briefSectionBlocks(initialDraftState("plumbing"), "2026-08-29", false, [], two);
    expect(blocks.what).toBeNull();
    expect(blocks.where_when).toBe("ADDRESS_NOT_CHOSEN");
  });
});
