import { describe, expect, it } from "vitest";

import { STARTED_BY_LABEL, paidForLabel, reasonLabel } from "./refunds";

describe("reading a refund at a glance", () => {
  it("says what the refunded payment was for", () => {
    expect(paidForLabel("BOOKING_GROUP")).toBe("Home visit");
    expect(paidForLabel("A7_RENTAL_BOOKING")).toBe("Rental");
    expect(paidForLabel("A7_RENTAL_DEPOSIT")).toBe("Rental");
    expect(paidForLabel("A9_STAY_RESERVATION")).toBe("Stay");
    expect(paidForLabel("M2_STAGE_FUNDING")).toBe("Project or crew job");
    expect(paidForLabel(null)).toBe("—");
  });

  it("writes known reasons out and makes any other readable", () => {
    expect(reasonLabel("rental_paid_after_cancellation")).toBe(
      "Paid after the booking was already cancelled",
    );
    expect(reasonLabel("customer_cancelled_rental")).toBe("Customer cancelled the rental");
    expect(reasonLabel("goodwill-credit_for_delay")).toBe("Goodwill credit for delay");
  });

  it("names who started it", () => {
    expect(STARTED_BY_LABEL.AUTOMATIC).toBe("Automatic");
    expect(STARTED_BY_LABEL.OPERATIONS).toBe("Operations");
  });
});
