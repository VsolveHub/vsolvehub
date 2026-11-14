import { COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Heart, MapPin, Wrench } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { useIsDesktop } from "@/lib/responsive";
import { formatPaise, type RentalAsset } from "../model";
import { useSavedItems } from "../use-saved-items";

export interface RentalRowCardProps {
  asset: RentalAsset;
  isSelected?: boolean;
  onRentNow: (asset: RentalAsset) => void;
}

export function RentalRowCard({
  asset,
  isSelected = false,
  onRentNow,
}: RentalRowCardProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const saved = useSavedItems("rental");
  const isHearted = saved.isSaved(asset.id);

  const dailyPrice = formatPaise(asset.daily_rate_paise);
  const deposit = formatPaise(asset.deposit_paise);
  const imageUrl = resolveImageUrl(asset.media?.[0]?.url || asset.thumbnail_url);

  const partnerDisplay =
    asset.partner_name ||
    asset.partner?.company_name ||
    asset.partner?.full_name ||
    null;

  const handleOpenDetails = () => {
    router.push(`/rentals/${asset.slug || asset.id}` as never);
  };

  if (!isDesktop) {
    return (
      <Pressable
        accessibilityLabel={`View ${asset.title}`}
        onPress={handleOpenDetails}
        className={`gap-2.5 rounded-2xl border p-3.5 shadow-2xs active:opacity-95 ${
          isSelected
            ? "border-navy-900 bg-orange-50/40"
            : "border-line bg-surface"
        }`}
      >
        <View className="flex-row items-start gap-3">
          {imageUrl ? (
            <View className="size-16 shrink-0 overflow-hidden rounded-xl border border-line bg-white p-1.5">
              <Image
                source={{ uri: imageUrl }}
                contentFit="contain"
                style={{ width: "100%", height: "100%" }}
              />
            </View>
          ) : (
            <View className="size-16 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-sunken">
              <Wrench size={20} color={COLOR_TOKENS.textMuted} />
            </View>
          )}

          <View className="min-w-0 flex-1 gap-1">
            <View className="flex-row items-start justify-between gap-2">
              <Text
                className="flex-1 text-[15px] font-bold leading-snug text-navy-900"
                numberOfLines={2}
              >
                {asset.title}
              </Text>
              <Pressable
                accessibilityLabel={
                  isHearted ? "Remove from saved rentals" : "Save rental listing"
                }
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation();
                  saved.toggle(asset.id);
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

            {asset.description ? (
              <Text className="text-xs leading-relaxed text-text-secondary" numberOfLines={2}>
                {asset.description}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center justify-between gap-2 border-t border-line/60 pt-2.5">
          <View className="min-w-0 flex-1">
            <Text className="text-[10px] font-medium text-text-secondary">Daily rate</Text>
            <View className="flex-row items-baseline gap-1">
              <Text className="text-[15px] font-bold text-navy-900" numberOfLines={1}>
                {dailyPrice}
              </Text>
              <Text className="text-[11px] text-text-secondary">/day</Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Rent ${asset.title}`}
            onPress={(e) => {
              e.stopPropagation();
              onRentNow(asset);
            }}
            className="shrink-0 rounded-lg bg-navy-900 px-3.5 py-2 active:bg-navy-800"
          >
            <Text className="text-xs font-bold text-white">Rent Now</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityLabel={`View ${asset.title}`}
      onPress={handleOpenDetails}
      className={`flex-row items-center gap-4 rounded-2xl border p-4 shadow-2xs transition-colors active:opacity-95 ${
        isSelected
          ? "border-navy-900/60 bg-orange-50/40"
          : "border-[#e7e2da] bg-white hover:border-line-strong"
      }`}
    >
      {/* Thumbnail */}
      {imageUrl ? (
        <View className="size-24 shrink-0 overflow-hidden rounded-xl border border-line bg-white p-2">
          <Image
            source={{ uri: imageUrl }}
            contentFit="contain"
            style={{ width: "100%", height: "100%" }}
          />
        </View>
      ) : (
        <View className="size-24 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-sunken">
          <Wrench size={24} color={COLOR_TOKENS.textMuted} />
        </View>
      )}

      {/* Middle Details */}
      <View className="min-w-0 flex-1 gap-1.5">
        <View className="flex-row items-center gap-2">
          <Text
            className="shrink text-base font-bold text-navy-900"
            numberOfLines={1}
          >
            {asset.title}
          </Text>
          <Pressable
            accessibilityLabel={
              isHearted ? "Remove from saved rentals" : "Save rental listing"
            }
            hitSlop={8}
            onPress={(e) => {
              e.stopPropagation();
              saved.toggle(asset.id);
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

        {partnerDisplay ? (
          <Text className="text-xs text-text-secondary" numberOfLines={1}>
            Offered by{" "}
            <Text className="font-semibold text-navy-900">{partnerDisplay}</Text>
          </Text>
        ) : null}

        {asset.description ? (
          <Text className="text-xs text-text-secondary leading-relaxed" numberOfLines={2}>
            {asset.description}
          </Text>
        ) : null}

        {asset.location_text ? (
          <View className="flex-row items-center gap-1 pt-0.5">
            <MapPin size={12} color={COLOR_TOKENS.textMuted} />
            <Text className="text-xs text-text-secondary" numberOfLines={1}>
              {asset.location_text}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Right Price + Dual Actions */}
      <View className="w-[215px] shrink-0 items-end justify-between self-stretch gap-3">
        <View className="items-end">
          <Text className="text-[11px] font-medium text-text-secondary">
            Daily rate
          </Text>
          <View className="flex-row items-baseline gap-1">
            <Text className="text-lg font-bold text-navy-900">{dailyPrice}</Text>
            <Text className="text-xs text-text-secondary">/day</Text>
          </View>
          <Text className="text-[11px] text-text-muted">Deposit: {deposit}</Text>
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
              onRentNow(asset);
            }}
            className="rounded-lg bg-navy-900 px-3.5 py-2 active:bg-navy-800"
          >
            <Text className="text-xs font-bold text-white">Rent Now</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

