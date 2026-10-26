import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Title for the public job board — the same words `/catalog/career-jobs` uses, since its canonical is this page.
 *
 * The page is a client component and cannot export metadata, so its title
 * lives here; without it the tab showed the site default.
 */
export const metadata: Metadata = {
  title: "Jobs & Career Openings in Hyderabad",
  description:
    "Browse job openings for skilled trades and service roles in Hyderabad and apply online on V Solve Hub.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
