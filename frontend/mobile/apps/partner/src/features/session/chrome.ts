// Ported from frontend/apps/partner/features/session/partner-shell.tsx
export const PARTNER_ROLE = "partner";

export type PartnerChromeMode = "full" | "focused" | "onboarding";

export function getPartnerChromeMode(pathname: string): PartnerChromeMode {
  if (pathname.startsWith("/apply")) return "onboarding";
  if (
    pathname === "/home" ||
    pathname === "/work/all" ||
    pathname === "/money" ||
    pathname === "/me" ||
    pathname.startsWith("/me/") ||
    pathname === "/rentals" ||
    pathname === "/rentals/bookings" ||
    pathname === "/stays" ||
    pathname === "/stays/enquiries" ||
    pathname === "/stays/visits" ||
    pathname === "/listings"
  ) {
    return "full";
  }
  return "focused";
}

/**
 * Pages any signed-in account may open, whatever the state of their application.
 *
 * They sit outside `(app)`, but the `(app)` layout stays mounted underneath them and reads the
 * global path, so without this list it judged them partner-only and sent an applicant back to
 * `/apply` about a second after Help & support or Delete account opened.
 */
const OPEN_TO_ANY_ACCOUNT = ["/help", "/delete-account"];

/** Portal routes demand an approved Partner. Home, apply and the open pages do not. */
export function routeRequiresPartnerRole(pathname: string): boolean {
  if (pathname.startsWith("/apply")) return false;
  if (pathname === "/home" || pathname === "/work") return false;
  if (OPEN_TO_ANY_ACCOUNT.includes(pathname)) return false;
  return true;
}

export function focusedHeaderTitle(pathname: string, titleOverride: string | null): string {
  let title = "Details";
  if (pathname.startsWith("/dispatch")) title = "Instant Job Offer";
  else if (pathname.startsWith("/work/offers")) title = "Work Offer";
  else if (pathname.endsWith("/arrival")) title = "Arrival code";
  else if (pathname.startsWith("/work/enquiries")) title = "Enquiry";
  else if (pathname.startsWith("/work/jobs")) title = "Job Details";
  else if (pathname.startsWith("/account") || pathname.startsWith("/me")) title = "Account";
  else if (pathname.startsWith("/rentals/bookings")) title = "Rental Bookings";
  else if (pathname.startsWith("/rentals")) title = "Rental Management";
  else if (pathname.startsWith("/stays/enquiries")) title = "Stay Enquiries";
  else if (pathname.startsWith("/stays/visits")) title = "Scheduled Visits";
  else if (pathname.startsWith("/stays")) title = "Stay Hosting";
  else if (pathname.startsWith("/listings/post")) title = "Post Job Opening";
  else if (pathname.startsWith("/listings")) title = "Details";
  if (titleOverride !== null) title = titleOverride;
  return title;
}
