import { describe, expect, it } from "vitest";

import type { RentalBooking } from "@/features/rentals/model";
import type { StayEnquiry, StayReservation, StayVisit } from "@/features/stays/queries";

import { marketplaceItems } from "./activity-screen";

const rental = { id: "r1", status: "RETURNED", created_at: "2026-10-20T10:00:00Z" } as RentalBooking;
const visit = {
  id: "v1",
  status: "ACCEPTED",
  visit_date: "2026-11-02",
  created_at: "2026-10-25T10:00:00Z",
} as StayVisit;
const enquiry = {
  id: "e1",
  status: "DECLINED",
  check_in: "2026-11-05",
  created_at: "2026-10-26T10:00:00Z",
} as StayEnquiry;
const reservation = { id: "s1", status: "CONFIRMED", created_at: "2026-10-27T10:00:00Z" } as StayReservation;

describe("rentals and stays in Your Bookings", () => {
  it("turns every rental and stay into a hub row of the right type and tab", () => {
    const items = marketplaceItems(
      { rentals: [rental], visits: [visit], enquiries: [enquiry], reservations: [reservation] },
      new Date(2026, 9, 29),
    );

    expect(items.map((item) => [item.kind, item.type, item.section])).toEqual([
      ["rental", "rentals", "past"],
      ["stay-visit", "stays", "active"],
      ["stay-enquiry", "stays", "cancelled"],
      ["stay-reservation", "stays", "active"],
    ]);
  });

  it("keys rows by kind, so a stay and a rental with the same id never collide", () => {
    const items = marketplaceItems({
      rentals: [{ ...rental, id: "same" }],
      visits: [{ ...visit, id: "same" }],
      enquiries: [],
      reservations: [],
    });

    expect(new Set(items.map((item) => item.key)).size).toBe(2);
  });
});
