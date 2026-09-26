import { ApiNetworkError, ApiRequestError } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import {
  failureReason,
  isForbidden,
  isMakerCheckerRefusal,
  isStaleRule,
  ruleFailure,
} from "./failures";

/**
 * Reading Django's refusals.
 *
 * Every refusal on this surface is a `409`, and the discriminator lives in
 * `details.reason`. These tests hold the classifier to that: a change that
 * collapses back to status-based handling would give "somebody else edited this"
 * and "you cannot approve your own proposal" the same message, and only one of
 * them is fixed by refetching.
 */

function conflict(reason: unknown, code = "compatibility_rule_conflict", status = 409) {
  return new ApiRequestError(status, {
    code,
    message: "Refused.",
    details: reason === undefined ? null : { reason },
    retryable: false,
    request_id: "req_1",
  });
}

describe("finding the reason", () => {
  it("reads it out of a rule conflict and an activation refusal alike", () => {
    expect(failureReason(conflict("version_changed"))).toBe("version_changed");
    expect(
      failureReason(conflict("variant_inactive", "compatibility_rule_activation_invalid")),
    ).toBe("variant_inactive");
  });

  it("ignores a reason on an error code this surface does not own", () => {
    // Another domain's 409 may carry an unrelated `reason`. Reading it would
    // render one surface's copy for another surface's failure.
    expect(failureReason(conflict("version_changed", "payment_conflict"))).toBeNull();
  });

  it("survives an envelope with no usable details", () => {
    expect(failureReason(conflict(undefined))).toBeNull();
    expect(failureReason(conflict(42))).toBeNull();
    expect(failureReason(new ApiNetworkError("offline", null))).toBeNull();
    expect(failureReason(null)).toBeNull();
  });
});

describe("the refusal that must never be reachable", () => {
  it("names maker-checker as its own thing", () => {
    expect(isMakerCheckerRefusal(conflict("maker_checker_required"))).toBe(true);
    expect(isMakerCheckerRefusal(conflict("version_changed"))).toBe(false);
  });

  it("tells the reviewer it was never theirs, and offers no way to ask", () => {
    const failure = ruleFailure(conflict("maker_checker_required"));

    expect(failure?.title).toMatch(/not yours to decide/i);
    expect(failure?.message).toMatch(/another Operations reviewer/i);
    expect(failure?.message).toMatch(/nothing was changed/i);
    // There is no access that can be granted, so no message may imply one.
    expect(failure?.message).not.toMatch(/ask your team lead|request access/i);
  });
});

describe("stale rules are the ones a reload fixes", () => {
  it("covers every reason Django raises for a rule that moved", () => {
    for (const reason of [
      "version_changed",
      "rule_is_not_draft",
      "rule_is_not_current_draft",
      "rule_is_not_current_active",
      "concurrent_version_created",
    ]) {
      expect(isStaleRule(conflict(reason))).toBe(true);
      expect(ruleFailure(conflict(reason))?.refetchFirst).toBe(true);
    }
  });

  it("does not treat a catalog problem as staleness", () => {
    // `variant_inactive` is fixed in the catalog, not by pressing refresh.
    expect(isStaleRule(conflict("variant_inactive"))).toBe(false);
    expect(ruleFailure(conflict("variant_inactive"))?.refetchFirst).toBe(false);
  });
});

describe("every failure still says what happened to the rule", () => {
  it("states that the decision did not take effect, whatever the reason", () => {
    for (const reason of [
      "maker_checker_required",
      "version_changed",
      "variant_inactive",
      "conditions_not_supported",
      "parallel_dependency_invalid",
      "effective_window_overlap",
      "variants_must_differ",
      "variant_not_found",
    ]) {
      const failure = ruleFailure(conflict(reason));
      expect(failure, reason).not.toBeNull();
      expect(failure?.message, reason).toMatch(
        /nothing was (changed|saved)|was not (applied|saved)/i,
      );
    }
  });

  it("degrades an unrecognised reason rather than printing the identifier", () => {
    // A newer deployment adding a reason must not put an untranslated
    // identifier in front of an operator.
    const failure = ruleFailure(conflict("some_reason_shipped_next_week"));

    expect(failure?.message).not.toMatch(/some_reason_shipped_next_week/);
    expect(failure?.refetchFirst).toBe(true);
  });

  it("separates a permission refusal from a conflict", () => {
    const forbidden = new ApiRequestError(403, {
      code: "permission_denied",
      message: "Forbidden.",
      details: null,
      retryable: false,
      request_id: null,
    });

    expect(isForbidden(forbidden)).toBe(true);
    expect(ruleFailure(forbidden)?.title).toMatch(/do not have access/i);
  });

  it("returns null when there is nothing to report", () => {
    expect(ruleFailure(null)).toBeNull();
    expect(ruleFailure(undefined)).toBeNull();
  });

  it("falls back to an honest message when the server was never reached", () => {
    const failure = ruleFailure(new ApiNetworkError("offline", null));

    expect(failure?.message).toMatch(/nothing was changed/i);
  });
});
