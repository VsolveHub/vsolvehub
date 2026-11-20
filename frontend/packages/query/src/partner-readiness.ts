/**
 * Shared Partner application readiness rules, used by both web and mobile.
 *
 * Implements Step 3 & 4 rules from FLOW.md:
 * - Service area requirement is met if: at least 1 area is selected OR at least 1 postal code is requested.
 * - Working hours requirement:
 *   - If zero areas are selected and at least 1 PIN is requested: MET (hours are skipped).
 *   - If at least 1 area is selected: requires active working hours for every selected area.
 */

export interface ServiceAreaReadinessInput {
  serviceAreaIds: readonly string[];
  requestedPostalCodes?: readonly string[];
  areaRequestsCount?: number;
}

export function isServiceAreaRequirementMet(input: ServiceAreaReadinessInput): boolean {
  const hasAreas = input.serviceAreaIds.length > 0;
  const hasRequestedPins =
    (input.requestedPostalCodes?.length ?? 0) > 0 || (input.areaRequestsCount ?? 0) > 0;
  return hasAreas || hasRequestedPins;
}

export interface WorkingHoursReadinessInput {
  serviceAreaIds: readonly string[];
  requestedPostalCodes?: readonly string[];
  areaRequestsCount?: number;
  availabilityRules?: readonly { service_area_id?: string; serviceAreaId?: string; is_active?: boolean }[];
}

export function isWorkingHoursRequirementMet(input: WorkingHoursReadinessInput): boolean {
  const hasAreas = input.serviceAreaIds.length > 0;
  const hasRequestedPins =
    (input.requestedPostalCodes?.length ?? 0) > 0 || (input.areaRequestsCount ?? 0) > 0;

  // Zero ticked areas: hours are skipped if they have requested PINs
  if (!hasAreas) {
    return hasRequestedPins;
  }

  // At least 1 ticked area: every ticked area needs at least one active rule
  const rules = input.availabilityRules ?? [];
  return input.serviceAreaIds.every((areaId) =>
    rules.some((rule) => {
      const ruleAreaId = rule.service_area_id ?? rule.serviceAreaId;
      const isActive = rule.is_active !== false;
      return ruleAreaId === areaId && isActive;
    }),
  );
}

export function shouldSkipHoursStep(input: ServiceAreaReadinessInput): boolean {
  return input.serviceAreaIds.length === 0;
}
