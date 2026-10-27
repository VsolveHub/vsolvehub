/**
 * The one Partner support line.
 *
 * Hard-coded in `booking-support.tsx` before a second screen needed it. A
 * support number that differs between two screens is worse than no number at
 * all, so there is exactly one — the same line the customer site publishes.
 */
export const PARTNER_SUPPORT_PHONE = "+917330764634";
export const PARTNER_SUPPORT_PHONE_DISPLAY = "+91 733 076 4634";
export const PARTNER_SUPPORT_HOURS = "9am–9pm, every day";
/** Catalogue key for `PARTNER_SUPPORT_HOURS` — render `t(PARTNER_SUPPORT_HOURS_KEY)` in a component. */
export const PARTNER_SUPPORT_HOURS_KEY = "workspaces.support.hours";
/** Support, privacy requests and grievances all go to this one mailbox. */
export const PARTNER_SUPPORT_EMAIL = "support@vsolvehub.com";
