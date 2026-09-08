import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PartnerShell } from "@/features/session/partner-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Job Listings Workspace | Vsolve Partners",
  description: "Employer and job listing management portal for Vsolve hiring partners",
  robots: { index: false, follow: false },
};

export default function ListingsLayout({ children }: { children: ReactNode }) {
  return <PartnerShell requirePartnerRole>{children}</PartnerShell>;
}
