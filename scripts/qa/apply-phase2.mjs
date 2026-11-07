import fs from "fs";

// 1. Update rental-card.tsx
{
  const filePath = "frontend/mobile/apps/customer/src/features/rentals/view/rental-card.tsx";
  let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const target = `{asset.location_text ? (
          <View className="flex-row items-center gap-1.5">
            <MapPin size={14} color={COLOR_TOKENS.textMuted} />
            <Text className="text-xs text-text-secondary" numberOfLines={1}>
              {asset.location_text}
            </Text>
          </View>
        ) : null}`;

  const replacement = `{asset.location_text ? (
          <View className="flex-row items-center gap-1.5">
            <MapPin size={14} color={COLOR_TOKENS.textMuted} />
            <Text className="text-xs text-text-secondary" numberOfLines={1}>
              {asset.location_text}
            </Text>
            {asset.distance_km != null ? (
              <Text className="shrink-0 text-xs font-semibold text-navy-900">
                · {asset.distance_km} km away
              </Text>
            ) : null}
          </View>
        ) : null}`;

  if (!content.includes(target)) {
    console.error("rental-card target not found");
  } else {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content);
    console.log("Updated rental-card.tsx");
  }
}

// 2. Update stay-card.tsx
{
  const filePath = "frontend/mobile/apps/customer/src/features/stays/view/stay-card.tsx";
  let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const target = `{property.location_text ? (
          <View className="flex-row items-center gap-1">
            <MapPin size={12} color={THEME_COLORS.muted} />
            <Text className="flex-1 text-xs text-text-secondary" numberOfLines={1}>
              {property.location_text}
            </Text>
          </View>
        ) : null}`;

  const replacement = `{property.location_text ? (
          <View className="flex-row items-center gap-1">
            <MapPin size={12} color={THEME_COLORS.muted} />
            <Text className="text-xs text-text-secondary" numberOfLines={1}>
              {property.location_text}
            </Text>
            {property.distance_km != null ? (
              <Text className="shrink-0 text-xs font-semibold text-navy-900">
                · {property.distance_km} km away
              </Text>
            ) : null}
          </View>
        ) : null}`;

  if (!content.includes(target)) {
    console.error("stay-card target not found");
  } else {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content);
    console.log("Updated stay-card.tsx");
  }
}

// 3. Update rentals-browse-screen.tsx
{
  const filePath = "frontend/mobile/apps/customer/src/features/rentals/view/rentals-browse-screen.tsx";
  let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

  // Add imports
  const importTarget = 'import { RentalCard } from "./rental-card";';
  const importReplacement = `import { RentalCard } from "./rental-card";
import { PlaceFilter } from "@/features/browse/place-filter";
import {
  EMPTY_PLACE,
  NearbyNotice,
  placeKey,
  placeQuery,
  type PlaceFilterValue,
} from "@/features/browse/nearby";`;

  content = content.replace(importTarget, importReplacement);

  // Replace state
  const stateTarget = `  const [draftLocation, setDraftLocation] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");`;

  const stateReplacement = `  const [draftPlace, setDraftPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedPlace, setAppliedPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);`;

  content = content.replace(stateTarget, stateReplacement);

  // Replace rentalsQuery
  const queryTarget = `  const rentalsQuery = useQuery({
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
  });`;

  const queryReplacement = `  const rentalsQuery = useQuery({
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
  });`;

  content = content.replace(queryTarget, queryReplacement);

  // Replace handleSearchSubmit & add handlePlaceChange
  const submitTarget = `  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
  };`;

  const submitReplacement = `  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedPlace(draftPlace);
  };

  const handlePlaceChange = (nextPlace: PlaceFilterValue, applyNow: boolean) => {
    setDraftPlace(nextPlace);
    if (applyNow) {
      setAppliedPlace(nextPlace);
      setAppliedQuery(draftQuery);
    }
  };`;

  content = content.replace(submitTarget, submitReplacement);

  // Replace location input in JSX
  const locationInputTarget = `        <View className="flex-row items-center rounded-xl bg-canvas px-3 py-2 border border-line/60">
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
        </View>`;

  const locationInputReplacement = `        <PlaceFilter
          value={draftPlace}
          onChange={handlePlaceChange}
          placeholder="Location (e.g. Hyderabad, Ameerpet)"
          onSubmit={handleSearchSubmit}
        />`;

  content = content.replace(locationInputTarget, locationInputReplacement);

  // Add NearbyNotice above listing
  const noticeTarget = `<View className="gap-4">
          {rentals.map((asset) => (
            <RentalCard key={asset.id} asset={asset} />
          ))}`;

  const noticeReplacement = `<View className="gap-4">
          <NearbyNotice
            place={appliedPlace}
            noun="rentals"
            count={rentals.length}
            nearestKm={rentals[0]?.distance_km}
          />
          {rentals.map((asset) => (
            <RentalCard key={asset.id} asset={asset} />
          ))}`;

  content = content.replace(noticeTarget, noticeReplacement);

  fs.writeFileSync(filePath, content);
  console.log("Updated rentals-browse-screen.tsx");
}

