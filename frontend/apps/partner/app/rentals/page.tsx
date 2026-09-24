"use client";

import { PartnerShell } from "@/features/session/partner-shell";
import { PartnerRentalsWorkspace } from "@/features/rentals/view/rentals-workspace";

export default function PartnerRentalsPage() {
  return (
    <PartnerShell requirePartnerRole>
      <PartnerRentalsWorkspace />
    </PartnerShell>
  );
}
