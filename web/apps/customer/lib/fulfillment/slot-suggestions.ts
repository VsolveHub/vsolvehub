// ─────────────────────────────────────────────────────────────────────────────
// Slot suggestions — the alternatives offered on the "No professionals
// available" screen. Pure: it walks the same 7-day × 6-block grid the booking
// flow's slot picker offers, evaluating each candidate against the pool of
// trade/area-matched partners already fetched by findAvailablePartners. No
// extra database query — a rejected slot becomes a redirect, not a dead end.
// ─────────────────────────────────────────────────────────────────────────────

import { slotMatchesAvailability, type CandidatePartner, type MatchContext } from "./matching";

/** Matches the flow's TIME_SLOTS block starts (8am, 10am, ... 6pm). */
const BLOCK_START_HOURS = [8, 10, 12, 14, 16, 18];
const BLOCK_LABELS = ["08–10 AM", "10–12 PM", "12–02 PM", "02–04 PM", "04–06 PM", "06–08 PM"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CANDIDATE_DAYS = 7;

export type SlotSuggestion = { slotIso: string; label: string; count: number };

function candidateSlots(): { iso: string; label: string }[] {
  const out: { iso: string; label: string }[] = [];
  for (let day = 0; day < CANDIDATE_DAYS; day++) {
    const date = new Date();
    date.setDate(date.getDate() + day);
    const dayLabel = day === 0 ? "Today" : DAY_LABELS[date.getDay()]!;
    for (let block = 0; block < BLOCK_START_HOURS.length; block++) {
      const slot = new Date(date);
      slot.setHours(BLOCK_START_HOURS[block]!, 0, 0, 0);
      out.push({ iso: slot.toISOString(), label: `${dayLabel} · ${BLOCK_LABELS[block]}` });
    }
  }
  return out;
}

/**
 * Evaluate the candidate-slot grid against an already-matched partner pool and
 * return up to `max` future slots (excluding the rejected one) with at least
 * one available partner, nearest first.
 */
export function suggestSlots(
  pool: CandidatePartner[],
  ctx: MatchContext,
  { max = 3 }: { max?: number } = {},
): SlotSuggestion[] {
  if (pool.length === 0) return [];

  const now = Date.now();
  const suggestions: SlotSuggestion[] = [];

  for (const { iso, label } of candidateSlots()) {
    if (suggestions.length >= max) break;
    if (iso === ctx.slot) continue;
    if (new Date(iso).getTime() <= now) continue;

    const count = pool.filter((p) => slotMatchesAvailability(iso, p.availability)).length;
    if (count > 0) suggestions.push({ slotIso: iso, label, count });
  }

  return suggestions;
}
