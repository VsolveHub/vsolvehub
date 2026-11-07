const GATED_PREFIXES = [
  "/engagements",
  "/activity",
  "/projects",
  "/account",
  "/requests",
  "/bookings",
  "/jobs",
  "/rentals/mine",
  "/stays/mine",
  "/listings/profile",
];

export function requiresCustomerSignIn(pathname: string): boolean {
  return GATED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Bookings tab is `/activity` and stays selected on `/bookings…`. */
export function isCustomerTabActive(tabHref: string, pathname: string): boolean {
  if (tabHref === "/activity") {
    return pathname === "/activity" || pathname.startsWith("/activity/") || pathname === "/bookings" || pathname.startsWith("/bookings/");
  }
  if (tabHref === "/") return pathname === "/";
  return pathname === tabHref || pathname.startsWith(`${tabHref}/`);
}
