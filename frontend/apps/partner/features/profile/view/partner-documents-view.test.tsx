import { describe, expect, it, vi } from "vitest";

const client = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() };
vi.mock("@/lib/api/browser", () => ({ getApiClient: () => client }));

const { APPLICATION_STATUS } = await import("./partner-documents-view");

describe("partner application status wording", () => {
  it("names every status in plain words", () => {
    for (const status of [
      "DRAFT",
      "SUBMITTED",
      "UNDER_REVIEW",
      "CHANGES_REQUIRED",
      "APPROVED",
      "DECLINED",
      "SUSPENDED",
      "OFFBOARDED",
    ]) {
      expect(APPLICATION_STATUS[status]?.label).toBeTruthy();
    }
  });

  it("only colours an approval as good; a decline or suspension never reads as approved", () => {
    expect(APPLICATION_STATUS.APPROVED?.tone).toBe("good");
    expect(APPLICATION_STATUS.DECLINED?.tone).toBe("bad");
    expect(APPLICATION_STATUS.SUSPENDED?.tone).toBe("bad");
    expect(APPLICATION_STATUS.SUBMITTED?.tone).toBe("waiting");
  });
});