// 4. Update stays-browse-screen.tsx (including fixing conditional hook)
{
  const filePath = "frontend/mobile/apps/customer/src/features/stays/view/stays-browse-screen.tsx";
  let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

  // Add imports
  const importTarget = 'import { StayCard } from "./stay-card";';
  const importReplacement = `import { StayCard } from "./stay-card";
import { PlaceFilter } from "@/features/browse/place-filter";
import {
  EMPTY_PLACE,
  NearbyNotice,
  placeKey,
  placeQuery,
  type PlaceFilterValue,
} from "@/features/browse/nearby";`;

  content = content.replace(importTarget, importReplacement);

  // Remove early return if (isDesktop) from top
  const badEarlyReturn = `  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DesktopStaysBrowse />;
  }

  // Search State: Draft vs Applied`;

  const fixedEarlyReturn = `  const isDesktop = useIsDesktop();

  // Search State: Draft vs Applied`;

  content = content.replace(badEarlyReturn, fixedEarlyReturn);

  // Replace state
  const stateTarget = `  const [draftLocation, setDraftLocation] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");`;

  const stateReplacement = `  const [draftPlace, setDraftPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedPlace, setAppliedPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);`;

  content = content.replace(stateTarget, stateReplacement);

  // Replace staysQuery
  const queryTarget = `  const staysQuery = useQuery({
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
        tenant_preference: tenantPreference,
      }),
    staleTime: 30_000,
  });`;

  const queryReplacement = `  const staysQuery = useQuery({
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
        tenant_preference: tenantPreference,
      }),
    staleTime: 30_000,
  });`;

  content = content.replace(queryTarget, queryReplacement);

  // Replace handleSearchSubmit & add handlePlaceChange
  const submitTarget = `  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
  };`;

  const submitReplacement = `  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedPlace(draftPlace);
  };

  const handlePlaceChange = (nextPlace: PlaceFilterValue, applyNow: boolean) => {
    setDraftPlace(nextPlace);
    if (applyNow) {
      setAppliedPlace(nextPlace);
      setAppliedQuery(draftQuery);
    }
  };`;

  content = content.replace(submitTarget, submitReplacement);

  // Replace location input in JSX
  const locationInputTarget = `              <View className="flex-row items-center rounded-xl border border-line bg-surface-sunken px-3 py-2">
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
              </View>`;

  const locationInputReplacement = `              <PlaceFilter
                value={draftPlace}
                onChange={handlePlaceChange}
                placeholder="City or Area (e.g. Hyderabad, Gachibowli)"
                onSubmit={handleSearchSubmit}
              />`;

  content = content.replace(locationInputTarget, locationInputReplacement);

  // Add NearbyNotice above listing
  const noticeTarget = `<View className="gap-4">
                  {stays.map((property) => (
                    <StayCard key={property.id} property={property} />
                  ))}`;

  const noticeReplacement = `<View className="gap-4">
                  <NearbyNotice
                    place={appliedPlace}
                    noun="stays"
                    count={stays.length}
                    nearestKm={stays[0]?.distance_km}
                  />
                  {stays.map((property) => (
                    <StayCard key={property.id} property={property} />
                  ))}`;

  content = content.replace(noticeTarget, noticeReplacement);

  // Add desktop early return after all hooks (right before main return)
  const returnTarget = `  return (
    <View className="flex-1 bg-canvas">`;

  const returnReplacement = `  if (isDesktop) {
    return <DesktopStaysBrowse />;
  }

  return (
    <View className="flex-1 bg-canvas">`;

  content = content.replace(returnTarget, returnReplacement);

  fs.writeFileSync(filePath, content);
  console.log("Updated stays-browse-screen.tsx");
}

