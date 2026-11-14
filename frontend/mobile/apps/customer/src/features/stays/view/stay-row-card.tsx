import { COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Building2, Heart, MapPin, Star, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { useIsDesktop } from "@/lib/responsive";
import {
  formatPaise,
  pricePeriodOf,
  roomOccupancyLabel,
  type StayPropertySummary,
} from "../model";
import { THEME_COLORS } from "../theme-colors";
import { useSavedItems } from "../use-saved-items";
import { getAmenityIcon } from "./amenity-icon";

export interface StayRowCardProps {
  property: StayPropertySummary;
  isSelected?: boolean;
  onCheckDates: (property: StayPropertySummary) => void;
}

export function StayRowCard({
  property,
  isSelected = false,
  onCheckDates,
}: StayRowCardProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const saved = useSavedItems("stay");
  const isHearted = saved.isSaved(property.id);

  const period = pricePeriodOf(property.price_period);
  const minRate =
    property.units && property.units.length > 0
      ? property.units.reduce(
        (min, u) => (u.nightly_rate_paise < min ? u.nightly_rate_paise : min),
        property.units[0]?.nightly_rate_paise ?? 0,
      )
      : property.min_price_paise ?? 0;

  const rawMedia = (property as { media?: { url?: string }[] }).media;
  const imageUrl = resolveImageUrl(
    (Array.isArray(rawMedia) && rawMedia[0]?.url) || property.image_urls?.[0],
  );

  const hostName =
    property.host_name ||
    property.partner?.company_name ||
    property.partner?.full_name ||
    null;

  const primaryUnit = property.units?.[0];
  const occupancy = primaryUnit
    ? roomOccupancyLabel(primaryUnit, property.room_style)
    : null;
  const amenities = (property.amenities ?? []).slice(0, 2);

  const handleOpenDetails = () => {
    router.push(`/stays/${property.slug || property.id}` as never);
  };

  if (!isDesktop) {
    return (
      <Pressable
        accessibilityLabel={`View ${property.title}`}
        onPress={handleOpenDetails}
        className={`gap-2.5 rounded-2xl border p-3.5 shadow-2xs active:opacity-95 ${
          isSelected
            ? "border-navy-900 bg-orange-50/40"
            : "border-line bg-surface"
        }`}
      >
        <View className="flex-row items-start gap-3">
          {imageUrl ? (
            <View className="size-16 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-sunken">
              <Image
                source={{ uri: imageUrl }}
                contentFit="cover"
                style={{ width: "100%", height: "100%" }}
              />
            </View>
          ) : (
            <View className="size-16 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-sunken">
              <Building2 size={20} color={COLOR_TOKENS.textMuted} />
            </View>
          )}

          <View className="min-w-0 flex-1 gap-1">
            <View className="flex-row items-start justify-between gap-2">
              <Text
                className="flex-1 text-[15px] font-bold leading-snug text-navy-900"
                numberOfLines={2}
              >
                {property.title}
              </Text>
              <Pressable
                accessibilityLabel={
                  isHearted ? "Remove from saved stays" : "Save stay listing"
                }
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation();
                  saved.toggle(property.id);
                }}
                className={`size-7 shrink-0 items-center justify-center rounded-full border bg-surface active:scale-90 ${
                  isHearted ? "border-action" : "border-line"
                }`}
              >
                <Heart
                  size={13}
                  color={isHearted ? COLOR_TOKENS.action : COLOR_TOKENS.textMuted}
                  fill={isHearted ? COLOR_TOKENS.action : "transparent"}
                />
              </Pressable>
            </View>

            {property.location_text || occupancy ? (
              <Text className="text-[11px] text-text-secondary" numberOfLines={1}>
                {[property.location_text, occupancy].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center justify-between gap-2 border-t border-line/60 pt-2.5">
          <View className="min-w-0 flex-1">
            <Text className="text-[10px] font-medium text-text-secondary">
              Starts at
            </Text>
            <View className="flex-row items-baseline gap-1">
              <Text className="text-[15px] font-bold text-navy-900" numberOfLines={1}>
                {formatPaise(minRate)}
              </Text>
              <Text className="text-[11px] text-text-secondary">
                /{period === "NIGHT" ? "night" : "mo"}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Check dates for ${property.title}`}
            onPress={(e) => {
              e.stopPropagation();
              onCheckDates(property);
            }}
            className="shrink-0 rounded-lg bg-navy-900 px-3.5 py-2 active:bg-navy-800"
          >
            <Text className="text-xs font-bold text-white">Check Dates</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityLabel={`View ${property.title}`}
      onPress={handleOpenDetails}
      className={`flex-row items-center gap-4 rounded-2xl border p-4 shadow-2xs transition-colors active:opacity-95 ${
        isSelected
          ? "border-navy-900/60 bg-orange-50/40"
          : "border-[#e7e2da] bg-white hover:border-line-strong"
      }`}
    >
      {/* Thumbnail */}
      {imageUrl ? (
        <View className="h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-sunken">
          <Image
            source={{ uri: imageUrl }}
            contentFit="cover"
            style={{ width: "100%", height: "100%" }}
          />
        </View>
      ) : (
        <View className="h-24 w-32 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-sunken">
          <Building2 size={24} color={COLOR_TOKENS.textMuted} />
        </View>
      )}

      {/* Middle Details */}
      <View className="min-w-0 flex-1 gap-1.5">
        <View className="flex-row items-center gap-2">
          <Text
            className="shrink text-base font-bold text-navy-900"
            numberOfLines={1}
          >
            {property.title}
          </Text>
          {property.average_rating ? (
            <View className="flex-row items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5">
              <Star size={10} color={THEME_COLORS.amber} fill={THEME_COLORS.amber} />
              <Text className="text-[10px] font-bold text-amber-800">
                {property.average_rating.toFixed(1)}
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityLabel={
              isHearted ? "Remove from saved stays" : "Save stay listing"
            }
            hitSlop={8}
            onPress={(e) => {
              e.stopPropagation();
              saved.toggle(property.id);
            }}
            className={`size-7 shrink-0 items-center justify-center rounded-full border bg-surface active:scale-90 ${isHearted ? "border-action" : "border-line"
              }`}
          >
            <Heart
              size={13}
              color={isHearted ? COLOR_TOKENS.action : COLOR_TOKENS.textMuted}
              fill={isHearted ? COLOR_TOKENS.action : "transparent"}
            />
          </Pressable>
        </View>

        {hostName ? (
          <Text className="text-xs text-text-secondary" numberOfLines={1}>
            Hosted by{" "}
            <Text className="font-semibold text-navy-900">{hostName}</Text>
          </Text>
        ) : null}

        {property.location_text ? (
          <View className="flex-row items-center gap-1">
            <MapPin size={12} color={COLOR_TOKENS.textMuted} />
            <Text className="text-xs text-text-secondary" numberOfLines={1}>
              {property.location_text}
            </Text>
          </View>
        ) : null}

        {occupancy || amenities.length > 0 ? (
          <View className="flex-row flex-wrap items-center gap-1.5 pt-0.5">
            {occupancy ? (
              <View className="flex-row items-center gap-1 rounded-md border border-line bg-surface-sunken px-2 py-0.5">
                <Users size={11} color={COLOR_TOKENS.textSecondary} />
                <Text className="text-[11px] font-medium text-text-secondary">
                  {occupancy}
                </Text>
              </View>
            ) : null}
            {amenities.map((amenity) => {
              const IconComp = getAmenityIcon(amenity.key);
              return (
                <View
                  key={amenity.key}
                  className="flex-row items-center gap-1 rounded-md border border-line bg-surface-sunken px-2 py-0.5"
                >
                  <IconComp size={11} color={COLOR_TOKENS.textSecondary} />
                  <Text className="text-[11px] font-medium text-text-secondary">
                    {amenity.label}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* Right Price + Dual Actions */}
      <View className="w-[215px] shrink-0 items-end justify-between self-stretch gap-3">
        <View className="items-end">
          <Text className="text-[11px] font-medium text-text-secondary">
            Starts at
          </Text>
          <View className="flex-row items-baseline gap-1">
            <Text className="text-lg font-bold text-navy-900">
              {formatPaise(minRate)}
            </Text>
            <Text className="text-xs text-text-secondary">
              / {period === "NIGHT" ? "night" : "month"}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={(e) => {
              e.stopPropagation();
              handleOpenDetails();
            }}
            className="rounded-lg border border-line bg-surface px-3 py-2 active:bg-surface-sunken"
          >
            <Text className="text-xs font-bold text-navy-900">View details</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={(e) => {
              e.stopPropagation();
              onCheckDates(property);
            }}
            className="rounded-lg bg-navy-900 px-3.5 py-2 active:bg-navy-800"
          >
            <Text className="text-xs font-bold text-white">Check Dates</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

