"use client";

import { factEntries, MarketplaceQueue, moneyLine } from "@/features/moderation/marketplace-queue";
import { RentalDisputeQueue } from "@/features/moderation/rental-disputes";
import { RentalPlatformFeeForm } from "@/features/moderation/rental-platform-fee";
import { fetchOpsRentals, moderateOpsRental } from "@/features/moderation/queries";

export default function OpsRentalsPage() {
  return (
    <MarketplaceQueue
      leading={
        <>
          <RentalPlatformFeeForm />
          <RentalDisputeQueue />
        </>
      }
      heading="Rental assets"
      queryKey="ops-rentals"
      load={async () => {
        const rows = await fetchOpsRentals();
        return rows.map((row) => {
          const media = (row as { media?: { url?: string }[] }).media;
          const daily = moneyLine(row.daily_rate_paise, "/ day");
          const deposit = moneyLine(row.deposit_paise, "deposit");
          return {
            id: row.id,
            title: row.title,
            public_state: row.public_state,
            partyName: row.partner_name,
            moderation_status: row.moderation_status,
            photoUrl: media?.[0]?.url,
            location: row.location_text || undefined,
            moneyLines: [daily, deposit].filter((line): line is string => Boolean(line)),
            facts: factEntries(row.structured_fields),
          };
        });
      }}
      moderate={moderateOpsRental}
    />
  );
}
