import { describe, expect, it } from "vitest";

import { isSelfApproval, isStepUpRequired } from "../queries";

/**
 * Two refusals the console has to tell apart from ordinary failure.
 *
 * Both are the platform working correctly, and both need a specific screen. Rendering either as
 * "something went wrong" leaves an operator pressing a button that keeps not working, with no
 * idea that the fix is a verification code or a colleague.
 */

describe("step-up refusals are routed, not reported as errors", () => {
  it("recognises the step-up refusal", () => {
    expect(isStepUpRequired({ code: "step_up_required" })).toBe(true);
  });

  it("does not mistake any other failure for one", () => {
    // A version conflict and a validation error both need a different screen. Treating them as
    // "go and re-verify" would send somebody to an OTP form that fixes nothing.
    expect(isStepUpRequired({ code: "payout_batch_version_conflict" })).toBe(false);
    expect(isStepUpRequired({ code: "payout_batch_invalid" })).toBe(false);
    expect(isStepUpRequired(new Error("network"))).toBe(false);
    expect(isStepUpRequired(null)).toBe(false);
    expect(isStepUpRequired(undefined)).toBe(false);
    expect(isStepUpRequired("step_up_required")).toBe(false);
  });
});

describe("self-approval is distinguished from a permission failure", () => {
  it("recognises the maker-checker refusal", () => {
    expect(isSelfApproval({ code: "self_approval_denied" })).toBe(true);
  });

  it("is not confused with the step-up refusal", () => {
    // The two are both 4xx and both about authority, but the remedy is completely different:
    // one needs a code, the other needs a different person.
    expect(isSelfApproval({ code: "step_up_required" })).toBe(false);
    expect(isStepUpRequired({ code: "self_approval_denied" })).toBe(false);
  });

  it("survives a malformed error object", () => {
    expect(isSelfApproval({})).toBe(false);
    expect(isSelfApproval({ code: undefined })).toBe(false);
    expect(isSelfApproval(42)).toBe(false);
  });
});
