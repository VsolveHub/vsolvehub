import Link from "next/link";

import { RideDetail } from "@/features/rides/view/ride-detail";

export default async function OpsRidePage({ params }: { params: Promise<{ rideId: string }> }) {
  const { rideId } = await params;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <Link href="/operations/rides" className="text-sm font-semibold text-text-link hover:underline">
        ← All rides
      </Link>
      <RideDetail rideId={rideId} />
    </div>
  );
}
