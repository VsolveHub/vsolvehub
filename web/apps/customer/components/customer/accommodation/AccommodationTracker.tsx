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

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <LoadingState label="Loading booking…" variant="inline" />;

  const status = data.status as keyof typeof ACCOMMODATION_STATUS_LABELS;
  const canCancel = !["CHECKED_IN", "CANCELLED"].includes(data.status);

  return (
    <div className="stack-lg">
      <div className="card">
        <div className="flex-between">
          <div>
            <p className="text-sm text-muted">Booking reference</p>
            <p className="card-title">{data.bookingRef}</p>
          </div>
          <Badge status={status}>{ACCOMMODATION_STATUS_LABELS[status] ?? status}</Badge>
        </div>
        <p className="alert alert-info mt-2">{data.message}</p>
      </div>

      <div className="card">
        <h2 className="section-title">Status</h2>
        <AccommodationStatusTimeline currentStatus={data.status} />
      </div>

      <div className="card stack">
        <h2 className="section-title">Owner</h2>
        <p className="card-title">{data.owner.name}</p>
        <p className="text-sm text-muted">★ {data.owner.rating.toFixed(1)}</p>
        <div className="booking-action-row">
          <a href={`tel:${data.owner.phone}`} className="btn btn-secondary btn-sm">
            Call
          </a>
        </div>
      </div>

      <div className="card stack">
        <p className="text-sm text-muted">Property</p>
        <p>{data.property.title}</p>
        <p className="text-sm text-muted">{data.property.location}</p>
        {data.moveInDate && (
          <p>
            Move-in: {formatDate(data.moveInDate)}
            {data.durationMonths ? ` · ${data.durationMonths} months` : ""}
          </p>
        )}
        {data.visitDate && <p>Visit: {formatDate(data.visitDate)}</p>}
        <p className="detail-price">{formatPrice(data.totalPaidPaise)} paid</p>
      </div>

      {canCancel && (
        <Button variant="secondary" onClick={cancelBooking} disabled={cancelling} block>
          Cancel booking
        </Button>
      )}

      <Link href="/accommodation" className="btn btn-secondary btn-block" style={{ textAlign: "center" }}>
        Browse more stays
      </Link>
    </div>
  );
}
