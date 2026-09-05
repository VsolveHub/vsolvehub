import { describe, expect, it } from "vitest";

import type { RequirementQuestionView } from "../adapters";
import { eventBriefShape, shouldShowTextQuestion } from "./event-brief";

/**
 * The event-shaped brief: detected from the catalogue's `event_type` question,
 * never from a service slug, so a second event service gets the same treatment
 * without a deploy.
 */

function question(overrides: Partial<RequirementQuestionView>): RequirementQuestionView {
  return { code: "q", label: "Q", kind: "choice", required: true, ...overrides };
}

const OCCASION = question({
  code: "event_type",
  label: "What's the occasion?",
  options: [
    { value: "wedding", label: "Wedding function" },
    { value: "other", label: "Something else" },
  ],
});
const DESCRIPTION = question({
  code: "event_description",
  label: "Tell us about the event",
  kind: "text",
  required: false,
});
const AREAS = question({ code: "decor_areas", label: "What should we decorate?", kind: "multi" });
const SETUP = question({
  code: "setup_access",
  label: "When can decorators set up?",
  required: false,
});

describe("eventBriefShape", () => {
  it("is not an event without an `event_type` question", () => {
    const shape = eventBriefShape([AREAS, SETUP]);

    expect(shape.isEvent).toBe(false);
    expect(shape.setupAccessQuestion).toBeNull();
    // Nothing is moved off step 1 for a non-event brief, even a `setup_access`
    // code — the shape is the occasion question's, not the code's.
    expect(shape.whatQuestions).toEqual([AREAS, SETUP]);
  });

  it("moves setup access to step 2 and keeps the rest on step 1, in order", () => {
    const shape = eventBriefShape([OCCASION, DESCRIPTION, AREAS, SETUP]);

    expect(shape.isEvent).toBe(true);
    expect(shape.setupAccessQuestion).toBe(SETUP);
    expect(shape.whatQuestions).toEqual([OCCASION, DESCRIPTION, AREAS]);
  });

  it("is an event without a setup-access question", () => {
    const shape = eventBriefShape([OCCASION, AREAS]);

    expect(shape.isEvent).toBe(true);
    expect(shape.setupAccessQuestion).toBeNull();
    expect(shape.whatQuestions).toEqual([OCCASION, AREAS]);
  });
});

describe("shouldShowTextQuestion", () => {
  const questions = [OCCASION, DESCRIPTION, AREAS];

  it("hides an optional text line until a sibling is answered `other`", () => {
    expect(shouldShowTextQuestion(DESCRIPTION, questions, {})).toBe(false);
    expect(shouldShowTextQuestion(DESCRIPTION, questions, { event_type: "wedding" })).toBe(false);
    expect(shouldShowTextQuestion(DESCRIPTION, questions, { event_type: "other" })).toBe(true);
  });

  it("keeps a line that already carries a value — a restored draft must not hide it", () => {
    expect(
      shouldShowTextQuestion(DESCRIPTION, questions, {
        event_type: "wedding",
        event_description: "Sangeet on the terrace",
      }),
    ).toBe(true);
  });

  it("always shows required text and every non-text question", () => {
    expect(shouldShowTextQuestion({ ...DESCRIPTION, required: true }, questions, {})).toBe(true);
    expect(shouldShowTextQuestion(AREAS, questions, {})).toBe(true);
  });

  it("reads `other` inside a multi-select answer too", () => {
    const multi = question({
      code: "extras",
      kind: "multi",
      options: [{ value: "other", label: "Something else" }],
    });
    expect(
      shouldShowTextQuestion(DESCRIPTION, [multi, DESCRIPTION], { extras: ["other"] }),
    ).toBe(true);
  });
});
