import type { Booking } from "@/lib/booking/types";

export type StepDetails = { label: string; sublabel: string | null };

export function getRatingLabel(val: number): string {
  if (val === 5) return "Excellent";
  if (val === 4) return "Good";
  if (val === 3) return "Average";
  if (val === 2) return "Poor";
  return "Very Bad";
}

type StepState = { isCompletedStep: boolean; isActiveStep: boolean; formattedTime: string };

// Individual (solo) electrician timeline copy, keyed by MARKETPLACE_TIMELINE step.
const SOLO_STEPS: Record<string, (s: StepState) => StepDetails> = {
  PENDING: ({ isCompletedStep, isActiveStep, formattedTime }) => ({
    label: "Booking Confirmed",
    sublabel: isCompletedStep || isActiveStep ? `Today, ${formattedTime}` : null,
  }),
  SEARCHING_PROVIDER: ({ isCompletedStep, isActiveStep }) => ({
    label: "Searching for provider",
    sublabel: isActiveStep ? "Finding nearest technician..." : isCompletedStep ? "Search completed" : "Pending acceptance",
  }),
  ASSIGNED: ({ isCompletedStep, isActiveStep, formattedTime }) => ({
    label: "Provider Accepted",
    sublabel: isCompletedStep || isActiveStep ? `Today, ${formattedTime}` : "Pending acceptance",
  }),
  PROVIDER_ARRIVING: ({ isCompletedStep, isActiveStep }) => ({
    label: "On the way",
    sublabel: isActiveStep ? "ETA: 12 mins away" : isCompletedStep ? "Arrived at location" : "Pending arrival",
  }),
  STARTED: ({ isActiveStep }) => ({
    label: "Work in progress",
    sublabel: isActiveStep ? "Technician has started work" : null,
  }),
  COMPLETED: ({ isCompletedStep, isActiveStep }) => ({
    label: "Completed",
    sublabel: isActiveStep || isCompletedStep ? "Job finished successfully" : null,
  }),
};

export function soloStepDetails(
  stepKey: string,
  idx: number,
  currentStatusIndex: number,
  booking: Booking,
): StepDetails {
  const formattedTime = booking.createdAt
    ? new Date(booking.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "10:15 AM";
  const state: StepState = {
    isCompletedStep: idx < currentStatusIndex,
    isActiveStep: idx === currentStatusIndex,
    formattedTime,
  };
  const build = SOLO_STEPS[stepKey];
  return build ? build(state) : { label: stepKey.replace(/_/g, " "), sublabel: null };
}

type TeamStepState = { isCompletedStep: boolean; isActiveStep: boolean };

// Team electrician timeline copy. A null entry (or missing key) is skipped in the team list.
const TEAM_STEPS: Record<string, ((s: TeamStepState) => StepDetails) | null> = {
  PENDING: ({ isCompletedStep, isActiveStep }) => ({
    label: "Service Confirmed",
    sublabel: isCompletedStep || isActiveStep ? "10:00 AM" : null,
  }),
  SEARCHING_PROVIDER: null,
  ASSIGNED: ({ isCompletedStep, isActiveStep }) => ({
    label: "Accepted by Vendor",
    sublabel: isCompletedStep || isActiveStep ? "10:15 AM" : "Pending",
  }),
  PROVIDER_ARRIVING: ({ isCompletedStep, isActiveStep }) => ({
    label: "On Way",
    sublabel: isActiveStep ? "Arriving in 20 mins" : isCompletedStep ? "Arrived" : "Pending",
  }),
  STARTED: ({ isActiveStep }) => ({
    label: "Work in Progress",
    sublabel: isActiveStep ? "In Progress" : "Pending",
  }),
  COMPLETED: ({ isCompletedStep, isActiveStep }) => ({
    label: "Completed",
    sublabel: isActiveStep || isCompletedStep ? "Completed" : "Pending",
  }),
};

export function teamStepDetails(
  stepKey: string,
  idx: number,
  currentStatusIndex: number,
): StepDetails | null {
  const build = TEAM_STEPS[stepKey];
  if (!build) return null;
  return build({ isCompletedStep: idx < currentStatusIndex, isActiveStep: idx === currentStatusIndex });
}
