import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Metadata for the stays area. The browse page is a client component and cannot export its own.
 * No canonical here: it would be inherited by every stay detail page and mark them all as copies
 * of the hub.
 */
export const metadata: Metadata = {
  title: "Rooms, PGs & Stays in Hyderabad",
  description:
    "Find rooms, PGs, hotels and resorts in Hyderabad from verified hosts. Send an enquiry for free and book with V Solve Hub.",
};

export default function StaysLayout({ children }: { children: ReactNode }) {
  return children;
}
