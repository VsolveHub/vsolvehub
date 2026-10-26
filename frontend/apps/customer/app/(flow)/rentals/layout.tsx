import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Metadata for the rentals area. The browse page is a client component and cannot export its own.
 * No canonical here: it would be inherited by every rental detail page and mark them all as
 * copies of the hub.
 */
export const metadata: Metadata = {
  title: "Equipment & Tool Rentals in Hyderabad",
  description:
    "Rent tools and equipment from verified owners in Hyderabad. Compare prices, pick up or get delivery, and book online with V Solve Hub.",
};

export default function RentalsLayout({ children }: { children: ReactNode }) {
  return children;
}
