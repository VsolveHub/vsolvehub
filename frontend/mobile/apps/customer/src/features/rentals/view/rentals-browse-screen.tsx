import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, Text } from "@vsolve/mobile-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  FileCheck2,
  ShieldCheck,
  Tag,
  Wrench,
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
import type { RentalAsset } from "../model";
import { fetchRentals, fetchRentalTaxonomy } from "../queries";
import { RentalDetailDrawer } from "./rental-detail-drawer";
import { RentalRowCard } from "./rental-row-card";
import { RentalSidebarFilters } from "./rental-sidebar-filters";

const RENTAL_TRUST_BADGES: readonly TrustBadgeItem[] = [
  { label: "Verified tools & equipment", icon: ShieldCheck },
  { label: "Transparent daily rates", icon: Tag },
  { label: "Refundable security deposit", icon: FileCheck2 },
];

export function RentalsBrowseScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isNarrow = width < 400;
  const params = useLocalSearchParams<{ category?: string; service?: string }>();

  const [draftQuery, setDraftQuery] = useState("");
  const [draftPlace, setDraftPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedPlace, setAppliedPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);

  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(
    params.category ?? null,
  );
  const [selectedService, setSelectedService] = useState<string | null>(
    params.service ?? null,
  );
  const [selectedAsset, setSelectedAsset] = useState<RentalAsset | null>(null);

  // Sync route param updates
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

  const categoriesQuery = useCategories();
  const taxonomyQuery = useQuery({
    queryKey: ["rental-taxonomy"],
    queryFn: fetchRentalTaxonomy,
    staleTime: 60_000,
  });

  const rentalsQuery = useQuery({
    queryKey: [
      "rentals",
      appliedQuery,
      placeKey(appliedPlace),
      selectedSubcategory,
      selectedService,
      minPrice,
      maxPrice,
    ],
    queryFn: () =>
      fetchRentals({
        q: appliedQuery || undefined,
        ...placeQuery(appliedPlace),
        category: selectedSubcategory || undefined,
        service: selectedService || undefined,
        min_price: minPrice,
        max_price: maxPrice,
      }),
    staleTime: 30_000,
  });

  const rentals = rentalsQuery.data ?? [];
  const taxonomy = taxonomyQuery.data ?? [];

  const tiles = useMemo(() => {
    const rentalCategory = (categoriesQuery.data ?? []).find(
      (c) => c.slug === "rental-services",
    );
    return buildBrowseTiles({
      category: rentalCategory,
      taxonomy,
      allLabel: "All Equipment",
      allDescription:
        "Rent certified power tools, event gear, and equipment with verified partners and transparent daily rates.",
      fallbackIconKey: "wrench",
    });
  }, [categoriesQuery.data, taxonomy]);

  const activeTile = useMemo(() => {
    const slug = selectedSubcategory ?? ALL_TILE_SLUG;
    return tiles.find((t) => t.slug === slug) ?? tiles[0];
  }, [tiles, selectedSubcategory]);

  const currentCategory = taxonomy.find((cat) => cat.slug === selectedSubcategory);
  const nestedServices = currentCategory?.services ?? [];

  const handleSelectTile = (slug: string) => {
    setSelectedSubcategory(slug === ALL_TILE_SLUG ? null : slug);
    setSelectedService(null);
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

  const clearFilters = () => {
    setDraftQuery("");
    setDraftPlace(EMPTY_PLACE);
    setAppliedQuery("");
    setAppliedPlace(EMPTY_PLACE);
    setSelectedSubcategory(null);
    setSelectedService(null);
    setMinPrice(undefined);
    setMaxPrice(undefined);
  };

  const activeFilterCount =
    (appliedQuery ? 1 : 0) +
    (appliedPlace.name ? 1 : 0) +
    (selectedService ? 1 : 0) +
    (minPrice !== undefined || maxPrice !== undefined ? 1 : 0);

  const isFiltering = activeFilterCount > 0 || selectedSubcategory !== null;

  const activeDrawerAsset =
    selectedAsset && rentals.find((r) => r.id === selectedAsset.id)
      ? rentals.find((r) => r.id === selectedAsset.id)!
      : selectedAsset;

  return (
    <SplitBrowseShell
      sidebarTitle="Rentals"
      sidebarDescription="Tools, appliances & event equipment with refundable deposit protection."
      selectLabel="Select a category"
      seeAllLabel="See all categories"
      seeAllModalTitle="All Rental Categories"
      seeAllModalSubtitle="Choose an equipment category to filter listings"
      backLabel="Home"
      backHref="/"
      headerAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="My rental bookings"
          onPress={() => router.push("/rentals/mine" as never)}
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
        <RentalSidebarFilters
          draftQuery={draftQuery}
          onDraftQueryChange={setDraftQuery}
          onSearchSubmit={handleSearchSubmit}
          draftPlace={draftPlace}
          onPlaceChange={handlePlaceChange}
          nestedServices={nestedServices}
          selectedService={selectedService}
          onSelectService={setSelectedService}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onPriceChange={(min, max) => {
            setMinPrice(min);
            setMaxPrice(max);
          }}
          isFiltering={isFiltering}
          onClearFilters={clearFilters}
        />
      }
      heroSummary="Rent certified power tools, event gear, and equipment with verified partners and transparent daily rates."
      trustBadges={RENTAL_TRUST_BADGES}
      centerToolbar={
        <View className="gap-2">
          <NearbyNotice
            place={appliedPlace}
            count={rentals.length}
            nearestKm={rentals[0]?.distance_km ?? null}
            noun="item"
          />
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-xs font-medium text-text-secondary">
              {rentals.length} {rentals.length === 1 ? "item" : "items"} available
            </Text>
            {isFiltering ? (
              <Pressable onPress={clearFilters} hitSlop={8}>
                <Text className="text-xs font-bold text-action">Reset filters</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      }
      centerContent={
        rentalsQuery.isLoading ? (
          <View className="items-center justify-center py-12">
            <ActivityIndicator size="large" color="#0B1B3D" />
          </View>
        ) : rentalsQuery.error ? (
          <ErrorState
            title="Could not load rentals"
            message="Failed to load rental equipment."
            actionLabel="Retry"
            onAction={() => void rentalsQuery.refetch()}
          />
        ) : rentals.length === 0 ? (
          <EmptyState
            icon={<Wrench size={28} color="#94A3B8" />}
            title="No rental equipment found"
            description="Try adjusting your category or search filters to see more equipment."
            action={
              isFiltering ? (
                <Pressable
                  onPress={clearFilters}
                  className="rounded-xl bg-navy-900 px-4 py-2"
                >
                  <Text className="text-xs font-bold text-white">Clear filters</Text>
                </Pressable>
              ) : undefined
            }
          />
        ) : (
          <View className="gap-3">
            {rentals.map((asset) => (
              <RentalRowCard
                key={asset.id}
                asset={asset}
                isSelected={activeDrawerAsset?.id === asset.id}
                onRentNow={(item) => setSelectedAsset(item)}
              />
            ))}
          </View>
        )
      }
      drawerOpen={Boolean(activeDrawerAsset)}
      onCloseDrawer={() => setSelectedAsset(null)}
      drawerContent={
        activeDrawerAsset ? (
          <RentalDetailDrawer
            asset={activeDrawerAsset}
            onClose={() => setSelectedAsset(null)}
          />
        ) : null
      }
    />
  );
}
