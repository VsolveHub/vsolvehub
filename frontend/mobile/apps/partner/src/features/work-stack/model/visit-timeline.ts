/**
 * "What happens next" for a booked visit, and how long until it starts.
 *
 * Pure, and every time comes from the server's `gates`. A step is done because the visit says so
 * (the address has arrived, the Partner has set off), never because the phone's clock passed it.
 */

export type TimelineStepState = "done" | "current" | "next";

export interface TimelineStep {
  readonly key: "address" | "travel" | "start";
  readonly at: string;
  readonly label: string;
  readonly state: TimelineStepState;
}

interface TimelineVisit {
  readonly site_address: unknown;
  readonly en_route_at: string | null;
  readonly scheduled_start: string;
  readonly gates: { readonly address_unlocks_at: string; readonly en_route_opens_at: string };
}

export function visitTimeline(visit: TimelineVisit): TimelineStep[] {
  const steps: { key: TimelineStep["key"]; at: string; label: string; done: boolean }[] = [
    { key: "address", at: visit.gates.address_unlocks_at, label: "Address and number unlock", done: visit.site_address !== null },
    { key: "travel", at: visit.gates.en_route_opens_at, label: "Start travelling", done: visit.en_route_at !== null },
    { key: "start", at: visit.scheduled_start, label: "Job starts", done: false },
  ];
  const currentIndex = steps.findIndex((step) => !step.done);
  return steps.map(({ key, at, label, done }, index) => ({
    key,
    at,
    label,
    state: done ? "done" : index === currentIndex ? "current" : "next",
  }));
}

/** "14h 20m", "2d 3h", "12 min". `null` once the start time has passed. */
export function formatStartsIn(remainingMs: number): string | null {
  if (remainingMs <= 0) return null;
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
