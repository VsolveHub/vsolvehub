"use client";

import { StayRoomCard, formatMoney, type StayRoomCardChip } from "@vsolve/ui";
import { Eye } from "lucide-react";

import type { StayLook, StayProperty, StayUnit } from "@/features/stays/queries";

const TENANT_LABELS: Record<string, string> = {
  BACHELOR_MALE: "Bachelor (M)",
  BACHELOR_FEMALE: "Ladies only",
  FAMILY: "Family only",
  WORKING_PROFESSIONAL: "Professionals",
};

/** Same wording as the guest app's room cards. */
function occupancy(unit: StayUnit, roomStyle: string | null | undefined): string {
  if (roomStyle === "PRIVATE") {
    const guests = unit.max_guests ?? 1;
    return `Up to ${guests} guest${guests === 1 ? "" : "s"}`;
  }
  const sharing = unit.sharing_count ?? 1;
  return sharing === 1 ? "Private room" : `${sharing} sharing`;
}

function available(count: number, roomStyle: string | null | undefined): string {
  const word = roomStyle === "SHARED" ? "bed" : "room";
  return `${count} ${word}${count === 1 ? "" : "s"} available`;
}

export type PreviewCard = {
  look: StayLook;
  visible: boolean;
  /** Why guests can't see this look right now, in the host's words. */
  reason: string | null;
};

/** Which looks guests see, and why the others are hidden. */
export function previewCards(unit: StayUnit): PreviewCard[] {
  const looks = [...(unit.looks ?? [])].sort((a, b) => a.display_order - b.display_order);
  return looks.map((look) => {
    const label = look.name || "this look";
    if (look.media.length === 0) {
      return { look, visible: false, reason: `Hidden from guests — add a photo of ${label}.` };
    }
    if (look.available_count === 0) {
      return { look, visible: false, reason: `Hidden from guests — no room of ${label} is on.` };
    }
    return { look, visible: true, reason: null };
  });
}

/**
 * "How guests see it": the real guest card for every look of this room type, live.
 *
 * Uses the guest app's own card component, so it is what guests get. A look without a photo,
 * or with no room on, is shown dimmed with the reason. Room numbers never appear.
 */
export function GuestPreview({ property, unit }: { property: StayProperty; unit: StayUnit }) {
  const cards = previewCards(unit);
  const shown = cards.filter((c) => c.visible).length;
  const fields = (property.structured_fields ?? {}) as { tenant_preference?: string };
  const tenant = fields.tenant_preference ? TENANT_LABELS[fields.tenant_preference] : undefined;
  const period = property.price_period === "NIGHT" ? "night" : "month";
  const others = Math.max(shown - 1, 0);
  // Guests see the average of the property's reviews, to one decimal.
  const ratings = (property.reviews ?? []).map((r) => r.rating ?? 0).filter((r) => r > 0);
  const rating = ratings.length
    ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(1)
    : null;

  return (
    <aside
      aria-label="How guests see this room"
      className="flex flex-col gap-3 rounded-card bg-navy-50 p-3 sm:p-4"
      data-testid="guest-preview"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-navy-700">
          <Eye className="size-3.5" aria-hidden />
          How guests see it
        </p>
        <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-bold text-navy-700">Live</span>
      </div>
      {cards.map(({ look, visible, reason }) => {
        const chips: StayRoomCardChip[] = [
          { label: occupancy(unit, property.room_style), tone: "neutral" },
          ...(tenant ? [{ label: tenant, tone: "brand" as const }] : []),
          { label: available(look.available_count, property.room_style), tone: "success" },
          ...(visible && others > 0
            ? [{ label: `+${others} more look${others === 1 ? "" : "s"}`, tone: "info" as const }]
            : []),
        ];
        return (
          <div key={look.id} className="flex flex-col gap-1.5">
            {reason ? (
              <p className="rounded-control border border-warning-text/30 bg-warning-surface px-2.5 py-1.5 text-xs font-semibold text-warning-text">
                {reason}
              </p>
            ) : null}
            <div className={visible ? "" : "opacity-45"} aria-hidden={!visible}>
              <StayRoomCard
                photoUrl={look.media[0]?.url}
                photoCount={look.media.length}
                rating={rating}
                reviewCount={ratings.length}
                title={look.display_name || unit.name}
                subtitle={property.title}
                location={property.location_text}
                chips={chips}
                price={formatMoney(unit.nightly_rate_paise)}
                period={period}
              />
            </div>
          </div>
        );
      })}
      <p className="text-sm font-semibold text-navy-900" data-testid="guest-preview-summary">
        Guests see {shown} card{shown === 1 ? "" : "s"} for {unit.name}.
      </p>
      <p className="text-xs text-text-secondary">Room numbers are never shown to guests.</p>
    </aside>
  );
}
