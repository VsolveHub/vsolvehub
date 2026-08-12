import { ApiNetworkError, ApiRequestError } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import {
  isFreelyEditable,
  isLifecycleUnsupported,
  isRequirementDuplicate,
  isRequirementLocked,
  isVendorVisible,
  readRequirementList,
  shouldRetryM2Read,
} from "./m2-requirement";

const detail = (code: string, message = "Readable message.") => ({
  code,
  message,
  details: null,
  retryable: false,
  request_id: "req_m2",
});

const row = (id: string) => ({ id, status: "MATCHING" });

describe("readRequirementList", () => {
  it("reads the array the OpenAPI document declares", () => {
    expect(readRequirementList([row("a"), row("b")]).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("reads the cursor envelope the view actually returns", () => {
    // `RequirementCollectionView.get` paginates while its `@extend_schema`
    // declares a bare list. This branch is the whole reason the function
    // exists; when the backend fix lands it is the branch that gets deleted.
    const payload = { next: "cursor=abc", previous: null, results: [row("a")] };
    expect(readRequirementList(payload).map((r) => r.id)).toEqual(["a"]);
  });

  it("reads an empty envelope as no rows rather than throwing", () => {
    expect(readRequirementList({ next: null, previous: null, results: [] })).toEqual([]);
  });

  it("reads an unrecognisable payload as no rows", () => {
    // Safe only because the caller decides "empty" from query status, never
    // from length: a failed read renders its error, not the empty state.
    expect(readRequirementList(null)).toEqual([]);
    expect(readRequirementList("nonsense")).toEqual([]);
    expect(readRequirementList({ detail: "boom" })).toEqual([]);
  });
});

describe("shouldRetryM2Read", () => {
  it("does not retry a session that has ended", () => {
    expect(shouldRetryM2Read(0, new ApiRequestError(401, detail("not_authenticated")))).toBe(false);
  });

  it("does not retry a refusal", () => {
    expect(shouldRetryM2Read(0, new ApiRequestError(403, detail("permission_denied")))).toBe(false);
  });

  it("does not retry a 404, because M2 answers 404 for somebody else's record", () => {
    // Existence is private, so "not yours" and "gone" arrive identically. A
    // second attempt cannot change either one.
    expect(shouldRetryM2Read(0, new ApiRequestError(404, detail("m2_requirement_not_found")))).toBe(
      false,
    );
  });

  it("retries a server fault twice and then stops", () => {
    const error = new ApiRequestError(503, detail("service_unavailable"));
    expect(shouldRetryM2Read(0, error)).toBe(true);
    expect(shouldRetryM2Read(1, error)).toBe(true);
    expect(shouldRetryM2Read(2, error)).toBe(false);
  });

  it("retries a dropped connection", () => {
    expect(shouldRetryM2Read(0, new ApiNetworkError("offline", null))).toBe(true);
  });
});

describe("editability", () => {
  it("treats only DRAFT as a free edit", () => {
    expect(isFreelyEditable("DRAFT")).toBe(true);
    for (const status of ["MATCHING", "QUOTES_READY", "UNLOCKED", "CLOSED_EXPIRED"]) {
      expect(isFreelyEditable(status), status).toBe(false);
    }
  });

  it("counts an invitation as a vendor having seen it, not an acceptance", () => {
    // The expensive edit is the one made while vendors are mid-quote. Waiting
    // for QUOTES_READY would let exactly that one happen without a word.
    expect(isVendorVisible("MATCHING")).toBe(true);
    expect(isVendorVisible("QUOTES_READY")).toBe(true);
    expect(isVendorVisible("ENGAGED")).toBe(true);
  });

  it("does not treat a draft or a closed request as vendor-visible", () => {
    expect(isVendorVisible("DRAFT")).toBe(false);
    expect(isVendorVisible("CLOSED_NO_SUPPLY")).toBe(false);
    expect(isVendorVisible("CLOSED_EXPIRED")).toBe(false);
  });

  it("never claims a status it has not been told about is vendor-visible", () => {
    expect(isVendorVisible("SOMETHING_NEW")).toBe(false);
  });
});

describe("refusal predicates", () => {
  it("recognises the locked, duplicate and unsupported refusals by code", () => {
    expect(isRequirementLocked(new ApiRequestError(409, detail("m2_requirement_locked")))).toBe(
      true,
    );
    expect(
      isRequirementDuplicate(new ApiRequestError(409, detail("m2_requirement_duplicate"))),
    ).toBe(true);
    expect(
      isLifecycleUnsupported(new ApiRequestError(400, detail("m2_lifecycle_not_supported"))),
    ).toBe(true);
  });

  it("does not confuse two refusals that share a status", () => {
    // Both are 409 and they need different screens: one is "your request moved
    // on", the other is "you already have this open".
    const duplicate = new ApiRequestError(409, detail("m2_requirement_duplicate"));
    expect(isRequirementLocked(duplicate)).toBe(false);
  });

  it("recognises nothing in a non-API failure", () => {
    const offline = new ApiNetworkError("offline", null);
    expect(isRequirementLocked(offline)).toBe(false);
    expect(isRequirementDuplicate(offline)).toBe(false);
    expect(isLifecycleUnsupported(offline)).toBe(false);
  });
});
