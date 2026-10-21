import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  Building2,
  Check,
  ChevronDown,
  Coffee,
  FileCheck2,
  Filter,
  Layers,
  MapPin,
  Search,
  Wind,
  X,
} from "lucide-react-native";
import { useState } from "react";
import {
  FlatList,
  Modal,
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
import { THEME_COLORS } from "../theme-colors";
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

  // Dropdown Picker Modal states
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [tenantModalOpen, setTenantModalOpen] = useState(false);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [draftMinStr, setDraftMinStr] = useState("");
  const [draftMaxStr, setDraftMaxStr] = useState("");

  // Pagination
  const [visible, setVisible] = useState(6);

  const taxonomyQuery = useQuery({
    queryKey: ["stay-taxonomy"],
    queryFn: fetchStayTaxonomy,
    staleTime: 5 * 60 * 1000,
  });

  const taxonomy = taxonomyQuery.data ?? [];
  const activeCategory = taxonomy.find((c) => c.slug === selectedCategorySlug);
  const subServices = activeCategory?.services ?? [];

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
    <>
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
                <Building2 size={13} color={THEME_COLORS.blue300} />
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
                <FileCheck2 size={16} color={THEME_COLORS.white} />
                <Text className="text-xs font-bold text-white">My Enquiries</Text>
              </View>
              <Text className="text-xs font-semibold text-brand">View Status →</Text>
            </Pressable>

            {/* Search Form with Submit Action */}
            <View className="mt-5 gap-2 rounded-2xl bg-surface p-2.5 shadow-sm">
              <View className="flex-row items-center rounded-xl border border-line bg-surface-sunken px-3 py-2">
                <Search size={16} color={THEME_COLORS.muted} />
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
                    <X size={14} color={THEME_COLORS.muted} />
                  </Pressable>
                ) : null}
              </View>

              <View className="flex-row items-center rounded-xl border border-line bg-surface-sunken px-3 py-2">
                <MapPin size={16} color={THEME_COLORS.muted} />
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
                    <X size={14} color={THEME_COLORS.muted} />
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

          {/* Filters Section: Clean & Professional Dropdown Filter Bar */}
          <View className="gap-2">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="items-center gap-2 py-0.5"
            >
              {/* 1. Category Dropdown Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Filter by property type"
                onPress={() => setCategoryModalOpen(true)}
                className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 shadow-2xs ${
                  !isAllCategories
                    ? "border-navy-900 bg-navy-900"
                    : "border-line bg-surface active:bg-surface-sunken"
                }`}
              >
                <Building2
                  size={13}
                  color={!isAllCategories ? THEME_COLORS.white : THEME_COLORS.muted}
                />
                <Text
                  numberOfLines={1}
                  className={`text-xs font-bold ${
                    !isAllCategories ? "text-white" : "text-navy-900"
                  }`}
                >
                  {activeCategory
                    ? selectedServiceSlug
                      ? `${activeCategory.name} • ${subServices.find((s) => s.slug === selectedServiceSlug)?.name || ""}`
                      : activeCategory.name
                    : "All Stays"}
                </Text>
                <ChevronDown
                  size={13}
                  color={!isAllCategories ? THEME_COLORS.white : THEME_COLORS.muted}
                />
              </Pressable>

              {/* 2. Tenant Preference Dropdown Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Filter by tenant preference"
                onPress={() => setTenantModalOpen(true)}
                className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 shadow-2xs ${
                  tenantPreference
                    ? "border-navy-900 bg-navy-900"
                    : "border-line bg-surface active:bg-surface-sunken"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    tenantPreference ? "text-white" : "text-navy-900"
                  }`}
                >
                  For: {TENANT_PREFERENCES.find((t) => t.value === tenantPreference)?.label || "Anyone"}
                </Text>
                <ChevronDown
                  size={13}
                  color={tenantPreference ? THEME_COLORS.white : THEME_COLORS.muted}
                />
              </Pressable>

              {/* 3. Price Range Dropdown Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Filter by price range"
                onPress={() => {
                  setDraftMinStr(minPrice !== undefined ? String(Math.round(minPrice / 100)) : "");
                  setDraftMaxStr(maxPrice !== undefined ? String(Math.round(maxPrice / 100)) : "");
                  setPriceModalOpen(true);
                }}
                className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 shadow-2xs ${
                  minPrice !== undefined || maxPrice !== undefined
                    ? "border-brand bg-brand"
                    : "border-line bg-surface active:bg-surface-sunken"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    minPrice !== undefined || maxPrice !== undefined
                      ? "text-white"
                      : "text-navy-900"
                  }`}
                >
                  {minPrice !== undefined || maxPrice !== undefined
                    ? `${minPrice ? `₹${Math.round(minPrice / 100)}` : "₹0"} – ${
                        maxPrice && maxPrice <= 2_000_000
                          ? `₹${Math.round(maxPrice / 100)}`
                          : "₹20k+"
                      }`
                    : "Price"}
                </Text>
                <ChevronDown
                  size={13}
                  color={
                    minPrice !== undefined || maxPrice !== undefined
                      ? THEME_COLORS.white
                      : THEME_COLORS.muted
                  }
                />
              </Pressable>

              {/* 4. Sort Dropdown Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sort stays"
                onPress={() => setSortModalOpen(true)}
                className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 shadow-2xs ${
                  sort !== "newest"
                    ? "border-navy-900 bg-navy-900"
                    : "border-line bg-surface active:bg-surface-sunken"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    sort !== "newest" ? "text-white" : "text-navy-900"
                  }`}
                >
                  Sort: {currentSortLabel}
                </Text>
                <ChevronDown
                  size={13}
                  color={sort !== "newest" ? THEME_COLORS.white : THEME_COLORS.muted}
                />
              </Pressable>

              <View className="h-4 w-px bg-line self-center" />

              {/* Quick AC chip */}
              <Pressable
                onPress={() => {
                  setFilterAc((curr) => (curr ? undefined : true));
                  setVisible(6);
                }}
                className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 border ${
                  filterAc
                    ? "border-brand bg-brand"
                    : "border-line bg-surface active:bg-surface-hover"
                }`}
              >
                <Wind
                  size={13}
                  color={filterAc ? THEME_COLORS.white : THEME_COLORS.muted}
                />
                <Text
                  className={`text-xs font-bold ${filterAc ? "text-white" : "text-text-secondary"}`}
                >
                  AC
                </Text>
              </Pressable>

              {/* Quick Meals chip */}
              <Pressable
                onPress={() => {
                  setFilterFood((curr) => (curr ? undefined : true));
                  setVisible(6);
                }}
                className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 border ${
                  filterFood
                    ? "border-brand bg-brand"
                    : "border-line bg-surface active:bg-surface-hover"
                }`}
              >
                <Coffee
                  size={13}
                  color={filterFood ? THEME_COLORS.white : THEME_COLORS.muted}
                />
                <Text
                  className={`text-xs font-bold ${filterFood ? "text-white" : "text-text-secondary"}`}
                >
                  Meals
                </Text>
              </Pressable>

              {/* Reset all button if active */}
              {hasActiveFilters ? (
                <Pressable
                  onPress={clearAllFilters}
                  className="flex-row items-center gap-1 rounded-full bg-surface-hover px-3 py-2 border border-line/60 active:bg-surface-sunken"
                >
                  <X size={12} color={THEME_COLORS.muted} />
                  <Text className="text-xs font-bold text-text-muted">Reset</Text>
                </Pressable>
              ) : null}
            </ScrollView>
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

      {/* 1. Category Selection Modal */}
      <Modal
        visible={categoryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center p-4"
          onPress={() => setCategoryModalOpen(false)}
        >
          <Pressable
            className="w-full max-w-sm rounded-3xl border border-line bg-surface p-5 shadow-raised max-h-[80%]"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between pb-3 border-b border-line">
              <View className="flex-row items-center gap-2">
                <Building2 size={18} color={THEME_COLORS.brand} />
                <Text className="text-base font-bold text-navy-900">
                  Property Type
                </Text>
              </View>
              <Pressable
                onPress={() => setCategoryModalOpen(false)}
                className="rounded-full p-1 active:bg-surface-sunken"
              >
                <X size={18} color={THEME_COLORS.muted} />
              </Pressable>
            </View>

            {/* Search within categories */}
            <View className="mt-3 flex-row items-center rounded-xl bg-surface-sunken px-3 py-2 border border-line/40">
              <Search size={14} color={THEME_COLORS.muted} />
              <TextInput
                placeholder="Search categories..."
                placeholderTextColor="rgba(117,108,94,0.6)"
                value={categorySearch}
                onChangeText={setCategorySearch}
                className="ml-2 flex-1 text-xs text-navy-900 p-0"
              />
              {categorySearch ? (
                <Pressable onPress={() => setCategorySearch("")}>
                  <X size={14} color={THEME_COLORS.muted} />
                </Pressable>
              ) : null}
            </View>

            <ScrollView className="mt-3" showsVerticalScrollIndicator={false}>
              {/* All Stays option */}
              {(!categorySearch || "all stays".includes(categorySearch.toLowerCase())) && (
                <Pressable
                  onPress={() => {
                    setSelectedCategorySlug(undefined);
                    setSelectedServiceSlug(undefined);
                    setVisible(6);
                    setCategoryModalOpen(false);
                  }}
                  className={`flex-row items-center justify-between p-3 rounded-xl border mb-1.5 ${
                    isAllCategories
                      ? "border-navy-900 bg-navy-900/5"
                      : "border-transparent active:bg-surface-sunken"
                  }`}
                >
                  <View className="flex-row items-center gap-2.5">
                    <Layers size={16} color={isAllCategories ? THEME_COLORS.navy : THEME_COLORS.muted} />
                    <Text className={`text-xs font-bold ${isAllCategories ? "text-navy-900" : "text-text-secondary"}`}>
                      All Stays
                    </Text>
                  </View>
                  {isAllCategories && <Check size={16} color={THEME_COLORS.navy} />}
                </Pressable>
              )}

              {taxonomy
                .filter((cat) =>
                  !categorySearch
                    ? true
                    : cat.name.toLowerCase().includes(categorySearch.toLowerCase())
                )
                .map((cat) => {
                  const isSelected = selectedCategorySlug === cat.slug;
                  const catServices = cat.services ?? [];
                  return (
                    <View key={cat.id || cat.slug} className="mb-1.5">
                      <Pressable
                        onPress={() => {
                          setSelectedCategorySlug(cat.slug);
                          setSelectedServiceSlug(undefined);
                          setVisible(6);
                          if (catServices.length === 0) {
                            setCategoryModalOpen(false);
                          }
                        }}
                        className={`flex-row items-center justify-between p-3 rounded-xl border ${
                          isSelected
                            ? "border-navy-900 bg-navy-900/5"
                            : "border-transparent active:bg-surface-sunken"
                        }`}
                      >
                        <Text className={`text-xs font-bold ${isSelected ? "text-navy-900 font-extrabold" : "text-text-secondary"}`}>
                          {cat.name}
                        </Text>
                        {isSelected && <Check size={16} color={THEME_COLORS.navy} />}
                      </Pressable>

                      {/* If category is selected and has sub-services, show them */}
                      {isSelected && catServices.length > 0 && (
                        <View className="ml-4 pl-3 border-l-2 border-line my-1 gap-1">
                          <Pressable
                            onPress={() => {
                              setSelectedServiceSlug(undefined);
                              setVisible(6);
                              setCategoryModalOpen(false);
                            }}
                            className={`flex-row items-center justify-between py-1.5 px-2 rounded-lg ${
                              !selectedServiceSlug ? "bg-brand/10" : "active:bg-surface-sunken"
                            }`}
                          >
                            <Text className={`text-[11px] font-bold ${!selectedServiceSlug ? "text-brand" : "text-text-secondary"}`}>
                              All {cat.name}
                            </Text>
                            {!selectedServiceSlug && <Check size={14} color={THEME_COLORS.brand} />}
                          </Pressable>
                          {catServices.map((svc) => {
                            const isSvcSelected = selectedServiceSlug === svc.slug;
                            return (
                              <Pressable
                                key={svc.id || svc.slug}
                                onPress={() => {
                                  setSelectedServiceSlug(svc.slug);
                                  setVisible(6);
                                  setCategoryModalOpen(false);
                                }}
                                className={`flex-row items-center justify-between py-1.5 px-2 rounded-lg ${
                                  isSvcSelected ? "bg-brand/10" : "active:bg-surface-sunken"
                                }`}
                              >
                                <Text className={`text-[11px] ${isSvcSelected ? "text-brand font-bold" : "text-text-secondary"}`}>
                                  {svc.name}
                                </Text>
                                {isSvcSelected && <Check size={14} color={THEME_COLORS.brand} />}
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 2. Tenant Preference Modal */}
      <Modal
        visible={tenantModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTenantModalOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center p-4"
          onPress={() => setTenantModalOpen(false)}
        >
          <Pressable
            className="w-full max-w-sm rounded-3xl border border-line bg-surface p-5 shadow-raised"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between pb-3 border-b border-line">
              <Text className="text-base font-bold text-navy-900">
                Tenant Preference
              </Text>
              <Pressable
                onPress={() => setTenantModalOpen(false)}
                className="rounded-full p-1 active:bg-surface-sunken"
              >
                <X size={18} color={THEME_COLORS.muted} />
              </Pressable>
            </View>

            <View className="mt-3 gap-1">
              {TENANT_PREFERENCES.map(({ value, label }) => {
                const isSelected = (tenantPreference ?? "") === value;
                return (
                  <Pressable
                    key={value || "all"}
                    onPress={() => {
                      setTenantPreference(value || undefined);
                      setVisible(6);
                      setTenantModalOpen(false);
                    }}
                    className={`flex-row items-center justify-between p-3 rounded-xl border ${
                      isSelected
                        ? "border-navy-900 bg-navy-900/5"
                        : "border-transparent active:bg-surface-sunken"
                    }`}
                  >
                    <Text className={`text-xs font-bold ${isSelected ? "text-navy-900" : "text-text-secondary"}`}>
                      {label}
                    </Text>
                    {isSelected && <Check size={16} color={THEME_COLORS.navy} />}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 3. Price Range Modal */}
      <Modal
        visible={priceModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPriceModalOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center p-4"
          onPress={() => setPriceModalOpen(false)}
        >
          <Pressable
            className="w-full max-w-sm rounded-3xl border border-line bg-surface p-5 shadow-raised"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between pb-3 border-b border-line">
              <Text className="text-base font-bold text-navy-900">
                Price range / month
              </Text>
              <Pressable
                onPress={() => setPriceModalOpen(false)}
                className="rounded-full p-1 active:bg-surface-sunken"
              >
                <X size={18} color={THEME_COLORS.muted} />
              </Pressable>
            </View>

            <Text className="mt-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Quick Presets
            </Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
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
                      setDraftMinStr(preset.min ? String(preset.min / 100) : "");
                      setDraftMaxStr(preset.max ? String(preset.max / 100) : "");
                      setVisible(6);
                      setPriceModalOpen(false);
                    }}
                    className={`rounded-full px-3 py-1.5 border ${
                      isSelected
                        ? "border-brand bg-brand"
                        : "border-line bg-surface-sunken active:bg-surface-hover"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? "text-white" : "text-text-secondary"
                      }`}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="mt-4 text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Custom Range (₹)
            </Text>
            <View className="mt-2 flex-row items-center gap-2">
              <View className="flex-1 flex-row items-center rounded-xl border border-line bg-surface-sunken px-3 py-2">
                <Text className="text-xs font-bold text-text-muted mr-1">₹</Text>
                <TextInput
                  placeholder="Min"
                  placeholderTextColor="rgba(107,101,96,0.6)"
                  keyboardType="numeric"
                  value={draftMinStr}
                  onChangeText={setDraftMinStr}
                  className="flex-1 text-xs text-navy-900 p-0"
                />
              </View>
              <Text className="text-xs text-text-muted">to</Text>
              <View className="flex-1 flex-row items-center rounded-xl border border-line bg-surface-sunken px-3 py-2">
                <Text className="text-xs font-bold text-text-muted mr-1">₹</Text>
                <TextInput
                  placeholder="Max"
                  placeholderTextColor="rgba(107,101,96,0.6)"
                  keyboardType="numeric"
                  value={draftMaxStr}
                  onChangeText={setDraftMaxStr}
                  className="flex-1 text-xs text-navy-900 p-0"
                />
              </View>
            </View>

            <View className="mt-5 flex-row items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onPress={() => {
                  setMinPrice(undefined);
                  setMaxPrice(undefined);
                  setMinInputStr("");
                  setMaxInputStr("");
                  setDraftMinStr("");
                  setDraftMaxStr("");
                  setVisible(6);
                  setPriceModalOpen(false);
                }}
              >
                <Text className="text-xs font-bold text-navy-900">Reset</Text>
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onPress={() => {
                  const minVal = parseInt(draftMinStr, 10);
                  const maxVal = parseInt(draftMaxStr, 10);
                  setMinPrice(!isNaN(minVal) && minVal >= 0 ? minVal * 100 : undefined);
                  setMaxPrice(!isNaN(maxVal) && maxVal > 0 ? maxVal * 100 : undefined);
                  setMinInputStr(draftMinStr);
                  setMaxInputStr(draftMaxStr);
                  setVisible(6);
                  setPriceModalOpen(false);
                }}
              >
                <Text className="text-xs font-bold text-white">Apply</Text>
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 4. Sort Options Modal */}
      <Modal
        visible={sortModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortModalOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center p-4"
          onPress={() => setSortModalOpen(false)}
        >
          <Pressable
            className="w-full max-w-sm rounded-3xl border border-line bg-surface p-5 shadow-raised"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between pb-3 border-b border-line">
              <Text className="text-base font-bold text-navy-900">
                Sort Stays By
              </Text>
              <Pressable
                onPress={() => setSortModalOpen(false)}
                className="rounded-full p-1 active:bg-surface-sunken"
              >
                <X size={18} color={THEME_COLORS.muted} />
              </Pressable>
            </View>

            <View className="mt-3 gap-1">
              {SORT_OPTIONS.map((opt) => {
                const isSelected = sort === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      setSort(opt.value);
                      setVisible(6);
                      setSortModalOpen(false);
                    }}
                    className={`flex-row items-center justify-between p-3 rounded-xl border ${
                      isSelected
                        ? "border-navy-900 bg-navy-900/5"
                        : "border-transparent active:bg-surface-sunken"
                    }`}
                  >
                    <Text className={`text-xs font-bold ${isSelected ? "text-navy-900" : "text-text-secondary"}`}>
                      {opt.label}
                    </Text>
                    {isSelected && <Check size={16} color={THEME_COLORS.navy} />}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
