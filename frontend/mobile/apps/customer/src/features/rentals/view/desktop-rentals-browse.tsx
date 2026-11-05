import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { useQuery } from "@tanstack/react-query";
import { Skeleton, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  FileCheck2,
  Heart,
  IndianRupee,
  Layers,
  MapPin,
  Search,
  Wrench,
  X,
} from "lucide-react-native";
import { useCallback, useId, useState } from "react";
import { Platform, Pressable, ScrollView, TextInput, View } from "react-native";

import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";
import { PlaceFilter } from "@/features/browse/place-filter";
import {
  EMPTY_PLACE,
  NearbyNotice,
  placeKey,
  placeQuery,
  type PlaceFilterValue,
} from "@/features/browse/nearby";

import {
  formatPaise,
  type RentalAsset,
  type RentalTaxonomySubcategory,
} from "../model";
import { fetchRentals, fetchRentalTaxonomy } from "../queries";
import { useSavedItems } from "../use-saved-items";

const SLIDER_MIN_PAISE = 0;
const SLIDER_MAX_PAISE = 500_000; // â‚¹5,000 / day
const SLIDER_STEP_PAISE = 5_000; // â‚¹50 step

function paiseToDisplay(paise: number): string {
  const rupees = Math.round(paise / 100);
  if (rupees >= 1000) return `â‚¹${(rupees / 1000).toFixed(rupees % 1000 === 0 ? 0 : 1)}k`;
  return `â‚¹${rupees}`;
}

const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: "All Rates", min: undefined, max: undefined },
  { label: "Under â‚¹500", min: undefined, max: 50_000 },
  { label: "â‚¹500 â€“ â‚¹1.5k", min: 50_000, max: 150_000 },
  { label: "â‚¹1.5k â€“ â‚¹3k", min: 150_000, max: 300_000 },
  { label: "â‚¹3k+", min: 300_000, max: undefined },
];

