"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PartnerRentalAssetIndexPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params?.assetId as string;

  useEffect(() => {
    if (assetId) {
      router.replace(`/rentals/${assetId}/edit`);
    } else {
      router.replace("/rentals");
    }
  }, [assetId, router]);

  return (
    <div className="flex h-64 items-center justify-center text-xs text-neutral-400">
      Loading rental asset…
    </div>
  );
}
