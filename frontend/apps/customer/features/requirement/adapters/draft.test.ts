import type { RequirementDraft } from "@vsolve/query";
import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import {
  toDraftIntent,
  toLifecycleVerdict,
  selectionOnlyQuestionSet,
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
    // Required since contract 1.24.0 — the name a row is titled by, where the slug was standing in.
    service_name: "Housekeeping staff",
    inferred_lifecycle: "A3_TIME_BLOCK",
    lifecycle_explanation: "You are hiring people for a period of time.",
    answers: { worker_count: 4 },
    missing_required_answers: ["duration_days"],
    address_id: "addr-1",
    requested_start: "2026-08-20T00:00:00Z",
    flexibility_days: 3,
    is_date_flexible: true,
    service_by: "2026-08-24",
    // The four tracking fields the detail projection gained at contract 1.24.0. Until then
    // `/requests/{id}` rendered a state with no countdown and no quote count, and the
    // free-to-submit promise existed only on the submit response.
    quote_delivery_deadline_at: "2026-08-12T18:00:00Z",
    teaser_count: 0,
    closure_reason: null,
    is_free: true,
    budget_min_paise: null,
    budget_max_paise: null,
    language: "en-IN",
    additional_details: "",
    attachments: [],
    engagement_id: null,
    server_now: "2026-08-12T09:00:00Z",
    ...overrides,
  };
}

describe("flexibility — an integer, all the way through", () => {
  it("reads the day count rather than the server's derived boolean", () => {
    // `is_date_flexible` is `flexibility_days > 0`, computed by the serializer,
    // and it carries strictly less: it cannot say *how* flexible. The capture
    // screen asks in bands, so the integer is what has to survive a round trip.
    expect(toDraftIntent(draft({ flexibility_days: 0 })).flexibilityDays).toBe(0);
    expect(toDraftIntent(draft({ flexibility_days: 7 })).flexibilityDays).toBe(7);
    expect(toDraftIntent(draft({ flexibility_days: 30 })).flexibilityDays).toBe(30);
  });

  it("keeps zero as a real answer rather than an absent one", () => {
    // "Exact" is a choice the Customer made. Restoring it as absent would leave
    // a previously-set window in place, so choosing Exact would silently do
    // nothing.
    expect(toDraftIntent(draft({ flexibility_days: 0 })).flexibilityDays).toBe(0);
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

describe("server draft dates", () => {
  it("restores the start as the Customer's local calendar day", () => {
    const stored = new Date(2026, 8, 14, 0, 0, 0).toISOString();
    expect(toDraftIntent(draft({ requested_start: stored })).requestedStart).toBe("2026-09-14");
  });

  it("keeps an absent start absent", () => {
    expect(toDraftIntent(draft({ requested_start: null })).requestedStart).toBeNull();
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
            { id: "o-1", code: "day", label: "Daytime", description: "Bright working hours" },
            { id: "o-2", code: "night", label: "Night", description: "" },
          ],
        }),
      ]),
    );

    expect(set.questions[0]?.options).toEqual([
      { value: "day", label: "Daytime", description: "Bright working hours" },
      { value: "night", label: "Night", description: undefined },
    ]);
  });

  it("turns the old interior fit-out text question into one selection question", () => {
    const set = selectionOnlyQuestionSet(
      "interior-fit-out-project",
      toQuestionSet(
        variant([
          question({
            code: "deliverable",
            prompt: "What should be finished at the end?",
            kind: "TEXT",
          }),
          question({
            code: "site_ready",
            prompt: "Is the site empty and ready?",
            kind: "BOOLEAN",
            is_required: false,
          }),
        ]),
      ),
    );

    expect(set.questions).toHaveLength(1);
    expect(set.questions[0]).toMatchObject({
      code: "deliverable",
      label: "What kind of fit-out do you need?",
      kind: "choice",
      required: true,
    });
    expect(set.questions[0]?.options?.map((option) => option.value)).toEqual([
      "office-fit-out",
      "retail-fit-out",
      "hospitality-fit-out",
      "shell-core-completion",
    ]);
  });
});
