"use client";

import Link from "next/link";
import { cn } from "@vsolve/ui";

import {
  BOOKING_STATUS_COPY,
  BOOKING_STATUS_TABS,
  bookingStatusHref,
  type BookingStatusTab,
  type BookingType,
} from "../model/booking-status";

export function BookingStatusTabs({
  selected,
  counts,
  type = null,
}: {
  selected: BookingStatusTab;
  counts: Record<BookingStatusTab, number>;
  /** The type filter, kept when switching tabs. */
  type?: BookingType | null;
}) {
  return (
    <nav aria-label="Booking status" className="mt-6 border-b border-line/80">
      <ul
        role="tablist"
        className="no-scrollbar -mx-4 flex list-none gap-1 overflow-x-auto px-4 sm:mx-0 sm:gap-2 sm:px-0"
      >
        {BOOKING_STATUS_TABS.map((tab) => {
          const isSelected = tab === selected;
          const copy = BOOKING_STATUS_COPY[tab];
          return (
            <li key={tab} role="presentation" className="shrink-0">
              <Link
                id={`booking-tab-${tab}`}
                href={bookingStatusHref(tab, type)}
                scroll={false}
                role="tab"
                aria-selected={isSelected}
                aria-controls="booking-status-panel"
                aria-label={`${copy.label} ${counts[tab]}`}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 border-b-2 px-2.5 pb-2.5 pt-1 text-sm transition-colors duration-150 sm:px-3 sm:text-[15px]",
                  "-mb-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  isSelected
                    ? "border-[#EA580C] font-extrabold text-navy-900"
                    : "border-transparent font-semibold text-text-secondary hover:text-navy-900",
                )}
              >
                <span className="whitespace-nowrap">{copy.label}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    isSelected ? "font-extrabold text-navy-900" : "font-bold text-text-secondary",
                  )}
                >
                  {counts[tab]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
