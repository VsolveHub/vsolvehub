"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPrice, formatDate } from "@/lib/format";
import { ACCOMMODATION_STATUS_LABELS } from "@/lib/accommodation/constants";
import { LoadingState } from "@/components/ui/LoadingState";
import { AccommodationStatusTimeline } from "./AccommodationStatusTimeline";

type TrackingData = {
  bookingRef: string;
  status: string;
  message: string;
  bookingType: string;
  moveInDate: string | null;
  visitDate: string | null;
  durationMonths: number | null;
  totalPaidPaise: number;
  paymentStatus: string;
  property: { title: string; location: string };
  owner: { name: string; phone: string; rating: number };
};

export function AccommodationTracker({ bookingRef }: { bookingRef: string }) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchStatus() {
      const res = await fetch(`/api/accommodation/bookings/${bookingRef}`);
      if (!res.ok) {
        if (active) setError("Booking not found");
        return;
      }
      if (active) setData(await res.json());
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [bookingRef]);

  async function cancelBooking() {
    if (!confirm("Cancel this booking?")) return;
    setCancelling(true);
    const res = await fetch(`/api/accommodation/bookings/${bookingRef}/cancel`, { method: "POST" });
    setCancelling(false);
    if (res.ok) {
      const updated = await fetch(`/api/accommodation/bookings/${bookingRef}`);
      if (updated.ok) setData(await updated.json());
    }
  }

  if (error) return <div className="rounded-xl px-4 py-3 text-sm bg-red-50 text-[var(--color-danger)]">{error}</div>;
  if (!data) return <LoadingState label="Loading booking…" variant="inline" />;

  const status = data.status as keyof typeof ACCOMMODATION_STATUS_LABELS;
  const canCancel = !["CHECKED_IN", "CANCELLED"].includes(data.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-gray-500">Booking reference</p>
            <p className="mb-1 text-[15px] font-semibold text-gray-900">{data.bookingRef}</p>
          </div>
          <Badge status={status}>{ACCOMMODATION_STATUS_LABELS[status] ?? status}</Badge>
        </div>
        <p className="rounded-xl px-4 py-3 text-sm bg-[var(--color-brand-light)] text-[var(--color-brand-dark)] mt-2">{data.message}</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Status</h2>
        <AccommodationStatusTimeline currentStatus={data.status} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Owner</h2>
        <p className="mb-1 text-[15px] font-semibold text-gray-900">{data.owner.name}</p>
        <p className="text-sm text-gray-500">★ {data.owner.rating.toFixed(1)}</p>
        <div className="mt-4 flex flex-col gap-2.5">
          <a href={`tel:${data.owner.phone}`} className="inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:opacity-60 px-3 py-1.5 text-[13px] border border-gray-200 bg-white text-gray-900 hover:bg-gray-50">
            Call
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4">
        <p className="text-sm text-gray-500">Property</p>
        <p>{data.property.title}</p>
        <p className="text-sm text-gray-500">{data.property.location}</p>
        {data.moveInDate && (
          <p>
            Move-in: {formatDate(data.moveInDate)}
            {data.durationMonths ? ` · ${data.durationMonths} months` : ""}
          </p>
        )}
        {data.visitDate && <p>Visit: {formatDate(data.visitDate)}</p>}
        <p className="text-lg font-black text-gray-900">{formatPrice(data.totalPaidPaise)} paid</p>
      </div>

      {canCancel && (
        <Button variant="secondary" onClick={cancelBooking} disabled={cancelling} block>
          Cancel booking
        </Button>
      )}

      <Link href="/accommodation" className="inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:opacity-60 px-4 py-2.5 text-sm border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 w-full" style={{ textAlign: "center" }}>
        Browse more stays
      </Link>
    </div>
  );
}
