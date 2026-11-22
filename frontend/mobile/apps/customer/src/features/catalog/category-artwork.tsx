import { apiBaseUrl, webBaseUrl } from "@vsolve/mobile-core";
import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";

import { iconForService } from "./icon-catalogue/service-icon";
import type { Category } from "./client-queries";

const CLOUDFLARE_R2_BASE = "https://media.vsolvehub.com";

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

  // Relative catalog tiles -> resolve directly to the public media domain
  if (trimmed.startsWith("/catalog/")) {
    return `${CLOUDFLARE_R2_BASE}${trimmed}`;
  }

  // Relative media / static -> resolve to API base URL
  if (trimmed.startsWith("/")) {
    const apiBase = apiBaseUrl();
    return `${apiBase}${trimmed}`;
  }

  return trimmed;
}

/**
 * A category's artwork, by the same rule as the web: the catalogue's own `image_url`,
 * or the category's `icon_key` icon while it has no photo (or the photo fails to load).
 * The app ships no copy of catalogue photos, so a photo changed in the catalogue shows
 * here without an app release, exactly as on the web.
 */
export function CategoryArtwork({
  category,
  iconSize = 30,
}: {
  category: Pick<Category, "image_url" | "icon_key">;
  iconSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const uri = resolveImageUrl(category.image_url);

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

  const Icon = iconForService(category.icon_key || "service");
  return (
    <View className="items-center justify-center p-3">
      <Icon size={iconSize} color="#00112e" strokeWidth={1.8} />
    </View>
  );
}
