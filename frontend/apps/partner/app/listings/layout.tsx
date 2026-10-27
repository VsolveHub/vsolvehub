import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PartnerShell } from "@/features/session/partner-shell";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // An object, not a string: a plain string here switches off the root
  // template for every page below, so their tabs lose the brand.
  title: { default: "Job listings workspace", template: `%s | ${SITE_NAME}` },
  description: "Employer and job listing management portal for V Solve Hub hiring partners",
  robots: { index: false, follow: false },
};

/**
 * A10 listings sit behind PartnerShell only. `WorkspaceRoute` wraps children in
 * a max-w-2xl main that would crush this wide hiring surface; capability gating
 * still happens via `LISTING_WORKSPACE` in the registry + Django on every command.
 */
export default function ListingsLayout({ children }: { children: ReactNode }) {
  return <PartnerShell requirePartnerRole>{children}</PartnerShell>;
}
