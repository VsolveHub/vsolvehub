// Ported from frontend/apps/customer/features/catalog/components/category-tile-browser.tsx
// Phone chrome from frontend/apps/customer/app/(shop)/catalog/[category]/page.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { BlurBackdrop, Button, ErrorState, Skeleton, Text, cn, formatMoney } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, ClipboardList, X } from "lucide-react-native";

import { iconForService } from "@/features/catalog/icon-catalogue/service-icon";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCategories, useCategoryServices, useServiceDetail, type Category, type ServiceCard } from "@/features/catalog/client-queries";
import { serviceHref } from "@/features/catalog/service-href";
import { AddToCartButton } from "@/features/catalog/view/add-to-cart-button";

const A3_TIME_BLOCK = "A3_TIME_BLOCK";

export interface TileGroup {
  slug: string;
  name: string;
  description: string;
  iconKey: string;
  imageUrl: string;
  services: ServiceCard[];
}

/** The category's subcategories, in their published order, with their offerable services. */
export function groupByTile(category: Category, services: readonly ServiceCard[]): TileGroup[] {
  const bySlug = new Map<string, ServiceCard[]>();
  for (const service of services) {
    const list = bySlug.get(service.subcategory_slug) ?? [];
    list.push(service);
    bySlug.set(service.subcategory_slug, list);
  }
  return category.subcategories
    .map((subcategory) => ({
      slug: subcategory.slug,
      name: subcategory.name,
      description: subcategory.description,
      iconKey: subcategory.icon_key,
      imageUrl: subcategory.image_url,
      services: bySlug.get(subcategory.slug) ?? [],
    }))
    .filter((tile) => tile.services.length > 0);
}

/** What buying this service is, in one honest line. */
export function priceLine(service: ServiceCard): string {
  if (service.starting_price !== null) {
    return `Starts at ${formatMoney(service.starting_price.amount_paise)}`;
  }
  if (service.request_archetypes.includes(A3_TIME_BLOCK)) {
    return "Booked by the day, at the published rate";
  }
  if (service.request_archetypes.length > 0) {
    return "Free quote after a site visit";
  }
  return "Price confirmed before you pay";
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

function oneParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function CatalogMissing() {
  const router = useRouter();
  return (
    <View className="mx-auto w-full max-w-lg items-center px-4 py-20">
      <Text className="text-center text-2xl font-bold text-text">We could not find that service</Text>
      <Text className="mt-2 text-center text-text-secondary">
        It may have been renamed or is no longer offered. Everything we currently do is on the services page.
      </Text>
      <Button size="lg" className="mt-6" onPress={() => router.push("/catalog" as never)}>
        Browse all services
      </Button>
    </View>
  );
}

function CatalogDown({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="mx-auto w-full max-w-2xl px-4 py-16">
      <ErrorState
        title="We could not load our services"
        message="This is a problem on our side, not yours. Nothing has been booked or charged."
        actionLabel="Try again"
        onAction={onRetry}
      />
    </View>
  );
}

function ListSkeleton() {
  return (
    <View className="flex-row items-start gap-4">
      <View className="w-24 shrink-0 gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-2xl" />
        ))}
      </View>
      <View className="flex-1 gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-2xl" />
        ))}
      </View>
    </View>
  );
}

function TradeMark({ iconKey }: { iconKey: string }) {
  const Icon = iconForService(iconKey);
  return (
    <View className="size-12 items-center justify-center">
      <Icon color="#453f37" size={28} strokeWidth={1.6} />
    </View>
  );
}

function Thumb({ uri, px, iconKey }: { uri: string; px: number; iconKey: string }) {
  const cover = uri.includes("/Service%20Cover/") || uri.includes("/Service Cover/");
  const Icon = iconForService(iconKey);
  return (
    <View className="shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#F4F1EC]" style={{ width: px, height: px }}>
      {uri ? (
        <Image
          source={{ uri }}
          contentFit={cover ? "contain" : "cover"}
          style={cover ? { width: "80%", height: "80%" } : { width: "100%", height: "100%" }}
        />
      ) : (
        <Icon color="#453f37" size={28} strokeWidth={1.6} />
      )}
    </View>
  );
}

