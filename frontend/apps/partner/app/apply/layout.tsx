import type { Metadata } from "next";

import { ApplyShell } from "@/features/application/view/apply-shell";

/**
 * The Partner onboarding tree.
 *
 * Dynamic and never indexed: every page under here depends on the signed-in
 * applicant's own record, so a shared cache entry would be wrong for everyone
 * after the first visitor, and a half-filled application is not a search result.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your application",
  robots: { index: false, follow: false },
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return <ApplyShell>{children}</ApplyShell>;
}
