import { describe, it, expect } from "vitest";
import { deriveBookingView, resolveTimeline } from "./booking-view";
import type { Booking } from "./types";

const base: Booking = {
  bookingRef: "VSH1",
  status: "ASSIGNED",
  message: "",
  service: { id: "s", name: "n", slug: "sl", categorySlug: "c" },
  issueDescription: "",
  mediaUrls: [],
  slot: "",
  scheduleType: "",
  address: "",
  vendor: null,
  provider: { id: "p", name: "Pro", phone: "1", rating: 5 },
  quotedAmount: 0,
  finalAmountPaise: 0,
  paymentStatus: "PENDING",
  paymentMethod: null,
  rating: null,
  archetypeDetails: "",
};

describe("deriveBookingView", () => {
  it("prefers provider over vendor as professional", () => {
    expect(deriveBookingView(base).professional?.name).toBe("Pro");
  });
  it("falls back to vendor when no provider", () => {
    const b = { ...base, provider: null, vendor: { id: "v", name: "Vend", phone: "1", rating: 4 } };
    expect(deriveBookingView(b).professional?.name).toBe("Vend");
  });
  it("marks COMPLETED bookings complete with correct timeline index", () => {
    const v = deriveBookingView({ ...base, status: "COMPLETED" });
    expect(v.isCompleted).toBe(true);
    expect(v.currentStatusIndex).toBe(5);
  });
  it("detects team bookings from archetypeDetails", () => {
    const v = deriveBookingView({ ...base, archetypeDetails: JSON.stringify({ bookingType: "team" }) });
    expect(v.isTeam).toBe(true);
  });
  it("treats empty archetypeDetails as empty details, not a crash", () => {
    expect(deriveBookingView(base).details).toEqual({});
  });
  it("treats malformed archetypeDetails as empty details, not a crash", () => {
    expect(deriveBookingView({ ...base, archetypeDetails: "{not json" }).details).toEqual({});
  });
});

describe("resolveTimeline", () => {
  it("labels steps before current as completed, current as active, later as upcoming", () => {
    const t = resolveTimeline(2); // ASSIGNED
    expect(t[1].state).toBe("completed");
    expect(t[2].state).toBe("active");
    expect(t[3].state).toBe("upcoming");
  });
});
