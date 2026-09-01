import type { BookingGroup } from "@/features/bookings/queries";
import { GROUP_STATUS_LABELS } from "@/features/bookings/view/group-status";
import type { EngagementRowView } from "@/features/engagement/adapters";
import { ENGAGEMENT_STATUS } from "@/features/engagement/view/engagement-status";
import type { RequestRowView } from "@/features/requirement/adapters";

/**
 * Client-side matching for the Bookings hub search field.
 *
 * The page already holds the list; this only decides which of those rows stay
 * visible. There is no second fetch and no reordering — a match keeps its
 * original section and its original place in that section.
 */

export type SearchableBooking =
  | { kind: "group"; group: BookingGroup }
  | { kind: "request"; row: RequestRowView }
  | { kind: "engagement"; row: EngagementRowView };

export function normalizeBookingSearch(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function matchesBookingSearch(haystack: string, query: string): boolean {
  const normalised = normalizeBookingSearch(query);
  if (normalised === "") return true;

  const hay = haystack.toLowerCase();
  if (hay.includes(normalised)) return true;

  return normalised.split(" ").every((token) => token.length > 0 && hay.includes(token));
}

function parts(...values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .join(" ");
}

function slugAsWords(slug: string): string {
  return slug.replace(/[-_./]/g, " ");
}

export function groupSearchHaystack(group: BookingGroup): string {
  const lineBits = group.units.flatMap((unit) =>
    unit.lines.flatMap((line) => [line.label, line.code, slugAsWords(line.code)]),
  );
  const unitBits = group.units.flatMap((unit) => [
    unit.id,
    unit.booking_id,
    unit.professional?.display_name,
    unit.professional?.headline,
  ]);

  return parts(
    group.id,
    group.checkout_id,
    group.order_id,
    GROUP_STATUS_LABELS[group.status],
    group.status,
    ...lineBits,
    ...unitBits,
  );
}

export function requestSearchHaystack(row: RequestRowView): string {
  return parts(
    row.id,
    row.title,
    row.status,
    row.lifecycleExplanation,
    row.categorySlug,
    row.categorySlug ? slugAsWords(row.categorySlug) : null,
  );
}

export function engagementSearchHaystack(row: EngagementRowView): string {
  return parts(
    row.engagementId,
    row.requirementId,
    row.serviceName,
    row.serviceSlug,
    row.serviceSlug ? slugAsWords(row.serviceSlug) : null,
    row.activeStageLabel,
    row.status,
    ENGAGEMENT_STATUS[row.status]?.label,
  );
}

export function searchableBookingMatches(item: SearchableBooking, query: string): boolean {
  if (item.kind === "group") return matchesBookingSearch(groupSearchHaystack(item.group), query);
  if (item.kind === "engagement") {
    return matchesBookingSearch(engagementSearchHaystack(item.row), query);
  }
  return matchesBookingSearch(requestSearchHaystack(item.row), query);
}

export function filterBookingsBySearch<T extends SearchableBooking>(
  items: readonly T[],
  query: string,
): T[] {
  if (normalizeBookingSearch(query) === "") return [...items];
  return items.filter((item) => searchableBookingMatches(item, query));
}
