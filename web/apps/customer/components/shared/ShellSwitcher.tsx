"use client";

import { AppHeader, BottomNav } from "@/components/shared/AppShell";
import { AppFooter } from "@/components/shared/AppFooter";

/**
 * App chrome wrapper (header, bottom nav, footer) shared by every customer page.
 *
 * Location detection is intentionally NOT handled here. It lives entirely in
 * <AppHeader>'s address modal, which prompts the user *with context* (and routes
 * reverse-geocoding through the /api/geocode/reverse proxy). Doing it here too
 * caused a second, uncontextualized geolocation prompt and a direct call to the
 * external Nominatim host from the browser.
 */
export function ShellSwitcher({ children }: { children: React.ReactNode }) {
  // Keep navigation present on all customer pages for a consistent app feel.
  // The header supports a compact mode on certain routes via `app-header--compact`.
  return (
    <div className="shell-switcher-layout" suppressHydrationWarning>
      <AppHeader />
      <main className="main-content main-content-wrapper">{children}</main>
      <BottomNav />
      <AppFooter />
    </div>
  );
}
