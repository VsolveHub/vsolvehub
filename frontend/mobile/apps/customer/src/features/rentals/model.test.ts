import {
  calculateRentalDays,
  canCancelRentalBooking,
  formatPaise,
  getDepositStatusBadge,
  getRentalStatusBadge,
  rentalMineBucket,
} from "./model";

describe("Rentals Model & Financial Helpers", () => {
  describe("formatPaise", () => {
    it("formats paise to Indian Rupee strings with en-IN separators", () => {
      expect(formatPaise(0)).toBe("₹0");
      expect(formatPaise(100)).toBe("₹1");
      expect(formatPaise(10000)).toBe("₹100");
      expect(formatPaise(150000)).toBe("₹1,500");
      expect(formatPaise(10000000)).toBe("₹1,00,000");
    });
  });

  describe("calculateRentalDays", () => {
    it("calculates exact calendar days between start and end date", () => {
      expect(calculateRentalDays("2026-10-12", "2026-10-13")).toBe(1);
      expect(calculateRentalDays("2026-10-12", "2026-10-14")).toBe(2);
      expect(calculateRentalDays("2026-10-12", "2026-10-19")).toBe(7);
      expect(calculateRentalDays("2026-10-12", "2026-10-26")).toBe(14);
    });

    it("clamps minimum rental duration to at least 1 day", () => {
      expect(calculateRentalDays("2026-10-12", "2026-10-12")).toBe(1);
      expect(calculateRentalDays("", "")).toBe(1);
    });
  });

  describe("rentalMineBucket", () => {
    it("sorts bookings into correct customer tabs", () => {
      expect(rentalMineBucket("CONFIRMED")).toBe("UPCOMING");
      expect(rentalMineBucket("REQUESTED")).toBe("UPCOMING");
      expect(rentalMineBucket("PENDING_PAYMENT")).toBe("UPCOMING");
      expect(rentalMineBucket("HANDOVER")).toBe("ONGOING");
      expect(rentalMineBucket("HANDED_OVER")).toBe("ONGOING");
      expect(rentalMineBucket("RETURNED")).toBe("RETURNED");
      expect(rentalMineBucket("CLOSED")).toBe("RETURNED");
      expect(rentalMineBucket("CANCELLED")).toBe("INACTIVE");
      expect(rentalMineBucket("DISPUTED")).toBe("INACTIVE");
    });
  });

  describe("canCancelRentalBooking", () => {
    it("permits cancellation only for pending or confirmed bookings", () => {
      expect(canCancelRentalBooking("PENDING_PAYMENT")).toBe(true);
      expect(canCancelRentalBooking("CONFIRMED")).toBe(true);
      expect(canCancelRentalBooking("HANDOVER")).toBe(false);
      expect(canCancelRentalBooking("RETURNED")).toBe(false);
      expect(canCancelRentalBooking("CLOSED")).toBe(false);
    });
  });

  describe("getRentalStatusBadge & getDepositStatusBadge", () => {
    it("returns correct badges and tones", () => {
      expect(getRentalStatusBadge("CONFIRMED").tone).toBe("brand");
      expect(getRentalStatusBadge("HANDOVER").tone).toBe("success");
      expect(getRentalStatusBadge("CANCELLED").tone).toBe("danger");

      expect(getDepositStatusBadge("RELEASED").tone).toBe("success");
      expect(getDepositStatusBadge("HELD").tone).toBe("warning");
      expect(getDepositStatusBadge("DEDUCTED").tone).toBe("danger");
    });
  });
});
