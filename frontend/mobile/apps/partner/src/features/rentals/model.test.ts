import {
  canSubmitAsset,
  formatPaise,
  getRentalBookingStatusBadge,
  getRentalStatusBadge,
} from "./model";

describe("Partner Rentals Model & Status Mappings", () => {
  describe("formatPaise", () => {
    it("formats paise to Indian Rupee strings with en-IN separators", () => {
      expect(formatPaise(0)).toBe("₹0");
      expect(formatPaise(null)).toBe("₹0");
      expect(formatPaise(undefined)).toBe("₹0");
      expect(formatPaise(50000)).toBe("₹500");
      expect(formatPaise(1250000)).toBe("₹12,500");
    });
  });

  describe("canSubmitAsset", () => {
    it("permits submission only for DRAFT or REJECTED assets", () => {
      expect(canSubmitAsset("DRAFT")).toBe(true);
      expect(canSubmitAsset("REJECTED")).toBe(true);
      expect(canSubmitAsset("APPROVED")).toBe(false);
      expect(canSubmitAsset("PENDING_REVIEW")).toBe(false);
    });
  });

  describe("getRentalStatusBadge", () => {
    it("returns correct moderation and status badges", () => {
      expect(getRentalStatusBadge("ACTIVE", "REJECTED").tone).toBe("danger");
      expect(getRentalStatusBadge("ACTIVE", "PENDING_REVIEW").tone).toBe("warning");
      expect(getRentalStatusBadge("ACTIVE", "APPROVED").tone).toBe("success");
      expect(getRentalStatusBadge("PAUSED", "APPROVED").tone).toBe("warning");
    });
  });

  describe("getRentalBookingStatusBadge", () => {
    it("maps booking statuses to correct badges and tones", () => {
      expect(getRentalBookingStatusBadge("CONFIRMED").tone).toBe("brand");
      expect(getRentalBookingStatusBadge("HANDED_OVER").tone).toBe("success");
      expect(getRentalBookingStatusBadge("CANCELLED").tone).toBe("danger");
      expect(getRentalBookingStatusBadge("DISPUTED").tone).toBe("danger");
      expect(getRentalBookingStatusBadge("RETURNED").tone).toBe("neutral");
    });
  });
});
