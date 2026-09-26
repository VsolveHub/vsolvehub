"use client";

import { ModerationQueue } from "@/features/moderation/moderation-queue";
import { fetchOpsRentals, moderateOpsRental } from "@/features/moderation/queries";

export default function OpsRentalsPage() {
  return (
    <ModerationQueue
      heading="Rental assets"
      queryKey="ops-rentals"
      load={async () => {
        const rows = await fetchOpsRentals();
        return rows.map((row) => ({
          id: row.id,
          title: row.title,
          public_state: row.public_state,
          partyName: row.partner_name,
          moderation_status: row.moderation_status,
        }));
      }}
      moderate={moderateOpsRental}
    />
  );
}
