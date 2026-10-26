import type { Metadata } from "next";
import type { ReactNode } from "react";

import { LISTINGS_DESCRIPTION } from "@/lib/detail-titles";

/**
 * Title for the public job board — the same words `/catalog/career-jobs` uses, since its canonical is this page.
 *
 * The page is a client component and cannot export metadata, so its title
 * lives here; without it the tab showed the site default.
 */
export const metadata: Metadata = {
  // An object, not a string: a plain string here would switch off the root
  // template for every page below, so their titles lost "— V Solve Hub".
  title: { default: "Career & job openings", template: "%s — V Solve Hub" },
  description: LISTINGS_DESCRIPTION,
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
