import { describe, expect, it } from "vitest";

import { briefSectionBlocks, initialDraftState } from "./state";

/**
 * The one-page brief's per-section completion.
 *
 * The point of these is that the page and the wizard cannot drift: both ask
 * `blockedReason` the same questions, so a rule added to one is a rule added to
 * both. What is asserted here is that asking it three times answers about three
 * sections rather than three times about the current one.
 */

const TODAY = "2026-08-18";

function draft() {
  return initialDraftState("interior-fit-out-project");
}

describe("briefSectionBlocks", () => {
  it("answers about every section, not about the current screen", () => {
    // The reducer starts on `what`, and the wizard's guard would only ever
    // answer about that screen. All three sections have to report.
    const blocks = briefSectionBlocks(draft(), TODAY);

    expect(Object.keys(blocks).sort()).toEqual(["details", "what", "where_when"]);
    expect(blocks.what).toBe("REQUIRED_ANSWER_MISSING");
    expect(blocks.where_when).toBe("ADDRESS_NOT_CHOSEN");
  });

  it("clears a section as its own answers arrive", () => {
    const state = {
      ...draft(),
      answers: { fit_out_style: "office-fit-out" },
    };
    const blocks = briefSectionBlocks(state, TODAY);

    expect(blocks.what).toBeNull();
    // Filling section 1 must not clear section 2.
    expect(blocks.where_when).toBe("ADDRESS_NOT_CHOSEN");
  });

  it("treats the optional section as complete when nothing is in flight", () => {
    // Attachments are optional; an attachment mid-upload or rejected is not, and
    // that is what its guard actually checks.
    expect(briefSectionBlocks(draft(), TODAY).details).toBeNull();
  });

  it("does not mutate the state it inspects", () => {
    // It asks by handing `blockedReason` a state that claims to be on each
    // screen. That synthetic value must never reach the real reducer state.
    const state = draft();
    briefSectionBlocks(state, TODAY);
    expect(state.screen).toBe("what");
  });
});
