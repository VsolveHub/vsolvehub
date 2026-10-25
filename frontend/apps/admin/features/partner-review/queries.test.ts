import { ApiNetworkError, ApiRequestError } from "@vsolve/api-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/browser", () => ({ getApiClient: () => ({}) }));

const { isClaimedElsewhere, isVersionConflict } = await import("./queries");

/**
 * Which refusals mean "someone else acted first".
 *
 * Every domain refusal on the transition endpoint is a 409. Reading them all as
 * a version conflict told a reviewer to wait out "Approve the latest required
 * documents first" — a problem only they could fix — so the check is by code.
 */

function refusal(code: string, status = 409) {
  return new ApiRequestError(status, {
    code,
    message: "Refused.",
    details: null,
    retryable: false,
    request_id: "req_1",
  });
}

describe("version conflicts", () => {
  it("recognises a genuine version conflict", () => {
    expect(isVersionConflict(refusal("partner_application_version_conflict"))).toBe(true);
  });

  it.each([
    "partner_application_incomplete",
    "partner_transition_not_allowed",
    "partner_review_ownership_conflict",
  ])("does not mistake %s for one", (code) => {
    expect(isVersionConflict(refusal(code))).toBe(false);
  });

  it("is never a network failure or a server error", () => {
    expect(isVersionConflict(new ApiNetworkError("offline", new Error("x")))).toBe(false);
    expect(isVersionConflict(refusal("internal_error", 500))).toBe(false);
  });
});

describe("a review held by someone else", () => {
  it("covers both a version conflict and another reviewer's claim", () => {
    expect(isClaimedElsewhere(refusal("partner_application_version_conflict"))).toBe(true);
    expect(isClaimedElsewhere(refusal("partner_review_ownership_conflict"))).toBe(true);
  });

  it("does not cover an incomplete application", () => {
    expect(isClaimedElsewhere(refusal("partner_application_incomplete"))).toBe(false);
  });
});
