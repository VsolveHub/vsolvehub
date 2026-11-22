import { Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Headphones,
  SlidersHorizontal,
  X,
} from "lucide-react-native";
import { useState, type ComponentType, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { iconForService } from "@/features/catalog/icon-catalogue/service-icon";
import { useIsLargeDesktop } from "@/lib/responsive";

import type { BrowseTile } from "./taxonomy-tiles";

export interface TrustBadgeItem {
  label: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}

function TileThumb({
  imageUrl,
  iconKey,
  size = 48,
}: {
  imageUrl: string;
  iconKey: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const uri = resolveImageUrl(imageUrl);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        contentFit="cover"
        style={{ width: "100%", height: "100%" }}
        onError={() => setFailed(true)}
      />
    );
  }
  const Icon = iconForService(iconKey || "service");
  return <Icon size={Math.round(size * 0.52)} color="#00112e" strokeWidth={1.8} />;
}

const SIDEBAR_TILE_CAP = 6;

function sidebarTilesForDisplay(tiles: readonly BrowseTile[], activeSlug: string): BrowseTile[] {
  if (tiles.length <= SIDEBAR_TILE_CAP) return [...tiles];
  const head = tiles.slice(0, SIDEBAR_TILE_CAP);
  if (head.some((tile) => tile.slug === activeSlug)) return head;
  const active = tiles.find((tile) => tile.slug === activeSlug);
  if (!active) return head;
  return [...head.slice(0, SIDEBAR_TILE_CAP - 1), active];
}

