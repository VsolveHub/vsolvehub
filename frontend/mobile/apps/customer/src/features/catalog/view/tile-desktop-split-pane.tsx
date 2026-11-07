import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { formatMoney, Text } from "@vsolve/mobile-ui";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Headphones,
  ShieldCheck,
  Tag,
  X,
} from "lucide-react-native";

import { resolveImageUrl } from "@/features/catalog/category-artwork";
import type { Category, ServiceCard } from "@/features/catalog/client-queries";
import { serviceHref } from "@/features/catalog/service-href";
import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";
import { categoryHeadline } from "@/features/catalog/tile-desktop-rating";
import { iconForService } from "@/features/catalog/icon-catalogue/service-icon";
import type { TileGroup } from "./category-screen";

const SIDEBAR_TILE_CAP = 6;

/**
 * Trust badges matching web customer portal 100%:
 * - ID-verified professionals
 * - Price confirmed before you pay
 * - Extra work only with your approval
 */
const TRUST_BADGES = [
  { label: "ID-verified professionals", icon: ShieldCheck },
  { label: "Price confirmed before you pay", icon: Tag },
  { label: "Extra work only with your approval", icon: BadgeCheck },
] as const;

function sidebarTilesForDisplay(tiles: TileGroup[], activeSlug: string): TileGroup[] {
  if (tiles.length <= SIDEBAR_TILE_CAP) return tiles;
  const head = tiles.slice(0, SIDEBAR_TILE_CAP);
  if (head.some((tile) => tile.slug === activeSlug)) return head;
  const active = tiles.find((tile) => tile.slug === activeSlug);
  if (!active) return head;
  return [...head.slice(0, SIDEBAR_TILE_CAP - 1), active];
}

function TileItemGraphic({ tile, size = 48 }: { tile: TileGroup; size?: number }) {
  const [error, setError] = useState(false);
  const resolved = resolveImageUrl(tile.imageUrl);
  if (resolved && !error) {
    return (
      <Image
        source={{ uri: resolved }}
        contentFit="contain"
        style={{ width: size, height: size }}
        onError={() => setError(true)}
      />
    );
  }
  const Icon = iconForService(tile.iconKey);
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Icon color="#453f37" size={Math.round(size * 0.6)} strokeWidth={1.6} />
    </View>
  );
}

function ServiceItemPhoto({ uri, iconKey }: { uri: string; iconKey: string }) {
  const [loadError, setLoadError] = useState(false);
  const resolved = resolveImageUrl(uri);
  const cover = resolved ? (resolved.includes("/Service%20Cover/") || resolved.includes("/Service Cover/")) : false;
  const Icon = iconForService(iconKey);

  return (
    <View className="size-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#F4F1EC]">
      {resolved && !loadError ? (
        <Image
          source={{ uri: resolved }}
          contentFit={cover ? "contain" : "cover"}
          style={cover ? { width: "80%", height: "80%" } : { width: "100%", height: "100%" }}
          onError={() => setLoadError(true)}
        />
      ) : (
        <Icon color="#453f37" size={32} strokeWidth={1.6} />
      )}
    </View>
  );
}

