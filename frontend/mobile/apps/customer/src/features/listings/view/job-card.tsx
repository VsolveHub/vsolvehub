import { Badge, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Briefcase, Building, MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";

import type { Listing } from "../queries";

export function JobCard({ listing }: { listing: Listing }) {
  const router = useRouter();

  const payDisplay =
    listing.salary_display ||
    (listing.salary_min_paise && listing.salary_max_paise
      ? `₹${Math.round(listing.salary_min_paise / 100).toLocaleString("en-IN")} - ₹${Math.round(listing.salary_max_paise / 100).toLocaleString("en-IN")}`
      : listing.salary_min_paise
        ? `From ₹${Math.round(listing.salary_min_paise / 100).toLocaleString("en-IN")}`
        : null);

  const structuredFields = (listing as any).structured_fields || {};
  const workMode = structuredFields.work_mode || (listing as any).work_mode;
  const roleType = structuredFields.employment_type || structuredFields.role_type;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/listings/${listing.slug || listing.id}` as never)}
      className="overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-xs active:opacity-95 gap-3"
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <Text className="text-base font-extrabold text-navy-900" numberOfLines={1}>
            {listing.title}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Building size={12} color="#6B6560" />
            <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>
              {listing.partner?.company_name || listing.partner?.full_name || "Verified Employer"}
            </Text>
          </View>
        </View>

        {payDisplay ? (
          <View className="items-end rounded-xl bg-brand/10 px-2.5 py-1">
            <Text className="text-xs font-black text-brand">{payDisplay}</Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        {listing.location_text ? (
          <View className="flex-row items-center gap-1 rounded-md bg-canvas px-2 py-0.5 border border-line/60">
            <MapPin size={10} color="#6B6560" />
            <Text className="text-[10px] text-text-secondary">{listing.location_text}</Text>
          </View>
        ) : null}

        {workMode ? (
          <View className="rounded-md bg-canvas px-2 py-0.5 border border-line/60">
            <Text className="text-[10px] font-semibold text-text-secondary capitalize">
              {String(workMode).toLowerCase().replaceAll("_", " ")}
            </Text>
          </View>
        ) : null}

        {roleType ? (
          <View className="rounded-md bg-canvas px-2 py-0.5 border border-line/60">
            <Text className="text-[10px] font-semibold text-text-secondary capitalize">
              {String(roleType).toLowerCase().replaceAll("_", " ")}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