// 5. Update desktop-stays-browse.tsx
{
  const filePath = "frontend/mobile/apps/customer/src/features/stays/view/desktop-stays-browse.tsx";
  let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

  // Add imports
  const importTarget = 'import { StayCard } from "./stay-card";';
  const importReplacement = `import { StayCard } from "./stay-card";
import { PlaceFilter } from "@/features/browse/place-filter";
import {
  EMPTY_PLACE,
  NearbyNotice,
  placeKey,
  placeQuery,
  type PlaceFilterValue,
} from "@/features/browse/nearby";`;

  content = content.replace(importTarget, importReplacement);

  // Replace state
  const stateTarget = `  const [draftLocation, setDraftLocation] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");`;

  const stateReplacement = `  const [draftPlace, setDraftPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedPlace, setAppliedPlace] = useState<PlaceFilterValue>(EMPTY_PLACE);`;

  content = content.replace(stateTarget, stateReplacement);

  // Replace query
  const queryTarget = `  const staysQuery = useQuery({
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
        tenant_preference: tenantPreference,
      }),
    staleTime: 30_000,
  });`;

  const queryReplacement = `  const staysQuery = useQuery({
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
        tenant_preference: tenantPreference,
      }),
    staleTime: 30_000,
  });`;

  content = content.replace(queryTarget, queryReplacement);

  // Replace submit
  const submitTarget = `  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
  };`;

  const submitReplacement = `  const handleSearchSubmit = () => {
    setAppliedQuery(draftQuery);
    setAppliedPlace(draftPlace);
  };

  const handlePlaceChange = (nextPlace: PlaceFilterValue, applyNow: boolean) => {
    setDraftPlace(nextPlace);
    if (applyNow) {
      setAppliedPlace(nextPlace);
      setAppliedQuery(draftQuery);
    }
  };`;

  content = content.replace(submitTarget, submitReplacement);

  // Replace location input in JSX
  const locationInputTarget = `              <View className="flex-row items-center rounded-xl border border-line bg-surface-sunken px-3.5 py-2">
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

  const locationInputReplacement = `              <PlaceFilter
                value={draftPlace}
                onChange={handlePlaceChange}
                placeholder="City or area (e.g. Hyderabad, Gachibowli)"
                onSubmit={handleSearchSubmit}
              />`;

  content = content.replace(locationInputTarget, locationInputReplacement);

  // Add notice above grid
  const noticeTarget = `<View className="flex-row flex-wrap gap-6">
                {stays.map((property) => (
                  <View key={property.id} className="w-[calc(33.333%-16px)] min-w-[280px]">
                    <StayCard property={property} />
                  </View>
                ))}`;

  const noticeReplacement = `<View className="flex-row flex-wrap gap-6">
                <View className="w-full">
                  <NearbyNotice
                    place={appliedPlace}
                    noun="stays"
                    count={stays.length}
                    nearestKm={stays[0]?.distance_km}
                  />
                </View>
                {stays.map((property) => (
                  <View key={property.id} className="w-[calc(33.333%-16px)] min-w-[280px]">
                    <StayCard property={property} />
                  </View>
                ))}`;

  content = content.replace(noticeTarget, noticeReplacement);

  fs.writeFileSync(filePath, content);
  console.log("Updated desktop-stays-browse.tsx");
}

