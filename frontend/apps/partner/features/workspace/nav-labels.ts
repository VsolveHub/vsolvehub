import type { useT } from "@vsolve/ui";

/**
 * `registry.ts` declares `WorkspaceNavItem.label` / `WorkspaceDefinition.label`
 * as plain English strings at module scope, because the registry itself is
 * data, not a component — it cannot call `useT()`. Every render site maps
 * that literal text through `translateNavLabel` instead of printing it
 * directly, so a label keeps rendering correctly even if a consumer forgets
 * to add a new one here (falls back to the literal English).
 */
const NAV_LABEL_KEYS: Record<string, string> = {
  Home: "workspaces.nav.home",
  Jobs: "workspaces.nav.jobs",
  Money: "workspaces.nav.money",
  You: "workspaces.nav.you",
  Work: "workspaces.nav.work",
  Alerts: "workspaces.nav.alerts",
  Me: "workspaces.nav.me",
  Listings: "workspaces.nav.listings",
  Rentals: "workspaces.nav.rentals",
  Bookings: "workspaces.nav.bookings",
  Stays: "workspaces.nav.stays",
  Enquiries: "workspaces.nav.enquiries",
  Workforce: "workspaces.nav.workforce",
  Offers: "workspaces.nav.offers",
  Shifts: "workspaces.nav.shifts",
  Crew: "workspaces.nav.crew",
  Projects: "workspaces.nav.projects",
  Stages: "workspaces.nav.stages",
  "Job Listings": "workspaces.nav.jobListings",
};

const WORKSPACE_DESCRIPTION_KEYS: Record<string, string> = {
  "Supply crew by the day or shift. You are paid directly by the customer.":
    "workspaces.description.workforce",
  "Quote for a defined outcome. Vsolve holds each stage until it is approved.":
    "workspaces.description.projects",
  "Post job opportunities, review applications, and manage hiring.":
    "workspaces.description.listing",
  "List rental assets, manage bookings, handover and deposit release.":
    "workspaces.description.rental",
  "Host properties and respond to guest enquiries.": "workspaces.description.stay",
};

/** Translates a `WorkspaceNavItem.label` / `WorkspaceDefinition.label`. Falls back to the literal English when the text has no mapped key. */
export function translateNavLabel(t: ReturnType<typeof useT>, label: string): string {
  const key = NAV_LABEL_KEYS[label];
  return key ? t(key) : label;
}

/** Translates a `WorkspaceDefinition.description`. Falls back to the literal English when the text has no mapped key. */
export function translateWorkspaceDescription(t: ReturnType<typeof useT>, description: string): string {
  const key = WORKSPACE_DESCRIPTION_KEYS[description];
  return key ? t(key) : description;
}
