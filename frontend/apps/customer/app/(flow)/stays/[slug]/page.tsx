"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

const SUBCATEGORY_SLUGS = new Set([
  "rooms",
  "pg-accommodation",
  "hostels",
  "bed-space",
  "co-living-spaces",
  "apartments",
  "rental-properties",
  "short-stay",
  "student-accommodation",
  "worker-accommodation",
  "property-listing",
  "hotels",
  "premium-stays",
]);

export default function StaysFilteredSlugPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params?.slug as string) || "";

  useEffect(() => {
    const normalized = slug.toLowerCase().trim();
    if (!normalized) {
      router.replace("/catalog/rooms-pg-hostel");
      return;
    }

    router.replace(`/catalog/rooms-pg-hostel?tile=${encodeURIComponent(normalized)}`);
  }, [slug, router]);

  return (
    <div className="flex h-64 items-center justify-center text-xs text-neutral-400">
      Loading {slug ? slug.replace(/-/g, " ") : "stay"} properties…
    </div>
  );
}
