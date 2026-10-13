import { useQuery } from "@tanstack/react-query";
import { Button, COLOR_TOKENS, EmptyState, ErrorState, Text } from "@vsolve/mobile-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FileCheck2, IndianRupee, Layers, MapPin, Search } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";

import { fetchRentals, fetchRentalTaxonomy } from "../queries";
import { RentalCard } from "./rental-card";

/** Paise range constants for the slider. 0 – ₹5,000/day */
const SLIDER_MIN_PAISE = 0;
const SLIDER_MAX_PAISE = 500_000; // ₹5,000 / day
const SLIDER_STEP_PAISE = 5_000; // ₹50 step

function paiseToDisplay(paise: number): string {
  const rupees = Math.round(paise / 100);
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(rupees % 1000 === 0 ? 0 : 1)}k`;
  return `₹${rupees}`;
}

const PRICE_PRESETS: { label: string; min: number; max: number }[] = [
  { label: "All Rates", min: 0, max: 500_000 },
  { label: "Under ₹500", min: 0, max: 50_000 },
  { label: "₹500 – ₹1.5k", min: 50_000, max: 150_000 },
  { label: "₹1.5k – ₹3k", min: 150_000, max: 300_000 },
  { label: "₹3k+", min: 300_000, max: 500_000 },
];

function PriceRangeSlider({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState<number | null>(null);
  const [activeThumb, setActiveThumb] = useState<"min" | "max" | null>(null);

  const minVal = Math.max(SLIDER_MIN_PAISE, Math.min(min, SLIDER_MAX_PAISE));
  const maxVal = Math.max(SLIDER_MIN_PAISE, Math.min(max, SLIDER_MAX_PAISE));

  const minPct = Math.max(
    0,
    Math.min(100, ((minVal - SLIDER_MIN_PAISE) / (SLIDER_MAX_PAISE - SLIDER_MIN_PAISE)) * 100),
  );
  const maxPct = Math.max(
    0,
    Math.min(100, ((maxVal - SLIDER_MIN_PAISE) / (SLIDER_MAX_PAISE - SLIDER_MIN_PAISE)) * 100),
  );

  const handleTouch = (locationX: number, thumbOverride?: "min" | "max") => {
    if (!trackWidth || trackWidth <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
    const touchedPaise =
      Math.round(((ratio * (SLIDER_MAX_PAISE - SLIDER_MIN_PAISE)) + SLIDER_MIN_PAISE) / SLIDER_STEP_PAISE) *
      SLIDER_STEP_PAISE;

    const chosenThumb =
      thumbOverride ??
      activeThumb ??
      (Math.abs(touchedPaise - minVal) <= Math.abs(touchedPaise - maxVal) ? "min" : "max");

    if (chosenThumb === "min") {
      const clamped = Math.max(
        SLIDER_MIN_PAISE,
        Math.min(touchedPaise, maxVal - SLIDER_STEP_PAISE),
      );
      onChange(clamped, maxVal);
    } else {
      const clamped = Math.min(
        SLIDER_MAX_PAISE,
        Math.max(touchedPaise, minVal + SLIDER_STEP_PAISE),
      );
      onChange(minVal, clamped);
    }
  };

  return (
    <View className="gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold text-navy-900">Daily rate range</Text>
        <Text className="text-xs font-extrabold text-brand tabular-nums">
          {paiseToDisplay(minVal)} –{" "}
          {maxVal >= SLIDER_MAX_PAISE
            ? `${paiseToDisplay(SLIDER_MAX_PAISE)}+`
            : paiseToDisplay(maxVal)}
        </Text>
      </View>

      {/* Slider Track Area */}
      <View
        className="relative h-10 justify-center px-3"
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width - 24;
          if (w > 0) setTrackWidth(w);
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          if (!trackWidth || trackWidth <= 0) return;
          const locX = Math.max(0, e.nativeEvent.locationX - 12);
          const ratio = Math.max(0, Math.min(1, locX / trackWidth));
          const touchedPaise =
            Math.round(
              ((ratio * (SLIDER_MAX_PAISE - SLIDER_MIN_PAISE)) + SLIDER_MIN_PAISE) /
                SLIDER_STEP_PAISE,
            ) * SLIDER_STEP_PAISE;
          const thumb =
            Math.abs(touchedPaise - minVal) <= Math.abs(touchedPaise - maxVal) ? "min" : "max";
          setActiveThumb(thumb);
          handleTouch(locX, thumb);
        }}
        onResponderMove={(e) => {
          const locX = Math.max(0, e.nativeEvent.locationX - 12);
          handleTouch(locX);
        }}
        onResponderRelease={() => {
          setActiveThumb(null);
        }}
        onResponderTerminate={() => {
          setActiveThumb(null);
        }}
      >
        {/* Inactive Track */}
        <View className="h-1.5 w-full rounded-full bg-line" />

        {/* Active Track Highlight */}
        <View
          style={{
            left: `${minPct}%`,
            width: `${Math.max(2, maxPct - minPct)}%`,
          }}
          className="absolute h-1.5 rounded-full bg-brand"
        />

        {/* Min Thumb */}
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="Minimum daily rate"
          accessibilityValue={{
            min: SLIDER_MIN_PAISE / 100,
            max: maxVal / 100,
            now: minVal / 100,
            text: paiseToDisplay(minVal),
          }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "increment") {
              const next = Math.min(minVal + SLIDER_STEP_PAISE, maxVal - SLIDER_STEP_PAISE);
              onChange(next, maxVal);
            } else if (event.nativeEvent.actionName === "decrement") {
              const prev = Math.max(minVal - SLIDER_STEP_PAISE, SLIDER_MIN_PAISE);
              onChange(prev, maxVal);
            }
          }}
          hitSlop={12}
          style={{
            left: `${minPct}%`,
            transform: [{ translateX: -11 }],
          }}
          className="absolute size-6 items-center justify-center rounded-full border-2 border-brand bg-white shadow-md active:scale-110"
        >
          <View className="size-2 rounded-full bg-brand" />
        </View>

        {/* Max Thumb */}
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="Maximum daily rate"
          accessibilityValue={{
            min: minVal / 100,
            max: SLIDER_MAX_PAISE / 100,
            now: maxVal / 100,
            text: paiseToDisplay(maxVal),
          }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "increment") {
              const next = Math.min(maxVal + SLIDER_STEP_PAISE, SLIDER_MAX_PAISE);
              onChange(minVal, next);
            } else if (event.nativeEvent.actionName === "decrement") {
              const prev = Math.max(maxVal - SLIDER_STEP_PAISE, minVal + SLIDER_STEP_PAISE);
              onChange(minVal, prev);
            }
          }}
          hitSlop={12}
          style={{
            left: `${maxPct}%`,
            transform: [{ translateX: -11 }],
          }}
          className="absolute size-6 items-center justify-center rounded-full border-2 border-brand bg-white shadow-md active:scale-110"
        >
          <View className="size-2 rounded-full bg-brand" />
        </View>
      </View>

      <View className="flex-row justify-between text-[11px] text-text-secondary/70">
        <Text className="text-[10px] text-text-muted">{paiseToDisplay(SLIDER_MIN_PAISE)}</Text>
        <Text className="text-[10px] text-text-muted">{paiseToDisplay(SLIDER_MAX_PAISE)}+</Text>
      </View>

      {/* Quick Presets */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 pt-1">
        {PRICE_PRESETS.map((preset) => {
          const isSelected = minVal === preset.min && maxVal === preset.max;
          return (
            <Pressable
              key={preset.label}
              onPress={() => onChange(preset.min, preset.max)}
              className={`rounded-full px-3 py-1 border ${
                isSelected
                  ? "border-brand bg-brand"
                  : "border-line bg-surface-sunken active:bg-surface-hover"
              }`}
            >
              <Text
                className={`text-[11px] font-bold ${
                  isSelected ? "text-white" : "text-text-secondary"
                }`}
              >
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function RentalsBrowseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; service?: string }>();

  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");

  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(
    params.category ?? null,
  );
  const [selectedService, setSelectedService] = useState<string | null>(params.service ?? null);

  // Sync state if params change during render (React 19 friendly)
  const [prevCategoryParam, setPrevCategoryParam] = useState(params.category);
  if (params.category !== prevCategoryParam) {
    setPrevCategoryParam(params.category);
    setSelectedSubcategory(params.category ?? null);
  }

  const [prevServiceParam, setPrevServiceParam] = useState(params.service);
  if (params.service !== prevServiceParam) {
    setPrevServiceParam(params.service);
    setSelectedService(params.service ?? null);
  }

  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [isPriceSliderOpen, setIsPriceSliderOpen] = useState(false);

  const hasPriceFilter = minPrice !== undefined || maxPrice !== undefined || isPriceSliderOpen;

  const taxonomyQuery = useQuery({
    queryKey: ["rental-taxonomy"],
    queryFn: fetchRentalTaxonomy,
    staleTime: 60_000,
  });

  const rentalsQuery = useQuery({
    queryKey: [
      "rentals",
      appliedQuery,
      appliedLocation,
      selectedSubcategory,
      selectedService,
      minPrice,
      maxPrice,
    ],
    queryFn: () =>
      fetchRentals({
        q: appliedQuery || undefined,
        location: appliedLocation || undefined,
        category: selectedSubcategory || undefined,
        service: selectedService || undefined,
        min_price: minPrice,
        max_price: maxPrice,
      }),
    staleTime: 30_000,
  });

  const rentals = rentalsQuery.data ?? [];
  const taxonomy = taxonomyQuery.data ?? [];

  const currentCategory = taxonomy.find((cat) => cat.slug === selectedSubcategory);
  const nestedServices = currentCategory?.services ?? [];

  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
  };

  const clearFilters = () => {
    setDraftQuery("");
    setDraftLocation("");
    setAppliedQuery("");
    setAppliedLocation("");
    setSelectedSubcategory(null);
    setSelectedService(null);
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setIsPriceSliderOpen(false);
  };

  const isFiltering =
    appliedQuery !== "" ||
    appliedLocation !== "" ||
    selectedSubcategory !== null ||
    selectedService !== null ||
    minPrice !== undefined ||
    maxPrice !== undefined;

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-5 px-4 py-4 pb-16"
      refreshControl={
        <RefreshControl
          refreshing={rentalsQuery.isRefetching}
          onRefresh={() => void rentalsQuery.refetch()}
        />
      }
    >
      {/* Hero Header */}
      <View className="overflow-hidden rounded-3xl bg-navy-900 p-6 shadow-md">
        <View className="gap-2">
          <View className="self-start rounded-full bg-brand/20 px-3 py-1">
            <Text className="text-[10px] font-extrabold uppercase tracking-wider text-brand">
              Verified Tools & Equipment
            </Text>
          </View>
          <Text className="text-2xl font-black text-white">Rent Tools & Equipment</Text>
          <Text className="text-xs font-medium leading-relaxed text-white/70">
            Certified power tools, machinery, and equipment with 100% refundable security deposit
            and clear daily rates.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/rentals/mine" as never)}
          className="mt-4 flex-row items-center justify-between rounded-xl border border-white/20 bg-white/10 px-4 py-3 active:bg-white/20"
        >
          <View className="flex-row items-center gap-2">
            <FileCheck2 size={16} color={COLOR_TOKENS.textInverse} />
            <Text className="text-xs font-bold text-white">My Rentals</Text>
          </View>
          <Text className="text-xs font-semibold text-brand">View Bookings →</Text>
        </Pressable>
      </View>

      {/* Dual Search Bar with Explicit Submit (Web W-002) */}
      <View className="gap-2.5 rounded-2xl border border-line bg-surface p-3.5 shadow-xs">
        <View className="flex-row items-center rounded-xl bg-canvas px-3 py-2 border border-line/60">
          <Search size={16} color={COLOR_TOKENS.textMuted} />
          <TextInput
            placeholder="Search tools (e.g. Bosch Drill, Angle Grinder)"
            placeholderTextColor={COLOR_TOKENS.placeholderText}
            value={draftQuery}
            onChangeText={setDraftQuery}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            className="ml-2 flex-1 text-xs text-navy-900"
          />
        </View>

        <View className="flex-row items-center rounded-xl bg-canvas px-3 py-2 border border-line/60">
          <MapPin size={16} color={COLOR_TOKENS.textMuted} />
          <TextInput
            placeholder="Location (e.g. Hyderabad, Ameerpet)"
            placeholderTextColor={COLOR_TOKENS.placeholderText}
            value={draftLocation}
            onChangeText={setDraftLocation}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            className="ml-2 flex-1 text-xs text-navy-900"
          />
        </View>

        <Button
          variant="primary"
          size="sm"
          onPress={handleSearchSubmit}
          className="w-full py-2.5"
        >
          <Text className="font-bold text-white">Search Gear</Text>
        </Button>
      </View>

      {/* Taxonomy Category Chips & Daily Rate Toggle (Web W-003, W-004 / GAP-RNT-008) */}
      <View className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
          Categories & Filters
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="items-center gap-2"
        >
          {/* All Equipment Chip */}
          <Pressable
            onPress={() => {
              setSelectedSubcategory(null);
              setSelectedService(null);
            }}
            className={`flex-row items-center gap-1.5 rounded-full px-4 py-2 border ${
              selectedSubcategory === null
                ? "border-navy-900 bg-navy-900"
                : "border-line bg-surface active:bg-surface-hover"
            }`}
          >
            <Layers size={13} color={selectedSubcategory === null ? COLOR_TOKENS.textInverse : COLOR_TOKENS.textMuted} />
            <Text
              className={`text-xs font-bold ${
                selectedSubcategory === null ? "text-white" : "text-text-secondary"
              }`}
            >
              All Equipment
            </Text>
          </Pressable>

          {taxonomy.map((cat) => (
            <Pressable
              key={cat.id || cat.slug}
              onPress={() => {
                setSelectedSubcategory(cat.slug);
                setSelectedService(null);
              }}
              className={`rounded-full px-4 py-2 border ${
                selectedSubcategory === cat.slug
                  ? "border-navy-900 bg-navy-900"
                  : "border-line bg-surface active:bg-surface-hover"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  selectedSubcategory === cat.slug ? "text-white" : "text-text-secondary"
                }`}
              >
                {cat.name}
              </Text>
            </Pressable>
          ))}

          {/* Daily Rate Filter Toggle Button (W-003 / GAP-RNT-008) */}
          <Pressable
            onPress={() => {
              if (hasPriceFilter) {
                setMinPrice(undefined);
                setMaxPrice(undefined);
                setIsPriceSliderOpen(false);
              } else {
                setIsPriceSliderOpen(true);
                setMinPrice(SLIDER_MIN_PAISE);
                setMaxPrice(SLIDER_MAX_PAISE);
              }
            }}
            className={`flex-row items-center gap-1.5 rounded-full px-4 py-2 border ${
              hasPriceFilter
                ? "border-brand bg-brand"
                : "border-line bg-surface active:bg-surface-hover"
            }`}
          >
            <IndianRupee size={13} color={hasPriceFilter ? COLOR_TOKENS.textInverse : COLOR_TOKENS.textMuted} />
            <Text
              className={`text-xs font-bold ${
                hasPriceFilter ? "text-white" : "text-text-secondary"
              }`}
            >
              {hasPriceFilter ? "Daily rate ✕" : "Daily rate"}
            </Text>
          </Pressable>
        </ScrollView>

        {/* Level 2: Nested Service Chips */}
        {nestedServices.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 pt-1"
          >
            <Pressable
              onPress={() => setSelectedService(null)}
              className={`rounded-full px-3 py-1.5 border ${
                selectedService === null
                  ? "border-brand bg-brand/10"
                  : "border-line bg-surface"
              }`}
            >
              <Text
                className={`text-[11px] font-bold ${
                  selectedService === null ? "text-brand" : "text-text-secondary"
                }`}
              >
                All {currentCategory?.name}
              </Text>
            </Pressable>

            {nestedServices.map((svc) => (
              <Pressable
                key={svc.id || svc.slug}
                onPress={() => setSelectedService(svc.slug)}
                className={`rounded-full px-3 py-1.5 border ${
                  selectedService === svc.slug
                    ? "border-brand bg-brand/10"
                    : "border-line bg-surface"
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${
                    selectedService === svc.slug ? "text-brand" : "text-text-secondary"
                  }`}
                >
                  {svc.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {/* Dual-Thumb Interactive Price Range Slider (W-003 / GAP-RNT-008) */}
      {hasPriceFilter ? (
        <PriceRangeSlider
          min={minPrice ?? SLIDER_MIN_PAISE}
          max={maxPrice ?? SLIDER_MAX_PAISE}
          onChange={(min, max) => {
            setMinPrice(min > SLIDER_MIN_PAISE ? min : undefined);
            setMaxPrice(max < SLIDER_MAX_PAISE ? max : undefined);
          }}
        />
      ) : null}

      {/* Results Count & Reset Filter */}
      <View className="flex-row items-center justify-between border-t border-line/60 pt-3">
        <Text className="text-sm font-extrabold text-navy-900">
          Available Gear ({rentals.length})
        </Text>
        {isFiltering ? (
          <Pressable onPress={clearFilters}>
            <Text className="text-xs font-bold text-brand">Reset filters</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Rentals List */}
      {rentalsQuery.isLoading ? (
        <View className="gap-4">
          {[1, 2, 3].map((idx) => (
            <View key={idx} className="h-56 rounded-2xl bg-surface-sunken" />
          ))}
        </View>
      ) : rentalsQuery.isError ? (
        <ErrorState
          title="Could not load equipment"
          message="Check your connection and try again."
          onAction={() => void rentalsQuery.refetch()}
        />
      ) : rentals.length === 0 ? (
        <EmptyState
          title="No equipment found"
          description="Try broadening your search keywords or location."
          action={
            isFiltering ? (
              <Button variant="secondary" onPress={clearFilters}>
                <Text className="font-bold">Reset Filters</Text>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <View className="gap-4">
          {rentals.map((asset) => (
            <RentalCard key={asset.id} asset={asset} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
