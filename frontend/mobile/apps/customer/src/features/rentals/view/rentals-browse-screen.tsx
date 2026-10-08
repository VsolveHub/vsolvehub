import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, ErrorState, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { FileCheck2, MapPin, Search } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";

import { fetchRentals, fetchRentalTaxonomy } from "../queries";
import { RentalCard } from "./rental-card";

const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: "All Rates" },
  { label: "Under ₹500", max: 50_000 },
  { label: "₹500 – ₹1.5k", min: 50_000, max: 150_000 },
  { label: "₹1.5k – ₹3k", min: 150_000, max: 300_000 },
  { label: "₹3k+", min: 300_000 },
];

export function RentalsBrowseScreen() {
  const router = useRouter();

  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");

  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [pricePresetIdx, setPricePresetIdx] = useState<number>(0);

  const activePreset = PRICE_PRESETS[pricePresetIdx] ?? PRICE_PRESETS[0]!;

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
      activePreset.min,
      activePreset.max,
    ],
    queryFn: () =>
      fetchRentals({
        q: appliedQuery || undefined,
        location: appliedLocation || undefined,
        category: selectedSubcategory || undefined,
        service: selectedService || undefined,
        min_price: activePreset.min,
        max_price: activePreset.max,
      }),
    staleTime: 30_000,
  });

  const rentals = rentalsQuery.data ?? [];
  const taxonomy = (taxonomyQuery.data as any[]) ?? [];

  const currentCategory = taxonomy.find((cat: any) => cat.slug === selectedSubcategory);
  const nestedServices = (currentCategory?.services as any[]) ?? [];

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
    setPricePresetIdx(0);
  };

  const isFiltering =
    appliedQuery !== "" ||
    appliedLocation !== "" ||
    selectedSubcategory !== null ||
    selectedService !== null ||
    pricePresetIdx !== 0;

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
      <View className="overflow-hidden rounded-3xl bg-[#00112e] p-6 shadow-md">
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
            <FileCheck2 size={16} color="#ffffff" />
            <Text className="text-xs font-bold text-white">My Rentals</Text>
          </View>
          <Text className="text-xs font-semibold text-brand">View Bookings →</Text>
        </Pressable>
      </View>

      {/* Dual Search Bar with Explicit Submit (Web W-002) */}
      <View className="gap-2.5 rounded-2xl border border-line bg-surface p-3.5 shadow-xs">
        <View className="flex-row items-center rounded-xl bg-canvas px-3 py-2 border border-line/60">
          <Search size={16} color="#6B6560" />
          <TextInput
            placeholder="Search tools (e.g. Bosch Drill, Angle Grinder)"
            placeholderTextColor="rgba(107,101,96,0.6)"
            value={draftQuery}
            onChangeText={setDraftQuery}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            className="ml-2 flex-1 text-xs text-navy-900"
          />
        </View>

        <View className="flex-row items-center rounded-xl bg-canvas px-3 py-2 border border-line/60">
          <MapPin size={16} color="#6B6560" />
          <TextInput
            placeholder="Location (e.g. Hyderabad, Ameerpet)"
            placeholderTextColor="rgba(107,101,96,0.6)"
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

      {/* Two-Tier Taxonomy Category Chips (Web W-004 / GAP-R-08) */}
      {taxonomy.length > 0 ? (
        <View className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Categories
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            <Pressable
              onPress={() => {
                setSelectedSubcategory(null);
                setSelectedService(null);
              }}
              className={`rounded-full px-4 py-2 border ${
                selectedSubcategory === null
                  ? "border-navy-900 bg-navy-900"
                  : "border-line bg-surface active:bg-surface-hover"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  selectedSubcategory === null ? "text-white" : "text-text-secondary"
                }`}
              >
                All Gear
              </Text>
            </Pressable>

            {taxonomy.map((cat: any) => (
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

              {nestedServices.map((svc: any) => (
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
      ) : null}

      {/* Price Range Presets (Web W-003 / GAP-R-07) */}
      <View className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
          Daily Rental Rate
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {PRICE_PRESETS.map((preset, idx) => (
            <Pressable
              key={preset.label}
              onPress={() => setPricePresetIdx(idx)}
              className={`rounded-full px-3.5 py-1.5 border ${
                pricePresetIdx === idx
                  ? "border-action bg-action text-white"
                  : "border-line bg-surface"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  pricePresetIdx === idx ? "text-white" : "text-text-secondary"
                }`}
              >
                {preset.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

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
