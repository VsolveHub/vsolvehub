"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense } from "react";

import { factEntries, MarketplaceQueue, moneyLine } from "@/features/moderation/marketplace-queue";
import { RentalBookings } from "@/features/moderation/rental-bookings";
import { RentalDisputeQueue } from "@/features/moderation/rental-disputes";
import { RentalPlatformFeeForm } from "@/features/moderation/rental-platform-fee";
import {
  fetchOpsRentalDisputes,
  fetchOpsRentals,
  moderateOpsRental,
} from "@/features/moderation/queries";
import { SectionTabs } from "@/features/shared/section-tabs";

async function loadRentalListings() {
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
}

function RentalsConsole() {
  const disputes = useQuery({ queryKey: ["ops-rental-disputes"], queryFn: fetchOpsRentalDisputes });
  const listings = useQuery({ queryKey: ["ops-rentals"], queryFn: loadRentalListings });
  const waitingDisputes = (disputes.data ?? []).filter((row) => row.awaiting_decision).length;
  const waitingListings = (listings.data ?? []).filter(
    (row) => row.moderation_status === "PENDING" || row.public_state === "PENDING_REVIEW",
  ).length;

  return (
    <SectionTabs
      title="Rentals"
      description="Equipment owners list items, customers book them, and you keep the two honest."
      tabs={[
        { id: "bookings", label: "Bookings", render: () => <RentalBookings /> },
        {
          id: "listings",
          label: "Listings to review",
          count: waitingListings,
          render: () => (
            <MarketplaceQueue
              embedded
              heading="Rental listings"
              queryKey="ops-rentals"
              load={loadRentalListings}
              moderate={moderateOpsRental}
            />
          ),
        },
        {
          id: "disputes",
          label: "Deposit disputes",
          count: waitingDisputes,
          render: () => <RentalDisputeQueue />,
        },
        { id: "fees", label: "Fees", render: () => <RentalPlatformFeeForm /> },
      ]}
    />
  );
}

export default function OpsRentalsPage() {
  return (
    <Suspense fallback={null}>
      <RentalsConsole />
    </Suspense>
  );
}
