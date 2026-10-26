import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Metadata for the job listings area. The browse page is a client component and cannot export its
 * own. No canonical here: it would be inherited by every listing detail page and mark them all as
 * copies of the hub.
 */
export const metadata: Metadata = {
  title: "Jobs & Career Openings in Hyderabad",
  description:
    "Browse job openings for skilled trades and service roles in Hyderabad and apply online on V Solve Hub.",
};

export default function ListingsLayout({ children }: { children: ReactNode }) {
  return children;
}
