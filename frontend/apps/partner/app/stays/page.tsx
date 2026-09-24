"use client";

import { PartnerShell } from "@/features/session/partner-shell";
import { PartnerStaysWorkspace } from "@/features/stays/view/stays-workspace";

export default function PartnerStaysPage() {
  return (
    <PartnerShell requirePartnerRole>
      <PartnerStaysWorkspace />
    </PartnerShell>
  );
}
