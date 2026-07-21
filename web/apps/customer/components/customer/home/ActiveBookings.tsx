"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

export type ActiveBookingItem = {
  id: string;
  ref: string;
  title: string;
  status: string;
  type: string;
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
    <section className="w-full" aria-label="Active Bookings">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Active Bookings</h2>
        <Link href="/profile/bookings" className="text-sm font-bold text-[var(--color-brand)] hover:underline">
          All bookings ({bookings.length})
        </Link>
      </div>

      <div className="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory hide-scrollbar">
        {bookings.map((booking) => (
          <motion.div 
            whileHover={{ y: -4 }}
            key={booking.ref} 
            className="min-w-[280px] sm:min-w-[320px] max-w-[320px] shrink-0 snap-start bg-white rounded-3xl border border-gray-150 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-blue-50 text-blue-600 shadow-inner">
                  <FlaticonIcon name={getIcon(booking.type)} size={20} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{booking.ref}</span>
                  <h3 className="text-sm font-bold text-gray-900 leading-tight mt-0.5">{booking.title}</h3>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-xs font-black text-blue-700">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                {formatStatus(booking.status)}
              </span>
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center justify-between mt-auto">
              <span className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                <span className="text-base">🗓️</span> {booking.date}
              </span>
              <Link href={booking.trackHref} className="text-xs font-black text-[var(--color-brand)] bg-[var(--color-brand-light)] px-4 py-2 rounded-xl hover:opacity-80 transition-opacity">
                Track Live →
              </Link>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
