import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Coffee,
  FileCheck2,
  Heart,
  Layers,
  MapPin,
  Search,
  ShieldCheck,
  Star,
  Users,
  Wind,
  X,
} from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, ScrollView, TextInput, View } from "react-native";

import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";

import {
  formatPaise,
  pricePeriodOf,
  roomOccupancyLabel,
  stayLengthLabel,
  type StayPropertySummary,
  type StayTaxonomyCategory,
} from "../model";
import { fetchStays, fetchStayTaxonomy } from "../queries";
import { THEME_COLORS } from "../theme-colors";
import { useSavedItems } from "../use-saved-items";
import { getAmenityIcon } from "./amenity-icon";

const FALLBACK_STAY_IMAGE =
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=800&auto=format&fit=crop";

const TENANT_OPTIONS = [
  { value: "", label: "Anyone" },
  { value: "BACHELOR_MALE", label: "Bachelor (M)" },
  { value: "BACHELOR_FEMALE", label: "Ladies" },
  { value: "FAMILY", label: "Family" },
  { value: "WORKING_PROFESSIONAL", label: "Professional" },
] as const;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating_desc", label: "Top Rated" },
] as const;

const PRICE_PRESETS = [
  { label: "All Rates", min: undefined, max: undefined },
  { label: "Under ₹5k", min: undefined, max: 500_000 },
  { label: "₹5k – ₹10k", min: 500_000, max: 1_000_000 },
  { label: "₹10k – ₹15k", min: 1_000_000, max: 1_500_000 },
  { label: "₹15k – ₹20k", min: 1_500_000, max: 2_000_000 },
  { label: "₹20k+", min: 2_000_000, max: undefined },
];

