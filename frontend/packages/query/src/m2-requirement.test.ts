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
  type RequirementSummary,
  type RequirementSummaryPage,
} from "./m2-requirement";

const detail = (code: string, message = "Readable message.") => ({
  code,
  message,
  details: null,
  retryable: false,
  request_id: "req_m2",
});

const row = (id: string): RequirementSummary => ({
  id,
  status: "MATCHING",
  category_slug: "deep-cleaning",
  // Required since contract 1.24.0. `category_slug` is a slug and `My requests` was formatting one
  // into a row title; the server now sends the name it should have been reading.
  service_name: "Deep cleaning",
  lifecycle_explanation: null,
  service_by: null,
  quote_delivery_deadline_at: "2026-08-20T09:00:00Z",
  teaser_count: 0,
  closure_reason: null,
  last_activity_at: "2026-08-13T09:00:00Z",
  engagement_id: null,
});

const page = (...rows: readonly RequirementSummary[]): RequirementSummaryPage => ({
  next: null,
  previous: null,
  results: [...rows],
});

describe("readRequirementList", () => {
  // The bare-array and unreadable-payload cases were deleted with the branches
  // they covered: contract 1.23.0 declares `RequirementSummaryPage`, so the
  // envelope is the only shape and `results` is required. See the module note.
  it("reads the rows out of the page the view returns", () => {
    expect(readRequirementList(page(row("a"), row("b"))).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("reads an empty page as no rows rather than throwing", () => {
    expect(readRequirementList(page())).toEqual([]);
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