function DesktopTileServiceCard({
  service,
  tile,
  categorySlug,
  onOpenPanel,
}: {
  service: ServiceCard;
  tile: TileGroup;
  categorySlug: string;
  onOpenPanel: () => void;
}) {
  const router = useRouter();
  const pricePaise = service.starting_price?.amount_paise ?? null;
  const photoUrl = service.cover?.url ?? tile.imageUrl;

  return (
    <View className="flex-row items-center gap-4 rounded-[1.25rem] border border-[#e7e2da] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      {/* Service Photo / Thumbnail */}
      <ServiceItemPhoto uri={photoUrl} iconKey={service.icon_key} />

      {/* Middle info */}
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-extrabold leading-snug text-navy-900">
          {service.name}
        </Text>
        {service.short_description ? (
          <Text
            numberOfLines={2}
            className="mt-1 text-[13px] leading-5 text-text-secondary"
          >
            {service.short_description}
          </Text>
        ) : null}
      </View>

      {/* Right side: Price & Action buttons */}
      <View className="flex-col items-end gap-2 pl-2 shrink-0">
        {pricePaise !== null ? (
          <View className="items-end">
            <Text className="text-[11px] font-medium text-text-secondary">Starts at</Text>
            <Text className="text-[15px] font-extrabold tabular-nums text-navy-900">
              {formatMoney(pricePaise)}
            </Text>
          </View>
        ) : (
          <Text className="text-[12px] font-bold text-navy-900">Price on request</Text>
        )}

        <View className="flex-row items-center gap-2">
          {/* View details */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View details for ${service.name}`}
            onPress={() => router.push(serviceHref(service, categorySlug) as never)}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-navy-900 bg-white px-3.5 hover:bg-[#FAF9F7]"
          >
            <Text className="text-[13px] font-bold text-navy-900">View details</Text>
          </Pressable>

          {/* Add */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${service.name} to cart`}
            onPress={() => {
              if (service.request_archetypes.length > 0) {
                router.push(serviceHref(service, categorySlug) as never);
                return;
              }
              onOpenPanel();
            }}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-[#0B192C] px-4 hover:bg-navy-900"
          >
            <Text className="text-[13px] font-bold text-white">Add</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function TileDesktopSplitPane({
  category,
  tiles,
  activeTile,
  onSelectTile,
  onOpenAddModal,
}: {
  category: Category;
  tiles: TileGroup[];
  activeTile: TileGroup;
  onSelectTile: (slug: string) => void;
  onOpenAddModal: (service: ServiceCard) => void;
}) {
  const router = useRouter();
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  const visibleTiles = sidebarTilesForDisplay(tiles, activeTile.slug);
  const showSeeAll = tiles.length > SIDEBAR_TILE_CAP;
  const headline = categoryHeadline(category.name);

  return (
    <ScrollView className="flex-1 bg-[#FAF9F7]" showsVerticalScrollIndicator={false}>
      {/* Full-width 2-column split pane matching web customer portal 100% */}
      <View className="w-full flex-row items-stretch border-b border-[#e7e2da] bg-white min-h-[calc(100vh-64px)]">
        {/* Left Column (Sidebar w-[22rem] matching Web) */}
        <View
          style={{ width: 350 }}
          className="shrink-0 border-r border-[#e7e2da] bg-white flex-col justify-between"
        >
          {/* Top content of sidebar */}
          <View>
            <View className="px-5 pb-1 pt-6">
              <Text className="text-[2rem] font-extrabold leading-[1.05] tracking-tight text-navy-900">
                {headline}
              </Text>
              {category.description && category.description.trim() !== "" ? (
                <Text className="mt-2 text-[13px] leading-snug text-text-secondary">
                  {category.description}
                </Text>
              ) : null}
            </View>

            {/* Select a service Card Container */}
            <View className="px-4 pb-3 pt-3">
              <View className="rounded-[1.25rem] border border-[#e7e2da] px-3.5 pb-4 pt-3.5">
                <View className="mb-4 flex-row items-center gap-3">
                  <Text className="shrink-0 text-[13px] font-medium text-text-secondary">
                    Select a service
                  </Text>
                  <View className="h-px flex-1 bg-[#e7e2da]" />
                </View>

                {/* 3-Column Tile Grid matching Web */}
                <View className="flex-row flex-wrap justify-between gap-y-4">
                  {visibleTiles.map((tile) => {
                    const active = tile.slug === activeTile.slug;
                    return (
                      <Pressable
                        key={tile.slug}
                        accessibilityRole="button"
                        accessibilityLabel={tile.name}
                        onPress={() => onSelectTile(tile.slug)}
                        style={{ width: "31%" }}
                        className="flex-col items-center gap-1.5 cursor-pointer"
                      >
                        <View
                          className={`w-full rounded-[1.1rem] p-1 items-center justify-center ${
                            active
                              ? "border-2 border-[#EA580C] bg-[#FFF8F3]"
                              : "border-2 border-transparent bg-transparent"
                          }`}
                        >
                          <TileItemGraphic tile={tile} size={48} />
                        </View>
                        <Text
                          numberOfLines={2}
                          className={`text-center text-[11px] font-semibold leading-tight ${
                            active ? "text-navy-900" : "text-navy-800"
                          }`}
                        >
                          {tile.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* See all services button if > 6 subcategories */}
              {showSeeAll ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSeeAllOpen(true)}
                  className="mt-4 flex-row h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-navy-900 bg-white hover:bg-[#FAF9F7]"
                >
                  <Text className="text-[13px] font-bold text-navy-900">See all services →</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Bottom "Need help?" card matching Web */}
          <View className="p-4 pt-2">
            <View className="rounded-2xl border border-[#e7e2da] bg-white p-4 shadow-xs">
              <View className="flex-row items-start gap-3">
                <View className="size-9 shrink-0 items-center justify-center rounded-full bg-[#FAF9F7] text-navy-900">
                  <Headphones size={16} color="#0F172A" strokeWidth={1.8} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[13px] font-extrabold text-navy-900">Need help?</Text>
                  <Text className="mt-0.5 text-[11px] font-medium text-text-secondary">
                    Talk to our experts
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Contact Us"
                onPress={() => router.push("/catalog" as never)}
                className="mt-3 flex-row h-9 items-center justify-center rounded-lg border border-navy-900 bg-white hover:bg-[#FAF9F7]"
              >
                <Text className="text-[12px] font-bold text-navy-900">Contact Us</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Right Column (Service Detail & Cards matching Web) */}
        <View className="flex-1 min-w-0 bg-[#FAF9F7] px-8 py-6">
          {/* Top Breadcrumb */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Back to ${category.name}`}
            onPress={() => router.push("/catalog" as never)}
            className="flex-row items-center gap-1.5 self-start cursor-pointer"
          >
            <ChevronLeft size={16} color="#EA580C" strokeWidth={2.4} />
            <Text className="text-[13px] font-bold text-[#EA580C]">{category.name}</Text>
          </Pressable>

          {/* Hero Title & Right Thumbnail */}
          <View className="mt-3 flex-row items-start justify-between gap-8">
            <View className="min-w-0 max-w-xl">
              <Text className="text-[1.85rem] font-extrabold tracking-tight text-navy-900 leading-tight">
                {activeTile.name}
              </Text>
              {activeTile.description && activeTile.description.trim() !== "" ? (
                <Text className="mt-2 text-[14px] leading-relaxed text-text-secondary">
                  {activeTile.description}
                </Text>
              ) : (
                <Text className="mt-2 text-[14px] leading-relaxed text-text-secondary">
                  {activeTile.services.length}{" "}
                  {activeTile.services.length === 1 ? "service" : "services"} to choose from
                </Text>
              )}
            </View>

            {/* Right 3D Artwork Graphic matching reference screenshot */}
            <View className="flex-row h-28 w-40 shrink-0 items-center justify-end">
              <TileItemGraphic tile={activeTile} size={110} />
            </View>
          </View>

          {/* Trust Badges matching Web: ID-verified professionals, Price confirmed before you pay, Extra work only with your approval */}
          <View className="mt-5 flex-row flex-wrap items-center gap-x-5 gap-y-2">
            {TRUST_BADGES.map((badge) => {
              const Icon = badge.icon;
              return (
                <View key={badge.label} className="flex-row items-center gap-1.5">
                  <Icon size={15} color="#1E293B" strokeWidth={1.8} />
                  <Text className="text-[12px] font-semibold text-navy-800">{badge.label}</Text>
                </View>
              );
            })}
          </View>

          {/* Service Cards List */}
          <View className="mt-6 flex-col gap-3 pb-12">
            {activeTile.services.map((service) => (
              <DesktopTileServiceCard
                key={service.id}
                service={service}
                tile={activeTile}
                categorySlug={category.slug}
                onOpenPanel={() => onOpenAddModal(service)}
              />
            ))}
          </View>
        </View>
      </View>

      {/* See All Subcategories Modal */}
      {showSeeAll ? (
        <Modal
          visible={seeAllOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setSeeAllOpen(false)}
        >
          <View className="flex-1 items-center justify-center bg-black/50 p-4">
            <View className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl gap-4 max-h-[80vh]">
              <View className="flex-row items-center justify-between border-b border-line pb-3">
                <Text className="text-lg font-bold text-navy-900">
                  All {category.name} Services
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSeeAllOpen(false)}
                  className="rounded-full p-1 active:bg-surface-sunken"
                >
                  <X size={20} color="#64748B" />
                </Pressable>
              </View>

              <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                <View className="flex-row flex-wrap justify-between gap-y-4">
                  {tiles.map((tile) => (
                    <Pressable
                      key={tile.slug}
                      onPress={() => {
                        setSeeAllOpen(false);
                        onSelectTile(tile.slug);
                      }}
                      style={{ width: "31%" }}
                      className="flex-col items-center gap-2 p-3 rounded-xl border border-line bg-surface active:bg-surface-sunken"
                    >
                      <TileItemGraphic tile={tile} size={48} />
                      <Text className="text-center text-xs font-semibold text-navy-900" numberOfLines={2}>
                        {tile.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}

      {/* Desktop Site Footer */}
      <DesktopSiteFooter />
    </ScrollView>
  );
}