export function DesktopStaysBrowse() {
  const router = useRouter();

  // Search & Filter State
  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");

  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | undefined>(undefined);
  const [selectedServiceSlug, setSelectedServiceSlug] = useState<string | undefined>(undefined);
  const [filterAc, setFilterAc] = useState<boolean | undefined>(undefined);
  const [filterFood, setFilterFood] = useState<boolean | undefined>(undefined);
  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [priceSliderOpen, setPriceSliderOpen] = useState(false);
  const [tenantPreference, setTenantPreference] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState("newest");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [visible, setVisible] = useState(6);

  const { data: taxonomy = [], isLoading: isTaxonomyLoading } = useQuery({
    queryKey: ["stayTaxonomy"],
    queryFn: fetchStayTaxonomy,
    staleTime: 5 * 60 * 1000,
  });

  const activeCategory = taxonomy.find((c) => c.slug === selectedCategorySlug);
  const subServices = activeCategory?.services ?? [];

  const {
    data: stays = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "stays",
      appliedQuery,
      appliedLocation,
      selectedCategorySlug,
      selectedServiceSlug,
      filterAc,
      filterFood,
      minPrice,
      maxPrice,
      tenantPreference,
      sort,
    ],
    queryFn: () =>
      fetchStays({
        q: appliedQuery,
        location: appliedLocation,
        ac: filterAc,
        food: filterFood,
        min_price: minPrice,
        max_price: maxPrice,
        tenant_preference: tenantPreference,
        service: selectedServiceSlug || selectedCategorySlug,
        sort,
        limit: 100,
        offset: 0,
      }),
    staleTime: 30_000,
  });

  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
    setVisible(6);
  };

  const clearFilters = () => {
    setDraftQuery("");
    setDraftLocation("");
    setAppliedQuery("");
    setAppliedLocation("");
    setSelectedCategorySlug(undefined);
    setSelectedServiceSlug(undefined);
    setFilterAc(undefined);
    setFilterFood(undefined);
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setPriceSliderOpen(false);
    setTenantPreference(undefined);
    setSort("newest");
    setVisible(6);
  };

  const hasPriceFilter = minPrice !== undefined || maxPrice !== undefined;
  const isAllStays = !selectedCategorySlug && !selectedServiceSlug;
  const displayedStays = stays.slice(0, visible);

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="min-h-screen justify-between"
      showsVerticalScrollIndicator
    >
      <View className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* 1. Hero / Header Banner */}
        <View
          style={{
            backgroundImage: "linear-gradient(135deg, #020b1e 0%, #071a3d 50%, #0d2854 100%)",
            backgroundColor: "#071a3d",
          }}
          className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl sm:p-10 border border-navy-800"
        >
          {/* Subtle Ambient Decorative Circles */}
          <View
            pointerEvents="none"
            className="absolute -right-24 -top-24 size-96 rounded-full bg-blue-500/10 blur-3xl"
          />
          <View
            pointerEvents="none"
            className="absolute -bottom-24 left-1/3 size-80 rounded-full bg-orange-500/10 blur-3xl"
          />

          <View className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <View className="max-w-2xl gap-2">
              <View className="self-start flex-row items-center gap-2 rounded-full border border-navy-300/30 bg-navy-500/20 px-3 py-1">
                <Building2 size={14} color="#93C5FD" />
                <Text className="text-xs font-semibold text-blue-200">
                  Verified Rooms, PG & Short Stays
                </Text>
              </View>

              <Text className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Find Rooms, PG & Hotels
              </Text>

              <Text className="text-sm text-slate-300 sm:text-base leading-relaxed">
                Verified coliving, PG accommodation, and short stay rooms. Instant date quote
                calculations and direct host communication.
              </Text>
            </View>

            {/* My Enquiries Button */}
            <View className="flex shrink-0 items-center">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="My Enquiries"
                onPress={() => router.push("/stays/mine")}
                className="flex-row items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur-md transition hover:bg-white/20 cursor-pointer"
              >
                <FileCheck2 size={16} color="#ffffff" />
                <Text className="text-sm font-semibold text-white">My Enquiries</Text>
              </Pressable>
            </View>
          </View>

          {/* Search Bar Container */}
          <View className="relative z-10 mt-8 flex-col gap-3 rounded-2xl bg-white p-2.5 shadow-2xl md:flex-row md:items-center border border-slate-100">
            {/* Input 1: Property Name */}
            <View className="flex-1 flex-row items-center gap-3 rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] px-3.5 py-2.5 focus-within:border-navy-900">
              <Search size={16} color="#6B6560" />
              <TextInput
                value={draftQuery}
                onChangeText={setDraftQuery}
                onSubmitEditing={handleSearchSubmit}
                placeholder="Search properties (e.g. Lakeview PG, Executive Single Room)"
                placeholderTextColor="rgba(107,101,96,0.7)"
                className="w-full bg-transparent text-sm text-navy-900 p-0 focus:outline-none"
              />
            </View>

            {/* Input 2: Location */}
            <View className="flex-1 md:max-w-[280px] flex-row items-center gap-3 rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] px-3.5 py-2.5 focus-within:border-navy-900">
              <MapPin size={16} color="#6B6560" />
              <TextInput
                value={draftLocation}
                onChangeText={setDraftLocation}
                onSubmitEditing={handleSearchSubmit}
                placeholder="City or Area (e.g. Hyderabad, Gachibowli)"
                placeholderTextColor="rgba(107,101,96,0.7)"
                className="w-full bg-transparent text-sm text-navy-900 p-0 focus:outline-none"
              />
            </View>

            {/* Submit Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search Stays"
              onPress={handleSearchSubmit}
              className="rounded-xl bg-[#EA580C] hover:bg-[#D94E08] px-6 py-3 items-center justify-center cursor-pointer transition shadow-sm"
            >
              <Text className="text-sm font-bold text-white">Search Stays</Text>
            </Pressable>
          </View>
        </View>

        {/* 2. Structured Filter Chips */}
        <View className="flex flex-col gap-4">
          <View className="flex flex-col gap-3">
            {/* Row 1: Categories + Amenities + Price */}
            <View className="flex-row flex-wrap items-center gap-2">
              {/* All Stays Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="All Stays"
                onPress={() => {
                  setSelectedCategorySlug(undefined);
                  setSelectedServiceSlug(undefined);
                }}
                className={`flex-row items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition cursor-pointer ${
                  isAllStays
                    ? "bg-[#EA580C] shadow-sm"
                    : "bg-white border border-[#EAE8E4] hover:border-slate-400"
                }`}
              >
                <Layers size={14} color={isAllStays ? "#ffffff" : "#475569"} />
                <Text className={`text-xs font-bold ${isAllStays ? "text-white" : "text-[#475569]"}`}>
                  All Stays
                </Text>
              </Pressable>

              {/* Taxonomy Categories */}
              {isTaxonomyLoading
                ? Array.from({ length: 4 }).map((_, idx) => (
                    <View key={idx} className="h-8 w-24 rounded-full bg-slate-200" />
                  ))
                : taxonomy.map((cat) => {
                    const isSelected = selectedCategorySlug === cat.slug;
                    return (
                      <Pressable
                        key={cat.id}
                        accessibilityRole="button"
                        accessibilityLabel={cat.name}
                        onPress={() => {
                          setSelectedCategorySlug(isSelected ? undefined : cat.slug);
                          setSelectedServiceSlug(undefined);
                        }}
                        className={`flex-row items-center gap-1.5 rounded-full px-4 py-2 transition cursor-pointer ${
                          isSelected
                            ? "bg-[#EA580C] shadow-sm"
                            : "bg-white border border-[#EAE8E4] hover:border-slate-400"
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? "text-white" : "text-[#475569]"
                          }`}
                        >
                          {cat.name}
                        </Text>
                      </Pressable>
                    );
                  })}

              {/* Vertical Divider */}
              <View className="mx-1 h-6 w-px bg-[#EAE8E4]" />

              {/* AC Included */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="AC Included"
                onPress={() => setFilterAc((prev) => (prev ? undefined : true))}
                className={`flex-row items-center gap-1.5 rounded-full px-4 py-2 transition cursor-pointer ${
                  filterAc
                    ? "bg-[#EA580C] shadow-sm"
                    : "bg-white border border-[#EAE8E4] hover:border-slate-400"
                }`}
              >
                <Wind size={14} color={filterAc ? "#ffffff" : "#475569"} />
                <Text className={`text-xs font-bold ${filterAc ? "text-white" : "text-[#475569]"}`}>
                  AC Included
                </Text>
              </Pressable>

              {/* Meals Included */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Meals Included"
                onPress={() => setFilterFood((prev) => (prev ? undefined : true))}
                className={`flex-row items-center gap-1.5 rounded-full px-4 py-2 transition cursor-pointer ${
                  filterFood
                    ? "bg-[#EA580C] shadow-sm"
                    : "bg-white border border-[#EAE8E4] hover:border-slate-400"
                }`}
              >
                <Coffee size={14} color={filterFood ? "#ffffff" : "#475569"} />
                <Text
                  className={`text-xs font-bold ${filterFood ? "text-white" : "text-[#475569]"}`}
                >
                  Meals Included
                </Text>
              </Pressable>

              {/* Price Range Chip */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Price range"
                onPress={() => setPriceSliderOpen((prev) => !prev)}
                className={`flex-row items-center gap-1.5 rounded-full px-4 py-2 transition cursor-pointer ${
                  hasPriceFilter || priceSliderOpen
                    ? "bg-[#EA580C] shadow-sm"
                    : "bg-white border border-[#EAE8E4] hover:border-slate-400"
                }`}
              >
                <Building2
                  size={14}
                  color={hasPriceFilter || priceSliderOpen ? "#ffffff" : "#475569"}
                />
                <Text
                  className={`text-xs font-bold ${
                    hasPriceFilter || priceSliderOpen ? "text-white" : "text-[#475569]"
                  }`}
                >
                  {hasPriceFilter ? "Price range ✕" : "Price range"}
                </Text>
              </Pressable>
            </View>

            {/* Row 2: Tenant Preferences */}
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-[#8C827A] mr-1">
                FOR
              </Text>
              {TENANT_OPTIONS.map(({ value, label }) => {
                const isSelected = (tenantPreference ?? "") === value;
                return (
                  <Pressable
                    key={value || "any"}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    onPress={() => setTenantPreference(value || undefined)}
                    className={`flex-row items-center gap-1 rounded-full px-3.5 py-1.5 transition cursor-pointer ${
                      isSelected
                        ? "bg-[#0F172A] shadow-xs"
                        : "bg-white border border-[#EAE8E4] hover:border-slate-400"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? "text-white" : "text-[#475569]"
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Price Range Panel (Revealed when chip is open) */}
            {priceSliderOpen && (
              <View className="flex flex-col gap-3 rounded-2xl border border-[#E5E1DC] bg-white p-4 shadow-sm max-w-xl">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold text-navy-900">Select Price Preset</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setMinPrice(undefined);
                      setMaxPrice(undefined);
                      setPriceSliderOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Text className="text-xs font-semibold text-[#EA580C]">Clear</Text>
                  </Pressable>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  {PRICE_PRESETS.map((p, idx) => {
                    const isPresetSelected = minPrice === p.min && maxPrice === p.max;
                    return (
                      <Pressable
                        key={idx}
                        accessibilityRole="button"
                        onPress={() => {
                          setMinPrice(p.min);
                          setMaxPrice(p.max);
                          setPriceSliderOpen(false);
                        }}
                        className={`rounded-xl px-3 py-1.5 border text-xs font-bold cursor-pointer ${
                          isPresetSelected
                            ? "bg-[#EA580C] border-[#EA580C]"
                            : "bg-[#FAF8F5] border-[#E5E1DC] hover:border-slate-400"
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isPresetSelected ? "text-white" : "text-navy-900"
                          }`}
                        >
                          {p.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Sub-services if category has them */}
            {activeCategory && subServices.length > 0 && (
              <View className="flex-row flex-wrap items-center gap-2">
                {subServices.map((svc) => {
                  const isSelected = selectedServiceSlug === svc.slug;
                  return (
                    <Pressable
                      key={svc.id}
                      accessibilityRole="button"
                      onPress={() =>
                        setSelectedServiceSlug(isSelected ? undefined : svc.slug)
                      }
                      className={`flex-row items-center gap-1 rounded-full px-3 py-1 transition cursor-pointer ${
                        isSelected
                          ? "bg-navy-900 shadow-xs"
                          : "bg-[#FAF8F5] border border-[#EAE8E4] hover:border-slate-400"
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? "text-white" : "text-[#475569]"
                        }`}
                      >
                        {svc.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Status Row */}
          <View className="flex-row items-center justify-between border-t border-[#EAE8E4]/60 pt-2 text-xs">
            <Text className="text-xs font-medium text-[#6B6560]">
              Showing{" "}
              <Text className="font-bold text-navy-900">
                {stays.length} verified propert{stays.length === 1 ? "y" : "ies"}
              </Text>
            </Text>
            <Text className="text-xs font-medium text-[#6B6560]">
              Transparent date quotes · Direct host communication
            </Text>
          </View>
        </View>

        {/* 3. Results Header with Count & Sort */}
        {!isLoading && stays.length > 0 && (
          <View className="flex-row items-center justify-between border-b border-[#EAE8E4] pb-3">
            <Text className="text-sm font-semibold text-navy-900">
              Showing{" "}
              <Text className="font-bold text-[#EA580C]">{displayedStays.length}</Text> of{" "}
              <Text className="font-bold text-navy-900">{stays.length}</Text>{" "}
              {stays.length === 1 ? "stay" : "stays"}
              {appliedLocation ? ` in "${appliedLocation}"` : ""}
            </Text>

            <View className="relative flex-row items-center gap-2">
              <Text className="text-xs font-medium text-[#6B6560]">Sort by:</Text>

              {/* Custom Desktop Dropdown */}
              <View className="relative">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSortDropdownOpen((prev) => !prev)}
                  className="flex-row items-center gap-2 rounded-lg border border-[#EAE8E4] bg-white px-3 py-1.5 shadow-xs hover:border-slate-400 cursor-pointer"
                >
                  <Text className="text-xs font-semibold text-navy-900">
                    {SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Newest First"}
                  </Text>
                  <ChevronDown size={14} color="#6B6560" />
                </Pressable>

                {sortDropdownOpen && (
                  <View className="absolute right-0 top-10 z-50 w-44 rounded-xl border border-[#EAE8E4] bg-white p-1.5 shadow-lg">
                    {SORT_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        accessibilityRole="button"
                        onPress={() => {
                          setSort(opt.value);
                          setSortDropdownOpen(false);
                          setVisible(6);
                        }}
                        className={`flex-row items-center justify-between rounded-lg px-2.5 py-2 cursor-pointer ${
                          sort === opt.value
                            ? "bg-[#FAF8F5] text-[#EA580C]"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            sort === opt.value ? "text-[#EA580C] font-bold" : "text-navy-900"
                          }`}
                        >
                          {opt.label}
                        </Text>
                        {sort === opt.value && <Check size={14} color="#EA580C" />}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* 4. Stay Cards Grid (3 Columns) */}
        {isLoading ? (
          <View className="flex-row flex-wrap -mx-2.5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <View
                key={idx}
                className="w-full md:w-[calc(50%-1.25rem)] lg:w-[calc(33.333%-1.25rem)] m-2.5 rounded-2xl border border-[#EAE8E4] bg-white p-5 gap-3"
              >
                <View className="aspect-[16/10] w-full rounded-xl bg-slate-200 animate-pulse" />
                <View className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
                <View className="h-6 w-3/4 rounded bg-slate-200 animate-pulse" />
                <View className="h-10 w-full rounded bg-slate-200 animate-pulse" />
                <View className="h-6 w-1/2 rounded bg-slate-200 animate-pulse" />
              </View>
            ))}
          </View>
        ) : error ? (
          <View className="rounded-2xl border border-red-200 bg-red-50 p-8 items-center gap-3">
            <Text className="text-base font-bold text-red-800">Could not load stay properties</Text>
            <Text className="text-xs text-red-600">{(error as Error).message}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => refetch()}
              className="mt-2 rounded-xl bg-red-600 px-5 py-2 cursor-pointer"
            >
              <Text className="text-xs font-bold text-white">Retry</Text>
            </Pressable>
          </View>
        ) : stays.length === 0 ? (
          <View className="rounded-2xl border border-[#EAE8E4] bg-white p-12 items-center gap-3">
            <Building2 size={36} color="#8C827A" />
            <Text className="text-lg font-bold text-navy-900">No stay properties found</Text>
            <Text className="text-xs text-slate-500 max-w-sm text-center">
              Try broadening your filters or searching in another area or city.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={clearFilters}
              className="mt-2 rounded-xl bg-[#FAF8F5] border border-[#EAE8E4] px-5 py-2.5 hover:border-slate-400 cursor-pointer"
            >
              <Text className="text-xs font-bold text-navy-900">Reset Filters</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row flex-wrap -mx-2.5">
            {displayedStays.map((property) => (
              <View
                key={property.id}
                className="w-full md:w-[calc(50%-1.25rem)] lg:w-[calc(33.333%-1.25rem)] m-2.5"
              >
                <DesktopStayCard property={property} />
              </View>
            ))}
          </View>
        )}

        {/* Load More Button */}
        {stays.length > visible && (
          <View className="flex items-center justify-center pt-4">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Load more stays"
              onPress={() => setVisible((c) => c + 6)}
              className="rounded-xl border border-[#EAE8E4] bg-white px-6 py-2.5 shadow-xs hover:border-slate-400 cursor-pointer transition"
            >
              <Text className="text-xs font-bold text-navy-900">
                Load more ({stays.length - visible} remaining)
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* 5. Desktop Site Footer */}
      <DesktopSiteFooter />
    </ScrollView>
  );
}

/**
 * 1:1 Pixel-accurate Desktop Stay Card matching the web portal screenshot
 */
function DesktopStayCard({ property }: { property: StayPropertySummary }) {
  const router = useRouter();
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
  const imageUrl =
    (Array.isArray(rawMedia) && rawMedia[0]?.url) ||
    property.image_urls?.[0] ||
    FALLBACK_STAY_IMAGE;

  const hostName =
    property.host_name ||
    property.partner?.company_name ||
    property.partner?.full_name ||
    "Lakeview PG";

  const rawPref =
    property.tenant_preference ||
    (typeof property.structured_fields?.tenant_preference === "string"
      ? property.structured_fields.tenant_preference
      : undefined);
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

  const primaryUnit = property.units?.[0];
  const occupancy = primaryUnit ? roomOccupancyLabel(primaryUnit, property.room_style) : null;
  const amenities = (property.amenities ?? []).slice(0, 4);

  const handleNavigate = () => {
    router.push(`/stays/${property.slug || property.id}`);
  };

  return (
    <View
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#EAE8E4] bg-white p-5 shadow-xs transition hover:border-[#D1CDC7] hover:shadow-lg cursor-pointer"
      style={{ height: "100%" }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`View ${property.title}`}
        onPress={handleNavigate}
        className="flex-col gap-3"
      >
        {/* Cover Image Container (16:10 aspect ratio) */}
        <View className="relative -mx-5 -mt-5 mb-3 aspect-[16/10] overflow-hidden bg-slate-100 rounded-t-2xl">
          <Image
            source={{ uri: imageUrl }}
            contentFit="cover"
            style={{ width: "100%", height: "100%" }}
            transition={300}
            className="group-hover:scale-105 transition duration-300"
          />

          {/* Heart Save Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isHearted ? "Remove from saved" : "Save stay"}
            onPress={(e) => {
              e.stopPropagation();
              saved.toggle(property.id);
            }}
            className="absolute top-3 right-3 size-8 items-center justify-center rounded-full bg-white/95 border border-line/60 shadow-md hover:bg-white transition cursor-pointer"
          >
            <Heart
              size={15}
              color={isHearted ? "#EA580C" : "#6B6560"}
              fill={isHearted ? "#EA580C" : "transparent"}
            />
          </Pressable>
        </View>

        {/* Badges: Verified Host & Star Rating */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <ShieldCheck size={15} color="#059669" />
            <Text className="text-xs font-semibold text-emerald-700">Verified host</Text>
          </View>

          {property.average_rating ? (
            <View className="flex-row items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 border border-amber-200">
              <Star size={11} color="#D97706" fill="#D97706" />
              <Text className="text-[11px] font-bold text-amber-800">
                {Number(property.average_rating).toFixed(0)}
                {property.review_count ? ` (${property.review_count})` : ""}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Title and Host Name */}
        <View className="gap-0.5">
          <Text
            className="text-lg font-bold text-navy-900 group-hover:text-[#EA580C] transition"
            numberOfLines={1}
          >
            {property.title}
          </Text>
          <Text className="text-xs text-[#6B6560]">
            Hosted by <Text className="font-semibold text-navy-900">{hostName}</Text>
          </Text>
        </View>

        {/* Description (2 lines clamp) */}
        {property.description ? (
          <Text className="text-xs leading-relaxed text-[#6B6560]" numberOfLines={2}>
            {property.description}
          </Text>
        ) : null}

        {/* Location with MapPin icon */}
        {property.location_text ? (
          <View className="flex-row items-center gap-1.5">
            <MapPin size={13} color="#8C827A" />
            <Text className="flex-1 text-xs text-[#6B6560]" numberOfLines={1}>
              {property.location_text}
            </Text>
          </View>
        ) : null}

        {/* Badges & Amenities Tags */}
        <View className="flex-row flex-wrap gap-1.5 pt-1">
          {tenantLabel ? (
            <View className="rounded-md border border-navy-200 bg-navy-50 px-2.5 py-1">
              <Text className="text-[11px] font-semibold text-navy-900">{tenantLabel}</Text>
            </View>
          ) : null}

          {occupancy ? (
            <View className="flex-row items-center gap-1 rounded-md border border-[#EAE8E4] bg-[#FAF8F5] px-2.5 py-1">
              <Users size={11} color="#6B6560" />
              <Text className="text-[11px] font-semibold text-[#6B6560]">{occupancy}</Text>
            </View>
          ) : null}

          {amenities.map((amenity) => {
            const Icon = getAmenityIcon(amenity.key);
            return (
              <View
                key={amenity.key}
                className="flex-row items-center gap-1 rounded-md border border-[#EAE8E4] bg-[#FAF8F5] px-2.5 py-1"
              >
                <Icon size={11} color="#EA580C" />
                <Text className="text-[11px] font-semibold text-[#6B6560]">{amenity.label}</Text>
              </View>
            );
          })}
        </View>
      </Pressable>

      {/* Pricing and Action Button */}
      <View className="mt-5 border-t border-[#F1EFEA] pt-4">
        <View className="flex-row items-end justify-between">
          <View className="flex-1 pr-2">
            <View className="flex-row items-baseline gap-1">
              <Text className="text-xl font-extrabold text-navy-900">{formatPaise(minRate)}</Text>
              <Text className="text-xs font-medium text-[#6B6560]">
                / {period === "NIGHT" ? "night" : "month"}
              </Text>
            </View>
            <Text className="mt-0.5 text-[11px] font-medium text-[#8C827A]" numberOfLines={1}>
              {typeof property.min_stay_nights === "number" && property.min_stay_nights > 1
                ? `Minimum stay ${stayLengthLabel(property.min_stay_nights, period)} · `
                : ""}
              Enquire and the host calls you
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Check Dates"
            onPress={handleNavigate}
            className="flex-row items-center gap-1.5 rounded-lg bg-[#EA580C] hover:bg-[#D94E08] px-4 py-2 cursor-pointer transition shadow-xs group-hover:shadow"
          >
            <Text className="text-xs font-bold text-white">Check Dates</Text>
            <ArrowRight size={13} color="#ffffff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
