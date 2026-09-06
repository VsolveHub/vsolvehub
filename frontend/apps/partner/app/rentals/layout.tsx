import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PartnerShell } from "@/features/session/partner-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rental Workspace",
  robots: { index: false, follow: false },
};

export default function RentalsLayout({ children }: { children: ReactNode }) {
  return <PartnerShell requirePartnerRole>{children}</PartnerShell>;
}
