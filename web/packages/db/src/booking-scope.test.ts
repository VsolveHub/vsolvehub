import { describe, expect, it } from "vitest";
import { ACTIVE_BOOKING_WHERE, isCartStatus, isDispatchable } from "./booking-scope";

describe("ACTIVE_BOOKING_WHERE", () => {
  it("excludes cart states from every booking list", () => {
    expect(ACTIVE_BOOKING_WHERE).toEqual({ status: { notIn: ["DRAFT"] } });
  });
});

describe("isDispatchable", () => {
  it("refuses a draft booking", () => expect(isDispatchable("DRAFT")).toBe(false));
  it("allows an authorized booking", () => expect(isDispatchable("AUTHORIZED")).toBe(true));
  it("allows a pending booking", () => expect(isDispatchable("PENDING")).toBe(true));
  it("allows a searching booking", () => expect(isDispatchable("SEARCHING_PROVIDER")).toBe(true));
  it("refuses a completed booking", () => expect(isDispatchable("COMPLETED")).toBe(false));
  it("refuses a cancelled booking", () => expect(isDispatchable("CANCELLED")).toBe(false));
  it("refuses an exhausted booking", () => expect(isDispatchable("NO_WORKER_FOUND")).toBe(false));
});

describe("isCartStatus", () => {
  it("identifies drafts", () => expect(isCartStatus("DRAFT")).toBe(true));
  it("rejects real bookings", () => expect(isCartStatus("ASSIGNED")).toBe(false));
});
