import {
  applicationStatusPresentation,
  documentLabel,
  documentStatusPresentation,
  isWaitingForDecision,
  statusRouteFor,
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

describe("statusRouteFor", () => {
  it("keeps an application waiting for a decision on /apply, like the website", () => {
    // Regression: submitting sent the phone to a separate "Application in review" screen the
    // website does not have, so the two showed different pages for the same application.
    expect(statusRouteFor("SUBMITTED")).toBe("/apply");
    expect(statusRouteFor("UNDER_REVIEW")).toBe("/apply");
  });

  it("keeps the status screen for the states that need an answer", () => {
    expect(statusRouteFor("DECLINED")).toBe("/apply/status");
    expect(statusRouteFor("REJECTED")).toBe("/apply/status");
    expect(statusRouteFor(undefined)).toBe("/apply/status");
  });

  it("knows which statuses are waiting", () => {
    expect(isWaitingForDecision("SUBMITTED")).toBe(true);
    expect(isWaitingForDecision("UNDER_REVIEW")).toBe(true);
    expect(isWaitingForDecision("DRAFT")).toBe(false);
    expect(isWaitingForDecision("APPROVED")).toBe(false);
    expect(isWaitingForDecision(null)).toBe(false);
  });
});
