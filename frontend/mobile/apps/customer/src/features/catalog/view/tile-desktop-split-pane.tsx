import { formatMoney } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Headphones,
  ShieldCheck,
  Tag,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Text } from "@vsolve/mobile-ui";

import { LOCAL_CATEGORY_TILES, resolveImageUrl } from "@/features/catalog/category-artwork";
import type { Category, ServiceCard } from "@/features/catalog/client-queries";
import { serviceHref } from "@/features/catalog/service-href";
import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";
import {
  categoryHeadline,
  displayCategoryStats,
  displayRating,
  earliestSlotLabel,
} from "@/features/catalog/tile-desktop-rating";
import { iconForService } from "@/features/catalog/icon-catalogue/service-icon";
import type { TileGroup } from "./category-screen";

const SIDEBAR_TILE_CAP = 6;

const TRUST_BADGES = [
  { label: "Verified Professionals", icon: ShieldCheck },
  { label: "On-time Service", icon: Clock },
  { label: "Transparent Pricing", icon: Tag },
  { label: "Satisfaction Guarantee", icon: CheckCircle2 },
] as const;

function sidebarTilesForDisplay(tiles: TileGroup[], activeSlug: string): TileGroup[] {
  if (tiles.length <= SIDEBAR_TILE_CAP) return tiles;
  const head = tiles.slice(0, SIDEBAR_TILE_CAP);
  if (head.some((tile) => tile.slug === activeSlug)) return head;
  const active = tiles.find((tile) => tile.slug === activeSlug);
  if (!active) return head;
  return [...head.slice(0, SIDEBAR_TILE_CAP - 1), active];
}

function SidebarEarliestBadge() {
  return (
    <View className="shrink-0 rounded-[0.9rem] bg-[#DEF7EC] px-2.5 py-1.5 items-center justify-center">
      <View className="flex-row items-center gap-1">
        <Clock size={11} color="#03543F" strokeWidth={2.4} />
        <Text className="text-[10px] font-bold text-[#03543F]">Earliest</Text>
      </View>
      <Text className="mt-0.5 text-[11px] font-extrabold text-navy-900 leading-none">
        {earliestSlotLabel()}
      </Text>
    </View>
  );
}

function SidebarWarrantyCard() {
  return (
    <View className="mt-2.5 flex-row items-center gap-2 rounded-[1.15rem] bg-[#F3F4F6] px-3 py-2.5">
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <View className="size-3.5 items-center justify-center rounded-full bg-[#059669]">
            <Svg viewBox="0 0 12 12" width={10} height={10} fill="none">
              <Path
                d="M2.5 6.2 4.8 8.5 9.5 3.5"
                stroke="#FFFFFF"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
          <Text className="text-[10px] font-extrabold tracking-wide text-[#059669]">
            V SOLVE COVER
          </Text>
        </View>
        <Text className="mt-0.5 text-[12px] font-semibold text-navy-900 leading-snug">
          Upto 30 days warranty on repairs
        </Text>
      </View>
      <ChevronRight size={16} color="#94A3B8" strokeWidth={1.8} />
    </View>
  );
}

