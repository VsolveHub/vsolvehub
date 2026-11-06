// Ported from frontend/apps/customer/features/catalog/components/promo-banners.tsx
import { Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { Dimensions, ScrollView, View } from "react-native";

import type { PromoBanner } from "../client-queries";

export interface PromoBannersProps {
  banners: PromoBanner[];
  fallbackImageUrl?: string;
}

/**
 * Operations' promotional banners, laid out like a marketplace offer card: a large title,
 * one line of detail, the small print, and artwork on the right.
 *
 * Display-only. The copy comes from `/api/v1/promo-banners/`; nothing here touches price,
 * and checkout does not read banners. A banner without its own image uses the category's
 * 3D artwork from the catalogue, so every card has a picture without inventing one.
 */
export function PromoBanners({ banners, fallbackImageUrl = "" }: PromoBannersProps) {
  if (banners.length === 0) return null;
  const several = banners.length > 1;
  const screenWidth = Dimensions.get("window").width;
  const cardWidth = several ? Math.min(screenWidth * 0.85, 360) : undefined;

  return (
    <View accessibilityLabel="Offers" className="my-6">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth ? cardWidth + 12 : undefined}
        decelerationRate="fast"
        contentContainerClassName={several ? "gap-3 px-4" : "px-4"}
      >
        {banners.map((banner) => {
          const imageUrl = banner.image_url?.trim() ? banner.image_url : fallbackImageUrl;
          return (
            <View
              key={banner.id}
              style={cardWidth ? { width: cardWidth } : { width: "100%" }}
              className="flex-row items-center justify-between gap-4 overflow-hidden rounded-2xl bg-[#F5F5F5] p-5 shadow-2xs"
            >
              <View className="flex-1 min-w-0 pr-2">
                <Text
                  accessibilityRole="header"
                  className="text-lg font-extrabold leading-tight tracking-tight text-[#0F0F0F]"
                >
                  {banner.title}
                </Text>
                {banner.subtitle ? (
                  <Text className="mt-1.5 text-xs leading-snug text-[#0F0F0F]">
                    {banner.subtitle}
                  </Text>
                ) : null}
                {banner.terms ? (
                  <Text className="mt-3 text-[11px] text-[#545454]">{banner.terms}</Text>
                ) : null}
              </View>
              {imageUrl !== "" ? (
                <Image
                  source={{ uri: imageUrl }}
                  contentFit="contain"
                  style={{ width: 84, height: 84, borderRadius: 12 }}
                  accessibilityLabel=""
                />
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      {several ? (
        <View className="mt-3 flex-row justify-center gap-1.5">
          {banners.map((banner) => (
            <View key={banner.id} className="h-1 w-6 rounded-full bg-[#D1D5DB]" />
          ))}
        </View>
      ) : null}
    </View>
  );
}
