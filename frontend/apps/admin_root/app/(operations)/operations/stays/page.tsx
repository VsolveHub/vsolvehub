"use client";

import { ModerationQueue } from "@/features/moderation/moderation-queue";
import { fetchOpsStays, moderateOpsStay } from "@/features/moderation/queries";

export default function OpsStaysPage() {
  return (
    <ModerationQueue
      heading="Stay properties"
      queryKey="ops-stays"
      load={async () => {
        const rows = await fetchOpsStays();
        return rows.map((row) => ({
          id: row.id,
          title: row.title,
          public_state: row.public_state,
          partyName: row.host_name,
          moderation_status: row.moderation_status,
        }));
      }}
      moderate={moderateOpsStay}
    />
  );
}