function SeeAllTilesModal({
  visible,
  onClose,
  title,
  subtitle,
  tiles,
  onSelectTile,
  isDesktop,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  tiles: readonly BrowseTile[];
  onSelectTile: (slug: string) => void;
  isDesktop: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 p-4 sm:p-6">
        <View className="max-h-[82%] w-full max-w-[680px] overflow-hidden rounded-3xl bg-white p-5 sm:p-6 shadow-2xl">
          <View className="flex-row items-start justify-between gap-3 border-b border-line/60 pb-4">
            <View className="flex-1">
              <Text className="text-lg font-extrabold text-navy-900">{title}</Text>
              <Text className="mt-0.5 text-xs font-semibold text-[#EA580C]">{subtitle}</Text>
            </View>
            <Pressable
              onPress={onClose}
              className="size-8 items-center justify-center rounded-full bg-slate-100"
            >
              <X size={16} color="#00112e" />
            </Pressable>
          </View>
          <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
            <View className="flex-row flex-wrap gap-3 pb-2">
              {tiles.map((tile) => (
                <Pressable
                  key={tile.slug}
                  onPress={() => {
                    onSelectTile(tile.slug);
                    onClose();
                  }}
                  className={`${
                    isDesktop ? "w-[23%]" : "w-[47.5%]"
                  } rounded-2xl border border-[#e7e2da] bg-white p-2.5`}
                >
                  <View className="aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-[#F6F3EE]">
                    <TileThumb imageUrl={tile.imageUrl} iconKey={tile.iconKey} size={72} />
                  </View>
                  <View className="mt-2 flex-row items-center justify-between gap-1">
                    <Text numberOfLines={2} className="flex-1 text-xs font-bold text-navy-900">
                      {tile.name}
                    </Text>
                    <ChevronRight size={14} color="#00112e" />
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export interface SplitBrowseShellProps {
  sidebarTitle: string;
  sidebarDescription: string;
  selectLabel?: string;
  seeAllLabel?: string;
  seeAllModalTitle: string;
  seeAllModalSubtitle: string;
  backLabel: string;
  backHref?: string;
  headerAction?: ReactNode;
  tiles: readonly BrowseTile[];
  activeTile: BrowseTile;
  onSelectTile: (slug: string) => void;
  sidebarFilters: ReactNode;
  activeFilterCount?: number;
  heroSummary: string;
  trustBadges: readonly TrustBadgeItem[];
  centerToolbar?: ReactNode;
  centerContent: ReactNode;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  drawerContent: ReactNode;
}

export function SplitBrowseShell({
  sidebarTitle,
  sidebarDescription,
  selectLabel = "Select a category",
  seeAllLabel = "See all categories",
  seeAllModalTitle,
  seeAllModalSubtitle,
  backLabel,
  backHref = "/",
  headerAction,
  tiles,
  activeTile,
  onSelectTile,
  sidebarFilters,
  activeFilterCount = 0,
  heroSummary,
  trustBadges,
  centerToolbar,
  centerContent,
  drawerOpen,
  onCloseDrawer,
  drawerContent,
}: SplitBrowseShellProps) {
  const router = useRouter();
  const isDesktop = useIsLargeDesktop();
  const { width, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const isWide400 = width >= 400;
  const isWide420 = width >= 420;
  const isTablet = width >= 640;
  const previewTiles = sidebarTilesForDisplay(tiles, activeTile.slug);

  if (isDesktop) {
    return (
      <View className="flex-1 bg-[#FAF9F7]">
        <View className="mx-auto w-full max-w-[1440px] flex-1 flex-row gap-8 px-6 py-5">
          {/* Left Sidebar (fixed 280px, must disable ScrollView's default flexGrow: 1) */}
          <View style={{ width: 280, flexGrow: 0, flexShrink: 0 }}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerClassName="gap-4 pb-10"
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-[28px] font-black tracking-tight text-navy-900">
                  {sidebarTitle}
                </Text>
                {headerAction}
              </View>
              <Text className="-mt-2 text-xs leading-relaxed text-text-secondary">
                {sidebarDescription}
              </Text>

              {/* Select a category card */}
              <View className="rounded-2xl border border-[#e7e2da] bg-white p-3.5 shadow-2xs">
                <View className="mb-3 flex-row items-center gap-2">
                  <View className="h-px flex-1 bg-[#e7e2da]" />
                  <Text className="text-[11px] font-bold text-text-secondary">{selectLabel}</Text>
                  <View className="h-px flex-1 bg-[#e7e2da]" />
                </View>

                <View className="flex-row flex-wrap justify-between gap-y-2.5">
                  {previewTiles.map((tile) => {
                    const isActive = tile.slug === activeTile.slug;
                    return (
                      <Pressable
                        key={tile.slug}
                        onPress={() => onSelectTile(tile.slug)}
                        className={`w-[31%] items-center gap-1.5 rounded-xl p-1.5 ${
                          isActive
                            ? "border-[1.5px] border-[#EA580C] bg-[#FFF8F3]"
                            : "border border-transparent bg-[#F8F9FA]"
                        }`}
                      >
                        <View className="size-14 items-center justify-center overflow-hidden rounded-lg bg-[#F4F1EC]">
                          <TileThumb imageUrl={tile.imageUrl} iconKey={tile.iconKey} size={52} />
                        </View>
                        <Text
                          numberOfLines={2}
                          className={`text-center text-[10.5px] font-bold leading-tight ${
                            isActive ? "text-[#C2410C]" : "text-navy-900"
                          }`}
                        >
                          {tile.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {tiles.length > 6 ? (
                <Pressable
                  onPress={() => setSeeAllOpen(true)}
                  className="h-10 items-center justify-center rounded-xl border border-navy-900 bg-white active:bg-surface-sunken"
                >
                  <Text className="text-xs font-bold text-navy-900">{seeAllLabel} →</Text>
                </Pressable>
              ) : null}

              {/* Filters */}
              <View className="rounded-2xl border border-[#e7e2da] bg-white p-4 shadow-2xs">
                {sidebarFilters}
              </View>

              {/* Need help card */}
              <View className="rounded-2xl border border-[#e7e2da] bg-white p-4 shadow-2xs">
                <View className="flex-row items-center gap-2.5">
                  <View className="size-9 items-center justify-center rounded-full bg-[#FAF9F7]">
                    <Headphones size={16} color="#00112e" />
                  </View>
                  <View>
                    <Text className="text-xs font-extrabold text-navy-900">Need help?</Text>
                    <Text className="text-[11px] text-text-secondary">Talk to our experts</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => router.push("/account" as never)}
                  className="mt-3 h-9 items-center justify-center rounded-xl border border-navy-900 bg-white active:bg-surface-sunken"
                >
                  <Text className="text-xs font-bold text-navy-900">Contact Us</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>

          {/* Center Main Content */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            className="min-w-0 flex-1"
            contentContainerClassName="pb-14"
          >
            <Pressable
              onPress={() => router.push(backHref as never)}
              className="flex-row items-center gap-1 self-start"
            >
              <ChevronLeft size={14} color="#C2410C" />
              <Text className="text-xs font-bold text-[#C2410C]">{backLabel}</Text>
            </Pressable>

            <View className="mt-3 flex-row items-start justify-between gap-6">
              <View className="flex-1">
                <Text className="text-[28px] font-black tracking-tight text-navy-900">
                  {activeTile.name}
                </Text>
                <Text className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                  {activeTile.description.trim() !== "" ? activeTile.description : heroSummary}
                </Text>
              </View>
              {activeTile.imageUrl !== "" ? (
                <View className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[#F4F1EC]">
                  <TileThumb imageUrl={activeTile.imageUrl} iconKey={activeTile.iconKey} size={96} />
                </View>
              ) : null}
            </View>

            {/* Trust badges */}
            <View className="mt-4 flex-row flex-wrap items-center gap-x-5 gap-y-2">
              {trustBadges.map((b) => {
                const Icon = b.icon;
                return (
                  <View key={b.label} className="flex-row items-center gap-1.5">
                    <Icon size={14} color="#00112e" strokeWidth={1.8} />
                    <Text className="text-xs font-semibold text-navy-900">{b.label}</Text>
                  </View>
                );
              })}
            </View>

            {centerToolbar ? <View className="mt-4">{centerToolbar}</View> : null}

            <View className="mt-5">{centerContent}</View>
          </ScrollView>

          {/* Right Slide-in Drawer */}
          {drawerOpen ? (
            <View className="w-[400px] shrink-0">{drawerContent}</View>
          ) : null}
        </View>

        {/* See All Categories Modal */}
        <SeeAllTilesModal
          visible={seeAllOpen}
          onClose={() => setSeeAllOpen(false)}
          title={seeAllModalTitle}
          subtitle={seeAllModalSubtitle}
          tiles={tiles}
          onSelectTile={onSelectTile}
          isDesktop
        />
      </View>
    );
  }

  // =========================================================================
  // MOBILE LAYOUT (< 400px safe, matches Web Mobile Left-Rail Split)
  // =========================================================================
  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Mobile Header */}
      <View className="flex-row items-center justify-between gap-2 border-b border-line/40 bg-white px-3 pb-2 pt-1.5">
        <View className="min-w-0 flex-1 flex-row items-center gap-1">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Back to home"
            onPress={() => router.push(backHref as never)}
            className="min-h-8 flex-row items-center gap-0.5 pr-1"
          >
            <ChevronLeft size={18} color="#C2410C" strokeWidth={2.5} />
            {isWide420 ? (
              <Text className="text-xs font-bold text-[#C2410C]">{backLabel}</Text>
            ) : null}
          </Pressable>
          <Text
            numberOfLines={1}
            className={`min-w-0 flex-1 font-extrabold text-navy-900 ${
              isWide400 ? "text-[18px]" : "text-[16px]"
            }`}
          >
            {sidebarTitle}
          </Text>
        </View>

        <View className="shrink-0 flex-row items-center gap-1.5">
          {headerAction}
          <Pressable
            onPress={() => setMobileFiltersOpen(true)}
            className="h-8 flex-row items-center gap-1 rounded-full border border-line bg-white px-2.5 shadow-2xs"
          >
            <SlidersHorizontal size={13} color="#00112e" />
            <Text className="text-[11px] font-bold text-navy-900">Filters</Text>
            {activeFilterCount > 0 ? (
              <View className="size-4 items-center justify-center rounded-full bg-[#EA580C]">
                <Text className="text-[10px] font-extrabold text-white">{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {/* Mobile / Tablet Split: Left Category Rail + Right Listings */}
      <View className={`flex-1 flex-row pt-2 ${isTablet ? "gap-4 px-4" : "gap-2 px-2"}`}>
        {/* Left Vertical Category Rail */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{
            width: isTablet ? 96 : isWide400 ? 80 : 74,
            flexGrow: 0,
            flexShrink: 0,
          }}
          className={`border-r border-line/70 ${isTablet ? "pr-3" : "pr-1.5"}`}
          contentContainerClassName="gap-2 pb-16"
        >
          {tiles.map((tile) => {
            const isActive = tile.slug === activeTile.slug;
            return (
              <Pressable
                key={tile.slug}
                onPress={() => onSelectTile(tile.slug)}
                className={`relative w-full items-center justify-center gap-1.5 rounded-2xl px-1 py-2.5 ${
                  isActive ? "bg-[#FFF8F3]" : "bg-[#F8F9FA]"
                }`}
              >
                {isActive ? (
                  <View className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-[#EA580C]" />
                ) : null}
                <View
                  className={`${
                    isTablet ? "size-14" : "size-12"
                  } items-center justify-center overflow-hidden rounded-xl bg-[#F4F1EC]`}
                >
                  <TileThumb
                    imageUrl={tile.imageUrl}
                    iconKey={tile.iconKey}
                    size={isTablet ? 56 : 48}
                  />
                </View>
                <Text
                  numberOfLines={2}
                  className={`w-full px-0.5 text-center font-bold leading-tight ${
                    isTablet ? "text-[11px]" : "text-[10px]"
                  } ${isActive ? "text-[#C2410C]" : "text-navy-900"}`}
                >
                  {tile.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Right Scrollable Listings Column */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          className={`min-w-0 flex-1 ${isTablet ? "pl-2" : "pl-1"}`}
          contentContainerClassName="gap-3 pb-16"
        >
          <View className="gap-0.5 border-b border-line/60 pb-2">
            <Text
              numberOfLines={1}
              className={`${
                isTablet ? "text-2xl" : "text-[17px]"
              } font-extrabold tracking-tight text-navy-900`}
            >
              {activeTile.name}
            </Text>
          </View>

          {centerToolbar}
          {centerContent}
        </ScrollView>
      </View>

      {/* Mobile Filters Modal */}
      <Modal
        visible={mobileFiltersOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMobileFiltersOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="max-h-[82%] rounded-t-3xl bg-white px-5 pb-6 pt-4">
            <View className="mb-3 flex-row items-center justify-between border-b border-line/60 pb-3">
              <Text className="text-base font-extrabold text-navy-900">Filters</Text>
              <Pressable
                onPress={() => setMobileFiltersOpen(false)}
                className="size-8 items-center justify-center rounded-full bg-slate-100"
              >
                <X size={16} color="#00112e" />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>{sidebarFilters}</ScrollView>
            <Pressable
              onPress={() => setMobileFiltersOpen(false)}
              className="mt-4 h-11 items-center justify-center rounded-xl bg-navy-900"
            >
              <Text className="text-sm font-bold text-white">Apply Filters</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Mobile Detail Drawer Bottom Sheet */}
      <Modal
        visible={drawerOpen}
        transparent
        animationType="slide"
        onRequestClose={onCloseDrawer}
      >
        <View
          className={`flex-1 bg-black/60 ${
            isTablet ? "items-center justify-center p-4" : "justify-end p-0"
          }`}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close sheet backdrop"
            className="absolute inset-0"
            onPress={onCloseDrawer}
          />
          <View
            style={{
              height: isTablet
                ? Math.min(760, Math.round(windowHeight * 0.85))
                : Math.max(
                    380,
                    Math.min(
                      Math.round(windowHeight * 0.9),
                      windowHeight - Math.max(insets.top, 24) - 12,
                    ),
                  ),
            }}
            className={`w-full max-w-lg overflow-hidden border border-[#e7e2da] bg-white shadow-2xl ${
              isTablet ? "rounded-2xl" : "rounded-t-3xl"
            }`}
          >
            {drawerContent}
          </View>
        </View>
      </Modal>
    </View>
  );
}

