"use client";

import Link from "next/link";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

export type ActiveBookingItem = {
  id: string;
  ref: string;
  title: string;
  status: string;
  type: string; // "service" | "accommodation" | "vehicle"
  date: string;
  trackHref: string;
};

type Props = {
  bookings: ActiveBookingItem[];
};

function formatStatus(status: string) {
  const norm = status.toUpperCase();
  if (norm === "REQUESTED") return "Assigning Pro...";
  if (norm === "ACCEPTED") return "Pro Confirmed";
  if (norm === "PENDING") return "Awaiting Approval";
  if (norm === "STARTED" || norm === "ARRIVED") return "Work in progress";
  if (norm === "DISPATCHED") return "Driver on the way";
  return status.toLowerCase().replace(/_/g, " ");
}

function getIcon(type: string) {
  if (type === "accommodation") return "house";
  if (type === "vehicle") return "car-side";
  return "wrench";
}

export function ActiveBookings({ bookings }: Props) {
  if (!bookings || bookings.length === 0) return null;

  return (
    <section className="home-section active-bookings" aria-label="Active Bookings">
      <div className="section-header-row">
        <h2 className="home-section-title">Active Bookings</h2>
        <Link href="/profile/bookings" className="section-link">
          All bookings ({bookings.length})
        </Link>
      </div>

      <div className="active-bookings__scroll">
        {bookings.map((booking) => (
          <div key={booking.ref} className="active-booking-card">
            <div className="active-booking-card__top">
              <div className="active-booking-icon-wrap" data-type={booking.type}>
                <FlaticonIcon name={getIcon(booking.type)} size={18} />
              </div>
              <div className="active-booking-info">
                <span className="active-booking-ref">{booking.ref}</span>
                <h3 className="active-booking-title">{booking.title}</h3>
              </div>
              <span className="active-booking-status-badge">
                <span className="status-dot animate-ping" />
                {formatStatus(booking.status)}
              </span>
            </div>

            <div className="active-booking-card__bottom">
              <span className="active-booking-time">
                🗓️ {booking.date}
              </span>
              <Link href={booking.trackHref} className="active-booking-track-btn">
                Track Live →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
