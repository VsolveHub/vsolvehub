import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { useQuery } from "@tanstack/react-query";
import { Skeleton, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  ChevronDown,
  Coins,
  FileCheck2,
  Filter,
  Heart,
  MapPin,
  Search,
  Sun,
  UserCheck,
  X,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";
import { useSavedItems } from "../../stays/use-saved-items";
import { getCareerImage } from "../career-images";
import { fetchListingFilters, fetchListings, type Listing } from "../queries";
import { DEMO_LISTINGS } from "./listings-browse-screen";

export const DEFAULT_CATEGORY_PILLS = [
  { label: "All Roles", value: "" },
  { label: "IT & Software", value: "it-software" },
  { label: "Sales & Marketing", value: "sales-marketing" },
  { label: "Customer Support", value: "customer-support" },
  { label: "BPO & Call Center", value: "bpo-call-center" },
  { label: "Finance & Accounts", value: "finance-accounts" },
  { label: "Admin & Operations", value: "office-admin" },
  { label: "Warehouse & Logistics", value: "delivery-logistics" },
  { label: "Healthcare", value: "health-care" },
  { label: "Banking & Insurance", value: "banking-insurance" },
];

const SORT_OPTIONS = [
  { label: "Latest", value: "latest" },
  { label: "Salary: High to Low", value: "salary_high" },
  { label: "Salary: Low to High", value: "salary_low" },
];

function listingFields(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function formatMoney(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw).trim();
  if (s.includes("₹")) return s;
  return `₹ ${s}`;
}

function VerifiedEmployerBadge() {
  return (
    <View className="flex-row items-center gap-1.5">
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path
          fill="#FF7900"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
        />
      </Svg>
      <Text className="text-[13px] md:text-[14px] text-[#555555] font-normal">
        Verified employer
      </Text>
    </View>
  );
}

function DesktopListingCard({ listing }: { listing: Listing }) {
  const router = useRouter();
  const saved = useSavedItems("listing");
  const isSaved = saved.isSaved(listing.id);

  const fields = listingFields(listing.structured_fields);

  // Pay calculation
  const rawPay = fields.pay_range || fields.salary_range || fields.compensation;
  let payText = "Pay on request";
  if (rawPay) {
    payText = formatMoney(rawPay);
  } else if (listing.salary_display) {
    payText = formatMoney(listing.salary_display);
  } else if (listing.salary_min_paise && listing.salary_max_paise) {
    payText = `₹${Math.round(listing.salary_min_paise / 100).toLocaleString("en-IN")} – ₹${Math.round(
      listing.salary_max_paise / 100,
    ).toLocaleString("en-IN")}/mo`;
  } else if (listing.salary_min_paise) {
    payText = `From ₹${Math.round(listing.salary_min_paise / 100).toLocaleString("en-IN")}/mo`;
  }

  // Location
  const locationText =
    listing.location_text ||
    (fields.location as string) ||
    (fields.city as string) ||
    listing.city ||
    "Hyderabad";

  // Experience
  const rawExperience =
    listing.experience_band ||
    fields.experience_years ||
    fields.experience ||
    fields.experience_band ||
    fields.experience_required;
  const experienceText = rawExperience
    ? String(rawExperience)
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "1-2 years";

  // Employment Type
  const rawRoleType =
    fields.role_type ||
    fields.employment_type ||
    fields.job_type ||
    listing.job_type ||
    "Full time";
  const roleTypeText = String(rawRoleType)
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .replace(/^full\s*time$/i, "Full time")
    .replace(/^part\s*time$/i, "Part time")
    .replace(/^contract$/i, "Contract")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Shift
  const rawShift =
    fields.shift ||
    fields.work_mode ||
    listing.shift ||
    listing.work_mode ||
    "Day shift";
  const shiftText = String(rawShift)
    .replace(/[-_]/g, " ")
    .toLowerCase()
    .replace(/^day(\s*shift)?$/i, "Day shift")
    .replace(/^night(\s*shift)?$/i, "Night shift")
    .replace(/^rotational(\s*shift)?$/i, "Rotational shift")
    .replace(/^general(\s*shift)?$/i, "General shift")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const { url: heroImage } = getCareerImage(listing);
  const employerName =
    listing.company_name ||
    listing.poster_name ||
    listing.partner?.company_name ||
    listing.partner?.full_name ||
    "Apex Staffing Solutions";

  const handleCardPress = () => {
    router.push(`/listings/${listing.slug || listing.id}` as never);
  };

  return (
    <View className="group relative flex-col md:flex-row w-full min-h-[220px] md:h-[230px] rounded-[24px] border border-[#E8E3DE] bg-[#FFFFFF] shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.07)] hover:border-[#ded8d2] transition-all duration-300 overflow-hidden">
      {/* Left Section: Image (~21% width, 100% height, full cover, no overflow) */}
      <Pressable
        accessibilityRole="button"
        onPress={handleCardPress}
        className="w-full md:w-[21%] md:min-w-[200px] md:max-w-[240px] h-52 md:h-full self-stretch shrink-0 overflow-hidden rounded-t-[24px] md:rounded-tr-none md:rounded-l-[24px] bg-slate-100 cursor-pointer"
      >
        <Image
          source={{ uri: heroImage }}
          contentFit="cover"
          style={{ width: "100%", height: "100%" }}
          transition={300}
        />
      </Pressable>

      {/* Right Section: Job Information */}
      <View className="flex-1 flex-col justify-between py-6 px-6 md:py-6 md:pl-10 md:pr-8 min-w-0">
        <View className="flex-col">
          {/* Top Row: Job Title & Heart Icon */}
          <View className="flex-row items-start justify-between gap-4">
            <Pressable
              accessibilityRole="link"
              onPress={handleCardPress}
              className="flex-1 min-w-0 cursor-pointer"
            >
              <Text
                className="text-[24px] md:text-[27px] font-bold text-[#15264D] tracking-tight leading-tight hover:text-[#FF7900] transition-colors"
                numberOfLines={1}
              >
                {listing.title}
              </Text>

              {/* Second Row: Company Name, Separator, Verified Badge */}
              <View className="mt-1.5 flex-row items-center gap-2 flex-wrap">
                <Text
                  className="text-[15px] md:text-[16px] font-semibold text-[#15264D]/90"
                  numberOfLines={1}
                >
                  {employerName}
                </Text>
                <Text className="text-slate-400 font-bold">·</Text>
                <VerifiedEmployerBadge />
              </View>
            </Pressable>

            {/* Favorite / Heart Icon */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isSaved ? "Remove from saved" : "Save this job"}
              onPress={() => saved.toggle(listing.id)}
              className="p-1 cursor-pointer shrink-0"
              hitSlop={8}
            >
              <Heart
                size={26}
                color={isSaved ? "#F43F5E" : "#2D3748"}
                fill={isSaved ? "#F43F5E" : "none"}
                strokeWidth={1.4}
              />
            </Pressable>
          </View>

          {/* Third Row: Job Metadata in One Horizontal Row with Subtle Vertical Separators */}
          <View className="mt-4 flex-row flex-wrap md:flex-nowrap items-center gap-x-3.5 gap-y-2">
            <View className="flex-row items-center gap-1.5">
              <MapPin size={16} color="#2D3748" strokeWidth={1.5} />
              <Text className="text-[14px] text-[#333333] font-medium">
                {locationText}
              </Text>
            </View>

            <View className="hidden md:flex h-3.5 w-[1px] bg-[#E8E3DE]" />

            <View className="flex-row items-center gap-1.5">
              <Coins size={16} color="#2D3748" strokeWidth={1.5} />
              <Text className="text-[14px] text-[#333333] font-medium">
                {payText}
              </Text>
            </View>

            <View className="hidden md:flex h-3.5 w-[1px] bg-[#E8E3DE]" />

            <View className="flex-row items-center gap-1.5">
              <Briefcase size={16} color="#2D3748" strokeWidth={1.5} />
              <Text className="text-[14px] text-[#333333] font-medium">
                {experienceText}
              </Text>
            </View>

            <View className="hidden md:flex h-3.5 w-[1px] bg-[#E8E3DE]" />

            <View className="flex-row items-center gap-1.5">
              <Calendar size={16} color="#2D3748" strokeWidth={1.5} />
              <Text className="text-[14px] text-[#333333] font-medium">
                {roleTypeText}
              </Text>
            </View>

            <View className="hidden md:flex h-3.5 w-[1px] bg-[#E8E3DE]" />

            <View className="flex-row items-center gap-1.5">
              <Sun size={16} color="#2D3748" strokeWidth={1.5} />
              <Text className="text-[14px] text-[#333333] font-medium">
                {shiftText}
              </Text>
            </View>
          </View>
        </View>

        {/* Bottom-Right Section: Large Rectangular Orange Apply Button */}
        <View className="mt-2 flex-row items-center justify-end">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apply"
            onPress={handleCardPress}
            className="items-center justify-center w-[114px] h-[46px] rounded-xl bg-[#FF7900] active:bg-[#e66d00] hover:bg-[#e66d00] shadow-xs cursor-pointer transition-colors"
          >
            <Text className="text-[16px] font-bold text-white">Apply</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function DesktopListingsBrowse() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; service?: string }>();

  // Search input draft states
  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocation, setDraftLocation] = useState("Hyderabad");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("Hyderabad");

  const [selectedCategory, setSelectedCategory] = useState(
    params.category || params.service || "",
  );
  const [employmentType, setEmploymentType] = useState<string>("");
  const [workMode, setWorkMode] = useState<string>("");
  const [minSalary, setMinSalary] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState("latest");
  const [roleSearch, setRoleSearch] = useState("");
  const [sortModalOpen, setSortModalOpen] = useState(false);

  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
  };

  const clearAllFilters = useCallback(() => {
    setDraftQuery("");
    setDraftLocation("Hyderabad");
    setAppliedQuery("");
    setAppliedLocation("Hyderabad");
    setSelectedCategory("");
    setEmploymentType("");
    setWorkMode("");
    setMinSalary(undefined);
    setSort("latest");
    setRoleSearch("");
  }, []);

  const { data: filtersData } = useQuery({
    queryKey: ["listing-filters"],
    queryFn: fetchListingFilters,
    staleTime: 60_000,
  });

  const categories = useMemo(() => {
    if (filtersData?.categories && Array.isArray(filtersData.categories)) {
      return filtersData.categories;
    }
    return DEFAULT_CATEGORY_PILLS;
  }, [filtersData]);

  const filteredCategories = useMemo(() => {
    if (!roleSearch.trim()) return categories;
    const q = roleSearch.toLowerCase().trim();
    return categories.filter(
      (cat: { label: string; value: string }) =>
        cat.value === "" ||
        cat.label.toLowerCase().includes(q) ||
        cat.value.toLowerCase().includes(q),
    );
  }, [categories, roleSearch]);

  const { data: rawListings = [], isLoading } = useQuery({
    queryKey: [
      "listings",
      appliedQuery,
      appliedLocation,
      selectedCategory,
      employmentType,
      workMode,
      minSalary,
      sort,
    ],
    queryFn: () =>
      fetchListings({
        q: appliedQuery || undefined,
        location: appliedLocation || undefined,
        service: selectedCategory || undefined,
        employment_type: employmentType || undefined,
        work_mode: workMode || undefined,
        min_salary: minSalary,
        sort,
      }),
    staleTime: 30_000,
  });

  const displayListings = useMemo(() => {
    const list =
      (rawListings as Listing[]).length > 0 ? (rawListings as Listing[]) : DEMO_LISTINGS;
    if (selectedCategory) {
      return list.filter((item) => {
        const cat = (item.job_category || item.service_name || "").toLowerCase();
        const sel = selectedCategory.toLowerCase();
        if (cat.includes(sel) || sel.includes(cat)) return true;
        const role = (item.role_template || "").toLowerCase();
        return role.includes(sel);
      });
    }
    return list;
  }, [rawListings, selectedCategory]);

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="min-h-screen justify-between"
      showsVerticalScrollIndicator
    >
      <View className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Link */}
        <View className="flex-row items-center">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Back to Home"
            onPress={() => router.push("/")}
            className="flex-row items-center gap-2 -ml-1 px-1 py-1 cursor-pointer group"
          >
            <ArrowLeft size={16} color="#6B6560" />
            <Text className="text-sm font-bold text-[#6B6560] group-hover:text-navy-900">
              Back to Home
            </Text>
          </Pressable>
        </View>

        {/* 1. Hero / Header Banner */}
        <View className="relative overflow-hidden rounded-[24px] border border-[#E8E3DE] bg-white p-6 sm:p-10 shadow-xs">
          <View className="flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <View className="max-w-2xl gap-2">
              <Text className="text-3xl font-extrabold tracking-tight text-[#0B1B3D] sm:text-4xl">
                Find Your Next Opportunity
              </Text>
              <Text className="text-sm text-slate-500 sm:text-base">
                Connect with verified employers hiring across Telangana & Hyderabad
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="My Applications"
              onPress={() => router.push("/listings/my-applications" as never)}
              className="flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-2xs cursor-pointer hover:bg-slate-50"
            >
              <FileCheck2 size={16} color="#0B1B3D" />
              <Text className="text-sm font-semibold text-[#0B1B3D]">
                My Applications
              </Text>
            </Pressable>
          </View>

          {/* Search Bar Container */}
          <View className="mt-8 flex-col md:flex-row items-center gap-3 rounded-2xl bg-[#F8F7F5] p-2.5 border border-[#E8E3DE]">
            {/* Search job titles input */}
            <View className="flex-1 w-full flex-row items-center gap-3 rounded-xl border border-[#E5E1DC] bg-white px-3.5 py-2.5">
              <Search size={16} color="#94A3B8" />
              <TextInput
                value={draftQuery}
                onChangeText={setDraftQuery}
                onSubmitEditing={handleSearchSubmit}
                placeholder="Search job titles, skills, or companies"
                placeholderTextColor="#94A3B8"
                className="w-full bg-transparent text-sm text-slate-900 p-0 focus:outline-none"
              />
            </View>

            {/* Location input */}
            <View className="w-full md:w-[260px] flex-row items-center gap-3 rounded-xl border border-[#E5E1DC] bg-white px-3.5 py-2.5">
              <MapPin size={16} color="#94A3B8" />
              <TextInput
                value={draftLocation}
                onChangeText={setDraftLocation}
                onSubmitEditing={handleSearchSubmit}
                placeholder="Hyderabad"
                placeholderTextColor="#94A3B8"
                className="w-full bg-transparent text-sm text-slate-900 p-0 focus:outline-none"
              />
            </View>

            {/* Search Jobs button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search Jobs"
              onPress={handleSearchSubmit}
              className="w-full md:w-auto items-center justify-center rounded-xl bg-[#FF7900] active:bg-[#e66d00] hover:bg-[#e66d00] px-6 py-2.5 cursor-pointer shadow-xs transition-colors"
            >
              <Text className="text-sm font-bold text-white">Search Jobs</Text>
            </Pressable>
          </View>
        </View>

        {/* 2. Candidate Match Banner */}
        <View className="flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-[#FFD8B3] bg-[#FFF8F0] p-5 shadow-xs">
          <View className="flex-row items-center gap-3 flex-1 min-w-0">
            <View className="size-10 rounded-full bg-[#FFEDD5] items-center justify-center shrink-0">
              <UserCheck size={20} color="#EA580C" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-base font-bold text-[#0B1B3D]">
                For job seekers & candidates
              </Text>
              <Text className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Tap the jobs and skills you have. We&apos;ll show matching jobs and you can apply in one tap.
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage profile"
            onPress={() => router.push("/listings/profile" as never)}
            className="items-center justify-center rounded-xl bg-[#FF7900] active:bg-[#e66d00] hover:bg-[#e66d00] px-5 py-2.5 cursor-pointer shadow-xs shrink-0 transition-colors"
          >
            <Text className="text-sm font-bold text-white">Manage profile</Text>
          </Pressable>
        </View>

        {/* 3. Quick Filter Pills */}
        <View className="flex-row flex-wrap items-center gap-2">
          <Pressable
            onPress={() => {
              setEmploymentType("");
              setWorkMode("");
              setMinSalary(undefined);
            }}
            className={`rounded-full px-4 py-2 cursor-pointer transition ${
              !employmentType && !workMode && minSalary === undefined
                ? "bg-[#FF7900]"
                : "border border-[#E8E3DE] bg-white hover:border-slate-300"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                !employmentType && !workMode && minSalary === undefined
                  ? "text-white"
                  : "text-slate-700"
              }`}
            >
              All jobs
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              setEmploymentType((v) => (v === "Full-Time" ? "" : "Full-Time"))
            }
            className={`rounded-full px-4 py-2 cursor-pointer transition ${
              employmentType === "Full-Time"
                ? "bg-[#FF7900]"
                : "border border-[#E8E3DE] bg-white hover:border-slate-300"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                employmentType === "Full-Time" ? "text-white" : "text-slate-700"
              }`}
            >
              Full-time
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setWorkMode((v) => (v === "On-site" ? "" : "On-site"))}
            className={`rounded-full px-4 py-2 cursor-pointer transition ${
              workMode === "On-site"
                ? "bg-[#FF7900]"
                : "border border-[#E8E3DE] bg-white hover:border-slate-300"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                workMode === "On-site" ? "text-white" : "text-slate-700"
              }`}
            >
              On-site
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              setMinSalary((v) => (v === 2000000 ? undefined : 2000000))
            }
            className={`rounded-full px-4 py-2 cursor-pointer transition ${
              minSalary === 2000000
                ? "bg-[#FF7900]"
                : "border border-[#E8E3DE] bg-white hover:border-slate-300"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                minSalary === 2000000 ? "text-white" : "text-slate-700"
              }`}
            >
              ₹20k+ / mo
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              setMinSalary((v) => (v === 4000000 ? undefined : 4000000))
            }
            className={`rounded-full px-4 py-2 cursor-pointer transition ${
              minSalary === 4000000
                ? "bg-[#FF7900]"
                : "border border-[#E8E3DE] bg-white hover:border-slate-300"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                minSalary === 4000000 ? "text-white" : "text-slate-700"
              }`}
            >
              ₹40k+ / mo
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              setMinSalary((v) => (v === 6000000 ? undefined : 6000000))
            }
            className={`rounded-full px-4 py-2 cursor-pointer transition ${
              minSalary === 6000000
                ? "bg-[#FF7900]"
                : "border border-[#E8E3DE] bg-white hover:border-slate-300"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                minSalary === 6000000 ? "text-white" : "text-slate-700"
              }`}
            >
              ₹60k+ / mo
            </Text>
          </Pressable>
        </View>

        {/* 4. Category & Role Filters */}
        <View className="rounded-[20px] border border-[#E8E3DE] bg-white p-4 shadow-xs gap-3">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <View className="flex-row items-center gap-2">
              <View className="flex-row items-center gap-1.5">
                <Filter size={14} color="#64748B" />
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Role & Category
                </Text>
              </View>

              {selectedCategory ? (
                <View className="flex-row items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 border border-slate-300">
                  <Text className="text-[11px] font-bold text-[#0B1B3D]">
                    Active:{" "}
                    {categories.find(
                      (c: { value: string; label: string }) =>
                        c.value === selectedCategory,
                    )?.label || selectedCategory}
                  </Text>
                  <Pressable onPress={() => setSelectedCategory("")} hitSlop={6}>
                    <X size={12} color="#64748B" />
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* Role Search */}
            <View className="flex-row items-center rounded-full border border-slate-200 bg-[#F8F7F5] px-3 py-1.5 w-44">
              <Search size={13} color="#94A3B8" />
              <TextInput
                value={roleSearch}
                onChangeText={setRoleSearch}
                placeholder="Filter roles..."
                placeholderTextColor="#94A3B8"
                className="ml-2 flex-1 text-xs text-slate-800 p-0 focus:outline-none"
              />
              {roleSearch ? (
                <Pressable onPress={() => setRoleSearch("")} hitSlop={6}>
                  <X size={12} color="#94A3B8" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Role & Category Pills */}
          <View className="flex-row flex-wrap gap-2 pt-1">
            {filteredCategories.map((cat: { label: string; value: string }) => {
              const isSelected = selectedCategory === cat.value;
              return (
                <Pressable
                  key={cat.label}
                  onPress={() => setSelectedCategory(isSelected ? "" : cat.value)}
                  className={`rounded-full px-3.5 py-1.5 cursor-pointer transition ${
                    isSelected
                      ? "bg-[#0B1B3D] shadow-xs"
                      : "border border-slate-200 bg-[#FAF9F7] hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      isSelected
                        ? "text-white font-bold"
                        : "text-slate-700 font-medium"
                    }`}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 5. Results Header */}
        <View className="flex-row flex-wrap items-center justify-between gap-3 pt-2">
          <Text className="text-base font-bold text-[#15264D]">
            Showing {displayListings.length} job opportunities
            {appliedLocation ? ` in ${appliedLocation}` : " in Hyderabad"}
          </Text>

          <View className="flex-row items-center gap-2">
            <Text className="text-xs font-semibold text-slate-500">Sort by:</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSortModalOpen(true)}
              className="flex-row items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-2xs cursor-pointer hover:bg-slate-50"
            >
              <Text className="text-xs font-bold text-[#15264D]">
                {SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Latest"}
              </Text>
              <ChevronDown size={14} color="#64748B" />
            </Pressable>
          </View>
        </View>

        {/* 6. Listings Section */}
        {isLoading ? (
          <View className="flex-col gap-4">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-44 w-full rounded-[24px]" />
            ))}
          </View>
        ) : displayListings.length === 0 ? (
          <View className="items-center justify-center rounded-[24px] border border-slate-200 bg-white p-12">
            <Text className="text-lg font-bold text-[#0B1B3D]">
              No career listings found
            </Text>
            <Text className="text-sm text-slate-500 mt-1 text-center max-w-md">
              We couldn&apos;t find any active job listings matching your search criteria. Try modifying your search keywords or location.
            </Text>
            <Pressable
              onPress={clearAllFilters}
              className="mt-4 rounded-xl bg-[#0B1B3D] px-5 py-2.5 cursor-pointer"
            >
              <Text className="text-sm font-bold text-white">Reset Filters</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-col gap-4">
            {displayListings.map((listing: Listing) => (
              <DesktopListingCard key={listing.id} listing={listing} />
            ))}
          </View>
        )}
      </View>

      {/* Sort Modal */}
      <Modal
        visible={sortModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortModalOpen(false)}
      >
        <Pressable
          onPress={() => setSortModalOpen(false)}
          className="flex-1 items-center justify-center bg-black/40 p-4"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-xl border border-slate-100"
          >
            <Text className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
              Sort by
            </Text>
            <View className="pt-2 gap-1">
              {SORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    setSort(opt.value);
                    setSortModalOpen(false);
                  }}
                  className={`flex-row items-center justify-between rounded-xl px-3 py-2.5 ${
                    sort === opt.value ? "bg-orange-50" : "active:bg-slate-50"
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      sort === opt.value
                        ? "font-bold text-[#EA580C]"
                        : "font-semibold text-slate-700"
                    }`}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Desktop Site Footer */}
      <DesktopSiteFooter />
    </ScrollView>
  );
}
