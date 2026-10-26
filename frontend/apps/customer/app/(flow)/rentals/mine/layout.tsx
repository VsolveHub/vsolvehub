import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * A signed-in customer's own rental bookings: not a search result.
 *
 * The page is a client component and cannot export metadata, so its title
 * lives here; without it the tab showed the site default.
 */
export const metadata: Metadata = {
  title: "Your rentals",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
