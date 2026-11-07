// Ported from frontend/apps/customer/features/activity/model/routes.ts
/** Legacy segment names retained only so old links keep resolving. */
export const ACTIVITY_TABS = ["booked", "requests", "projects"] as const;
export type ActivityTab = (typeof ACTIVITY_TABS)[number];
export const DEFAULT_ACTIVITY_TAB: ActivityTab = "booked";

export function toActivityTab(_value: string | string[] | undefined): ActivityTab {
  return DEFAULT_ACTIVITY_TAB;
}

/** Every former segment now has one canonical Customer destination. */
export function activityTabHref(_tab: ActivityTab): string {
  return "/activity";
}
