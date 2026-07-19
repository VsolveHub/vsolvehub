import type { Booking } from "@/lib/booking/types";

export type StepDetails = { label: string; sublabel: string | null };

export function getRatingLabel(val: number): string {
  if (val === 5) return "Excellent";
  if (val === 4) return "Good";
  if (val === 3) return "Average";
  if (val === 2) return "Poor";
  return "Very Bad";
}

// Individual (solo) electrician timeline copy.
export function soloStepDetails(
  stepKey: string,
  idx: number,
  currentStatusIndex: number,
  booking: Booking,
): StepDetails {
  const isCompletedStep = idx < currentStatusIndex;
  const isActiveStep = idx === currentStatusIndex;

  const formattedTime = booking.createdAt
    ? new Date(booking.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "10:15 AM";

  switch (stepKey) {
    case "PENDING":
      return {
        label: "Booking Confirmed",
        sublabel: isCompletedStep || isActiveStep ? `Today, ${formattedTime}` : null,
      };
    case "SEARCHING_PROVIDER":
      return {
        label: "Searching for provider",
        sublabel: isActiveStep ? "Finding nearest technician..." : isCompletedStep ? "Search completed" : "Pending acceptance",
      };
    case "ASSIGNED":
      return {
        label: "Provider Accepted",
        sublabel: isCompletedStep || isActiveStep ? `Today, ${formattedTime}` : "Pending acceptance",
      };
    case "PROVIDER_ARRIVING":
      return {
        label: "On the way",
        sublabel: isActiveStep ? "ETA: 12 mins away" : isCompletedStep ? "Arrived at location" : "Pending arrival",
      };
    case "STARTED":
      return {
        label: "Work in progress",
        sublabel: isActiveStep ? "Technician has started work" : null,
      };
    case "COMPLETED":
      return {
        label: "Completed",
        sublabel: isActiveStep || isCompletedStep ? "Job finished successfully" : null,
      };
    default:
      return { label: stepKey.replace(/_/g, " "), sublabel: null };
  }
}

// Team electrician timeline copy. Returns null for steps hidden in the team list.
export function teamStepDetails(
  stepKey: string,
  idx: number,
  currentStatusIndex: number,
): StepDetails | null {
  const isCompletedStep = idx < currentStatusIndex;
  const isActiveStep = idx === currentStatusIndex;

  switch (stepKey) {
    case "PENDING":
      return { label: "Service Confirmed", sublabel: isCompletedStep || isActiveStep ? "10:00 AM" : null };
    case "SEARCHING_PROVIDER":
      return null; // Skip in team list
    case "ASSIGNED":
      return { label: "Accepted by Vendor", sublabel: isCompletedStep || isActiveStep ? "10:15 AM" : "Pending" };
    case "PROVIDER_ARRIVING":
      return { label: "On Way", sublabel: isActiveStep ? "Arriving in 20 mins" : isCompletedStep ? "Arrived" : "Pending" };
    case "STARTED":
      return { label: "Work in Progress", sublabel: isActiveStep ? "In Progress" : "Pending" };
    case "COMPLETED":
      return { label: "Completed", sublabel: isActiveStep || isCompletedStep ? "Completed" : "Pending" };
    default:
      return null;
  }
}
