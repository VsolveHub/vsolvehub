"use client";

import { StayRoomCard, formatMoney, useT, type StayRoomCardChip } from "@vsolve/ui";
import { Eye } from "lucide-react";

import type { StayLook, StayProperty, StayUnit } from "@/features/stays/queries";

type Translate = ReturnType<typeof useT>;

/** Catalogue keys, resolved with `t` at render time. */
const TENANT_LABEL_KEYS: Record<string, string> = {
  BACHELOR_MALE: "stays.guestPreview.tenant.bachelorMale",
  BACHELOR_FEMALE: "stays.guestPreview.tenant.bachelorFemale",
  FAMILY: "stays.guestPreview.tenant.family",
  WORKING_PROFESSIONAL: "stays.guestPreview.tenant.workingProfessional",
};

/** Same wording as the guest app's room cards. */
function occupancy(unit: StayUnit, roomStyle: string | null | undefined, t: Translate): string {
  if (roomStyle === "PRIVATE") {
    const guests = unit.max_guests ?? 1;
    return t("stays.guestPreview.upToGuests", { count: guests });
  }
  const sharing = unit.sharing_count ?? 1;
  return sharing === 1
    ? t("stays.guestPreview.privateRoom")
    : t("stays.guestPreview.sharing", { count: sharing });
}

function available(count: number, roomStyle: string | null | undefined, t: Translate): string {
  return roomStyle === "SHARED"
    ? t("stays.guestPreview.bedsAvailable", { count })
    : t("stays.guestPreview.roomsAvailable", { count });
}

export type PreviewCard = {
  look: StayLook;
  visible: boolean;
  /** Why guests can't see this look right now, in the host's words. */
  reason: string | null;
};

/** Which looks guests see, and why the others are hidden. */
export function previewCards(unit: StayUnit, t: Translate): PreviewCard[] {
  const looks = [...(unit.looks ?? [])].sort((a, b) => a.display_order - b.display_order);
  return looks.map((look) => {
    const label = look.name || t("stays.guestPreview.thisLook");
    if (look.media.length === 0) {
      return { look, visible: false, reason: t("stays.guestPreview.hiddenNoPhoto", { label }) };
    }
    if (look.available_count === 0) {
      return { look, visible: false, reason: t("stays.guestPreview.hiddenNoRoomOn", { label }) };
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
  const t = useT();
  const cards = previewCards(unit, t);
  const shown = cards.filter((c) => c.visible).length;
  const fields = (property.structured_fields ?? {}) as { tenant_preference?: string };
  const tenantKey = fields.tenant_preference ? TENANT_LABEL_KEYS[fields.tenant_preference] : undefined;
  const tenant = tenantKey ? t(tenantKey) : undefined;
  const period =
    property.price_period === "NIGHT" ? t("stays.guestPreview.night") : t("stays.guestPreview.month");
  const others = Math.max(shown - 1, 0);
  // Guests see the average of the property's reviews, to one decimal.
  const ratings = (property.reviews ?? []).map((r) => r.rating ?? 0).filter((r) => r > 0);
  const rating = ratings.length
    ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(1)
    : null;

  return (
    <aside
      aria-label={t("stays.guestPreview.ariaLabel")}
      className="flex flex-col gap-3 rounded-card bg-navy-50 p-3 sm:p-4"
      data-testid="guest-preview"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-navy-700">
          <Eye className="size-3.5" aria-hidden />
          {t("stays.guestPreview.heading")}
        </p>
        <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-bold text-navy-700">{t("stays.guestPreview.live")}</span>
      </div>
      {cards.map(({ look, visible, reason }) => {
        const chips: StayRoomCardChip[] = [
          { label: occupancy(unit, property.room_style, t), tone: "neutral" },
          ...(tenant ? [{ label: tenant, tone: "brand" as const }] : []),
          { label: available(look.available_count, property.room_style, t), tone: "success" },
          ...(visible && others > 0
            ? [{ label: t("stays.guestPreview.moreLooks", { count: others }), tone: "info" as const }]
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
        {t("stays.guestPreview.summary", { count: shown, name: unit.name })}
      </p>
      <p className="text-xs text-text-secondary">{t("stays.guestPreview.noRoomNumbers")}</p>
    </aside>
  );
}
