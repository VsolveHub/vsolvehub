import { Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { useRouter } from "expo-router";
import {
  Bookmark,
  Briefcase,
  Building2,
  Calculator,
  ClipboardList,
  MapPin,
  ShoppingCart,
  Stethoscope,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { useSavedItems } from "../../stays/use-saved-items";
import type { Listing } from "../queries";
import { listingPayText } from "../pay";
import { VerifiedBadge, employerDetailLine, employerName, listingEmployer } from "./employer-identity";

function JewelleryIcon({ color = "#7C3AED" }: { color?: string }) {
  return (
    <Svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M6 3c0 6 3 11 6 11s6-5 6-11" />
      <Circle cx="12" cy="18" r="3" />
      <Line x1="12" y1="14" x2="12" y2="15" />
    </Svg>
  );
}

function listingFields(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function getJobCategoryVisuals(listing: Listing) {
  const title = (listing.title || "").toLowerCase();
  const cat = (listing.job_category || listing.service_name || "").toLowerCase();

  // 1. Office / Coordinator / Admin Operations
  if (
    title.includes("coordinator") ||
    title.includes("office") ||
    title.includes("admin") ||
    cat.includes("admin") ||
    cat.includes("office")
  ) {
    return {
      bg: "bg-[#EFF6FF]",
      icon: <ClipboardList size={26} color="#2563EB" strokeWidth={1.8} />,
      tag: "Admin & Operations",
    };
  }

  // 2. Accountant / Finance & Accounts
  if (
    title.includes("accountant") ||
    title.includes("finance") ||
    title.includes("cashier") ||
    title.includes("billing") ||
    cat.includes("finance") ||
    cat.includes("account")
  ) {
    return {
      bg: "bg-[#ECFDF5]",
      icon: <Calculator size={26} color="#16A34A" strokeWidth={1.8} />,
      tag: "Finance & Accounts",
    };
  }

  // 3. Warehouse / Packer / Logistics
  if (
    title.includes("warehouse") ||
    title.includes("packer") ||
    title.includes("helper") ||
    title.includes("delivery") ||
    cat.includes("warehouse") ||
    cat.includes("logistics")
  ) {
    return {
      bg: "bg-[#FFFBEB]",
      icon: <ShoppingCart size={26} color="#D97706" strokeWidth={1.8} />,
      tag: "Warehouse & Logistics",
    };
  }

  // 4. Healthcare / Staff Nurse
  if (
    title.includes("nurse") ||
    title.includes("doctor") ||
    title.includes("health") ||
    cat.includes("health") ||
    cat.includes("medical")
  ) {
    return {
      bg: "bg-[#FFF1F2]",
      icon: <Stethoscope size={26} color="#E11D48" strokeWidth={1.8} />,
      tag: "Healthcare",
    };
  }

  // 5. Jewellery / Retail & Sales
  if (
    title.includes("jewellery") ||
    title.includes("jewelry") ||
    title.includes("retail") ||
    title.includes("sales") ||
    cat.includes("jewel") ||
    cat.includes("sales")
  ) {
    return {
      bg: "bg-[#F5F3FF]",
      icon: <JewelleryIcon color="#7C3AED" />,
      tag: "Sales & Retail",
    };
  }

  return {
    bg: "bg-slate-100",
    icon: <Briefcase size={26} color="#475569" strokeWidth={1.8} />,
    tag: listing.job_category || listing.service_name || "General",
  };
}

export function JobCard({ listing }: { listing: Listing }) {
  const router = useRouter();
  const saved = useSavedItems("listing");
  const isHearted = saved.isSaved(listing.id);

  const fields = listingFields(listing.structured_fields);
  const rawPay = fields.pay_range || fields.salary_range || fields.compensation;
  const pay = listingPayText(listing, rawPay) ?? "Pay not disclosed";

  const rawExp = listing.experience_band || fields.experience_years || fields.experience;
  const experience = rawExp ? String(rawExp) : null;

  const rawMode = listing.work_mode || fields.shift || fields.work_mode;
  const mode = rawMode
    ? String(rawMode).toLowerCase().includes("shift")
      ? "Rotational shift"
      : String(rawMode).toLowerCase().includes("home")
        ? "Work from Home"
        : "Work from Office"
    : null;

  // Who is hiring comes from the server's employer object; "Verified" only when it says so.
  const employer = listingEmployer(listing);
  const company = employerName(employer);
  const employerDetail = employerDetailLine(employer);

  const location =
    listing.location_text ||
    listing.city ||
    listing.area ||
    listing.location ||
    "Hyderabad";

  const visuals = getJobCategoryVisuals(listing);
  const categoryTag = visuals.tag;

  const handleCardPress = () => {
    router.push(`/listings/${listing.slug || listing.id}` as never);
  };

  return (
    <View className="rounded-3xl border border-slate-100 bg-white p-4 shadow-xs gap-3">
      {/* Top Section: Icon Tile + Details + Actions */}
      <View className="flex-row items-start justify-between gap-3">
        {/* Left Category / Job Image Tile */}
        <View
          className={`size-[56px] items-center justify-center rounded-2xl ${visuals.bg} shrink-0 overflow-hidden border border-slate-100`}
        >
          {listing.media?.[0]?.url ? (
            <Image
              source={{ uri: resolveImageUrl(listing.media[0].url) || listing.media[0].url }}
              contentFit="cover"
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            visuals.icon
          )}
        </View>
        {/* Center Details */}
        <Pressable
          accessibilityRole="button"
          onPress={handleCardPress}
          className="flex-1 min-w-0 pr-1 active:opacity-85"
        >
          <Text
            className="text-[14px] font-bold text-slate-900 leading-snug"
            numberOfLines={2}
          >
            {listing.title}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-1 flex-wrap">
            <Text className="text-xs font-semibold text-slate-800 shrink" numberOfLines={1}>
              {company}
            </Text>
            <VerifiedBadge employer={employer} textClassName="text-[11px] font-semibold text-emerald-700" />
          </View>
          {employerDetail ? (
            <Text className="mt-0.5 text-[11px] text-slate-500" numberOfLines={1}>
              {employerDetail}
            </Text>
          ) : null}
          <View className="flex-row items-center gap-1 mt-1">
            <MapPin size={12} color="#94A3B8" />
            <Text className="text-xs text-slate-500">{location}</Text>
          </View>
        </Pressable>

        {/* Right Side: Bookmark (the View job button sits in the footer so the title keeps its width) */}
        <View className="shrink-0">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isHearted ? "Remove from saved" : "Save job"}
            hitSlop={8}
            onPress={() => saved.toggle(listing.id)}
            className="p-1 active:opacity-70"
          >
            <Bookmark
              size={18}
              color={isHearted ? "#EA580C" : "#94A3B8"}
              fill={isHearted ? "#EA580C" : "transparent"}
              strokeWidth={1.8}
            />
          </Pressable>

        </View>
      </View>

      {/* Middle Details Row: Experience · Salary · Work Mode (only what the listing states) */}
      <View className="mt-0.5 flex-row items-center flex-wrap gap-x-2 gap-y-1">
        {experience ? (
          <>
            <View className="flex-row items-center gap-1">
              <Briefcase size={12} color="#64748B" />
              <Text className="text-xs text-slate-600">{experience}</Text>
            </View>
            <Text className="text-xs text-slate-400">·</Text>
          </>
        ) : null}
        <Text className="text-xs font-bold text-slate-800">{pay}</Text>
        {mode ? (
          <>
            <Text className="text-xs text-slate-400">·</Text>
            <View className="flex-row items-center gap-1">
              <Building2 size={12} color="#64748B" />
              <Text className="text-xs text-slate-600">{mode}</Text>
            </View>
          </>
        ) : null}
      </View>

      {/* Footer: category tag + View job */}
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 shrink rounded-lg bg-slate-100 px-2.5 py-1">
          <Text numberOfLines={1} className="text-[11px] font-semibold text-slate-700">
            {categoryTag}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View job"
          onPress={handleCardPress}
          className="min-h-9 shrink-0 justify-center rounded-xl bg-[#EA580C] px-4 active:bg-[#C2410C]"
        >
          <Text className="text-xs font-bold text-white">View job</Text>
        </Pressable>
      </View>
    </View>
  );
}
