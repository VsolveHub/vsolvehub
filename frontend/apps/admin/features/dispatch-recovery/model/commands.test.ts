import { ApiNetworkError, ApiRequestError } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import {
  COMMANDS,
  NOTE_MAX_LENGTH,
  REASONS,
  currentVersionFrom,
  dispatchFailure,
  eligibilityEntries,
  hasRankingSnapshot,
  isCommandInvalid,
  isInProgress,
  isNoteAcceptable,
  isVersionConflict,
} from "./commands";
import { attempt } from "../../shared/fixtures";

/**
 * Reading dispatch's refusals, and reading its explanation honestly.
 *
 * The refusal that matters most is `dispatch_version_conflict`. Django publishes
 * it as retryable and it genuinely is — the operator's intent may still be right
 * against the new state. What must never follow is an automatic retry carrying
 * the version Django just quoted, because that turns the optimistic guard into a
 * rubber stamp on a state nobody read. So the classifier's job is to say
 * "re-read first", and these tests hold it to that.
 */

function apiError(code: string, status: number, details: unknown = null, message = "Refused.") {
  return new ApiRequestError(status, {
    code,
    message,
    details,
    retryable: code === "dispatch_version_conflict",
    request_id: "req_1",
  });
}

describe("the version guard", () => {
  it("recognises the conflict and publishes the version Django is at", () => {
    const error = apiError("dispatch_version_conflict", 409, { current_version: 9 });

    expect(isVersionConflict(error)).toBe(true);
    expect(currentVersionFrom(error)).toBe(9);
  });

  it("says nothing changed, and that a re-read comes first", () => {
    const failure = dispatchFailure(apiError("dispatch_version_conflict", 409, { current_version: 9 }));

    expect(failure?.message).toMatch(/nothing was changed/i);
    expect(failure?.message).toMatch(/version 9/);
    expect(failure?.refetchFirst).toBe(true);
  });

  it("still refuses honestly when Django published no version", () => {
    const failure = dispatchFailure(apiError("dispatch_version_conflict", 409, {}));

    expect(currentVersionFrom(apiError("dispatch_version_conflict", 409, {}))).toBeNull();
    expect(failure?.message).toMatch(/nothing was changed/i);
    expect(failure?.message).not.toMatch(/version undefined|version null/i);
  });

  it("reads a version from nothing else", () => {
    expect(currentVersionFrom(apiError("dispatch_command_invalid", 400, { current_version: 9 }))).toBeNull();
    expect(currentVersionFrom(new ApiNetworkError("offline", null))).toBeNull();
  });
});

describe("a command that no longer applies", () => {
  it("shows Django's own sentence, which is more specific than a guess", () => {
    // "This offer is no longer live to revoke" and "This reservation is already
    // released" are different facts, and both are operator-safe copy authored by
    // the domain command.
    const failure = dispatchFailure(
      apiError("dispatch_command_invalid", 400, null, "This offer is no longer live to revoke."),
    );

    expect(isCommandInvalid(apiError("dispatch_command_invalid", 400))).toBe(true);
    expect(failure?.message).toMatch(/no longer live to revoke/);
    expect(failure?.message).toMatch(/nothing was changed/i);
    expect(failure?.refetchFirst).toBe(true);
  });
});

describe("a command still in flight", () => {
  it("tells the operator to wait rather than to send another", () => {
    const failure = dispatchFailure(apiError("idempotency_in_progress", 409));

    expect(isInProgress(apiError("idempotency_in_progress", 409))).toBe(true);
    expect(failure?.message).toMatch(/do not send a second one/i);
    // Nothing to re-read yet: the outcome does not exist either way.
    expect(failure?.refetchFirst).toBe(false);
  });
});

describe("an id that does not resolve", () => {
  it("says the id is the problem, and that no search exists to fix it", () => {
    const failure = dispatchFailure(apiError("not_found", 404));

    expect(failure?.title).toMatch(/could not find that record/i);
    expect(failure?.message).toMatch(/publishes no search/i);
  });
});

describe("every refusal states what happened to the visit", () => {
  it("never leaves an operator guessing whether the command landed", () => {
    for (const error of [
      apiError("dispatch_version_conflict", 409, { current_version: 2 }),
      apiError("dispatch_command_invalid", 400),
      apiError("idempotency_in_progress", 409),
      apiError("idempotency_key_reused", 409),
      apiError("not_found", 404),
      apiError("permission_denied", 403),
      apiError("validation_error", 400),
      new ApiNetworkError("offline", null),
    ]) {
      const failure = dispatchFailure(error);
      expect(failure).not.toBeNull();
      expect(failure?.message).toMatch(
        /nothing was changed|do not send a second one|check what already happened/i,
      );
    }
  });

  it("returns null when there is nothing to report", () => {
    expect(dispatchFailure(null)).toBeNull();
    expect(dispatchFailure(undefined)).toBeNull();
  });

  it("does not offer to ask for access that is granted per account", () => {
    const failure = dispatchFailure(apiError("permission_denied", 403));
    expect(failure?.title).toMatch(/do not have access/i);
    expect(failure?.message).toMatch(/granted per account/i);
  });
});

describe("what each command costs, in words", () => {
  it("warns that releasing can unwind the whole Booking Group", () => {
    // The one command here whose damage reaches visits the operator was not
    // looking at.
    expect(COMMANDS.release.consequence).toMatch(/whole Booking Group/i);
    expect(COMMANDS.release.consequence).toMatch(/replanned/i);
  });

  it("does not promise that recovery moves anything", () => {
    expect(COMMANDS.recover.consequence).toMatch(/does not force an outcome/i);
  });

  it("says a revoked Partner is not told why", () => {
    expect(COMMANDS.revoke.consequence).toMatch(/not told why/i);
  });

  it("offers exactly the reasons Django accepts", () => {
    expect(REASONS.map((entry) => entry.value)).toEqual([
      "PARTNER_UNREACHABLE",
      "CUSTOMER_REQUEST",
      "SAFETY_CONCERN",
      "DUPLICATE_DISPATCH",
      "STUCK_DISPATCH",
      "OPERATIONS_ERROR",
    ]);
  });
});

describe("notes", () => {
  it("are optional, and bounded by Django's field length", () => {
    expect(isNoteAcceptable("")).toBe(true);
    expect(isNoteAcceptable("a".repeat(NOTE_MAX_LENGTH))).toBe(true);
    expect(isNoteAcceptable("a".repeat(NOTE_MAX_LENGTH + 1))).toBe(false);
  });
});

describe("reading the explanation", () => {
  it("distinguishes an empty snapshot from a dispatch that found nobody", () => {
    // `ranking.py` still orders by Partner UUID and older attempts predate the
    // snapshot, so an empty `ranked` is "not recorded", not "nobody eligible".
    expect(hasRankingSnapshot(attempt({ ranked: [], excluded: [] }))).toBe(false);
    expect(
      hasRankingSnapshot(attempt({ ranked: [], excluded: [{ partner_id: "p-1", reasons: ["skill"] }] })),
    ).toBe(true);
  });

  it("renders eligibility values without asserting a shape", () => {
    const entries = eligibilityEntries(
      attempt({ eligibility: { skill_match: true, radius_km: 12, notes: { extra: 1 } } }),
    );

    expect(entries).toEqual([
      { key: "skill_match", value: "true" },
      { key: "radius_km", value: "12" },
      { key: "notes", value: '{"extra":1}' },
    ]);
  });
});
