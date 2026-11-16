import {
  applicationStatusPresentation,
  documentLabel,
  documentStatusPresentation,
  trackerStage,
} from "./status";

describe("trackerStage", () => {
  it("places DRAFT and CHANGES_REQUIRED at stop 0 (Fill in)", () => {
    expect(trackerStage("DRAFT")).toBe(0);
    expect(trackerStage("CHANGES_REQUIRED")).toBe(0);
  });

  it("places SUBMITTED at stop 1 (Sent)", () => {
    expect(trackerStage("SUBMITTED")).toBe(1);
  });

  it("places UNDER_REVIEW at stop 2 (In review)", () => {
    expect(trackerStage("UNDER_REVIEW")).toBe(2);
  });

  it("places terminal/decision states at stop 3 (Decision)", () => {
    expect(trackerStage("APPROVED")).toBe(3);
    expect(trackerStage("DECLINED")).toBe(3);
    expect(trackerStage("SUSPENDED")).toBe(3);
    expect(trackerStage("OFFBOARDED")).toBe(3);
  });
});

describe("applicationStatusPresentation", () => {
  it("provides exact copy and tone for DRAFT", () => {
    const draft = applicationStatusPresentation("DRAFT");
    expect(draft.label).toBe("Draft");
    expect(draft.headline).toBe("Finish your application");
    expect(draft.next).toBe("Complete the steps below, then send it.");
    expect(draft.tone).toBe("neutral");
  });
});

describe("document labels & status", () => {
  it("maps document kinds and statuses accurately", () => {
    expect(documentLabel("GOVERNMENT_ID")).toBe("Government photo ID");
    expect(documentStatusPresentation({ status: "REJECTED", scan_status: "CLEAN" }).label).toBe(
      "Needs replacing",
    );
  });
});
