import { apiBaseUrl, webBaseUrl } from "@vsolve/mobile-core";
import { Image } from "expo-image";
import {
  AirVent,
  Briefcase,
  Building2,
  Calendar,
  ChefHat,
  Dog,
  Droplets,
  HardHat,
  Home,
  KeyRound,
  Scissors,
  Sparkles,
  SprayCan,
  UtensilsCrossed,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { iconForService } from "./icon-catalogue/service-icon";
import type { Category } from "./client-queries";

/**
 * Static require map for local bundled 3D category & subcategory tiles.
 * Having these bundled ensures instant offline/online rendering with zero delay,
 * exactly matching the web laptop experience.
 */
export const LOCAL_CATEGORY_TILES: Readonly<Record<string, any>> = {
  "career-jobs": require("../../../assets/catalog/tiles/career-jobs.png"),
  "rental-services": require("../../../assets/catalog/tiles/rental-services.png"),
  "rooms-pg-hostel-hotels": require("../../../assets/catalog/tiles/rooms-pg-hostel-hotels.png"),
  "technician-jobs": require("../../../assets/catalog/tiles/technician-jobs.png"),
  "tools-machinery": require("../../../assets/catalog/tiles/tools-machinery.png"),
  coolingheating: require("../../../assets/catalog/tiles/coolingheating.png"),
  "cleaning-maintenance-jobs": require("../../../assets/catalog/tiles/cleaning-maintenance-jobs.png"),
  "catering-equipment": require("../../../assets/catalog/tiles/catering-equipment.png"),
  "construction-jobs": require("../../../assets/catalog/tiles/construction-jobs.png"),
  "construction-equipment": require("../../../assets/catalog/tiles/construction-equipment.png"),
  "furniture-rental-homeoffice": require("../../../assets/catalog/tiles/furniture-rental-homeoffice.png"),
  "home-appliance-rental": require("../../../assets/catalog/tiles/home-appliance-rental.png"),
  "lighting-rental": require("../../../assets/catalog/tiles/lighting-rental.png"),
  "sound-system-rental": require("../../../assets/catalog/tiles/sound-system-rental.png"),
  apartments: require("../../../assets/catalog/tiles/apartments.png"),
  "pg-accommodation": require("../../../assets/catalog/tiles/pg-accommodation.png"),
  hotels: require("../../../assets/catalog/tiles/hotels.png"),
  hostels: require("../../../assets/catalog/tiles/hostels.png"),
  "short-stay": require("../../../assets/catalog/tiles/short-stay.png"),
  "bed-space": require("../../../assets/catalog/tiles/bed-space.png"),
  "co-living-spaces": require("../../../assets/catalog/tiles/co-living-spaces.png"),
  "premium-stays": require("../../../assets/catalog/tiles/premium-stays.png"),
  "property-listing": require("../../../assets/catalog/tiles/property-listing.png"),
  "rental-properties": require("../../../assets/catalog/tiles/rental-properties.png"),
  "banking-insurance-jobs": require("../../../assets/catalog/tiles/banking-insurance-jobs.png"),
  "beauty-wellness-jobs": require("../../../assets/catalog/tiles/beauty-wellness-jobs.png"),
  "bpo-call-center-jobs": require("../../../assets/catalog/tiles/bpo-call-center-jobs.png"),
  "business-services-jobs": require("../../../assets/catalog/tiles/business-services-jobs.png"),
  "customer-support-jobs": require("../../../assets/catalog/tiles/customer-support-jobs.png"),
  "delivery-logistics-jobs": require("../../../assets/catalog/tiles/delivery-logistics-jobs.png"),
  "domestic-jobs": require("../../../assets/catalog/tiles/domestic-jobs.png"),
  "driver-jobs": require("../../../assets/catalog/tiles/driver-jobs.png"),
  "education-jobs": require("../../../assets/catalog/tiles/education-jobs.png"),
  "finance-accounts-jobs": require("../../../assets/catalog/tiles/finance-accounts-jobs.png"),
  "freelance-jobs": require("../../../assets/catalog/tiles/freelance-jobs.png"),
  "health-care-jobs": require("../../../assets/catalog/tiles/health-care-jobs.png"),
  "hr-recruitment-jobs": require("../../../assets/catalog/tiles/hr-recruitment-jobs.png"),
  "internship-jobs": require("../../../assets/catalog/tiles/internship-jobs.png"),
  "it-software-jobs": require("../../../assets/catalog/tiles/it-software-jobs.png"),
  "retail-shop-staff": require("../../../assets/catalog/tiles/retail-shop-staff.png"),
  "sales-marketing-jobs": require("../../../assets/catalog/tiles/sales-marketing-jobs.png"),
  "security-jobs": require("../../../assets/catalog/tiles/security-jobs.png"),
  "work-from-home-jobs": require("../../../assets/catalog/tiles/work-from-home-jobs.png"),
};

/**
 * Resolves any image URL (relative or localhost) to a fully qualified URL
 * reachable from mobile devices on LAN/production.
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();

  // If already absolute HTTP(S)
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    // If it points to localhost or 127.0.0.1, replace host with mobile-reachable API IP
    if (trimmed.includes("localhost") || trimmed.includes("127.0.0.1")) {
      const apiBase = apiBaseUrl();
      return trimmed.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, apiBase);
    }
    return trimmed;
  }

  // Relative catalog tiles -> resolve to web base URL
  if (trimmed.startsWith("/catalog/tiles/")) {
    const webBase = webBaseUrl();
    return `${webBase}${trimmed}`;
  }

  // Relative media / static -> resolve to API base URL
  if (trimmed.startsWith("/")) {
    const apiBase = apiBaseUrl();
    return `${apiBase}${trimmed}`;
  }

  return trimmed;
}

/**
 * Returns a trade-specific Lucide icon component when no image is available
 * or when image loading fails. Never defaults to an arbitrary house icon.
 */
export function getCategoryFallbackIcon(slug?: string, iconKey?: string): LucideIcon {
  const normalizedSlug = (slug || "").toLowerCase().trim();
  const normalizedKey = (iconKey || "").toLowerCase().trim();

  if (normalizedSlug === "technician" || normalizedKey === "wrench" || normalizedKey === "tools") {
    return Wrench;
  }
  if (normalizedSlug === "electrician" || normalizedKey === "electrical" || normalizedKey === "zap") {
    return Zap;
  }
  if (normalizedSlug === "plumber" || normalizedKey === "plumbing" || normalizedKey === "droplets" || normalizedKey === "droplet") {
    return Droplets;
  }
  if (normalizedSlug.includes("career") || normalizedSlug.includes("job") || normalizedKey === "workforce") {
    return Briefcase;
  }
  if (normalizedSlug.includes("rental") || normalizedKey === "rentals" || normalizedKey === "key") {
    return KeyRound;
  }
  if (normalizedSlug.includes("room") || normalizedSlug.includes("stay") || normalizedSlug.includes("hostel") || normalizedSlug.includes("hotel")) {
    return Building2;
  }
  if (normalizedSlug.includes("ac") || normalizedKey === "air-conditioning" || normalizedKey === "air-conditioner") {
    return AirVent;
  }
  if (normalizedSlug.includes("beauty") || normalizedSlug.includes("salon") || normalizedKey === "beauty-treatment") {
    return Sparkles;
  }
  if (normalizedSlug.includes("clean") || normalizedKey === "home-cleaning") {
    return SprayCan;
  }
  if (normalizedSlug.includes("home")) {
    return Home;
  }
  if (normalizedSlug.includes("pet") || normalizedKey.includes("pet")) {
    return Dog;
  }
  if (normalizedSlug.includes("construction") || normalizedKey === "custom-project") {
    return HardHat;
  }
  if (normalizedSlug.includes("cater") || normalizedSlug.includes("event") || normalizedKey === "gas-stove") {
    return UtensilsCrossed;
  }

  if (normalizedKey && normalizedKey !== "service") {
    return iconForService(normalizedKey);
  }

  return Wrench;
}

/**
 * Resolves the artwork source for a category:
 * 1. Local bundled tile asset (if available in assets/catalog/tiles)
 * 2. Remote resolved image URL
 * 3. Fallback icon
 */
export function getCategoryArtworkSource(category: Pick<Category, "slug" | "image_url">): {
  type: "local" | "remote" | "icon";
  source?: any;
  uri?: string;
} {
  // Check local bundled tiles first (instant, guaranteed to display)
  const localAsset = LOCAL_CATEGORY_TILES[category.slug];
  if (localAsset) {
    return { type: "local", source: localAsset };
  }

  // Check if image_url points to a known local tile filename
  if (category.image_url) {
    const tileMatch = category.image_url.match(/\/catalog\/tiles\/([^/.]+)\.png/);
    if (tileMatch && tileMatch[1] && LOCAL_CATEGORY_TILES[tileMatch[1]]) {
      return { type: "local", source: LOCAL_CATEGORY_TILES[tileMatch[1]] };
    }

    const resolved = resolveImageUrl(category.image_url);
    if (resolved) {
      return { type: "remote", uri: resolved };
    }
  }

  return { type: "icon" };
}

/**
 * Self-healing Category Artwork component.
 * Displays local 3D tiles, remote images, or distinctive brand-colored icons.
 * Never leaves a blank box and never collapses to 0 height.
 */
export function CategoryArtwork({
  category,
  size = "100%",
  iconSize = 30,
}: {
  category: Category;
  size?: number | string;
  iconSize?: number;
}) {
  const [remoteFailed, setRemoteFailed] = useState(false);
  const artwork = getCategoryArtworkSource(category);

  if (artwork.type === "local" && artwork.source) {
    return (
      <Image
        source={artwork.source}
        contentFit="contain"
        style={{ width: "100%", height: "100%" }}
      />
    );
  }

  if (artwork.type === "remote" && artwork.uri && !remoteFailed) {
    const isTransparentTile = artwork.uri.includes("/catalog/tiles/") || artwork.uri.includes("/Service%20Cover/");
    return (
      <Image
        source={{ uri: artwork.uri }}
        contentFit={isTransparentTile ? "contain" : "cover"}
        style={{ width: "100%", height: "100%" }}
        onError={() => setRemoteFailed(true)}
      />
    );
  }

  const FallbackIcon = getCategoryFallbackIcon(category.slug, category.icon_key);
  return (
    <View className="items-center justify-center">
      <FallbackIcon size={iconSize} color="#00112e" strokeWidth={1.8} />
    </View>
  );
}
