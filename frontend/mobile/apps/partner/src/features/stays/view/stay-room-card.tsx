import { BedDouble, MapPin } from "lucide-react-native";
import type { ReactNode } from "react";
import { Image, View } from "react-native";

import { Text } from "@vsolve/mobile-ui";
import { THEME_COLORS } from "../theme-colors";

export type StayRoomCardChip = {
  label: string;
  tone: "neutral" | "brand" | "success" | "info";
};

export interface StayRoomCardProps {
  photoUrl?: string | null;
  photoCount: number;
  rating?: string | number | null;
  reviewCount?: number | null;
  title: string;
  subtitle: string;
  location?: string | null;
  chips: StayRoomCardChip[];
  price: string;
  period: string;
  footnote?: ReactNode;
  overlay?: ReactNode;
  className?: string;
}

const CHIP_BG: Record<StayRoomCardChip["tone"], string> = {
  neutral: "border-line bg-surface-muted",
  brand: "border-navy-200 bg-navy-50",
  success: "border-emerald-200 bg-emerald-50",
  info: "border-navy-200 bg-navy-50",
};

const CHIP_TEXT: Record<StayRoomCardChip["tone"], string> = {
  neutral: "text-text-muted",
  brand: "text-navy-900",
  success: "text-emerald-800",
  info: "text-navy-900",
};

export function StayRoomCard({
  photoUrl,
  photoCount,
  rating,
  reviewCount,
  title,
  subtitle,
  location,
  chips,
  price,
  period,
  footnote,
  overlay,
  className,
}: StayRoomCardProps) {
  return (
    <View
      className={`relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm ${className ?? ""}`}
    >
      {overlay}
      <View className="relative aspect-[16/10] w-full overflow-hidden bg-surface-muted">
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            className="absolute inset-0 size-full"
            resizeMode="cover"
          />
        ) : (
          <View className="flex size-full items-center justify-center">
            <BedDouble size={32} color={THEME_COLORS.muted} />
          </View>
        )}
        {photoCount > 1 ? (
          <View className="absolute bottom-2 right-2 rounded-md bg-navy-900/80 px-2 py-0.5">
            <Text className="text-[11px] font-semibold text-white">
              {photoCount} photos
            </Text>
          </View>
        ) : null}
        {rating ? (
          <View className="absolute left-2 top-2 rounded bg-white/95 px-2 py-0.5 shadow-sm">
            <Text className="text-xs font-bold text-amber-700">
              ★ {rating}
              {reviewCount ? ` (${reviewCount})` : ""}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="flex flex-1 flex-col gap-2 p-3.5">
        <View>
          <Text className="text-base font-bold text-text">{title}</Text>
          <Text className="text-xs font-medium text-text-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        {location ? (
          <View className="flex-row items-center gap-1">
            <MapPin size={12} color={THEME_COLORS.muted} />
            <Text className="text-xs text-text-muted" numberOfLines={1}>
              {location}
            </Text>
          </View>
        ) : null}

        <View className="flex-row flex-wrap gap-1.5 mt-1">
          {chips.map((chip, index) => (
            <View
              key={index}
              className={`rounded-full border px-2 py-0.5 ${CHIP_BG[chip.tone]}`}
            >
              <Text className={`text-[11px] font-semibold ${CHIP_TEXT[chip.tone]}`}>
                {chip.label}
              </Text>
            </View>
          ))}
        </View>

        <View className="mt-1 flex-row items-baseline gap-1">
          <Text className="text-base font-bold text-navy-900">{price}</Text>
          <Text className="text-xs text-text-muted">/ {period}</Text>
        </View>

        {footnote}
      </View>
    </View>
  );
}

