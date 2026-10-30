import { COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ArrowRight, Heart, MapPin, Wrench } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { formatPaise, type RentalAsset } from "../model";
import { useSavedItems } from "../use-saved-items";

const FALLBACK_TOOL_IMAGE =
  "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?q=80&w=800&auto=format&fit=crop";

export function RentalCard({ asset }: { asset: RentalAsset }) {
  const router = useRouter();
  const saved = useSavedItems("rental");
  const isHearted = saved.isSaved(asset.id);

  const dailyPrice = formatPaise(asset.daily_rate_paise);
  const deposit = formatPaise(asset.deposit_paise);
  const imageUrl = asset.media?.[0]?.url || asset.thumbnail_url || FALLBACK_TOOL_IMAGE;

  const partnerDisplay =
    asset.partner_name ||
    asset.partner?.company_name ||
    asset.partner?.full_name ||
    null;

  const handleCardPress = () => {
    router.push(`/rentals/${asset.slug || asset.id}` as never);
  };

  return (
    <Pressable
      accessibilityLabel={`View ${asset.title}`}
      onPress={handleCardPress}
      className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs active:scale-[0.99] active:border-line-strong active:shadow-raised"
    >
      {/* Cover Image - Clean, no badges overlaid (100% Web Parity) */}
      <View className="aspect-[16/10] w-full bg-surface-muted overflow-hidden">
        <Image
          source={{ uri: imageUrl }}
          contentFit="cover"
          style={{ width: "100%", height: "100%" }}
        />
      </View>

      <View className="gap-3 p-4">
        {/* Top Badges & Heart Row below Image matching Web 100% */}
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row flex-wrap items-center gap-1.5">
            <View className="flex-row items-center gap-1.5 self-start rounded-full border border-info-line bg-info-surface px-2.5 py-1">
              <Wrench size={12} color={COLOR_TOKENS.infoText} />
              <Text className="text-xs font-bold text-info-text uppercase tracking-wider">
                Verified Tool
              </Text>
            </View>
            {typeof asset.quantity_available === "number" && asset.quantity_available > 1 ? (
              <View className="flex-row items-center self-start rounded-full bg-surface-sunken px-2.5 py-1">
                <Text className="text-xs font-bold text-text-secondary">
                  Qty {asset.quantity_available}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Save Heart Toggle matching Web */}
          <Pressable
            accessibilityLabel={isHearted ? "Remove from saved rentals" : "Save rental listing"}
            hitSlop={8}
            onPress={(e) => {
              e.stopPropagation();
              saved.toggle(asset.id);
            }}
            className={`size-8 items-center justify-center rounded-full border bg-surface shadow-2xs active:scale-90 ${
              isHearted ? "border-action" : "border-line"
            }`}
          >
            <Heart
              size={15}
              color={isHearted ? COLOR_TOKENS.action : COLOR_TOKENS.textMuted}
              fill={isHearted ? COLOR_TOKENS.action : "transparent"}
            />
          </Pressable>
        </View>

        {/* Title & Partner Name */}
        <View className="gap-0.5">
          <Text className="text-lg font-bold text-navy-900" numberOfLines={1}>
            {asset.title}
          </Text>
          {partnerDisplay ? (
            <Text className="text-xs text-text-secondary" numberOfLines={1}>
              Offered by <Text className="font-semibold text-navy-900">{partnerDisplay}</Text>
            </Text>
          ) : null}
        </View>

        {/* Description clamped to 2 lines */}
        {asset.description ? (
          <Text className="text-xs leading-relaxed text-text-secondary" numberOfLines={2}>
            {asset.description}
          </Text>
        ) : null}

        {/* Location text */}
        {asset.location_text ? (
          <View className="flex-row items-center gap-1.5">
            <MapPin size={14} color={COLOR_TOKENS.textMuted} />
            <Text className="text-xs text-text-secondary" numberOfLines={1}>
              {asset.location_text}
            </Text>
          </View>
        ) : null}

        {/* Pricing and Action Footer */}
        <View className="mt-1 flex-row items-end justify-between gap-3 border-t border-line/70 pt-3">
          <View className="flex-1">
            <View className="flex-row items-baseline gap-1">
              <Text className="text-xl font-extrabold text-navy-900 tabular-nums">{dailyPrice}</Text>
              <Text className="text-xs font-medium text-text-secondary">/ day</Text>
            </View>
            <Text className="mt-0.5 text-[11px] font-medium text-text-secondary">
              Deposit: <Text className="font-semibold text-navy-900 tabular-nums">{deposit}</Text> (100% refundable)
            </Text>
          </View>

          <View className="flex-row items-center gap-1.5 rounded-xl bg-action px-3.5 py-2">
            <Text className="text-xs font-bold text-action-text">Rent Now</Text>
            <ArrowRight size={13} color={COLOR_TOKENS.actionText} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
