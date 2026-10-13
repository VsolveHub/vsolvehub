// Ported from frontend/apps/customer/features/catalog/icon-catalogue/catalogue-header.tsx
// and features/catalog/components/catalog-category-rows.tsx, search-results.tsx, service-row.tsx.
import { Button, EmptyState, Skeleton, Text, formatMoney } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { LOCAL_CATEGORY_TILES, getCategoryFallbackIcon, resolveImageUrl } from "@/features/catalog/category-artwork";
import { useCatalogIndex, useCategories, type Category, type ServiceCard } from "@/features/catalog/client-queries";
import { bookingModeLabel, rankCatalogMatches } from "@/features/catalog/search";
import { serviceHref } from "@/features/catalog/service-href";

export function CatalogScreen() {
  const categories = useCategories();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const open = searchOpen || query.trim().length > 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await categories.refetch();
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="px-4 pb-6 pt-4"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-[19px] font-extrabold tracking-tight text-text">All services</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? "Close search" : "Search services"}
          accessibilityState={{ expanded: open }}
          onPress={() => {
            if (open) setQuery("");
            setSearchOpen(!open);
          }}
          className="h-11 w-11 items-center justify-center rounded-control"
        >
          {open ? (
            <Svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="#6B6560" strokeWidth={2}>
              <Path d="M18 6 6 18" strokeLinecap="round" />
              <Path d="m6 6 12 12" strokeLinecap="round" />
            </Svg>
          ) : (
            <Svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="#6B6560" strokeWidth={2}>
              <Circle cx={11} cy={11} r={8} />
              <Path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </Svg>
          )}
        </Pressable>
      </View>

      {open ? (
        <View className="mt-3 h-11 flex-row items-center rounded-full border border-line/80 bg-surface-sunken px-4">
          <Svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="#756c5e" strokeWidth={2}>
            <Circle cx={11} cy={11} r={7} />
            <Path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </Svg>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search services..."
            placeholderTextColor="#756c5e"
            autoFocus
            className="ml-3 h-11 flex-1 text-sm font-medium text-navy-900"
          />
        </View>
      ) : null}

      {categories.isPending ? <CatalogSkeleton /> : null}
      {categories.isError ? (
        <View className="mt-6">
          <EmptyState
            title="We could not load the catalogue"
            description="Check your connection and try again."
            action={<Button onPress={() => void categories.refetch()}>Try again</Button>}
          />
        </View>
      ) : null}
      {categories.data ? (
        query.trim().length > 0 ? (
          <SearchHits categories={categories.data} query={query.trim()} />
        ) : (
          <CategoryRows categories={categories.data} />
        )
      ) : null}
    </ScrollView>
  );
}

