"use client";

import {
  ACCOMMODATION_STATUSES,
  ACCOMMODATION_STATUS_LABELS,
  type AccommodationStatus,
} from "@/lib/accommodation/constants";

export function AccommodationStatusTimeline({ currentStatus }: { currentStatus: string }) {
  const activeStatuses = ACCOMMODATION_STATUSES.filter((s) => s !== "CANCELLED");
  const normalized =
    currentStatus === "CANCELLED" ? "CANCELLED" : (currentStatus as AccommodationStatus);
  const currentIndex =
    normalized === "CANCELLED"
      ? -1
      : activeStatuses.indexOf(normalized as (typeof activeStatuses)[number]);

  return (
    <ol className="timeline">
      {activeStatuses.map((status, index) => {
        const state =
          currentStatus === "CANCELLED"
            ? "pending"
            : index < currentIndex
              ? "done"
              : index === currentIndex
                ? "active"
                : "pending";
        return (
          <li key={status} className={`timeline-item ${state}`}>
            <span className="timeline-dot" />
            <span className="timeline-label">{ACCOMMODATION_STATUS_LABELS[status]}</span>
          </li>
        );
      })}
    </ol>
  );
}
