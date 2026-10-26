import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RENTALS_DESCRIPTION } from "@/lib/detail-titles";

/**
 * Title for the public rentals catalogue.
 *
 * The page is a client component and cannot export metadata, so its title
 * lives here; without it the tab showed the site default.
 */
export const metadata: Metadata = {
  // An object, not a string: a plain string here would switch off the root
  // template for every page below, so their titles lost "— V Solve Hub".
  title: { default: "Rent tools and equipment", template: "%s — V Solve Hub" },
  description: RENTALS_DESCRIPTION,
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
