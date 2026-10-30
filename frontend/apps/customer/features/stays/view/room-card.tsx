"use client";

import Link from "next/link";
import { StayRoomCard, type StayRoomCardChip } from "@vsolve/ui";

import { stayHref } from "@/lib/routes";

import { otherLooksLabel } from "../looks";
import { availabilityLabel, formatPaise, pricePeriodOf, roomOccupancyLabel } from "../model";
import type { RoomCard as RoomCardData } from "../room-cards";

const TENANT_LABELS: Record<string, string> = {
  BACHELOR_MALE: "Bachelor (M)",
  BACHELOR_FEMALE: "Ladies only",
  FAMILY: "Family only",
  WORKING_PROFESSIONAL: "Professionals",
};

/** "/stays/<slug>?room=<unit id>&look=<look id>": the property page opens on this room and look. */
export function roomHref(slug: string, unitId: string, lookId?: string): string {
  const look = lookId ? `&look=${encodeURIComponent(lookId)}` : "";
  return `${stayHref(slug)}?room=${encodeURIComponent(unitId)}${look}`;
}

/** The tenant label a property shows on its cards, if it set one. */
export function tenantLabel(structuredFields: unknown): string | undefined {
  const raw = (structuredFields as { tenant_preference?: string } | null)?.tenant_preference;
  return raw ? TENANT_LABELS[raw] : undefined;
}

/**
 * One look of a room type in search: its photo, what it is, where, and the price.
 *
 * The markup is `StayRoomCard` from the UI kit, which the host's "How guests see it" preview
 * renders too, so what the host previews is what guests get.
 */
export function RoomCard({ card }: { card: RoomCardData }) {
  const { property, unit, look, otherLooks, moreHere } = card;
  const period = pricePeriodOf(property.price_period);
  const tenant = tenantLabel(property.structured_fields);
  const title = look.display_name || unit.name;
  const chips: StayRoomCardChip[] = [
    { label: roomOccupancyLabel(unit, property.room_style), tone: "neutral" },
    ...(tenant ? [{ label: tenant, tone: "brand" as const }] : []),
    { label: availabilityLabel(look.available_count, property.room_style), tone: "success" },
    ...(otherLooks > 0 ? [{ label: otherLooksLabel(otherLooks), tone: "info" as const }] : []),
  ];

  return (
    <StayRoomCard
      photoUrl={look.media[0]?.url}
      photoCount={look.media.length}
      rating={property.average_rating}
      reviewCount={property.review_count}
      title={title}
      subtitle={property.title}
      location={property.location_text}
      chips={chips}
      price={formatPaise(unit.nightly_rate_paise)}
      period={period === "NIGHT" ? "night" : "month"}
      overlay={
        <Link
          href={roomHref(property.slug, unit.id, look.id || undefined)}
          className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          aria-label={`${title} at ${property.title}`}
        />
      }
      footnote={
        moreHere > 0 ? (
          <p className="text-xs font-semibold text-text-link">
            + {moreHere} more room type{moreHere === 1 ? "" : "s"} at {property.title}
          </p>
        ) : null
      }
    />
  );
}
