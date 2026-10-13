import { Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ArrowRight, Heart, MapPin, ShieldCheck, Star, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";

import {
  formatPaise,
  pricePeriodOf,
  roomOccupancyLabel,
  stayLengthLabel,
  type StayPropertySummary,
} from "../model";
import { useSavedItems } from "../use-saved-items";
import { getAmenityIcon } from "./amenity-icon";

const FALLBACK_STAY_IMAGE =
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=800&auto=format&fit=crop";

export function StayCard({ property }: { property: StayPropertySummary }) {
  const router = useRouter();
  const saved = useSavedItems("stay");
  const isHearted = saved.isSaved(property.id);

  const period = pricePeriodOf(property.price_period);
  const minRate = property.min_price_paise ?? 0;
  const imageUrl = property.image_urls?.[0] || FALLBACK_STAY_IMAGE;
  const hostName =
    property.host_name ||
    property.partner?.company_name ||
    property.partner?.full_name ||
    "Verified Host";

  const rawPref =
    property.tenant_preference ||
    (property as any).structured_fields?.tenant_preference;
  const tenantLabel =
    rawPref === "BACHELOR_MALE"
      ? "Bachelor (M)"
      : rawPref === "BACHELOR_FEMALE"
        ? "Ladies Only"
        : rawPref === "FAMILY"
          ? "Family Only"
          : rawPref === "WORKING_PROFESSIONAL"
            ? "Professionals"
            : null;

  const primaryUnit = (property as any).units?.[0];
  const occupancy = primaryUnit
    ? roomOccupancyLabel(primaryUnit, property.room_style)
    : null;
  const amenities = (property.amenities ?? []).slice(0, 3);

  const handlePress = () => {
    router.push(`/stays/${property.slug || property.id}` as never);
  };

  return (
    <Pressable
      accessibilityLabel={`View ${property.title}`}
      onPress={handlePress}
      className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs active:border-line-strong active:shadow-raised"
    >
      {/* Cover Image */}
      <View className="relative aspect-[16/10] w-full bg-[#f0ede6]">
        <Image
          source={{ uri: imageUrl }}
          contentFit="cover"
          style={{ width: "100%", height: "100%" }}
        />
      </View>

      {/* Card Content */}
      <View className="gap-2.5 p-4">
        {/* Top Badges & Heart Save Button */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="flex-row items-center gap-1">
              <ShieldCheck size={14} color="#059669" />
              <Text className="text-xs font-semibold text-emerald-700">Verified host</Text>
            </View>
            {property.average_rating ? (
              <View className="flex-row items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 border border-amber-200">
                <Star size={10} color="#d97706" fill="#d97706" />
                <Text className="text-[10px] font-bold text-amber-800">
                  {Number(property.average_rating).toFixed(1)}
                  {property.review_count ? ` (${property.review_count})` : ""}
                </Text>
              </View>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isHearted ? "Remove from saved" : "Save stay"}
            onPress={(e) => {
              e.stopPropagation();
              saved.toggle(property.id);
            }}
            className="size-8 items-center justify-center rounded-full bg-surface-sunken border border-line active:bg-surface-hover"
          >
            <Heart
              size={15}
              color={isHearted ? "#ea580c" : "#6B6560"}
              fill={isHearted ? "#ea580c" : "transparent"}
            />
          </Pressable>
        </View>

        {/* Title and Host */}
        <View>
          <Text className="text-base font-extrabold text-navy-900" numberOfLines={1}>
            {property.title}
          </Text>
          <Text className="mt-0.5 text-xs text-text-secondary">
            Hosted by <Text className="font-semibold text-navy-900">{hostName}</Text>
          </Text>
        </View>

        {/* Description line-clamp */}
        {(property as any).description ? (
          <Text className="text-xs leading-relaxed text-text-secondary" numberOfLines={2}>
            {(property as any).description}
          </Text>
        ) : null}

        {/* Location Text */}
        {property.location_text ? (
          <View className="flex-row items-center gap-1">
            <MapPin size={12} color="#6B6560" />
            <Text className="flex-1 text-xs text-text-secondary" numberOfLines={1}>
              {property.location_text}
            </Text>
          </View>
        ) : null}

        {/* Tags: Tenant, Occupancy, Amenities */}
        <View className="flex-row flex-wrap gap-1.5 pt-1">
          {tenantLabel ? (
            <View className="rounded-md border border-navy-200 bg-navy-50 px-2 py-0.5">
              <Text className="text-[10px] font-bold text-navy-900">{tenantLabel}</Text>
            </View>
          ) : null}

          {occupancy ? (
            <View className="flex-row items-center gap-1 rounded-md border border-line bg-surface-sunken px-2 py-0.5">
              <Users size={10} color="#6B6560" />
              <Text className="text-[10px] font-medium text-text-secondary">{occupancy}</Text>
            </View>
          ) : null}

          {amenities.map((amenity) => {
            const Icon = getAmenityIcon(amenity.key);
            return (
              <View
                key={amenity.key}
                className="flex-row items-center gap-1 rounded-md border border-line bg-surface-sunken px-2 py-0.5"
              >
                <Icon size={10} color="#f87000" />
                <Text className="text-[10px] font-medium text-text-secondary">{amenity.label}</Text>
              </View>
            );
          })}
        </View>

        {/* Footer: Price and CTA */}
        <View className="mt-2 flex-row items-end justify-between border-t border-line/70 pt-3">
          <View className="flex-1 pr-2">
            <View className="flex-row items-baseline gap-1">
              <Text className="text-lg font-black text-navy-900">{formatPaise(minRate)}</Text>
              <Text className="text-xs font-medium text-text-secondary">
                / {period === "NIGHT" ? "night" : "month"}
              </Text>
            </View>
            <Text className="mt-0.5 text-[10px] text-text-muted" numberOfLines={1}>
              {typeof property.min_stay_nights === "number" && property.min_stay_nights > 1
                ? `Minimum stay ${stayLengthLabel(property.min_stay_nights, period)} · `
                : ""}
              Enquire and the host calls you
            </Text>
          </View>

          <View className="flex-row items-center gap-1 rounded-xl bg-brand px-3 py-2 active:bg-brand/90">
            <Text className="text-xs font-bold text-white">Check Dates</Text>
            <ArrowRight size={13} color="#ffffff" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