function WhatYouCanBookModal({
  service,
  onClose,
}: {
  service: ServiceCard;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { data: detail, isLoading } = useServiceDetail(service.slug);
  const fallbackUrls = [service.cover?.url, ...(detail?.media?.map((item) => item.url) ?? [])].filter(Boolean) as string[];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View
        className="flex-1 justify-end items-center p-2"
        style={{ paddingBottom: Math.max(20, insets.bottom + 8) }}
      >
        <BlurBackdrop
          onPress={onClose}
          accessibilityLabel="Close modal backdrop"
        />
          <View
            className="w-full max-w-lg gap-3.5 rounded-3xl border border-line bg-surface p-4 shadow-2xl"
            style={{ maxHeight: "80%" }}
          >
            <View className="shrink-0 flex-row items-center justify-between border-b border-line pb-3">
              <View className="flex-row items-center gap-2">
                <View className="size-7 items-center justify-center rounded-lg bg-selected-surface">
                  <ClipboardList color="#f87000" size={16} />
                </View>
                <Text className="text-base font-bold text-navy-900">What you can book</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="size-9 items-center justify-center rounded-full">
                <X color="#756c5e" size={20} />
              </Pressable>
            </View>

            <ScrollView style={{ flexShrink: 1 }} contentContainerClassName="gap-3.5 pb-4">
              {isLoading ? (
                <View className="gap-3">
                  {Array.from({ length: 2 }, (_, index) => (
                    <Skeleton key={index} className="h-28 rounded-2xl" />
                  ))}
                </View>
              ) : detail && detail.variants && detail.variants.length > 0 ? (
                detail.variants.map((variant) => {
                  const variantImg = variant.image_url && variant.image_url.trim() !== "" ? variant.image_url : (fallbackUrls[0] ?? "");
                  return (
                    <View key={variant.id} className="gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-2xs">
                      <View className="flex-row items-start gap-3">
                        <Thumb uri={variantImg} px={64} iconKey={service.icon_key} />
                        <View className="min-w-0 flex-1 gap-1">
                          <Text className="text-base font-bold leading-snug text-navy-900">{variant.name}</Text>
                          {variant.description ? (
                            <Text numberOfLines={2} className="text-xs leading-relaxed text-text-secondary">
                              {variant.description}
                            </Text>
                          ) : null}
                          <Text className="mt-0.5 text-xs italic text-text-muted">
                            {variant.task_lines && variant.task_lines.length > 0
                              ? `${variant.task_lines.length} tasks you can choose from`
                              : "Priced on booking"}
                          </Text>
                        </View>
                      </View>
                      <View className="flex-row items-center justify-between gap-3 border-t border-line/60 pt-2.5">
                        <View>
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-text-muted">STARTS AT</Text>
                          <Text className="text-base font-extrabold tabular-nums text-navy-900">
                            {formatMoney(variant.starting_price.amount_paise)}
                          </Text>
                        </View>
                        <AddToCartButton variantId={variant.id} size="compact" />
                      </View>
                    </View>
                  );
                })
              ) : (
                <View className="gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-2xs">
                  <View className="flex-row items-start gap-3">
                    <Thumb uri={fallbackUrls[0] ?? ""} px={64} iconKey={service.icon_key} />
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="text-base font-bold text-navy-900">{service.name}</Text>
                      <Text className="text-xs leading-relaxed text-text-secondary">{service.short_description}</Text>
                    </View>
                  </View>
                  <View className="flex-row items-center justify-between gap-3 border-t border-line/60 pt-2.5">
                    <View>
                      <Text className="text-[10px] font-bold uppercase tracking-wider text-text-muted">STARTS AT</Text>
                      <Text className="text-base font-extrabold tabular-nums text-navy-900">{priceLine(service)}</Text>
                    </View>
                    {service.bookable_variant_id ? <AddToCartButton variantId={service.bookable_variant_id} size="compact" /> : null}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
    </Modal>
  );
}

function CategoryTileBrowser({
  category,
  services,
  activeTileSlug,
}: {
  category: Category;
  services: readonly ServiceCard[];
  activeTileSlug: string | null;
}) {
  const router = useRouter();
  const [selectedServiceForModal, setSelectedServiceForModal] = useState<ServiceCard | null>(null);
  const tiles = groupByTile(category, services);

  if (tiles.length === 0) {
    return (
      <Text className="rounded-2xl border border-line bg-surface p-6 text-sm leading-6 text-text-secondary">
        Nothing is on sale in {category.name} for your area yet. The catalogue updates as professionals come on board — check back soon.
      </Text>
    );
  }

  const activeTile = (activeTileSlug !== null ? tiles.find((tile) => tile.slug === activeTileSlug) : undefined) ?? tiles[0];
  if (!activeTile) return null;

  return (
    <View style={{ flex: 1, width: "100%", minHeight: 0, flexDirection: "row", gap: 8 }}>
      <ScrollView
        accessibilityLabel={`${category.name} categories`}
        style={{ width: 80, flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 64 }}
      >
        {tiles.map((tile) => {
          const isActive = tile.slug === activeTile.slug;
          return (
            <Pressable
              key={tile.slug}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => router.setParams({ tile: tile.slug })}
              className={cn(
                "relative items-center justify-center gap-1.5 rounded-2xl px-1 py-2.5",
                isActive ? "bg-[#FFF8F3]" : "bg-[#F8F9FA]",
              )}
            >
              {isActive ? <View className="absolute bottom-2 left-0 top-2 w-1 rounded-r bg-signal-500" /> : null}
              {tile.imageUrl ? (
                <Image source={{ uri: tile.imageUrl }} contentFit="contain" style={{ width: 48, height: 48 }} />
              ) : (
                <TradeMark iconKey={tile.iconKey} />
              )}
              <Text
                numberOfLines={2}
                className={cn("px-0.5 text-center text-[10px] font-bold leading-tight", isActive ? "text-signal-700" : "text-navy-900")}
              >
                {tile.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ gap: 12, paddingBottom: 64, paddingLeft: 4 }}>
        <View className="shrink-0 flex-row items-baseline justify-between gap-3 border-b border-line/60 pb-1">
          <Text className="text-lg font-extrabold tracking-tight text-navy-900">{activeTile.name}</Text>
          <Text className="shrink-0 text-xs font-semibold text-text-secondary">
            {activeTile.services.length === 1 ? "1 service" : `${activeTile.services.length} services`}
          </Text>
        </View>

        <View className="gap-2.5">
          {activeTile.services.map((service) => {
            const imgUrl = service.cover?.url ?? activeTile.imageUrl;
            return (
              <View key={service.id} className="flex-row items-start gap-3 rounded-2xl border border-line/80 bg-white p-3">
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push(serviceHref(service, category.slug) as never)}
                  className="size-16 shrink-0 overflow-hidden rounded-2xl"
                >
                  <Thumb uri={imgUrl} px={64} iconKey={service.icon_key} />
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Pressable accessibilityRole="link" onPress={() => router.push(serviceHref(service, category.slug) as never)}>
                    <Text className="text-sm font-bold leading-snug text-navy-900">{service.name}</Text>
                    <Text numberOfLines={2} className="mt-1 text-xs leading-relaxed text-text-secondary">
                      {service.short_description}
                    </Text>
                  </Pressable>
                  <View className="mt-2.5 flex-row items-center justify-between gap-2">
                    <Text className="min-w-0 flex-1 text-xs font-bold text-navy-900">{priceLine(service)}</Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        if (service.request_archetypes.length > 0) {
                          router.push(serviceHref(service, category.slug) as never);
                          return;
                        }
                        setSelectedServiceForModal(service);
                      }}
                      className="h-8 shrink-0 items-center justify-center rounded-lg bg-navy-900 px-3.5"
                    >
                      <Text className="text-xs font-bold text-white">Add</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {selectedServiceForModal ? (
        <WhatYouCanBookModal service={selectedServiceForModal} onClose={() => setSelectedServiceForModal(null)} />
      ) : null}
    </View>
  );
}

export function CategoryScreen({ categorySlug }: { categorySlug: string }) {
  const router = useRouter();

  useState(() => {
    if (categorySlug === "rental-services") {
      router.replace("/rentals" as never);
    } else if (categorySlug === "rooms-pg-hostel-hotels") {
      router.replace("/stays" as never);
    } else if (categorySlug === "career-jobs") {
      router.replace("/listings" as never);
    }
  });

  const params = useLocalSearchParams<{ tile?: string | string[] }>();
  const tileValue = oneParam(params.tile);
  const activeTileSlug = tileValue !== "" ? tileValue : null;
  const categories = useCategories();
  const services = useCategoryServices(categorySlug);

  const retry = () => {
    void categories.refetch();
    void services.refetch();
  };

  if (categories.isPending) return <ListSkeleton />;
  if (categories.isError) return <CatalogDown onRetry={retry} />;

  const category = (categories.data ?? []).find((item) => item.slug === categorySlug);
  if (!category) return <CatalogMissing />;
  if (services.isError && isNotFound(services.error)) return <CatalogMissing />;
  if (services.isError) return <CatalogDown onRetry={retry} />;

  return (
    <View style={{ flex: 1, width: "100%", paddingHorizontal: 8, paddingTop: 8 }}>
      <View className="shrink-0 flex-row items-center gap-1 pb-2">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Back to home"
          onPress={() => router.push("/" as never)}
          className="min-h-9 flex-row items-center gap-1"
        >
          <ChevronLeft color="#a94900" size={16} strokeWidth={2.5} />
          <Text className="text-xs font-bold text-signal-700">Home</Text>
        </Pressable>
        <Text numberOfLines={1} className="min-w-0 flex-1 px-1 text-[19px] font-extrabold tracking-tight text-text">
          {category.name}
        </Text>
      </View>
      <View style={{ flex: 1, width: "100%", minHeight: 0 }}>
        {services.isPending || services.data == null ? (
          <ListSkeleton />
        ) : (
          <CategoryTileBrowser category={category} services={services.data} activeTileSlug={activeTileSlug} />
        )}
      </View>
    </View>
  );
}
