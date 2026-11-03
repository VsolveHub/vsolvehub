import { describe, expect, it } from "vitest";

import {
  bookingStatusHref,
  rentalSection,
  stayEnquirySection,
  stayReservationSection,
  stayVisitSection,
  toBookingType,
} from "./booking-status";

/** Rentals and stays sit in the same Upcoming & Active · Past · Cancelled tabs as services. */

const TODAY = new Date(2026, 9, 29, 12, 0);

describe("rentalSection", () => {
  it("keeps a rental active until it is returned, a dispute included", () => {
    for (const status of ["AWAITING_TRANSPORT_QUOTE", "PENDING_PAYMENT", "CONFIRMED", "HANDOVER", "DISPUTED"] as const) {
      expect(rentalSection({ status })).toBe("active");
    }
    expect(rentalSection({ status: "RETURNED" })).toBe("past");
    expect(rentalSection({ status: "CANCELLED" })).toBe("cancelled");
  });
});

describe("stayVisitSection", () => {
  it("keeps a visit active until its day has passed", () => {
    expect(stayVisitSection({ status: "REQUESTED", visit_date: "2026-10-01" }, TODAY)).toBe("active");
    expect(stayVisitSection({ status: "ACCEPTED", visit_date: "2026-10-29" }, TODAY)).toBe("active");
    expect(stayVisitSection({ status: "ACCEPTED", visit_date: "2026-10-28" }, TODAY)).toBe("past");
  });

  it("files a declined or cancelled visit as cancelled, an unanswered one as past", () => {
    expect(stayVisitSection({ status: "DECLINED", visit_date: "2026-11-02" }, TODAY)).toBe("cancelled");
    expect(stayVisitSection({ status: "CANCELLED", visit_date: "2026-11-02" }, TODAY)).toBe("cancelled");
    expect(stayVisitSection({ status: "EXPIRED", visit_date: "2026-10-20" }, TODAY)).toBe("past");
  });
});

describe("stayEnquirySection", () => {
  it("keeps an enquiry active while it waits or is answered", () => {
    expect(stayEnquirySection({ status: "SUBMITTED", check_in: "2026-11-05" }, TODAY)).toBe("active");
    expect(stayEnquirySection({ status: "RESPONDED", check_in: "2026-11-05" }, TODAY)).toBe("active");
    expect(stayEnquirySection({ status: "CONFIRMED", check_in: "2026-11-05" }, TODAY)).toBe("active");
  });

  it("moves a confirmed stay to past once check-in has gone by", () => {
    expect(stayEnquirySection({ status: "CONFIRMED", check_in: "2026-10-01" }, TODAY)).toBe("past");
    expect(stayEnquirySection({ status: "EXPIRED", check_in: "2026-11-05" }, TODAY)).toBe("past");
  });

  it("files declined, withdrawn and cancelled enquiries as cancelled", () => {
    for (const status of ["DECLINED", "WITHDRAWN", "CANCELLED"] as const) {
      expect(stayEnquirySection({ status, check_in: "2026-11-05" }, TODAY)).toBe("cancelled");
    }
  });
});

describe("stayReservationSection", () => {
  it("sorts reservations by where the stay is", () => {
    expect(stayReservationSection({ status: "CONFIRMED" })).toBe("active");
    expect(stayReservationSection({ status: "CHECKED_IN" })).toBe("active");
    expect(stayReservationSection({ status: "CHECKED_OUT" })).toBe("past");
    expect(stayReservationSection({ status: "NO_SHOW" })).toBe("past");
    expect(stayReservationSection({ status: "CANCELLED" })).toBe("cancelled");
  });
});

describe("the type filter in the address", () => {
  it("reads only the published types", () => {
    expect(toBookingType("rentals")).toBe("rentals");
    expect(toBookingType("stays")).toBe("stays");
    expect(toBookingType("jobs")).toBeNull();
    expect(toBookingType(undefined)).toBeNull();
  });

  it("keeps the type when switching tabs", () => {
    expect(bookingStatusHref("active", "rentals")).toBe("/activity?type=rentals");
    expect(bookingStatusHref("past", "stays")).toBe("/activity?status=past&type=stays");
    expect(bookingStatusHref("past")).toBe("/activity?status=past");
  });
});
