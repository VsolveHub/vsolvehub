import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CustomerShell } from "@/features/session/view/customer-shell";

/**
 * A signed-in customer's own applications: not a search result.
 *
 * The page is a client component and cannot export metadata, so its title
 * lives here; without it the tab showed the site default.
 */
export const metadata: Metadata = {
  title: "Your job applications",
  robots: { index: false, follow: false },
};

/**
 * Signed-in only. A visitor without a session is sent to login and back here
 * afterwards, rather than shown a list the API refuses to fill ("Authentication
 * credentials were not provided").
 */
export default function Layout({ children }: { children: ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
