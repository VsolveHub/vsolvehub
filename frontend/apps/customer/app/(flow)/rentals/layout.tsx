import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Title for the public rentals catalogue.
 *
 * The page is a client component and cannot export metadata, so its title
 * lives here; without it the tab showed the site default.
 */
export const metadata: Metadata = {
  title: "Equipment & Tool Rentals in Hyderabad",
  description:
    "Rent tools and equipment from verified owners in Hyderabad. Compare prices, pick up or get delivery, and book online with V Solve Hub.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
