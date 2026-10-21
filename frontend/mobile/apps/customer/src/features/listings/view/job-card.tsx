import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Building2, Heart, MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { useSavedItems } from "../../stays/use-saved-items";
import type { Listing } from "../queries";

function listingFields(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function JobCard({ listing }: { listing: Listing }) {
  const router = useRouter();
  const saved = useSavedItems("listing");
  const isHearted = saved.isSaved(listing.id);

  const fields = listingFields(listing.structured_fields);
  const rawPay = fields.pay_range || fields.salary_range || fields.compensation;
  const pay = rawPay
    ? String(rawPay)
    : listing.salary_display
      ? listing.salary_display
      : listing.salary_min_paise && listing.salary_max_paise
        ? `₹${Math.round(listing.salary_min_paise / 100).toLocaleString("en-IN")} - ₹${Math.round(listing.salary_max_paise / 100).toLocaleString("en-IN")}`
        : listing.salary_min_paise
          ? `From ₹${Math.round(listing.salary_min_paise / 100).toLocaleString("en-IN")}`
          : "Pay on request";

  const rawExp = fields.experience_years || fields.experience;
  const experience = rawExp ? String(rawExp) : "1 to 2 years";

  const rawRole = fields.role_type || fields.employment_type;
  const roleType = rawRole ? String(rawRole) : "Full-time";

  const rawMode = fields.shift || fields.work_mode;
  const mode = rawMode ? String(rawMode) : "Day shift";

  const company =
    listing.poster_name ||
    listing.company_name ||
    listing.partner?.company_name ||
    listing.partner?.full_name ||
    "Apex Staffing Solutions";

  const location = listing.location_text || listing.location || "Hyderabad";

  const handleCardPress = () => {
    router.push(`/listings/${listing.slug || listing.id}` as never);
  };

  return (
    <View className="relative rounded-2xl border border-line bg-surface p-4 shadow-xs">
      {/* Save Heart Button */}
      <View className="absolute top-4 right-4 z-10">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isHearted ? "Remove from saved" : "Save job"}
          hitSlop={8}
          onPress={() => saved.toggle(listing.id)}
          className="size-8 items-center justify-center rounded-full border border-line bg-surface active:bg-surface-sunken"
        >
          <Heart
            size={14}
            color={isHearted ? "#ea580c" : "#9ca3af"}
            fill={isHearted ? "#ea580c" : "transparent"}
          />
        </Pressable>
      </View>

      {/* Main Card Pressable Area */}
      <Pressable
        accessibilityRole="button"
        onPress={handleCardPress}
        className="pr-10 active:opacity-90"
      >
        <View className="flex-row items-start gap-3">
          <View className="size-10 items-center justify-center rounded-xl bg-surface-sunken border border-line/40">
            <Building2 size={18} color="#00112e" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-navy-900 leading-snug">
              {listing.title}
            </Text>
            <Text className="text-xs text-text-secondary mt-0.5">
              {company} · Verified employer
            </Text>
          </View>
        </View>

        {/* Location & Pay */}
        <View className="mt-3 flex-row items-center flex-wrap gap-x-3 gap-y-1">
          <View className="flex-row items-center gap-1">
            <MapPin size={12} color="#6B6560" />
            <Text className="text-xs text-text-secondary">{location}</Text>
          </View>
          <Text className="text-xs text-text-secondary">{pay}</Text>
        </View>

        {/* Tags Line (Experience · Role · Shift) */}
        <View className="mt-1 flex-row items-center flex-wrap">
          <Text className="text-xs text-text-secondary">
            {experience} · {roleType} · {mode}
          </Text>
        </View>
      </Pressable>

      {/* Bottom Apply Action */}
      <View className="mt-2 flex-row justify-end">
        <Pressable
          accessibilityRole="button"
          onPress={handleCardPress}
          className="rounded-lg bg-[#ea580c] px-5 py-2 active:bg-[#c2410c]"
        >
          <Text className="text-xs font-bold text-white">Apply</Text>
        </Pressable>
      </View>
    </View>
  );
}
