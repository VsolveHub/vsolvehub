import type { RequirementDraft } from "@vsolve/query";
import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import {
  FLEXIBLE_WINDOW_DAYS,
  flexibilityDaysFor,
  toDraftIntent,
  toLifecycleVerdict,
  toQuestionSet,
  toServerAttachmentItems,
} from "./index";

/**
 * The three field shapes the 1.21.0 re-point had to absorb, plus the two the
 * handover note did not mention.
 *
 * Each one is a place where the wire and the screens disagree, and each is
 * resolved here rather than in a component — which is the property that made
 * the integration a re-point instead of a rewrite. A test per row of the table
 * in `./index.ts`.
 */

function draft(overrides: Partial<RequirementDraft> = {}): RequirementDraft {
  return {
    id: "req-1",
    status: "DRAFT",
    category_slug: "housekeeping-staff",
    inferred_lifecycle: "A3_TIME_BLOCK",
    lifecycle_explanation: "You are hiring people for a period of time.",
    answers: { worker_count: 4 },
    missing_required_answers: ["duration_days"],
    address_id: "addr-1",
    requested_start: "2026-08-20T00:00:00Z",
    flexibility_days: 3,
    is_date_flexible: true,
    service_by: "2026-08-24",
    budget_min_paise: null,
    budget_max_paise: null,
    language: "en-IN",
    additional_details: "",
    attachments: [],
    server_now: "2026-08-12T09:00:00Z",
    ...overrides,
  };
}

describe("flexibility — an integer on the wire, a checkbox on the screen", () => {
  it("reads the server's own boolean rather than re-deriving it from the integer", () => {
    // `is_date_flexible` is `flexibility_days > 0`, computed by the serializer.
    // Re-deriving it here is how two clients end up disagreeing about what zero
    // days means.
    expect(toDraftIntent(draft({ flexibility_days: 0, is_date_flexible: false })).isDateFlexible)
      .toBe(false);
    expect(toDraftIntent(draft()).isDateFlexible).toBe(true);
  });

  it("writes a named window rather than a number nobody can find later", () => {
    expect(flexibilityDaysFor(true)).toBe(FLEXIBLE_WINDOW_DAYS);
    expect(flexibilityDaysFor(false)).toBe(0);
  });

  it("writes zero for an unticked box, not an absent field", () => {
    // Absent would leave a previously-set window in place, so unticking the box
    // would silently do nothing.
    expect(flexibilityDaysFor(false)).toBe(0);
  });
});

describe("the lifecycle verdict", () => {
  it("carries the server's sentence and its list of what is still missing", () => {
    const verdict = toLifecycleVerdict(draft());

    expect(verdict?.explanation).toBe("You are hiring people for a period of time.");
    expect(verdict?.missingRequiredAnswers).toEqual(["duration_days"]);
  });

  it("is null when the server sent a lifecycle it could not explain", () => {
    // The explanation is the only part the Customer sees. Showing nothing beats
    // inventing the sentence.
    expect(toLifecycleVerdict(draft({ lifecycle_explanation: null }))).toBeNull();
  });

  it("is null for a lifecycle this bundle has no screens for", () => {
    // Carrying a third archetype as a verdict would let the flow behave as
    // though it supported one.
    expect(toLifecycleVerdict(draft({ inferred_lifecycle: "A7_SOMETHING_NEW" }))).toBeNull();
  });
});

describe("the answer bag", () => {
  it("is narrowed to a record, because the wire publishes it as unknown", () => {
    expect(toDraftIntent(draft()).answers).toEqual({ worker_count: 4 });
  });

  it("reads a non-object as no answers rather than letting it reach the reducer", () => {
    // The reducer indexes this by question code. A string or an array reaching
    // it reads `undefined` for every question, which looks exactly like a
    // Customer who has answered nothing — except the guard would then be
    // unfixable from the screen.
    expect(toDraftIntent(draft({ answers: "nonsense" })).answers).toEqual({});
    expect(toDraftIntent(draft({ answers: [1, 2] })).answers).toEqual({});
    expect(toDraftIntent(draft({ answers: null })).answers).toEqual({});
  });
});

