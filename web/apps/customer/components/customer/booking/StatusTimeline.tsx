"use client";

import {
  BOOKING_STATUSES,
  MARKETPLACE_TIMELINE,
  STATUS_LABELS,
  normalizeBookingStatus,
} from "@/lib/constants";

type StatusTimelineProps = {
  currentStatus: string;
  marketplace?: boolean;
};

export function StatusTimeline({ currentStatus, marketplace = false }: StatusTimelineProps) {
  const normalized = normalizeBookingStatus(currentStatus);
  const activeStatuses: string[] = marketplace
    ? [...MARKETPLACE_TIMELINE]
    : [...BOOKING_STATUSES.filter((s) => s !== "CANCELLED")];
  const currentIndex =
    normalized === "CANCELLED" || normalized === "NO_WORKER_FOUND"
      ? -1
      : activeStatuses.indexOf(normalized);

  return (
    <ol className="timeline">
      {activeStatuses.map((status, index) => {
        const state =
          normalized === "CANCELLED" || normalized === "NO_WORKER_FOUND"
            ? "pending"
            : index < currentIndex
              ? "done"
              : index === currentIndex
                ? "active"
                : "pending";
        return (
          <li key={status} className={`timeline-item ${state}`}>
            <span className="timeline-dot" />
            <span className="timeline-label">{STATUS_LABELS[status] ?? status}</span>
          </li>
        );
      })}
    </ol>
  );
}
