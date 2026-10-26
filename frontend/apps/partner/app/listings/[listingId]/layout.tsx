import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The page is a client component and cannot export metadata itself. Generic on
 * purpose: the listing is an authenticated, unindexed read, and naming it here
 * would mean a second, session-bearing fetch on the server just for the tab.
 */
export const metadata: Metadata = { title: "Manage job listing" };

export default function ListingDetailLayout({ children }: { children: ReactNode }) {
  return children;
}
