import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Title for the public stays catalogue.
 *
 * The page is a client component and cannot export metadata, so its title
 * lives here; without it the tab showed the site default.
 */
export const metadata: Metadata = {
  title: "Rooms, PGs & Stays in Hyderabad",
  description:
    "Find rooms, PGs, hotels and resorts in Hyderabad from verified hosts. Send an enquiry for free and book with V Solve Hub.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
