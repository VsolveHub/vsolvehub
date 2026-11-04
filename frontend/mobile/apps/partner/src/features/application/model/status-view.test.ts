import {
  extractRejectionReason,
  extractTimelineDates,
  formatSpecTimestamp,
  resolveStatusView,
} from "./status-view";

describe("resolveStatusView decision table", () => {
  it("returns 'rejected' when application is DECLINED, overriding approved documents", () => {
    const result = resolveStatusView(
      { status: "DECLINED" },
      [{ status: "APPROVED" }, { status: "APPROVED" }],
    );
    expect(result).toBe("rejected");
  });

  it("returns 'rejected' when application is DECLINED, overriding an expired document", () => {
    const result = resolveStatusView(
      { status: "DECLINED" },
      [{ status: "APPROVED" }],
      { hasExpiredDoc: true },
    );
    expect(result).toBe("rejected");
  });

  it("returns 'rejected' when application has alias REJECTED", () => {
    const result = resolveStatusView(
      { status: "REJECTED" as any },
      [{ status: "PENDING" }],
    );
    expect(result).toBe("rejected");
  });

  it("returns 'changes_needed' when application is CHANGES_REQUIRED", () => {
    const result = resolveStatusView(
      { status: "CHANGES_REQUIRED" },
      [{ status: "APPROVED" }],
    );
    expect(result).toBe("changes_needed");
  });

  it("returns 'changes_needed' when a document has status REJECTED", () => {
    const result = resolveStatusView(
      { status: "UNDER_REVIEW" },
      [{ status: "APPROVED" }, { status: "REJECTED" }],
    );
    expect(result).toBe("changes_needed");
  });

  it("returns 'changes_needed' when a document has scan_status REJECTED", () => {
    const result = resolveStatusView(
      { status: "SUBMITTED" },
      [{ status: "PENDING", scan_status: "REJECTED" } as any],
    );
    expect(result).toBe("changes_needed");
  });

  it("returns 'changes_needed' when an expired doc is flagged", () => {
    const result = resolveStatusView(
      { status: "UNDER_REVIEW" },
      [{ status: "APPROVED" }],
      { hasExpiredDoc: true },
    );
    expect(result).toBe("changes_needed");
  });

  it("returns 'approved' when status is APPROVED and no rejected docs", () => {
    const result = resolveStatusView(
      { status: "APPROVED" },
      [{ status: "APPROVED" }, { status: "APPROVED" }],
    );
    expect(result).toBe("approved");
  });

  it("returns 'in_review' when status is SUBMITTED and docs pending", () => {
    const result = resolveStatusView(
      { status: "SUBMITTED" },
      [{ status: "PENDING" }],
    );
    expect(result).toBe("in_review");
  });

  it("returns 'in_review' when status is UNDER_REVIEW and docs pending", () => {
    const result = resolveStatusView(
      { status: "UNDER_REVIEW" },
      [{ status: "PENDING" }],
    );
    expect(result).toBe("in_review");
  });

  it("returns 'in_review' for null or uninitialized application", () => {
    expect(resolveStatusView(null)).toBe("in_review");
  });
});

describe("extractRejectionReason", () => {
  it("extracts reason from transition history with application_declined", () => {
    const application = {
      status: "DECLINED",
      transitions: [
        {
          id: "t1",
          from_status: "UNDER_REVIEW",
          to_status: "DECLINED",
          reason_code: "application_declined",
          reason: "Documents could not be verified.",
          application_version: 2,
          occurred_at: "2026-10-27T10:20:00Z",
        },
      ],
    } as any;

    expect(extractRejectionReason(application)).toBe("Documents could not be verified.");
  });

  it("returns empty string when reason is blank or not provided", () => {
    const application = {
      status: "DECLINED",
      transitions: [
        {
          id: "t1",
          from_status: "UNDER_REVIEW",
          to_status: "DECLINED",
          reason_code: "application_declined",
          reason: "   ",
          application_version: 2,
          occurred_at: "2026-10-27T10:20:00Z",
        },
      ],
    } as any;

    expect(extractRejectionReason(application)).toBe("");
  });
});

describe("formatSpecTimestamp", () => {
  it("formats date in 12-hour clock with lowercase am/pm matching spec", () => {
    const formatted = formatSpecTimestamp(
      "2026-10-26T13:09:00Z", // 6:39 pm IST
      "26 Oct 2026, 6:39 pm",
    );
    expect(formatted).toContain("26 Oct 2026");
    expect(formatted).toMatch(/(am|pm)/);
  });
});

