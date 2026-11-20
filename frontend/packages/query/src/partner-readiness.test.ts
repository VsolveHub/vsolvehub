import { describe, expect, it } from "vitest";

import {
  isServiceAreaRequirementMet,
  isWorkingHoursRequirementMet,
  shouldSkipHoursStep,
} from "./partner-readiness";

describe("partner-readiness", () => {
  describe("isServiceAreaRequirementMet", () => {
    it("is met with at least 1 service area", () => {
      expect(isServiceAreaRequirementMet({ serviceAreaIds: ["area-1"] })).toBe(true);
    });

    it("is met with 0 areas but at least 1 requested PIN", () => {
      expect(
        isServiceAreaRequirementMet({ serviceAreaIds: [], requestedPostalCodes: ["509216"] }),
      ).toBe(true);
      expect(
        isServiceAreaRequirementMet({ serviceAreaIds: [], areaRequestsCount: 1 }),
      ).toBe(true);
    });

    it("is not met with 0 areas and 0 requested PINs", () => {
      expect(isServiceAreaRequirementMet({ serviceAreaIds: [], requestedPostalCodes: [] })).toBe(false);
    });
  });

  describe("isWorkingHoursRequirementMet", () => {
    it("is met when zero areas are selected but requested PINs exist (hours skipped)", () => {
      expect(
        isWorkingHoursRequirementMet({ serviceAreaIds: [], requestedPostalCodes: ["509216"] }),
      ).toBe(true);
    });

    it("is not met when zero areas and zero requested PINs", () => {
      expect(
        isWorkingHoursRequirementMet({ serviceAreaIds: [], requestedPostalCodes: [] }),
      ).toBe(false);
    });

    it("requires active hours for every selected area", () => {
      const rules = [
        { service_area_id: "area-1", is_active: true },
        { service_area_id: "area-2", is_active: true },
      ];
      expect(
        isWorkingHoursRequirementMet({ serviceAreaIds: ["area-1", "area-2"], availabilityRules: rules }),
      ).toBe(true);

      // Missing area-2
      expect(
        isWorkingHoursRequirementMet({
          serviceAreaIds: ["area-1", "area-2"],
          availabilityRules: [{ service_area_id: "area-1", is_active: true }],
        }),
      ).toBe(false);

      // Inactive rule for area-2
      expect(
        isWorkingHoursRequirementMet({
          serviceAreaIds: ["area-1", "area-2"],
          availabilityRules: [
            { service_area_id: "area-1", is_active: true },
            { service_area_id: "area-2", is_active: false },
          ],
        }),
      ).toBe(false);
    });
  });

  describe("shouldSkipHoursStep", () => {
    it("returns true when zero areas are selected", () => {
      expect(shouldSkipHoursStep({ serviceAreaIds: [] })).toBe(true);
      expect(shouldSkipHoursStep({ serviceAreaIds: ["area-1"] })).toBe(false);
    });
  });
});
