import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SITE_NAME } from "@/lib/site";

/**
 * Title for the public rentals catalogue.
 *
 * The page is a client component and cannot export metadata, so its title
 * lives here; without it the tab showed the site default.
 */
export const metadata: Metadata = {
  // An object, not a string: a plain string here switches off the root
  // template for every page below, so their tabs lose the brand.
  title: { default: "Equipment & Tool Rentals in Hyderabad", template: `%s | ${SITE_NAME}` },
  description:
    "Rent tools and equipment from verified owners in Hyderabad. Compare prices, pick up or get delivery, and book online with V Solve Hub.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
