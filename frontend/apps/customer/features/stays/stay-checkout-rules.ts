/**
 * Re-exports the shared occupancy-model presentation logic from @vsolve/ui
 * so existing imports in this app (and stay-checkout-rules.test.ts) keep
 * working unchanged. The canonical implementation lives in
 * frontend/packages/ui/src/stays-occupancy.ts — see
 * Django_Next.js_Plan/M3/07-a9-stays-ux-overhaul-plan.md (Wave U0) for why
 * this was consolidated instead of kept as a local duplicate.
 */
export {
  isoDatePlusDays,
  defaultStayStartDate,
  defaultStayEndDate,
  stayNights,
  leaseMonthsFromDates,
  publishedDurationModes,
  shouldShowDurationToggle,
  durationModeLabel,
  shouldShowOccupantPicker,
  holdGuestCount,
  occupancyGuestCap,
  hideSoldOutStayCards,
} from "@vsolve/ui";
export type { StayDurationMode } from "@vsolve/ui";
