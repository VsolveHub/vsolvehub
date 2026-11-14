import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, Text } from "@vsolve/mobile-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Building2,
  CalendarCheck2,
  FileCheck2,
  MessageSquare,
  ShieldCheck,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";

import {
  EMPTY_PLACE,
  NearbyNotice,
  placeKey,
  placeQuery,
  type PlaceFilterValue,
} from "@/features/browse/nearby";
import {
  SplitBrowseShell,
  type TrustBadgeItem,
} from "@/features/browse/split-browse-shell";
import {
  ALL_TILE_SLUG,
  buildBrowseTiles,
} from "@/features/browse/taxonomy-tiles";
import { useCategories } from "@/features/catalog/client-queries";
import type { StayPropertySummary } from "../model";
import { fetchStays, fetchStayTaxonomy } from "../queries";
import { StayDetailDrawer } from "./stay-detail-drawer";
import { StayRowCard } from "./stay-row-card";
import { StaySidebarFilters } from "./stay-sidebar-filters";

const STAY_TRUST_BADGES: readonly TrustBadgeItem[] = [
  { label: "Verified hosts & properties", icon: ShieldCheck },
  { label: "Instant date quotes", icon: CalendarCheck2 },
  { label: "Direct host communication", icon: MessageSquare },
];

export function StaysBrowseScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isNarrow = width < 400;
  const params = useLocalSearchParams<{ category?: string; service?: string }>();

  const [draftQuery, setDraftQuery] = useState("");
  const [draftPlace, setDraftPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedPlace, setAppliedPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);

  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | undefined>(
    params.category || undefined,
  );
  const [selectedServiceSlug, setSelectedServiceSlug] = useState<string | undefined>(
    params.service || undefined,
  );
  const [filterAc, setFilterAc] = useState<boolean | undefined>(undefined);
  const [filterFood, setFilterFood] = useState<boolean | undefined>(undefined);
  const [tenantPreference, setTenantPreference] = useState<string | undefined>(
    undefined,
  );
  const [sort, setSort] = useState<string>("newest");
  const [selectedProperty, setSelectedProperty] =
    useState<StayPropertySummary | null>(null);

  const categoriesQuery = useCategories();
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
      placeKey(appliedPlace),
      selectedCategorySlug,
      selectedServiceSlug,
      filterAc,
      filterFood,
      tenantPreference,
      sort,
    ],
    queryFn: () =>
      fetchStays({
        q: appliedQuery || undefined,
        ...placeQuery(appliedPlace),
        service: selectedServiceSlug || selectedCategorySlug || undefined,
        ac: filterAc,
        food: filterFood,
        tenant_preference: tenantPreference || undefined,
        sort,
        limit: 100,
        offset: 0,
      }),
    staleTime: 30_000,
  });

  const stays = (staysQuery.data as StayPropertySummary[]) ?? [];

  const tiles = useMemo(() => {
    const stayCategory = (categoriesQuery.data ?? []).find(
      (c) => c.slug === "rooms-pg-hostel-hotels",
    );
    return buildBrowseTiles({
      category: stayCategory,
      taxonomy: taxonomy.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug ?? c.id,
        services: c.services?.map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug ?? s.id,
        })),
      })),
      allLabel: "All Stays",
      allDescription:
        "Verified coliving, PG accommodation, hostels, and short stay rooms with direct host communication.",
      fallbackIconKey: "building",
    });
  }, [categoriesQuery.data, taxonomy]);

  const activeTile = useMemo(() => {
    const slug = selectedCategorySlug ?? ALL_TILE_SLUG;
    return tiles.find((t) => t.slug === slug) ?? tiles[0];
  }, [tiles, selectedCategorySlug]);

  const handleSelectTile = (slug: string) => {
    setSelectedCategorySlug(slug === ALL_TILE_SLUG ? undefined : slug);
    setSelectedServiceSlug(undefined);
  };

  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedPlace(draftPlace);
  };

  const handlePlaceChange = (nextPlace: PlaceFilterValue, applyNow: boolean) => {
    setDraftPlace(nextPlace);
    if (applyNow) {
      setAppliedPlace(nextPlace);
      setAppliedQuery(draftQuery);
    }
  };

  const clearAllFilters = () => {
    setDraftQuery("");
    setDraftPlace(EMPTY_PLACE);
    setAppliedQuery("");
    setAppliedPlace(EMPTY_PLACE);
    setSelectedCategorySlug(undefined);
    setSelectedServiceSlug(undefined);
    setFilterAc(undefined);
    setFilterFood(undefined);
    setTenantPreference(undefined);
    setSort("newest");
  };

  const activeFilterCount =
    (appliedQuery ? 1 : 0) +
    (appliedPlace.name ? 1 : 0) +
    (selectedServiceSlug ? 1 : 0) +
    (filterAc === true ? 1 : 0) +
    (filterFood === true ? 1 : 0) +
    (tenantPreference ? 1 : 0) +
    (sort !== "newest" ? 1 : 0);

  const hasActiveFilters = activeFilterCount > 0 || Boolean(selectedCategorySlug);

  const activeDrawerProperty =
    selectedProperty && stays.find((p) => p.id === selectedProperty.id)
      ? stays.find((p) => p.id === selectedProperty.id)!
      : selectedProperty;

  return (
    <SplitBrowseShell
      sidebarTitle="Stays"
      sidebarDescription="Rooms, PG accommodation, hostels & co-living spaces with verified hosts."
      selectLabel="Select stay type"
      seeAllLabel="See all stay types"
      seeAllModalTitle="All Stay Types"
      seeAllModalSubtitle="Choose a stay type to browse verified properties"
      backLabel="Home"
      backHref="/"
      headerAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="My stay enquiries"
          onPress={() => router.push("/stays/mine" as never)}
          className="flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1.5 shadow-2xs active:bg-surface-sunken"
        >
          <FileCheck2 size={13} color="#D97706" />
          <Text className="text-[11px] font-bold text-navy-900">
            {isNarrow ? "Bookings" : "My bookings"}
          </Text>
        </Pressable>
      }
      tiles={tiles}
      activeTile={activeTile}
      onSelectTile={handleSelectTile}
      activeFilterCount={activeFilterCount}
      sidebarFilters={
        <StaySidebarFilters
          draftQuery={draftQuery}
          onDraftQueryChange={setDraftQuery}
          onSearchSubmit={handleSearchSubmit}
          draftPlace={draftPlace}
          onPlaceChange={handlePlaceChange}
          subServices={subServices}
          selectedServiceSlug={selectedServiceSlug}
          onSelectServiceSlug={setSelectedServiceSlug}
          filterAc={filterAc}
          onToggleAc={() =>
            setFilterAc((prev) => (prev === true ? undefined : true))
          }
          filterFood={filterFood}
          onToggleFood={() =>
            setFilterFood((prev) => (prev === true ? undefined : true))
          }
          tenantPreference={tenantPreference}
          onSelectTenantPreference={setTenantPreference}
          sort={sort}
          onSelectSort={setSort}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAllFilters}
        />
      }
      heroSummary="Verified coliving, PG accommodation, hostels, and short stay rooms with direct host communication."
      trustBadges={STAY_TRUST_BADGES}
      centerToolbar={
        <View className="gap-2">
          <NearbyNotice
            place={appliedPlace}
            count={stays.length}
            nearestKm={stays[0]?.distance_km ?? null}
            noun="property"
          />
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-xs font-medium text-text-secondary">
              {stays.length} {stays.length === 1 ? "property" : "properties"}{" "}
              available
            </Text>
            {hasActiveFilters ? (
              <Pressable onPress={clearAllFilters} hitSlop={8}>
                <Text className="text-xs font-bold text-action">Reset filters</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      }
      centerContent={
        staysQuery.isLoading ? (
          <View className="items-center justify-center py-12">
            <ActivityIndicator size="large" color="#0B1B3D" />
          </View>
        ) : staysQuery.error ? (
          <ErrorState
            title="Could not load stays"
            message="Failed to load stays."
            actionLabel="Retry"
            onAction={() => void staysQuery.refetch()}
          />
        ) : stays.length === 0 ? (
          <EmptyState
            icon={<Building2 size={28} color="#94A3B8" />}
            title="No stays found"
            description="Try adjusting your stay type or location filters to see more properties."
            action={
              hasActiveFilters ? (
                <Pressable
                  onPress={clearAllFilters}
                  className="rounded-xl bg-navy-900 px-4 py-2"
                >
                  <Text className="text-xs font-bold text-white">Clear filters</Text>
                </Pressable>
              ) : undefined
            }
          />
        ) : (
          <View className="gap-3">
            {stays.map((property) => (
              <StayRowCard
                key={property.id}
                property={property}
                isSelected={activeDrawerProperty?.id === property.id}
                onCheckDates={(item) => setSelectedProperty(item)}
              />
            ))}
          </View>
        )
      }
      drawerOpen={Boolean(activeDrawerProperty)}
      onCloseDrawer={() => setSelectedProperty(null)}
      drawerContent={
        activeDrawerProperty ? (
          <StayDetailDrawer
            property={activeDrawerProperty}
            onClose={() => setSelectedProperty(null)}
          />
        ) : null
      }
    />
  );
}
