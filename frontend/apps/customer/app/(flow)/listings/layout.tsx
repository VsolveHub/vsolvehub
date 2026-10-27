import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SITE_NAME } from "@/lib/site";

/**
 * Title for the public job board — the same words `/catalog/career-jobs` uses, since its canonical is this page.
 *
 * The page is a client component and cannot export metadata, so its title
 * lives here; without it the tab showed the site default.
 */
export const metadata: Metadata = {
  // An object, not a string: a plain string here switches off the root
  // template for every page below, so their tabs lose the brand.
  title: { default: "Jobs & Career Openings in Hyderabad", template: `%s | ${SITE_NAME}` },
  description:
    "Browse job openings for skilled trades and service roles in Hyderabad and apply online on V Solve Hub.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
