import { describe, expect, it } from "vitest";

import { leadOnlyHubPhase, toCrewPaymentRecord } from "./booking-record";

describe("lead-only booking hub state", () => {
  it("keeps COMPLETING as a customer action instead of a finished booking", () => {
    expect(leadOnlyHubPhase("COMPLETING")).toBe("completion");
    expect(leadOnlyHubPhase("COMPLETED")).toBe("done");
    expect(leadOnlyHubPhase("ACTIVE")).toBe("active");
  });
});

describe("crew booking payment record", () => {
  const crewTerms = {
    totalCustomerLabel: "₹5,400",
    leadReceiptLabel: "₹5,100",
  };

  it("shows the whole booking split and does not claim unsettled days are paid", () => {
    const record = toCrewPaymentRecord({
      crewTerms,
      stages: [
        {
          stageId: "day-1",
          label: "Day 1",
          status: "RELEASED",
          shiftSummary: {
            settlementStatus: "SETTLED",
            chip: { label: "Paid ✓ ₹2,550" },
          },
        },
        {
          stageId: "day-2",
          label: "Day 2",
          status: "RELEASED",
          shiftSummary: {
            settlementStatus: "SUPERVISOR_CLAIMED",
            chip: { label: "Confirm you paid" },
          },
        },
      ],
    });

    expect(record).toMatchObject({
      totalLabel: "₹5,400",
      directAmountLabel: "₹5,100",
      allDaysConfirmed: false,
      statusLabel: "1 of 2 days confirmed",
    });
  });

  it("marks all direct payments confirmed only after every live day settles", () => {
    const record = toCrewPaymentRecord({
      crewTerms,
      stages: [
        {
          stageId: "day-1",
          label: "Day 1",
          status: "RELEASED",
          shiftSummary: {
            settlementStatus: "SETTLED",
            chip: { label: "Paid ✓ ₹5,100" },
          },
        },
        {
          stageId: "cancelled-day",
          label: "Cancelled day",
          status: "CANCELLED",
          shiftSummary: {
            settlementStatus: "",
            chip: { label: "Cancelled" },
          },
        },
      ],
    });

    expect(record?.allDaysConfirmed).toBe(true);
    expect(record?.statusLabel).toBe("Confirmed paid");
    expect(record?.days).toHaveLength(1);
  });
});
