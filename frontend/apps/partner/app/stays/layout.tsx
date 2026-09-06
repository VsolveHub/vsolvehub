import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PartnerShell } from "@/features/session/partner-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stays & Hostels Host Workspace | Vsolve",
  description: "Property and guest management portal for Vsolve stay hosts",
  robots: { index: false, follow: false },
};

export default function StaysLayout({ children }: { children: ReactNode }) {
  return <PartnerShell requirePartnerRole>{children}</PartnerShell>;
}
