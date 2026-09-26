"use client";

import { factEntries, MarketplaceQueue, moneyLine } from "@/features/moderation/marketplace-queue";
import { fetchOpsStays, moderateOpsStay } from "@/features/moderation/queries";

export default function OpsStaysPage() {
  return (
    <MarketplaceQueue
      heading="Stay properties"
      queryKey="ops-stays"
      load={async () => {
        const rows = await fetchOpsStays();
        return rows.map((row) => {
          const media = (row as { media?: { url?: string }[] }).media;
          const nightly = row.units?.[0]?.nightly_rate_paise;
          const nightlyLine = moneyLine(nightly, "/ night");
          return {
            id: row.id,
            title: row.title,
            public_state: row.public_state,
            partyName: row.host_name,
            moderation_status: row.moderation_status,
            photoUrl: media?.[0]?.url,
            location: row.location_text || undefined,
            moneyLines: nightlyLine ? [nightlyLine] : [],
            facts: factEntries(row.structured_fields),
          };
        });
      }}
      moderate={moderateOpsStay}
    />
  );
}
