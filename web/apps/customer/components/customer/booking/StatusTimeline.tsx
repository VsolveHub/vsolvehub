"use client";

import { motion } from "framer-motion";
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
    <ol className="relative flex flex-col gap-6 ml-3 mt-4">
      {activeStatuses.map((status, index) => {
        const state =
          normalized === "CANCELLED" || normalized === "NO_WORKER_FOUND"
            ? "pending"
            : index < currentIndex
              ? "done"
              : index === currentIndex
                ? "active"
                : "pending";

        const isDone = state === "done";
        const isActive = state === "active";
        const isPending = state === "pending";

        return (
          <li key={status} className="relative flex items-start gap-4">
            {/* Connecting Line (except last item) */}
            {index < activeStatuses.length - 1 && (
              <div className={`absolute left-2.5 top-6 w-0.5 h-full -ml-px ${isDone ? "bg-[var(--color-brand)]" : "bg-gray-200"}`} />
            )}
            
            {/* Status Dot */}
            <div className="relative z-10 flex items-center justify-center w-5 h-5 mt-0.5">
              <motion.div 
                initial={false}
                animate={{ 
                  scale: isActive ? [1, 1.2, 1] : 1,
                  backgroundColor: isDone || isActive ? "var(--color-brand)" : "#e5e7eb",
                  borderColor: isActive ? "var(--color-brand-light)" : "transparent"
                }}
                transition={{ duration: 1, repeat: isActive ? Infinity : 0 }}
                className={`w-3 h-3 rounded-full ${isActive ? "ring-4 ring-[var(--color-brand-light)]" : ""}`}
              />
            </div>
            
            {/* Label */}
            <div className="flex flex-col">
              <span className={`text-sm font-bold ${isActive ? "text-[var(--color-brand)]" : isDone ? "text-gray-900" : "text-gray-400"}`}>
                {STATUS_LABELS[status] ?? status}
              </span>
              {isActive && (
                <motion.span 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: "auto" }} 
                  className="text-xs text-gray-500 font-semibold mt-1"
                >
                  Current phase
                </motion.span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