function TileItemGraphic({ tile, size = 48 }: { tile: TileGroup; size?: number }) {
  const [error, setError] = useState(false);
  const localAsset = LOCAL_CATEGORY_TILES[tile.slug];
  if (localAsset) {
    return <Image source={localAsset} contentFit="contain" style={{ width: size, height: size }} />;
  }
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
  const visibleTiles = sidebarTilesForDisplay(tiles, activeTile.slug);
  const headline = categoryHeadline(category.name);
  const stats = displayCategoryStats(category.slug);

  return (
    <ScrollView className="flex-1 bg-[#FAF9F7]" showsVerticalScrollIndicator={false}>
      {/* Full-width 2-column split pane */}
      <View className="w-full flex-row items-stretch border-b border-[#e7e2da] bg-white">
        {/* Left Column (Sidebar) */}
        <View
          style={{ width: 252 }}
          className="shrink-0 border-r border-[#e7e2da] bg-white p-3.5 pb-6 gap-3.5"
        >
          {/* Top Category Header */}
          <View>
            <View className="flex-row items-start justify-between gap-2">
              <Text className="min-w-0 flex-1 text-[22px] font-extrabold leading-tight tracking-tight text-navy-900">
                {headline}
              </Text>
              <SidebarEarliestBadge />
            </View>

            {/* Rating Line */}
            <View className="mt-1 flex-row items-center gap-1 text-[13px] text-navy-900">
              <Text className="text-[13px] leading-none text-navy-900">★</Text>
              <Text className="font-semibold text-navy-900">{stats.score}</Text>
              <Text className="underline decoration-navy-900/35 underline-offset-[3px] text-navy-900 font-normal">
                ({stats.bookings})
              </Text>
            </View>

            {/* V Solve Cover Banner */}
            <SidebarWarrantyCard />

            {/* Select a service Container */}
            <View className="mt-3 rounded-[1.15rem] border border-[#e7e2da] px-2.5 pb-3 pt-2.5">
              <View className="mb-2.5 flex-row items-center gap-2">
                <Text className="shrink-0 text-[12px] font-medium text-text-secondary">
                  Select a service
                </Text>
                <View className="h-px flex-1 bg-[#e7e2da]" />
              </View>

              {/* 3-Column Grid */}
              <View className="flex-row flex-wrap justify-between gap-y-2.5">
                {visibleTiles.map((tile) => {
                  const isActive = tile.slug === activeTile.slug;
                  let displayName = tile.name;
                  if (tile.slug === "computer-laptop-repair") {
                    displayName = "Computer &\nLaptop...";
                  } else if (tile.slug === "wifi-technician") {
                    displayName = "Internet & WiFi\nTechnician";
                  } else if (tile.slug === "gas-stove-technician") {
                    displayName = "Gas Stove\nTechnician";
                  } else if (tile.slug === "mobile-technician") {
                    displayName = "Mobile\nTechnician";
                  }
                  return (
                    <Pressable
                      key={tile.slug}
                      accessibilityRole="button"
                      accessibilityLabel={tile.name}
                      onPress={() => onSelectTile(tile.slug)}
                      style={{ width: "31.5%" }}
                      className="items-center cursor-pointer"
                    >
                      <View
                        className={`w-full rounded-[1rem] p-1 items-center justify-center ${
                          isActive
                            ? "border-2 border-[#EA580C] bg-[#FFF8F3]"
                            : "border-2 border-transparent bg-transparent hover:bg-slate-50"
                        }`}
                      >
                        <TileItemGraphic tile={tile} size={38} />
                      </View>
                      <Text
                        numberOfLines={2}
                        className={`mt-1 text-center text-[10px] leading-tight px-0.5 ${
                          isActive ? "font-bold text-navy-900" : "font-semibold text-navy-800"
                        }`}
                      >
                        {displayName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Need Help Card */}
            <View className="mt-3 rounded-2xl border border-[#e7e2da] bg-white p-3 shadow-xs">
              <View className="flex-row items-start gap-2.5">
                <View className="size-8 shrink-0 items-center justify-center rounded-full bg-[#FAF9F7] text-navy-900">
                  <Headphones size={16} color="#0B1B3D" strokeWidth={1.8} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[12px] font-extrabold text-navy-900">Need help?</Text>
                  <Text className="mt-0.5 text-[10.5px] font-medium text-text-secondary">
                    Talk to our experts
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Contact Us"
                onPress={() => router.push("/catalog" as never)}
                className="mt-2.5 flex h-8 items-center justify-center rounded-lg border border-navy-900 bg-white cursor-pointer hover:bg-[#FAF9F7]"
              >
                <Text className="text-[11.5px] font-bold text-navy-900">Contact Us</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Right Column (Service Detail & Cards) */}
        <View className="flex-1 min-w-0 bg-[#FAF9F7] px-8 py-5">
          {/* Breadcrumb with explicit Left Chevron */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Back to ${category.name}`}
            onPress={() => router.push("/catalog" as never)}
            className="flex-row items-center gap-1 cursor-pointer"
          >
            <Svg width={14} height={14} viewBox="0 0 20 20" fill="none">
              <Path
                d="M12.5 4.5 7 10l5.5 5.5"
                stroke="#EA580C"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <Text className="text-[13px] font-bold text-[#EA580C]">{category.name}</Text>
          </Pressable>

          {/* Hero Header */}
          <View className="mt-2 flex-row items-start justify-between gap-6">
            <View className="flex-1 min-w-0 max-w-xl">
              <Text className="text-[1.85rem] font-extrabold tracking-tight text-navy-900 leading-tight">
                {activeTile.name}
              </Text>
              <Text className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
                {activeTile.description && activeTile.description.trim() !== ""
                  ? activeTile.description
                  : `Book expert ${activeTile.name} for installation, repair, service and maintenance at your doorstep.`}
              </Text>
            </View>

            {/* 3D Artwork thumbnail on top-right */}
            <View className="h-24 w-36 shrink-0 items-center justify-center">
              <TileItemGraphic tile={activeTile} size={90} />
            </View>
          </View>

          {/* Trust Badges Row (clean without underline border) */}
          <View className="mt-3.5 flex-row flex-wrap items-center gap-x-5 gap-y-1.5">
            {TRUST_BADGES.map((badge) => {
              const Icon = badge.icon;
              return (
                <View key={badge.label} className="flex-row items-center gap-1.5">
                  <Icon size={15} color="#1E293B" strokeWidth={1.8} />
                  <Text className="text-[11.5px] font-semibold text-navy-800">{badge.label}</Text>
                </View>
              );
            })}
          </View>

          {/* Service Cards List */}
          <View className="mt-5 gap-3 pb-8">
            {activeTile.services.map((service) => {
              const rating = displayRating(service.slug);
              const pricePaise = service.starting_price?.amount_paise ?? null;
              const photoUrl = service.cover?.url ?? activeTile.imageUrl;

              return (
                <View
                  key={service.id}
                  className="flex-row items-center gap-4 rounded-[1.25rem] border border-[#e7e2da] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                >
                  {/* Left Thumbnail */}
                  <ServiceItemPhoto uri={photoUrl} iconKey={service.icon_key} />

                  {/* Middle Info */}
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-extrabold leading-snug text-navy-900">
                      {service.name}
                    </Text>
                    <View className="mt-0.5 flex-row items-center gap-1">
                      <Text className="text-[12px] text-[#F5A524] leading-none">★</Text>
                      <Text className="text-[12px] font-semibold text-navy-900">{rating.score}</Text>
                      <Text className="text-[12px] font-medium text-text-secondary">
                        ({rating.count})
                      </Text>
                    </View>
                    {service.short_description ? (
                      <Text
                        numberOfLines={2}
                        className="mt-1 text-[13px] leading-5 text-text-secondary"
                      >
                        {service.short_description}
                      </Text>
                    ) : null}
                  </View>

                  {/* Right: Starts at Price & Buttons */}
                  <View className="shrink-0 items-end gap-2 pl-2">
                    <View className="items-end">
                      <Text className="text-[11px] font-medium text-text-secondary">Starts at</Text>
                      <Text className="text-[15px] font-extrabold tabular-nums text-navy-900">
                        {pricePaise !== null ? formatMoney(pricePaise) : "Price on request"}
                      </Text>
                    </View>

                    <View className="flex-row items-center gap-2">
                      {/* View details */}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View details for ${service.name}`}
                        onPress={() => router.push(serviceHref(service, category.slug) as never)}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-navy-900 bg-white px-3.5 cursor-pointer hover:bg-[#FAF9F7]"
                      >
                        <Text className="text-[13px] font-bold text-navy-900">View details</Text>
                      </Pressable>

                      {/* Add */}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${service.name} to cart`}
                        onPress={() => {
                          if (service.request_archetypes.length > 0) {
                            router.push(serviceHref(service, category.slug) as never);
                            return;
                          }
                          onOpenAddModal(service);
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-navy-900 px-4 cursor-pointer hover:bg-navy-800"
                      >
                        <Text className="text-[13px] font-bold text-white">Add</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* Desktop Site Footer */}
      <DesktopSiteFooter />
    </ScrollView>
  );
}
