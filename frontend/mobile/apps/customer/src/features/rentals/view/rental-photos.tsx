import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { resolveImageUrl } from "@/features/catalog/category-artwork";

interface RentalPhoto {
  readonly id?: string;
  readonly url: string;
  readonly display_order?: number;
}

/**
 * A rental item's own photos, whole: a product cropped to fit a box hides what is being rented.
 * Nothing at all when it has none, never a stand-in.
 */
export function RentalPhotos({ media, title }: { media: readonly RentalPhoto[]; title: string }) {
  const [index, setIndex] = useState(0);
  const photos = [...media]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((item) => ({ key: item.id ?? item.url, uri: resolveImageUrl(item.url) }))
    .filter((item): item is { key: string; uri: string } => item.uri !== null);

  const current = photos[Math.min(index, photos.length - 1)];
  if (!current) return null;

  return (
    <View className="gap-2">
      <View className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line bg-white p-3">
        <Image
          source={{ uri: current.uri }}
          accessibilityLabel={title}
          contentFit="contain"
          style={{ width: "100%", height: "100%" }}
          transition={200}
        />
      </View>
      {photos.length > 1 ? (
        <View className="flex-row flex-wrap gap-2">
          {photos.map((photo, position) => (
            <Pressable
              key={photo.key}
              accessibilityRole="button"
              accessibilityLabel={`Show photo ${position + 1}`}
              onPress={() => setIndex(position)}
              className={`size-14 overflow-hidden rounded-xl border bg-white p-1 ${
                position === index ? "border-action" : "border-line"
              }`}
            >
              <Image
                source={{ uri: photo.uri }}
                contentFit="contain"
                style={{ width: "100%", height: "100%" }}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
