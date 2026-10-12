"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense } from "react";

import { factEntries, MarketplaceQueue, moneyLine } from "@/features/moderation/marketplace-queue";
import {
  fetchOpsStaysPage,
  moderateOpsStay,
  type OpsStayProperty,
} from "@/features/moderation/queries";
import { StayPlans } from "@/features/moderation/stay-plans";
import { StayEnquiries, StayReservations } from "@/features/moderation/stay-reservations";
import { SectionTabs } from "@/features/shared/section-tabs";

function toQueueRow(row: OpsStayProperty) {
  const media = (row as { media?: { url?: string }[] }).media;
  const nightlyLine = moneyLine(row.units?.[0]?.nightly_rate_paise, "/ night");
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
}

async function loadStayProperties(cursor: string | undefined, pendingOnly: boolean) {
  const page = await fetchOpsStaysPage(cursor, pendingOnly ? "PENDING" : undefined);
  return { ...page, results: page.results.map(toQueueRow) };
}

function StaysConsole() {
  const pending = useQuery({
    queryKey: ["ops-stays", "PENDING", "count"],
    queryFn: () => fetchOpsStaysPage(undefined, "PENDING"),
  });
  const waiting = pending.data?.results.length ?? 0;

  return (
    <SectionTabs
      title="Stays"
      description="Hosts list properties, guests reserve rooms and ask questions."
      tabs={[
        { id: "reservations", label: "Reservations", render: () => <StayReservations /> },
        {
          id: "properties",
          label: "Properties to review",
          count: waiting,
          render: () => (
            <MarketplaceQueue
              embedded
              heading="Stay properties"
              queryKey="ops-stays"
              loadPage={loadStayProperties}
              moderate={moderateOpsStay}
            />
          ),
        },
        { id: "enquiries", label: "Guest enquiries", render: () => <StayEnquiries /> },
        { id: "plans", label: "Host plans", render: () => <StayPlans /> },
      ]}
    />
  );
}

export default function OpsStaysPage() {
  return (
    <Suspense fallback={null}>
      <StaysConsole />
    </Suspense>
  );
}
