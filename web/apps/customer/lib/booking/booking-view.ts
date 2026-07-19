import { MARKETPLACE_TIMELINE, normalizeBookingStatus } from "@/lib/constants";
import type { Booking, BookingParty } from "./types";

export type StepState = "completed" | "active" | "upcoming";

export type BookingView = {
  status: string;
  currentStatusIndex: number;
  professional: BookingParty | null;
  isCompleted: boolean;
  isTeam: boolean;
  details: Record<string, any>;
};

function parseDetails(raw: string): Record<string, any> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function deriveBookingView(booking: Booking): BookingView {
  const status = normalizeBookingStatus(booking.status);
  const details = parseDetails(booking.archetypeDetails);
  return {
    status,
    currentStatusIndex: (MARKETPLACE_TIMELINE as readonly string[]).indexOf(status),
    professional: booking.provider ?? booking.vendor,
    isCompleted: status === "COMPLETED",
    isTeam: details.bookingType === "team",
    details,
  };
}

export function resolveTimeline(
  currentStatusIndex: number,
  steps: readonly string[] = MARKETPLACE_TIMELINE,
) {
  return steps.map((key, index) => ({
    key,
    index,
    state: (index < currentStatusIndex
      ? "completed"
      : index === currentStatusIndex
        ? "active"
        : "upcoming") as StepState,
  }));
}