export function DesktopRentalsBrowse() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; service?: string }>();

  // Search & Filter State
  const [draftQuery, setDraftQuery] = useState("");
  const [draftPlace, setDraftPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedPlace, setAppliedPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);

  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | undefined>(
    params.category ?? undefined,
  );
  const [selectedServiceSlug, setSelectedServiceSlug] = useState<string | undefined>(
    params.service ?? undefined,
  );

  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [priceSliderOpen, setPriceSliderOpen] = useState(false);
  const [visible, setVisible] = useState(12);

  const { data: taxonomy = [], isLoading: isTaxonomyLoading } = useQuery({
    queryKey: ["rental-taxonomy"],
    queryFn: fetchRentalTaxonomy,
    staleTime: 5 * 60 * 1000,
  });

  const activeCategory = taxonomy.find((c) => c.slug === selectedCategorySlug);
  const nestedServices = activeCategory?.services ?? [];

  const {
    data: rentals = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "rentals",
      appliedQuery,
      placeKey(appliedPlace),
      selectedCategorySlug,
      selectedServiceSlug,
      minPrice,
      maxPrice,
    ],
    queryFn: () =>
      fetchRentals({
        q: appliedQuery || undefined,
        ...placeQuery(appliedPlace),
        category: selectedCategorySlug || undefined,
        service: selectedServiceSlug || undefined,
        min_price: minPrice,
        max_price: maxPrice,
      }),
    staleTime: 30_000,
  });

  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedPlace(draftPlace);
    setVisible(12);
  };

  const handlePlaceChange = (next: PlaceFilterValue, applyNow: boolean) => {
    setDraftPlace(next);
    if (applyNow) {
      setAppliedQuery(draftQuery);
      setAppliedPlace(next);
      setVisible(12);
    }
  };

  const clearFilters = () => {
    setDraftQuery("");
    setDraftPlace(EMPTY_PLACE);
    setAppliedQuery("");
    setAppliedPlace(EMPTY_PLACE);
    setSelectedCategorySlug(undefined);
    setSelectedServiceSlug(undefined);
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setPriceSliderOpen(false);
    setVisible(12);
  };

  const hasPriceFilter = minPrice !== undefined || maxPrice !== undefined;
  const isAllEquipment = !selectedCategorySlug && !selectedServiceSlug;
  const displayedRentals = rentals.slice(0, visible);

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="min-h-screen justify-between"
      showsVerticalScrollIndicator
    >
      <View className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Link matching Web customer portal 100% */}
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
                <Wrench size={14} color="#93C5FD" />
                <Text className="text-xs font-semibold text-blue-200">
                  Verified Tools & Equipment Rentals
                </Text>
              </View>

              <Text className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Rent Tools & Equipment
              </Text>

              <Text className="text-sm text-slate-300 sm:text-base leading-relaxed">
                Rent certified power tools, carpentry kits, and equipment with verified partners.
                100% refundable security deposit and transparent daily rates.
              </Text>
            </View>

            {/* My bookings Button */}
            <View className="flex shrink-0 items-center">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="My bookings"
                onPress={() => router.push("/activity?type=rentals")}
                className="flex-row items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur-md transition hover:bg-white/20 cursor-pointer"
              >
                <FileCheck2 size={16} color="#ffffff" />
                <Text className="text-sm font-semibold text-white">My bookings</Text>
              </Pressable>
            </View>
          </View>

          {/* Search Bar Container inside dark banner */}
          <View className="relative z-10 mt-8 flex-col gap-3 rounded-2xl bg-white p-2.5 shadow-2xl md:flex-row md:items-center border border-slate-100">
            {/* Input 1: Tools Query */}
            <View className="flex-1 flex-row items-center gap-3 rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] px-3.5 py-2.5 focus-within:border-navy-900">
              <Search size={16} color="#6B6560" />
              <TextInput
                value={draftQuery}
                onChangeText={setDraftQuery}
                onSubmitEditing={handleSearchSubmit}
                placeholder="Search tools (e.g. Bosch Drill, Angle Grinder, Carpentry Kit)"
                placeholderTextColor="rgba(107,101,96,0.7)"
                className="w-full bg-transparent text-sm text-navy-900 p-0 focus:outline-none"
              />
            </View>

            {/* Input 2: Location */}
            <View className="flex-1 md:max-w-[320px]">
              <PlaceFilter
                value={draftPlace}
                onChange={handlePlaceChange}
                placeholder="Location (e.g. Hyderabad)"
                onSubmit={handleSearchSubmit}
              />
            </View>

            {/* Submit Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search Gear"
              onPress={handleSearchSubmit}
              className="rounded-xl bg-[#EA580C] hover:bg-[#D94E08] px-6 py-3 items-center justify-center cursor-pointer transition shadow-sm"
            >
              <Text className="text-sm font-bold text-white">Search Gear</Text>
            </Pressable>
          </View>
        </View>

        {/* 2. Structured Filter Chips */}
        <View className="flex flex-col gap-4">
          <View className="flex flex-col gap-3">
            {/* Row 1: Categories + Divider + Daily Rate */}
            <View className="flex-row flex-wrap items-center gap-2">
              {/* All Equipment Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="All Equipment"
                onPress={() => {
                  setSelectedCategorySlug(undefined);
                  setSelectedServiceSlug(undefined);
                }}
                className={`flex-row items-center gap-2 rounded-full px-4 py-2 transition cursor-pointer ${
                  isAllEquipment
                    ? "bg-[#EA580C] shadow-xs"
                    : "bg-white border border-[#EAE8E4] hover:border-slate-400"
                }`}
              >
                <Layers size={14} color={isAllEquipment ? "#ffffff" : "#475569"} />
                <Text
                  className={`text-xs font-bold ${
                    isAllEquipment ? "text-white" : "text-[#475569]"
                  }`}
                >
                  All Equipment
                </Text>
              </Pressable>

              {/* Taxonomy Categories */}
              {isTaxonomyLoading
                ? Array.from({ length: 4 }).map((_, idx) => (
                    <View key={idx} className="h-8 w-28 rounded-full bg-slate-200 animate-pulse" />
                  ))
                : taxonomy.map((cat) => {
                    const isSelected = selectedCategorySlug === cat.slug;
                    return (
                      <Pressable
                        key={cat.id}
                        accessibilityRole="button"
                        accessibilityLabel={cat.name}
                        onPress={() => {
                          setSelectedCategorySlug(cat.slug);
                          setSelectedServiceSlug(undefined);
                        }}
                        className={`flex-row items-center gap-2 rounded-full px-4 py-2 transition cursor-pointer ${
                          isSelected
                            ? "bg-[#EA580C] shadow-xs"
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

              {/* Divider */}
              <View className="h-6 w-px bg-[#EAE8E4] mx-1" />

              {/* Daily Rate Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Daily rate filter"
                onPress={() => {
                  if (hasPriceFilter) {
                    setMinPrice(undefined);
                    setMaxPrice(undefined);
                    setPriceSliderOpen(false);
                  } else {
                    setPriceSliderOpen((prev) => !prev);
                  }
                }}
                className={`flex-row items-center gap-2 rounded-full px-4 py-2 transition cursor-pointer ${
                  hasPriceFilter || priceSliderOpen
                    ? "bg-[#EA580C] shadow-xs"
                    : "bg-white border border-[#EAE8E4] hover:border-slate-400"
                }`}
              >
                <IndianRupee
                  size={14}
                  color={hasPriceFilter || priceSliderOpen ? "#ffffff" : "#475569"}
                />
                <Text
                  className={`text-xs font-bold ${
                    hasPriceFilter || priceSliderOpen ? "text-white" : "text-[#475569]"
                  }`}
                >
                  {hasPriceFilter ? "Daily rate âœ•" : "Daily rate"}
                </Text>
              </Pressable>
            </View>

            {/* Price Range Panel (Revealed when chip is open) */}
            {priceSliderOpen && (
              <View className="flex flex-col gap-3 rounded-2xl border border-[#E5E1DC] bg-white p-4 shadow-sm max-w-xl">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs font-bold text-navy-900">Daily rate range</Text>
                    <Text className="text-xs font-extrabold text-[#EA580C] tabular-nums">
                      {paiseToDisplay(minPrice ?? SLIDER_MIN_PAISE)} â€“{" "}
                      {(maxPrice ?? SLIDER_MAX_PAISE) >= SLIDER_MAX_PAISE
                        ? `${paiseToDisplay(SLIDER_MAX_PAISE)}+`
                        : paiseToDisplay(maxPrice ?? SLIDER_MAX_PAISE)}
                    </Text>
                  </View>
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

                {/* Quick Presets */}
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
                        }}
                        className={`rounded-full px-3 py-1.5 transition cursor-pointer ${
                          isPresetSelected
                            ? "bg-navy-900 text-white"
                            : "bg-[#FAF8F5] border border-[#EAE8E4] hover:border-slate-400"
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isPresetSelected ? "text-white" : "text-[#475569]"
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

            {/* Row 2: Sub-services if activeCategory has nested services */}
            {nestedServices.length > 0 && (
              <View className="flex-row flex-wrap items-center gap-2 pt-1">
                {nestedServices.map((svc) => {
                  const isSelected = selectedServiceSlug === svc.slug;
                  return (
                    <Pressable
                      key={svc.id}
                      accessibilityRole="button"
                      onPress={() =>
                        setSelectedServiceSlug(isSelected ? undefined : svc.slug)
                      }
                      className={`flex-row items-center gap-2 rounded-full px-3 py-1.5 transition cursor-pointer ${
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

          {/* Summary Row matching Web customer portal */}
          <View className="flex-row items-center justify-between text-xs text-[#6B6560] font-medium px-1">
            {isLoading ? (
              <Text className="text-xs font-medium text-[#6B6560]">Loading equipmentâ€¦</Text>
            ) : (
              <Text className="text-xs font-medium text-[#6B6560]">
                Showing <Text className="font-bold text-navy-900">{rentals.length}</Text> rental item
                {rentals.length === 1 ? "" : "s"}
              </Text>
            )}
            <Text className="text-xs font-medium text-[#6B6560]">
              Standard Indian daily rental cycle (24h)
            </Text>
          </View>
        </View>

        {/* Nearby notice when location filter active */}
        {!isLoading && !error && appliedPlace.name ? (
          <NearbyNotice
            place={appliedPlace}
            noun="rentals"
            count={rentals.length}
            nearestKm={rentals[0]?.distance_km}
          />
        ) : null}

        {/* 3. Rental Cards Grid (3 Columns) */}
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
            <Text className="text-base font-bold text-red-800">
              Could not load equipment rentals
            </Text>
            <Text className="text-xs text-red-600">{(error as Error).message}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => refetch()}
              className="mt-2 rounded-xl bg-red-600 px-5 py-2 cursor-pointer"
            >
              <Text className="text-xs font-bold text-white">Retry</Text>
            </Pressable>
          </View>
        ) : rentals.length === 0 ? (
          <View className="rounded-2xl border border-[#EAE8E4] bg-white p-12 items-center gap-3">
            <Wrench size={36} color="#8C827A" />
            <Text className="text-lg font-bold text-navy-900">No equipment rentals found</Text>
            <Text className="text-xs text-slate-500 max-w-sm text-center">
              Try broadening your search query or location filter.
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
            {displayedRentals.map((asset) => (
              <View
                key={asset.id}
                className="w-full md:w-[calc(50%-1.25rem)] lg:w-[calc(33.333%-1.25rem)] m-2.5 flex"
              >
                <DesktopRentalCard asset={asset} />
              </View>
            ))}
          </View>
        )}

        {/* Load More Button */}
        {rentals.length > visible && (
          <View className="flex items-center justify-center pt-4">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Load more rentals"
              onPress={() => setVisible((c) => c + 12)}
              className="rounded-xl border border-[#EAE8E4] bg-white px-6 py-2.5 shadow-xs hover:border-slate-400 cursor-pointer transition"
            >
              <Text className="text-xs font-bold text-navy-900">
                Show more rentals ({rentals.length - visible} remaining)
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* 4. Desktop Site Footer */}
      <DesktopSiteFooter />
    </ScrollView>
  );
}

/**
 * 1:1 Pixel-accurate Desktop Rental Card matching the web portal rental card
 */
function DesktopRentalCard({ asset }: { asset: RentalAsset }) {
  const router = useRouter();
  const saved = useSavedItems("rental");
  const isHearted = saved.isSaved(asset.id);

  const dailyPrice = formatPaise(asset.daily_rate_paise);
  const deposit = formatPaise(asset.deposit_paise);
  // The listing's own photo and partner, or nothing, as on the web: never a stand-in.
  const imageUrl = resolveImageUrl(asset.media?.[0]?.url || asset.thumbnail_url);

  const partnerDisplay =
    asset.partner_name ||
    asset.partner?.company_name ||
    asset.partner?.full_name ||
    null;

  const handleCardPress = () => {
    router.push(`/rentals/${asset.slug || asset.id}` as never);
  };

  return (
    <View
      className="group relative flex flex-1 flex-col justify-between overflow-hidden rounded-2xl border border-[#E5E1DC] bg-white p-5 shadow-xs transition hover:border-slate-400 hover:shadow-raised"
    >
      {/* Cover Image */}
      {imageUrl ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`View ${asset.title}`}
          onPress={handleCardPress}
          className="-mx-5 -mt-5 mb-3 aspect-[4/3] overflow-hidden rounded-t-2xl bg-white p-3 cursor-pointer"
        >
          <Image
            source={{ uri: imageUrl }}
            contentFit="contain"
            style={{ width: "100%", height: "100%" }}
            transition={200}
          />
        </Pressable>
      ) : null}

      <View className="flex flex-col gap-3">
        {/* Top Badges & Heart Row matching Web */}
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row flex-wrap items-center gap-1.5">
            <View className="flex-row items-center gap-1.5 self-start rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1">
              <Wrench size={12} color="#0284C7" />
              <Text className="text-[11px] font-bold text-sky-700 uppercase tracking-wider">
                VERIFIED TOOL
              </Text>
            </View>
            {typeof asset.quantity_available === "number" && asset.quantity_available > 1 ? (
              <View className="flex-row items-center self-start rounded-full bg-slate-100 px-2.5 py-1">
                <Text className="text-[11px] font-bold text-slate-600">
                  Qty {asset.quantity_available}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Save Heart Toggle matching Web */}
          <Pressable
            accessibilityLabel={isHearted ? "Remove from saved rentals" : "Save rental listing"}
            hitSlop={8}
            onPress={() => saved.toggle(asset.id)}
            className={`size-8 items-center justify-center rounded-full border bg-white shadow-2xs active:scale-90 cursor-pointer ${
              isHearted ? "border-[#EA580C]" : "border-[#E5E1DC]"
            }`}
          >
            <Heart
              size={15}
              color={isHearted ? "#EA580C" : "#94A3B8"}
              fill={isHearted ? "#EA580C" : "transparent"}
            />
          </Pressable>
        </View>

        {/* Title and Partner */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={asset.title}
          onPress={handleCardPress}
          className="cursor-pointer"
        >
          <Text
            className="text-base sm:text-lg font-bold text-navy-900 group-hover:text-[#EA580C]"
            numberOfLines={2}
          >
            {asset.title}
          </Text>
          {partnerDisplay ? (
            <Text className="mt-0.5 text-xs font-medium text-slate-500" numberOfLines={1}>
              Offered by <Text className="font-semibold text-navy-900">{partnerDisplay}</Text>
            </Text>
          ) : null}
        </Pressable>

        {/* Description */}
        {asset.description ? (
          <Text className="text-xs leading-relaxed text-slate-500" numberOfLines={2}>
            {asset.description}
          </Text>
        ) : null}

        {/* Location text */}
        {asset.location_text ? (
          <View className="flex-row items-center gap-1.5 text-xs text-slate-500">
            <MapPin size={14} color="#94A3B8" />
            <Text className="text-xs text-slate-500 shrink truncate" numberOfLines={1}>
              {asset.location_text}
            </Text>
            {asset.distance_km != null ? (
              <Text className="shrink-0 text-xs font-semibold text-navy-900">
                Â· {asset.distance_km} km away
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Pricing and Action Footer */}
      <View className="mt-5 border-t border-slate-100 pt-4">
        <View className="flex-row items-end justify-between gap-3">
          <View>
            <View className="flex-row items-baseline gap-1">
              <Text className="text-xl font-extrabold text-navy-900 tabular-nums">
                {dailyPrice}
              </Text>
              <Text className="text-xs font-medium text-slate-500">/ day</Text>
            </View>
            <Text className="mt-0.5 text-[11px] font-medium text-slate-500">
              Deposit: <Text className="font-semibold text-navy-900 tabular-nums">{deposit}</Text> (100% refundable)
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Rent ${asset.title}`}
            onPress={handleCardPress}
            className="flex-row items-center gap-1.5 rounded-xl bg-[#EA580C] hover:bg-[#D94E08] px-4 py-2 cursor-pointer transition shadow-xs group"
          >
            <Text className="text-xs font-bold text-white">Rent Now</Text>
            <ArrowRight size={13} color="#ffffff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

