import type {
  RequirementDraft,
  RequirementSummary,
  RequirementTimeline,
  RequirementTimelineEvent,
} from "@vsolve/query";
import { describe, expect, it } from "vitest";

import {
  toRequestHeader,
  toRequestRow,
  toRequestRows,
  toTimelineEvent,
  toTimelineEvents,
} from "./index";

/**
 * `M2-FE-213` and `M2-FE-214`, against contract 1.21.0.
 *
 * The load-bearing block is "the pre-unlock identity rule". Everything else is
 * mapping; that one is the privacy rule the entire teaser design rests on.
 *
 * Fixtures live in this file and nowhere else. Execution plan §2: no mock or
 * placeholder data in application code, permanently — the screens show real
 * server states or real error states, never a simulated success.
 */

function summary(overrides: Partial<RequirementSummary> = {}): RequirementSummary {
  return {
    id: "req-1",
    status: "MATCHING",
    category_slug: "housekeeping-staff",
    service_name: "Housekeeping staff",
    lifecycle_explanation: "You are hiring people for a period of time.",
    service_by: "2026-08-24",
    quote_delivery_deadline_at: "2026-08-12T18:00:00Z",
    teaser_count: 0,
    closure_reason: null,
    last_activity_at: "2026-08-10T09:33:40Z",
    ...overrides,
  };
}

function event(overrides: Partial<RequirementTimelineEvent> = {}): RequirementTimelineEvent {
  return {
    id: "e1",
    at: "2026-08-10T09:31:02Z",
    type: "REQUIREMENT_SUBMITTED",
    detail: {},
    ...overrides,
  };
}

describe("my-requests rows", () => {
  it("carries the status as a code, not as a sentence", () => {
    // The delayed-match state is derived from the status *and* the deadline
    // together. A row handed a finished label has already lost the ability to
    // tell "still looking" from "we are late".
    expect(toRequestRow(summary(), "Housekeeping staff")?.status).toBe("MATCHING");
  });

  it("keeps the closure reason distinct rather than collapsing it", () => {
    const row = toRequestRow(
      summary({ status: "CLOSED_NO_SUPPLY", closure_reason: "NO_SUPPLY" }),
      "Housekeeping staff",
    );

    expect(row?.status).toBe("CLOSED_NO_SUPPLY");
    expect(row?.closure).toBe("NO_SUPPLY");
  });

  it("carries both dates, because they mean different things", () => {
    // `service_by` closes the requirement; the delivery deadline is our promise
    // about quotes. Dropping either would make one of the two closure states
    // unexplainable.
    const row = toRequestRow(summary(), "Housekeeping staff");

    expect(row?.serviceBy).toBe("2026-08-24");
    expect(row?.deadlineAt).toBe("2026-08-12T18:00:00Z");
  });

  it("passes the server's sentence through untouched", () => {
    expect(toRequestRow(summary(), "Housekeeping staff")?.lifecycleExplanation).toBe(
      "You are hiring people for a period of time.",
    );
  });

  it("refuses a status this build has no copy for", () => {
    // Cast because the schema's enum is a claim about a *document*, and this
    // test is about the *bytes*: the day Django grows a thirteenth status,
    // every deployed bundle receives it and none of them was recompiled. An
    // unrecognised status reaching `REQUEST_STATE_COPY` renders
    // `undefined.explanation` rather than failing where anyone would see it.
    const grown = "REPRICING" as RequirementSummary["status"];

    expect(toRequestRow(summary({ status: grown }), "Housekeeping staff")).toBeNull();
  });

  it("drops a closure reason it does not recognise without dropping the row", () => {
    // The status is what the screen renders from. An unknown *reason* beside a
    // known closed status is a detail the build cannot word, not a row it
    // should hide.
    const row = toRequestRow(
      summary({ status: "CLOSED_CANCELLED", closure_reason: "MOON_PHASE" }),
      "Housekeeping staff",
    );

    expect(row?.status).toBe("CLOSED_CANCELLED");
    expect(row?.closure).toBeNull();
  });

  it("keeps the rows it can render when one in the list is unknown", () => {
    const grown = "REPRICING" as RequirementSummary["status"];
    const rows = toRequestRows(
      [summary({ id: "good" }), summary({ id: "bad", status: grown })],
      () => "Housekeeping staff",
    );

    expect(rows.map((row) => row.id)).toEqual(["good"]);
  });
});

describe("the detail header", () => {
  function draft(overrides: Partial<RequirementDraft> = {}): RequirementDraft {
    return {
      id: "req-1",
      status: "MATCHING",
      category_slug: "housekeeping-staff",
      service_name: "Housekeeping staff",
      inferred_lifecycle: "A3_TIME_BLOCK",
      lifecycle_explanation: "You are hiring people for a period of time.",
      answers: {},
      missing_required_answers: [],
      address_id: "addr-1",
      requested_start: "2026-08-20T00:00:00Z",
      flexibility_days: 3,
      is_date_flexible: true,
      service_by: "2026-08-24",
      quote_delivery_deadline_at: "2026-08-12T18:00:00Z",
      teaser_count: 0,
      closure_reason: null,
      is_free: true,
      budget_min_paise: null,
      budget_max_paise: null,
      language: "en-IN",
      additional_details: "",
      attachments: [],
      server_now: "2026-08-12T09:00:00Z",
      ...overrides,
    };
  }

  it("renders no deadline and no quote count, because the record carries neither", () => {
    // The detail endpoint answers with `RequirementDraft`. Filling these in
    // from the list cache would show a deadline read at some earlier moment as
    // though it had just been confirmed, on the one screen whose job is to be
    // truthful about a promise with a clock on it.
    const header = toRequestHeader(draft(), "Housekeeping staff");

    expect(header?.deadlineAt).toBeNull();
    expect(header?.teaserCount).toBe(0);
    expect(header?.closure).toBeNull();
  });

  it("still carries the status, the sentence and the hard date", () => {
    const header = toRequestHeader(draft(), "Housekeeping staff");

    expect(header?.status).toBe("MATCHING");
    expect(header?.serviceBy).toBe("2026-08-24");
    expect(header?.lifecycleExplanation).toBe("You are hiring people for a period of time.");
  });
});