describe("attachments the server already holds", () => {
  function attachment(
    overrides: Partial<Schemas["RequirementAttachment"]> = {},
  ): Schemas["RequirementAttachment"] {
    return {
      id: "att-1",
      kind: "IMAGE",
      scan_status: "VERIFIED",
      // Published as a required field at contract 1.22.0, alongside `INFECTED`.
      // Django's own default is a blank CharField: an attachment that has not
      // failed a scan carries no reason, rather than a null the client would
      // then have to narrow at every read.
      scan_failure_reason: "",
      size_bytes: 2048,
      language: "",
      ...overrides,
    };
  }

  it("treats VERIFIED as attached — there is no CLEAN any more", () => {
    expect(toServerAttachmentItems([attachment()])[0]?.status).toBe("attached");
  });

  it("treats a pending scan as still working, never as attached", () => {
    // A file on the server that has not cleared its scan is not usable, and
    // showing it as attached is how someone submits believing a photo went
    // with it.
    expect(toServerAttachmentItems([attachment({ scan_status: "PENDING" })])[0]?.status).toBe(
      "uploading",
    );
  });

  it("fails an unrecognised scan state closed", () => {
    // There is no INFECTED in the published states. Anything that is neither
    // PENDING nor VERIFIED fails, because failing closed is the only direction
    // that cannot put an unscanned file in front of a vendor.
    expect(toServerAttachmentItems([attachment({ scan_status: "FAILED" })])[0]?.status).toBe(
      "failed",
    );
    expect(toServerAttachmentItems([attachment({ scan_status: "QUARANTINED" })])[0]?.status).toBe(
      "failed",
    );
  });

  it("maps IMAGE, which is what PHOTO became", () => {
    expect(toServerAttachmentItems([attachment()])[0]?.kind).toBe("image");
  });

  it("maps AUDIO, which the file picker cannot produce but the server can send", () => {
    expect(toServerAttachmentItems([attachment({ kind: "AUDIO" })])[0]?.kind).toBe("audio");
  });

  it("names a file by what it is, because the wire carries no file name", () => {
    // A generic noun is the whole truth the record contains. Inventing
    // "document-3.pdf" would be worse than saying "Document".
    expect(toServerAttachmentItems([attachment({ kind: "DOCUMENT" })])[0]?.name).toBe("Document");
  });
});

describe("screen 1's questions", () => {
  function question(
    overrides: Partial<Schemas["ServiceQuestion"]> = {},
  ): Schemas["ServiceQuestion"] {
    return {
      id: "q-1",
      code: "worker_count",
      prompt: "How many people do you need?",
      help_text: "",
      kind: "NUMBER",
      is_required: true,
      validation_rules: {},
      options: [],
      ...overrides,
    };
  }

  function variant(
    questions: Schemas["ServiceQuestion"][],
  ): Schemas["ServiceVariantConfiguration"] {
    return {
      id: "var-1",
      code: "standard",
      name: "Standard",
      description: "",
      fulfilment_archetype: "A3_TIME_BLOCK",
      starting_price: { amount_paise: 0, currency: "INR" } as Schemas["Money"],
      minimum_service_subtotal: { amount_paise: 0, currency: "INR" } as Schemas["Money"],
      task_lines: [],
      required_skill_code: "housekeeping",
      questions,
    };
  }

  it("maps the four kinds the M2 validator can accept", () => {
    const set = toQuestionSet(
      variant([
        question({ code: "a", kind: "NUMBER" }),
        question({ code: "b", kind: "TEXT" }),
        question({ code: "c", kind: "BOOLEAN" }),
        question({ code: "d", kind: "SINGLE_CHOICE" }),
      ]),
    );

    expect(set.questions.map((entry) => entry.kind)).toEqual([
      "number",
      "text",
      "boolean",
      "choice",
    ]);
    expect(set.unsupported).toEqual([]);
  });

  it("reports a multiple-choice question rather than guessing a control for it", () => {
    // `validate_scope` accepts INTEGER, TEXT, BOOLEAN and SELECT — there is no
    // list-valued answer it would take, so any control invented here produces
    // an answer the submit command refuses, with the refusal landing on the
    // Customer.
    const set = toQuestionSet(variant([question({ code: "rooms", kind: "MULTIPLE_CHOICE" })]));

    expect(set.questions).toEqual([]);
    expect(set.unsupported).toEqual(["rooms"]);
  });

  it("drops an empty help string rather than rendering an empty paragraph", () => {
    expect(toQuestionSet(variant([question()])).questions[0]?.help).toBeUndefined();
  });

  it("carries a choice question's options by code", () => {
    const set = toQuestionSet(
      variant([
        question({
          kind: "SINGLE_CHOICE",
          options: [
            { id: "o-1", code: "day", label: "Daytime", description: "" },
            { id: "o-2", code: "night", label: "Night", description: "" },
          ],
        }),
      ]),
    );

    expect(set.questions[0]?.options).toEqual([
      { value: "day", label: "Daytime" },
      { value: "night", label: "Night" },
    ]);
  });
});
