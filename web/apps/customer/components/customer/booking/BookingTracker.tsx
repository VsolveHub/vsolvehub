"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ElectricianTracker } from "./ElectricianTracker";
import { BeauticianTracker } from "./BeauticianTracker";
import { ConstructionTracker } from "./ConstructionTracker";
import { CrewBookingTracker, type CrewTrackingData } from "./CrewBookingTracker";
import { LoadingState } from "@/components/ui/LoadingState";

type TrackingData = {
  bookingRef: string;
  status: string;
  message: string;
  marketplace?: boolean;
  isCrew?: boolean;
  service: { id: string; name: string; slug: string; categorySlug: string };
  issueDescription: string;
  mediaUrls: string[];
  slot: string;
  scheduleType: string;
  address: string;
  vendor: { id: string; name: string; phone: string; rating: number } | null;
  provider: {
    id: string;
    name: string;
    phone: string;
    rating: number;
    etaMinutes: number;
  } | null;
  quotedAmount: number;
  finalAmountPaise: number;
  paymentStatus: string;
  paymentMethod: string | null;
  rating: number | null;
  archetypeDetails: string;
};

export function BookingTracker({ bookingRef }: { bookingRef: string }) {
  const router = useRouter();
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState("");

  async function fetchStatus() {
    const res = await fetch(`/api/bookings/${bookingRef}`);
    if (!res.ok) {
      setError("Booking not found");
      return;
    }
    const json = await res.json();
    setData(json);
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, [bookingRef]);

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  if (!data) {
    return <LoadingState label="Loading booking status…" variant="inline" />;
  }

  if (data.isCrew) {
    return <CrewBookingTracker booking={data as unknown as CrewTrackingData} onRefresh={fetchStatus} />;
  }

  const categorySlug = data.service.categorySlug;

  if (categorySlug === "construction-services") {
    return <ConstructionTracker booking={data} onRefresh={fetchStatus} />;
  }

  if (categorySlug === "beauty-wellness") {
    return <BeauticianTracker booking={data} onRefresh={fetchStatus} />;
  }

  // Default (Electrician/Technician/etc. Archetype A)
  return <ElectricianTracker booking={data} onRefresh={fetchStatus} />;
}