describe("timeline ordering", () => {
  it("renders oldest first whatever order the wire used", () => {
    const timeline: RequirementTimeline = {
      events: [
        event({ id: "late", at: "2026-08-10T14:02:11Z", type: "QUESTION_ASKED" }),
        event({ id: "early", at: "2026-08-10T09:31:02Z" }),
      ],
      server_now: "2026-08-10T15:00:00Z",
    };

    expect(toTimelineEvents(timeline).map((entry) => entry.id)).toEqual(["early", "late"]);
  });

  it("keeps the server's ordering for events sharing an instant", () => {
    const at = "2026-08-10T09:31:02Z";
    const timeline: RequirementTimeline = {
      events: [event({ id: "first", at }), event({ id: "second", at })],
      server_now: at,
    };

    expect(toTimelineEvents(timeline).map((entry) => entry.id)).toEqual(["first", "second"]);
  });
});

describe("an event type this build does not know", () => {
  it("is kept as a dated row rather than dropped", () => {
    // A gap in a record both parties argue from during a dispute reads as
    // "nothing happened", which is worse than an unstyled entry.
    const unknown = toTimelineEvent(event({ id: "e9", type: "VENDOR_SANG_A_SONG" }));

    expect(unknown.id).toBe("e9");
    expect(unknown.at).toBe("2026-08-10T09:31:02Z");
    expect(unknown.type).toBeNull();
  });

  it("carries none of its detail fields", () => {
    // This build cannot know which fields of an unreviewed event are safe to
    // print, and guessing is how an identity leaks through a type nobody read.
    const unknown = toTimelineEvent(
      event({
        type: "VENDOR_SANG_A_SONG",
        detail: { vendor_name: "Ravi", vendors_invited: 5 },
      }),
    );

    expect(unknown.detail).toEqual({});
  });
});

describe("the pre-unlock identity rule", () => {
  it("keeps the invitation count and drops everything beside it", () => {
    // The rule `M2-FE-214` states as "invitations at an aggregate level". The
    // serializer is supposed to withhold identities too; this is what happens
    // when it stops.
    const wave = toTimelineEvent(
      event({
        type: "MATCHING_WAVE_SENT",
        detail: {
          vendors_invited: 5,
          vendor_names: ["Ravi", "Sunil"],
          vendor_ids: ["p-1", "p-2"],
          vendor_phone: "+919876543210",
        },
      }),
    );

    expect(wave.detail).toEqual({ vendors_invited: 5 });
  });

  it("drops an allowlisted key whose value is not printable", () => {
    // An allowlist that let an object through would render "[object Object]"
    // at best and a nested identity at worst.
    const wave = toTimelineEvent(
      event({ type: "MATCHING_WAVE_SENT", detail: { vendors_invited: { count: 5 } } }),
    );

    expect(wave.detail).toEqual({});
  });

  it("survives a detail field that is not an object at all", () => {
    // `detail` is `unknown` on the wire — a `JSONField` with no declared shape.
    expect(toTimelineEvent(event({ detail: "unexpected" })).detail).toEqual({});
    expect(toTimelineEvent(event({ detail: null })).detail).toEqual({});
    expect(toTimelineEvent(event({ detail: [1, 2] })).detail).toEqual({});
  });

  it("does not invent detail for an event that carries none", () => {
    expect(toTimelineEvent(event({ type: "QUOTE_RECEIVED" })).detail).toEqual({});
  });

  it("lets a question's own words through, because the Customer must answer it", () => {
    const asked = toTimelineEvent(
      event({
        type: "QUESTION_ASKED",
        // `question_id` is beside `body` on the wire and is deliberately not
        // allowlisted: it addresses a clarification thread that is Wave A2's,
        // and a timeline has nowhere to send it.
        detail: { body: "Is there a lift to the 4th floor?", question_id: "q-1" },
      }),
    );

    expect(asked.detail).toEqual({ body: "Is there a lift to the 4th floor?" });
  });

  it("lets the closure reason through, which is the field the re-point recovered", () => {
    // The allowlist permitted `closure_reason`; `_transition_events` sends
    // `reason_code`. Nothing failed, because dropping is what an allowlist
    // does — it was silently withholding the one field that says *why* a
    // request closed, which is the distinction `M2-FE-215` is built on.
    const closed = toTimelineEvent(
      event({ type: "REQUIREMENT_CLOSED", detail: { reason_code: "no_supply" } }),
    );

    expect(closed.detail).toEqual({ reason_code: "no_supply" });
  });

  it("lets a site-visit fee through, because it is money the Customer may be asked for", () => {
    const visit = toTimelineEvent(
      event({ type: "SITE_VISIT_REQUESTED", detail: { fee_paise: 29900, partner_id: "p-1" } }),
    );

    expect(visit.detail).toEqual({ fee_paise: 29900 });
  });
});
