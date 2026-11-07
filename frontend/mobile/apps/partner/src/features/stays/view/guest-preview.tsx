import { Eye } from "lucide-react-native";
import { View } from "react-native";

import { Text, formatMoney, useT } from "@vsolve/mobile-ui";
import type { StayLook, StayProperty, StayUnit } from "../model";
import { THEME_COLORS } from "../theme-colors";
import { StayRoomCard, type StayRoomCardChip } from "./stay-room-card";

type Translate = ReturnType<typeof useT>;

const TENANT_LABEL_KEYS: Record<string, string> = {
  BACHELOR_MALE: "stays.guestPreview.tenant.bachelorMale",
  BACHELOR_FEMALE: "stays.guestPreview.tenant.bachelorFemale",
  FAMILY: "stays.guestPreview.tenant.family",
  WORKING_PROFESSIONAL: "stays.guestPreview.tenant.workingProfessional",
};

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
  reason: string | null;
};

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
 * "How guests see it": live preview of real guest cards for every look of this room type.
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
  const reviews = property.reviews ?? [];
  const ratings = reviews.map((r: { rating?: number }) => r.rating ?? 0).filter((r: number) => r > 0);
  const rating = ratings.length
    ? (ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length).toFixed(1)
    : null;

  return (
    <View
      aria-label={t("stays.guestPreview.ariaLabel")}
      className="flex flex-col gap-3 rounded-2xl bg-navy-50 p-3.5"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Eye size={14} color={THEME_COLORS.navy700} />
          <Text className="text-[11px] font-bold uppercase tracking-wider text-navy-700">
            {t("stays.guestPreview.heading")}
          </Text>
        </View>
        <View className="rounded-full bg-surface px-2.5 py-0.5">
          <Text className="text-[11px] font-bold text-navy-700">
            {t("stays.guestPreview.live")}
          </Text>
        </View>
      </View>
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
          <View key={look.id} className="flex flex-col gap-1.5">
            {reason ? (
              <View className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5">
                <Text className="text-xs font-semibold text-amber-900">{reason}</Text>
              </View>
            ) : null}
            <View className={visible ? "" : "opacity-45"}>
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
            </View>
          </View>
        );
      })}
      <Text className="text-sm font-semibold text-navy-900">
        {t("stays.guestPreview.summary", { count: shown, name: unit.name })}
      </Text>
      <Text className="text-xs text-text-muted">{t("stays.guestPreview.noRoomNumbers")}</Text>
    </View>
  );
}
