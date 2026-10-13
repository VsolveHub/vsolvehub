import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  Building2,
  Coffee,
  FileCheck2,
  Layers,
  MapPin,
  Search,
  Wind,
  X,
} from "lucide-react-native";
import { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";

import {
  SORT_OPTIONS,
  TENANT_PREFERENCES,
  type StayPropertySummary,
} from "../model";
import { fetchStays, fetchStayTaxonomy } from "../queries";
import { StayCard } from "./stay-card";

const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: "All Rates" },
  { label: "Under ₹5k", max: 500_000 },
  { label: "₹5k – ₹10k", min: 500_000, max: 1_000_000 },
  { label: "₹10k – ₹15k", min: 1_000_000, max: 1_500_000 },
  { label: "₹15k – ₹20k", min: 1_500_000, max: 2_000_000 },
  { label: "₹20k+", min: 2_000_000 },
];

export function StaysBrowseScreen() {
  const router = useRouter();

  // Search State: Draft vs Applied
  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");

  // Filters
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | undefined>(undefined);
  const [selectedServiceSlug, setSelectedServiceSlug] = useState<string | undefined>(undefined);
  const [filterAc, setFilterAc] = useState<boolean | undefined>(undefined);
  const [filterFood, setFilterFood] = useState<boolean | undefined>(undefined);
  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [minInputStr, setMinInputStr] = useState<string>("");
  const [maxInputStr, setMaxInputStr] = useState<string>("");
  const [tenantPreference, setTenantPreference] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<string>("newest");

  // Pagination
  const [visible, setVisible] = useState(6);

  const taxonomyQuery = useQuery({
    queryKey: ["stay-taxonomy"],
    queryFn: fetchStayTaxonomy,
    staleTime: 5 * 60 * 1000,
  });

  const taxonomy = (taxonomyQuery.data as any[]) ?? [];
  const activeCategory = taxonomy.find((c) => c.slug === selectedCategorySlug);
  const subServices = (activeCategory?.services as any[]) ?? [];

  const staysQuery = useQuery({
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
        q: appliedQuery || undefined,
        location: appliedLocation || undefined,
        service: selectedServiceSlug || selectedCategorySlug || undefined,
        ac: filterAc,
        food: filterFood,
        min_price: minPrice,
        max_price: maxPrice,
        tenant_preference: tenantPreference || undefined,
        sort,
        limit: 100,
        offset: 0,
      }),
    staleTime: 30_000,
  });

  const stays = (staysQuery.data as StayPropertySummary[]) ?? [];
  const displayedStays = stays.slice(0, visible);

  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
    setVisible(6);
  };

  const clearAllFilters = () => {
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
    setMinInputStr("");
    setMaxInputStr("");
    setTenantPreference(undefined);
    setSort("newest");
    setVisible(6);
  };

  const hasActiveFilters = Boolean(
    appliedQuery ||
      appliedLocation ||
      selectedCategorySlug ||
      selectedServiceSlug ||
      filterAc !== undefined ||
      filterFood !== undefined ||
      minPrice !== undefined ||
      maxPrice !== undefined ||
      tenantPreference ||
      sort !== "newest"
  );

  const isAllCategories = !selectedCategorySlug && !selectedServiceSlug;

  const currentSortLabel =
    SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Newest First";

  return (
    <FlatList
      data={staysQuery.isLoading ? [] : displayedStays}
      keyExtractor={(item) => item.id}
      contentContainerClassName="gap-4 px-4 py-4 pb-16 bg-canvas"
      refreshControl={
        <RefreshControl
          refreshing={staysQuery.isRefetching}
          onRefresh={() => void staysQuery.refetch()}
        />
      }
      ListHeaderComponent={
        <View className="gap-5 pb-2">
          {/* Hero Section */}
          <View className="overflow-hidden rounded-3xl bg-navy-900 p-6 shadow-md">
            <View className="gap-2.5">
              <View className="self-start flex-row items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/15 px-3 py-1">
                <Building2 size={13} color="#93c5fd" />
                <Text className="text-[11px] font-bold text-sky-200">
                  Verified Rooms, PG & Short Stays
                </Text>
              </View>

              <Text className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                Find Rooms, PG & Hotels
              </Text>

              <Text className="text-xs font-medium leading-relaxed text-white/70">
                Verified coliving, PG accommodation, and short stay rooms. Instant date quote
                calculations and direct host communication.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View my enquiries and visits"
              onPress={() => router.push("/stays/mine" as never)}
              className="mt-4 flex-row items-center justify-between rounded-xl border border-white/20 bg-white/10 px-4 py-3 active:bg-white/20"
            >
              <View className="flex-row items-center gap-2">
                <FileCheck2 size={16} color="#ffffff" />
                <Text className="text-xs font-bold text-white">My Enquiries</Text>
              </View>
              <Text className="text-xs font-semibold text-brand">View Status →</Text>
            </Pressable>

            {/* Search Form with Submit Action */}
            <View className="mt-5 gap-2 rounded-2xl bg-surface p-2.5 shadow-sm">
              <View className="flex-row items-center rounded-xl border border-line bg-surface-sunken px-3 py-2">
                <Search size={16} color="#6B6560" />
                <TextInput
                  placeholder="Search properties (e.g. Lakeview PG, Executive)"
                  placeholderTextColor="rgba(107,101,96,0.6)"
                  value={draftQuery}
                  onChangeText={setDraftQuery}
                  onSubmitEditing={handleSearchSubmit}
                  returnKeyType="search"
                  className="ml-2 flex-1 text-xs text-navy-900"
                />
                {draftQuery ? (
                  <Pressable onPress={() => setDraftQuery("")}>
                    <X size={14} color="#6B6560" />
                  </Pressable>
                ) : null}
              </View>

              <View className="flex-row items-center rounded-xl border border-line bg-surface-sunken px-3 py-2">
                <MapPin size={16} color="#6B6560" />
                <TextInput
                  placeholder="City or Area (e.g. Hyderabad, Gachibowli)"
                  placeholderTextColor="rgba(107,101,96,0.6)"
                  value={draftLocation}
                  onChangeText={setDraftLocation}
                  onSubmitEditing={handleSearchSubmit}
                  returnKeyType="search"
                  className="ml-2 flex-1 text-xs text-navy-900"
                />
                {draftLocation ? (
                  <Pressable onPress={() => setDraftLocation("")}>
                    <X size={14} color="#6B6560" />
                  </Pressable>
                ) : null}
              </View>

              <Button
                variant="primary"
                onPress={handleSearchSubmit}
                className="w-full rounded-xl py-3"
              >
                <Text className="text-xs font-bold text-white">Search Stays</Text>
              </Button>
            </View>
          </View>

          {/* Filters Section */}
          <View className="gap-3">
            {/* Row 1: Categories + Amenities Quick Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              <Pressable
                onPress={() => {
                  setSelectedCategorySlug(undefined);
                  setSelectedServiceSlug(undefined);
                  setVisible(6);
                }}
                className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5 border ${
                  isAllCategories
                    ? "border-navy-900 bg-navy-900"
                    : "border-line bg-surface active:bg-surface-hover"
                }`}
              >
                <Layers size={13} color={isAllCategories ? "#ffffff" : "#6B6560"} />
                <Text
                  className={`text-xs font-bold ${
                    isAllCategories ? "text-white" : "text-text-secondary"
                  }`}
                >
                  All Stays
                </Text>
              </Pressable>

              {taxonomy.map((cat: any) => {
                const isSelected = selectedCategorySlug === cat.slug;
                return (
                  <Pressable
                    key={cat.id || cat.slug}
                    onPress={() => {
                      setSelectedCategorySlug(isSelected ? undefined : cat.slug);
                      setSelectedServiceSlug(undefined);
                      setVisible(6);
                    }}
                    className={`rounded-full px-3.5 py-1.5 border ${
                      isSelected
                        ? "border-navy-900 bg-navy-900"
                        : "border-line bg-surface active:bg-surface-hover"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? "text-white" : "text-text-secondary"
                      }`}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}

              <View className="h-5 w-px bg-line self-center" />

              {/* Quick AC chip */}
              <Pressable
                onPress={() => {
                  setFilterAc((curr) => (curr ? undefined : true));
                  setVisible(6);
                }}
                className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5 border ${
                  filterAc
                    ? "border-brand bg-brand"
                    : "border-line bg-surface active:bg-surface-hover"
                }`}
              >
                <Wind size={13} color={filterAc ? "#ffffff" : "#6B6560"} />
                <Text
                  className={`text-xs font-bold ${filterAc ? "text-white" : "text-text-secondary"}`}
                >
                  AC Included
                </Text>
              </Pressable>

              {/* Quick Meals chip */}
              <Pressable
                onPress={() => {
                  setFilterFood((curr) => (curr ? undefined : true));
                  setVisible(6);
                }}
                className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5 border ${
                  filterFood
                    ? "border-brand bg-brand"
                    : "border-line bg-surface active:bg-surface-hover"
                }`}
              >
                <Coffee size={13} color={filterFood ? "#ffffff" : "#6B6560"} />
                <Text
                  className={`text-xs font-bold ${filterFood ? "text-white" : "text-text-secondary"}`}
                >
                  Meals Included
                </Text>
              </Pressable>
            </ScrollView>

            {/* Row 2: Sub-services inside chosen Category (Two-tier taxonomy GAP-S-06) */}
            {subServices.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                {subServices.map((svc: any) => {
                  const isSelected = selectedServiceSlug === svc.slug;
                  return (
                    <Pressable
                      key={svc.id || svc.slug}
                      onPress={() => {
                        setSelectedServiceSlug(isSelected ? undefined : svc.slug);
                        setVisible(6);
                      }}
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
                        {svc.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            {/* Row 3: Tenant Preference Chips (GAP-S-05) */}
            <View className="flex-row items-center gap-2">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                For
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                {TENANT_PREFERENCES.map(({ value, label }) => {
                  const isSelected = (tenantPreference ?? "") === value;
                  return (
                    <Pressable
                      key={value || "all"}
                      onPress={() => {
                        setTenantPreference(value || undefined);
                        setVisible(6);
                      }}
                      className={`rounded-full px-3 py-1 border ${
                        isSelected
                          ? "border-navy-900 bg-navy-900"
                          : "border-line bg-surface active:bg-surface-hover"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold ${
                          isSelected ? "text-white" : "text-text-secondary"
                        }`}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Row 4: Price Range Filter (GAP-S-04: presets + min/max inputs, 0-20k/mo in paise) */}
            <View className="gap-2 rounded-2xl border border-line bg-surface p-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-bold text-navy-900">
                  Price range / month
                </Text>
                <Text className="text-xs font-bold text-brand">
                  {minPrice ? `₹${Math.round(minPrice / 100)}` : "₹0"} –{" "}
                  {maxPrice && maxPrice <= 2_000_000 ? `₹${Math.round(maxPrice / 100)}` : "₹20,000+"}
                </Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                {PRICE_PRESETS.map((preset) => {
                  const isSelected =
                    minPrice === preset.min && maxPrice === preset.max;
                  return (
                    <Pressable
                      key={preset.label}
                      onPress={() => {
                        setMinPrice(preset.min);
                        setMaxPrice(preset.max);
                        setMinInputStr(preset.min ? String(preset.min / 100) : "");
                        setMaxInputStr(preset.max ? String(preset.max / 100) : "");
                        setVisible(6);
                      }}
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

              <View className="flex-row items-center gap-2 pt-1">
                <View className="flex-1 flex-row items-center rounded-xl border border-line bg-surface-sunken px-2.5 py-1.5">
                  <Text className="text-xs font-bold text-text-muted mr-1">₹</Text>
                  <TextInput
                    placeholder="Min"
                    placeholderTextColor="rgba(107,101,96,0.6)"
                    keyboardType="numeric"
                    value={minInputStr}
                    onChangeText={setMinInputStr}
                    onEndEditing={() => {
                      const val = parseInt(minInputStr, 10);
                      setMinPrice(!isNaN(val) && val >= 0 ? val * 100 : undefined);
                      setVisible(6);
                    }}
                    className="flex-1 text-xs text-navy-900 p-0"
                  />
                </View>
                <Text className="text-xs text-text-muted">to</Text>
                <View className="flex-1 flex-row items-center rounded-xl border border-line bg-surface-sunken px-2.5 py-1.5">
                  <Text className="text-xs font-bold text-text-muted mr-1">₹</Text>
                  <TextInput
                    placeholder="Max"
                    placeholderTextColor="rgba(107,101,96,0.6)"
                    keyboardType="numeric"
                    value={maxInputStr}
                    onChangeText={setMaxInputStr}
                    onEndEditing={() => {
                      const val = parseInt(maxInputStr, 10);
                      setMaxPrice(!isNaN(val) && val > 0 ? val * 100 : undefined);
                      setVisible(6);
                    }}
                    className="flex-1 text-xs text-navy-900 p-0"
                  />
                </View>
                {(minPrice !== undefined || maxPrice !== undefined) ? (
                  <Pressable
                    onPress={() => {
                      setMinPrice(undefined);
                      setMaxPrice(undefined);
                      setMinInputStr("");
                      setMaxInputStr("");
                      setVisible(6);
                    }}
                    className="rounded-lg bg-surface-hover px-2.5 py-1.5"
                  >
                    <Text className="text-[10px] font-bold text-text-muted">Reset</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Row 5: Sort Options (GAP-S-05) */}
            <View className="flex-row items-center gap-2">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Sort ({currentSortLabel}):
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                {SORT_OPTIONS.map((opt) => {
                  const isSelected = sort === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        setSort(opt.value);
                        setVisible(6);
                      }}
                      className={`rounded-full px-3 py-1 border ${
                        isSelected
                          ? "border-navy-900 bg-navy-900"
                          : "border-line bg-surface active:bg-surface-hover"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold ${
                          isSelected ? "text-white" : "text-text-secondary"
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* Results Summary Header */}
          <View className="flex-row items-center justify-between border-b border-line pb-2.5 pt-1">
            <Text className="text-xs font-semibold text-text-secondary">
              Showing <Text className="font-bold text-brand">{displayedStays.length}</Text> of{" "}
              <Text className="font-bold text-navy-900">{stays.length}</Text>{" "}
              {stays.length === 1 ? "stay" : "stays"}
              {appliedLocation ? ` in "${appliedLocation}"` : ""}
            </Text>

            {hasActiveFilters ? (
              <Pressable onPress={clearAllFilters} className="active:opacity-70">
                <Text className="text-xs font-bold text-brand">Reset Filters</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      }
      renderItem={({ item }) => <StayCard property={item} />}
      ListFooterComponent={
        stays.length > visible ? (
          <View className="mt-4 items-center">
            <Button
              variant="secondary"
              onPress={() => setVisible((curr) => curr + 6)}
              className="rounded-xl px-6 py-2.5"
            >
              <Text className="text-xs font-bold text-navy-900">
                Load more ({stays.length - visible} remaining)
              </Text>
            </Button>
          </View>
        ) : null
      }
      ListEmptyComponent={
        staysQuery.isLoading ? (
          <View className="gap-4">
            {[1, 2, 3].map((idx) => (
              <View key={idx} className="h-64 rounded-2xl bg-surface-sunken p-4 justify-between">
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </View>
            ))}
          </View>
        ) : staysQuery.isError ? (
          <ErrorState
            title="Could not load stay properties"
            message={(staysQuery.error as Error)?.message || "Check connection and retry."}
            actionLabel="Retry"
            onAction={() => void staysQuery.refetch()}
          />
        ) : (
          <EmptyState
            title="No stay properties found"
            description="Try broadening your filters or searching another area."
            action={
              <Button variant="secondary" size="sm" onPress={clearAllFilters}>
                <Text className="text-xs font-bold text-navy-900">Reset Filters</Text>
              </Button>
            }
          />
        )
      }
    />
  );
}