function CategoryRows({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const rows = categories
    .map((category) => ({
      category,
      subcategories: category.subcategories.filter((subcategory) => subcategory.service_count > 0),
    }))
    .filter(({ subcategories }) => subcategories.length > 0);

  if (rows.length === 0) {
    return (
      <View className="mt-6">
        <EmptyState title="No services are published yet" description="Our catalogue is being set up. Please check back shortly." />
      </View>
    );
  }

  return (
    <View className="mt-3 gap-8 pb-4">
      {rows.map(({ category, subcategories }) => (
        <View key={category.id}>
          <View className="mb-3 min-h-11 flex-row items-center gap-3 border-b border-line/70">
            <Text className="min-w-0 flex-1 text-base font-extrabold tracking-tight text-text">{category.name}</Text>
            {subcategories.length > 3 ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`See all ${category.name} subcategories`}
                onPress={() => router.push(`/catalog/${category.slug}` as never)}
                className="min-h-11 flex-row items-center gap-1 px-1"
              >
                <Text className="text-sm font-bold text-action">See all</Text>
                <Svg viewBox="0 0 20 20" width={16} height={16} fill="none" stroke="#0B6E4F" strokeWidth={1.9}>
                  <Path d="m7.5 4.5 5.5 5.5-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Pressable>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={104}
            contentContainerClassName="gap-3 pr-4"
            className="-mx-4"
            style={{ marginHorizontal: -16 }}
            contentContainerStyle={{ paddingHorizontal: 16 }}
          >
            {subcategories.map((subcategory) => (
              <Pressable
                key={subcategory.id}
                accessibilityRole="link"
                onPress={() => router.push(`/catalog/${category.slug}?tile=${subcategory.slug}` as never)}
                className="w-[92px] items-center gap-2"
              >
                <TilePhoto imageUrl={subcategory.image_url} slug={subcategory.slug} iconKey={subcategory.icon_key} />
                <Text numberOfLines={2} className="w-full text-center text-[12px] font-semibold leading-tight text-text">
                  {subcategory.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

function TilePhoto({ imageUrl, slug, iconKey }: { imageUrl: string; slug?: string; iconKey?: string }) {
  const [loadError, setLoadError] = useState(false);
  const localAsset = slug ? LOCAL_CATEGORY_TILES[slug] : null;
  if (localAsset) {
    return (
      <View className="aspect-square w-full items-center justify-center overflow-hidden rounded-card bg-[#F4F1EC]">
        <Image source={localAsset} contentFit="contain" style={{ width: "76%", height: "76%" }} />
      </View>
    );
  }

  const resolved = resolveImageUrl(imageUrl);
  const isCover = resolved ? (resolved.includes("/Service%20Cover/") || resolved.includes("/Service Cover/")) : false;
  const FallbackIcon = getCategoryFallbackIcon(slug, iconKey);

  return (
    <View className="aspect-square w-full items-center justify-center overflow-hidden rounded-card bg-[#F4F1EC]">
      {resolved && !loadError ? (
        <Image
          source={{ uri: resolved }}
          contentFit={isCover ? "contain" : "cover"}
          style={isCover ? { width: "76%", height: "76%" } : { width: "100%", height: "100%" }}
          onError={() => setLoadError(true)}
        />
      ) : (
        <FallbackIcon size={26} color="#00112e" strokeWidth={1.8} />
      )}
    </View>
  );
}

function SearchHits({ categories, query }: { categories: Category[]; query: string }) {
  const router = useRouter();
  const index = useCatalogIndex(categories);
  if (index.isPending) return <Text className="mt-6 text-sm text-text-secondary">Searching…</Text>;
  const matches = rankCatalogMatches(categories, index.servicesByCategory, query);
  if (matches.services.length === 0 && matches.categories.length === 0) {
    return (
      <View className="mt-6">
        <EmptyState
          title={`Nothing matches “${query}”`}
          description="Try a shorter word, or the name of the appliance or room. Everything we do is on the catalogue below."
          action={
            <Button variant="outline" onPress={() => router.push("/catalog")}>
              Browse all services
            </Button>
          }
        />
      </View>
    );
  }

  return (
    <View className="mt-6 gap-10">
      {matches.services.length > 0 ? (
        <View>
          <View className="flex-row flex-wrap items-baseline justify-between gap-1 border-b border-line pb-3">
            <Text className="text-[1.35rem] font-extrabold tracking-tight text-navy-900">Services</Text>
            <Text className="text-sm font-medium text-text-secondary">
              {matches.services.length} {matches.services.length === 1 ? "match" : "matches"} for “{query}”
            </Text>
          </View>
          <View className="mt-4 gap-2.5">
            {matches.services.map(({ service, category }) => (
              <ServiceResult key={service.id} service={service} category={category} />
            ))}
          </View>
        </View>
      ) : null}
      {matches.categories.length > 0 ? (
        <View>
          <Text className="border-b border-line pb-3 text-[1.35rem] font-extrabold tracking-tight text-navy-900">
            {matches.services.length > 0 ? "Or open the whole trade" : "Trades that match"}
          </Text>
          <View className="mt-4 flex-row flex-wrap gap-2">
            {matches.categories.map((category) => (
              <Pressable
                key={category.id}
                accessibilityRole="link"
                onPress={() => router.push(`/catalog/${category.slug}` as never)}
                className="flex-row items-center gap-2 rounded-full border border-line bg-surface px-4 py-2"
              >
                <Text className="text-sm font-bold text-navy-900">{category.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ServiceResult({ service, category }: { service: ServiceCard; category: Category }) {
  const router = useRouter();
  const mode = bookingModeLabel(service);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(serviceHref(service, category.slug) as never)}
      className="flex-row items-stretch gap-4 rounded-card border border-line bg-surface px-4 py-4"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-text-muted">{category.name}</Text>
        <Text className="mt-1 text-[1.0625rem] font-bold leading-snug text-navy-900">{service.name}</Text>
        {service.short_description ? (
          <Text numberOfLines={2} className="mt-1.5 text-sm leading-relaxed text-text-secondary">
            {service.short_description}
          </Text>
        ) : null}
      </View>
      <View className="items-end justify-center">
        {mode ? <Text className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-text-muted">{mode}</Text> : null}
        {service.starting_price !== null ? (
          <Text className="mt-1 text-[1.0625rem] font-extrabold leading-none text-navy-900">
            {formatMoney(service.starting_price.amount_paise)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function CatalogSkeleton() {
  return (
    <View className="mt-6 gap-8">
      {Array.from({ length: 3 }, (_, row) => (
        <View key={row}>
          <Skeleton className="mb-3 h-5 w-32" />
          <View className="flex-row gap-3">
            {Array.from({ length: 3 }, (_, tile) => (
              <View key={tile} className="w-[92px] gap-2">
                <Skeleton className="aspect-square w-full rounded-card" />
                <Skeleton className="mx-auto h-3 w-4/5" />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
