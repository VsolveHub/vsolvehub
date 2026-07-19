export type WorkerLine = { label: string; count: number; icon?: string };

export type ConstructionDetails = {
  workers: WorkerLine[];
  bookingType: "individual" | "team";
  selectedQuoteName: string;
  duration: number;
};

const DEFAULT_WORKERS: WorkerLine[] = [
  { label: "Masons", count: 2, icon: "🧱" },
  { label: "Helpers", count: 4, icon: "👷" },
  { label: "Bar Benders", count: 2, icon: "🦾" },
  { label: "Shuttering Carpenters", count: 1, icon: "🪵" },
];

function resolveWorkers(details: any): WorkerLine[] | null {
  if (Array.isArray(details.workers) && details.workers.length) {
    return details.workers.map((w: any) => ({ label: w.label, count: w.count, icon: w.icon }));
  }
  if (details.crew) {
    return [
      { label: "Masons", count: details.crew.masons ?? 0, icon: "🧱" },
      { label: "Helpers", count: details.crew.helpers ?? 0, icon: "👷" },
      { label: "Bar Benders", count: details.crew.barBenders ?? 0, icon: "🦾" },
      { label: "Shuttering Carpenters", count: details.crew.shutteringCarpenters ?? 0, icon: "🪵" },
    ].filter((w) => w.count > 0);
  }
  return null;
}

function resolveQuoteName(details: any): string | null {
  return details.selectedTeam?.name ?? details.selectedQuote?.name ?? null;
}

// Parse details from the booking's archetypeDetails JSON string.
export function parseConstructionDetails(archetypeDetails: string): ConstructionDetails {
  const result: ConstructionDetails = {
    workers: DEFAULT_WORKERS,
    bookingType: "team",
    selectedQuoteName: "Raju Construction",
    duration: 2,
  };

  try {
    const details = JSON.parse(archetypeDetails);
    if (details.bookingType) result.bookingType = details.bookingType;

    const workers = resolveWorkers(details);
    if (workers) result.workers = workers;

    const quoteName = resolveQuoteName(details);
    if (quoteName) result.selectedQuoteName = quoteName;

    if (details.durationDays) result.duration = details.durationDays;
  } catch {}

  return result;
}
