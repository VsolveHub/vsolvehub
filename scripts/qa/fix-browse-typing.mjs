import fs from "fs";

// 1. Fix place-filter.tsx
{
  const filePath = "frontend/mobile/apps/customer/src/features/browse/place-filter.tsx";
  let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  content = content.replace(
    "const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);",
    "const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);",
  );
  fs.writeFileSync(filePath, content);
  console.log("Fixed place-filter.tsx");
}

// 2. Fix rentals-browse-screen.tsx
{
  const filePath = "frontend/mobile/apps/customer/src/features/rentals/view/rentals-browse-screen.tsx";
  let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

  content = content.replace(
    `  const clearFilters = () => {
    setDraftQuery("");
    setDraftLocation("");
    setAppliedQuery("");
    setAppliedLocation("");`,
    `  const clearFilters = () => {
    setDraftQuery("");
    setDraftPlace(EMPTY_PLACE);
    setAppliedQuery("");
    setAppliedPlace(EMPTY_PLACE);`,
  );

  content = content.replace(
    `  const isFiltering =
    appliedQuery !== "" ||
    appliedLocation !== "" ||`,
    `  const isFiltering =
    appliedQuery !== "" ||
    appliedPlace.name !== "" ||`,
  );

  fs.writeFileSync(filePath, content);
  console.log("Fixed rentals-browse-screen.tsx");
}

// 3. Fix stays-browse-screen.tsx
{
  const filePath = "frontend/mobile/apps/customer/src/features/stays/view/stays-browse-screen.tsx";
  let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

  // Query replacement
  const oldQuery = `  const staysQuery = useQuery({
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
  });`;

  const newQuery = `  const staysQuery = useQuery({
    queryKey: [
      "stays",
      appliedQuery,
      placeKey(appliedPlace),
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
        ...placeQuery(appliedPlace),
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

  const handlePlaceChange = (nextPlace: PlaceFilterValue, applyNow: boolean) => {
    setDraftPlace(nextPlace);
    if (applyNow) {
      setAppliedPlace(nextPlace);
      setAppliedQuery(draftQuery);
      setVisible(6);
    }
  };`;

  content = content.replace(oldQuery, newQuery);

  // Search submit & clear
  content = content.replace(
    `  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
    setVisible(6);
  };

  const clearAllFilters = () => {
    setDraftQuery("");
    setDraftLocation("");
    setAppliedQuery("");
    setAppliedLocation("");`,
    `  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedPlace(draftPlace);
    setVisible(6);
  };

  const clearAllFilters = () => {
    setDraftQuery("");
    setDraftPlace(EMPTY_PLACE);
    setAppliedQuery("");
    setAppliedPlace(EMPTY_PLACE);`,
  );

  // hasActiveFilters
  content = content.replace(
    `  const hasActiveFilters = Boolean(
    appliedQuery ||
      appliedLocation ||`,
    `  const hasActiveFilters = Boolean(
    appliedQuery ||
      appliedPlace.name ||`,
  );

  // Results text
  content = content.replace(
    '{appliedLocation ? ` in "${appliedLocation}"` : ""}',
    '{appliedPlace.name ? ` in "${appliedPlace.name}"` : ""}',
  );

  fs.writeFileSync(filePath, content);
  console.log("Fixed stays-browse-screen.tsx");
}

// 4. Fix desktop-stays-browse.tsx
{
  const filePath = "frontend/mobile/apps/customer/src/features/stays/view/desktop-stays-browse.tsx";
  let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

  // Add imports
  content = content.replace(
    'import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";',
    `import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";
import { PlaceFilter } from "@/features/browse/place-filter";
import {
  EMPTY_PLACE,
  NearbyNotice,
  placeKey,
  placeQuery,
  type PlaceFilterValue,
} from "@/features/browse/nearby";`,
  );

  // Query replacement
  const oldQuery = `  const {
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
  });`;

  const newQuery = `  const {
    data: stays = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "stays",
      appliedQuery,
      placeKey(appliedPlace),
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
        ...placeQuery(appliedPlace),
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

  const handlePlaceChange = (nextPlace: PlaceFilterValue, applyNow: boolean) => {
    setDraftPlace(nextPlace);
    if (applyNow) {
      setAppliedPlace(nextPlace);
      setAppliedQuery(draftQuery);
      setVisible(6);
    }
  };`;

  content = content.replace(oldQuery, newQuery);

  // Search submit & clear
  content = content.replace(
    `  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
    setVisible(6);
  };

  const clearFilters = () => {
    setDraftQuery("");
    setDraftLocation("");
    setAppliedQuery("");
    setAppliedLocation("");`,
    `  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedPlace(draftPlace);
    setVisible(6);
  };

  const clearFilters = () => {
    setDraftQuery("");
    setDraftPlace(EMPTY_PLACE);
    setAppliedQuery("");
    setAppliedPlace(EMPTY_PLACE);`,
  );

  // Replace location input in desktop JSX
  const oldDesktopInput = `              <View className="flex-row items-center rounded-xl border border-line bg-surface-sunken px-3.5 py-2">
                <MapPin size={16} color={THEME_COLORS.muted} />
                <TextInput
                  placeholder="City or area (e.g. Hyderabad, Gachibowli)"
                  placeholderTextColor="rgba(107,101,96,0.6)"
                  value={draftLocation}
                  onChangeText={setDraftLocation}
                  onSubmitEditing={handleSearchSubmit}
                  returnKeyType="search"
                  className="ml-2 flex-1 text-sm text-navy-900"
                />
                {draftLocation ? (
                  <Pressable onPress={() => setDraftLocation("")}>
                    <X size={14} color={THEME_COLORS.muted} />
                  </Pressable>
                ) : null}
              </View>`;

  const newDesktopInput = `              <PlaceFilter
                value={draftPlace}
                onChange={handlePlaceChange}
                placeholder="City or area (e.g. Hyderabad, Gachibowli)"
                onSubmit={handleSearchSubmit}
              />`;

  content = content.replace(oldDesktopInput, newDesktopInput);

  // Results text in desktop
  content = content.replace(
    '{appliedLocation ? ` in "${appliedLocation}"` : ""}',
    '{appliedPlace.name ? ` in "${appliedPlace.name}"` : ""}',
  );

  fs.writeFileSync(filePath, content);
  console.log("Fixed desktop-stays-browse.tsx");
}

