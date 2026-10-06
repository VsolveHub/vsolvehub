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
    pathname.startsWith("/me/")
  ) {
    return "full";
  }
  return "focused";
}

/** Portal routes demand an approved Partner. Home and apply do not. */
export function routeRequiresPartnerRole(pathname: string): boolean {
  if (pathname.startsWith("/apply")) return false;
  if (pathname === "/home" || pathname === "/work") return false;
  return true;
}

export function focusedHeaderTitle(pathname: string, titleOverride: string | null): string {
  let title = "Details";
  if (pathname.startsWith("/work/offers")) title = "Work Offer";
  else if (pathname.endsWith("/arrival")) title = "Arrival code";
  else if (pathname.startsWith("/work/enquiries")) title = "Enquiry";
  else if (pathname.startsWith("/work/jobs")) title = "Job Details";
  else if (pathname.startsWith("/account") || pathname.startsWith("/me")) title = "Account";
  if (titleOverride !== null) title = titleOverride;
  return title;
}
