import { Badge, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { MapPin, ShieldCheck } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { formatPaise, type RentalAsset } from "../model";

const FALLBACK_TOOL_IMAGE =
  "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?q=80&w=800&auto=format&fit=crop";

export function RentalCard({ asset }: { asset: RentalAsset }) {
  const router = useRouter();
  const dailyPrice = formatPaise(asset.daily_rate_paise);
  const deposit = formatPaise(asset.deposit_paise);
  const imageUrl = asset.media?.[0]?.url || asset.thumbnail_url || FALLBACK_TOOL_IMAGE;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/rentals/${asset.slug || asset.id}` as never)}
      className="overflow-hidden rounded-2xl border border-line bg-surface active:opacity-95"
    >
      <View className="relative h-44 w-full bg-[#f0ede6]">
        <Image
          source={{ uri: imageUrl }}
          contentFit="cover"
          style={{ width: "100%", height: "100%" }}
        />
        <View className="absolute left-3 top-3 flex-row gap-1.5">
          <Badge tone="brand" className="bg-brand/90 backdrop-blur-xs">
            <Text className="text-[10px] font-bold text-white">Verified</Text>
          </Badge>
          {asset.quantity_available && asset.quantity_available > 0 ? (
            <Badge tone="success" className="bg-emerald-600/90 backdrop-blur-xs">
              <Text className="text-[10px] font-bold text-white">Available</Text>
            </Badge>
          ) : null}
        </View>
      </View>

      <View className="gap-2.5 p-4">
        <View className="gap-0.5">
          <Text className="text-base font-extrabold text-navy-900" numberOfLines={1}>
            {asset.title}
          </Text>
          {asset.location_text ? (
            <View className="flex-row items-center gap-1">
              <MapPin size={12} color="#6B6560" />
              <Text className="text-xs text-text-secondary" numberOfLines={1}>
                {asset.location_text}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="flex-row items-center justify-between border-t border-line/60 pt-2.5">
          <View>
            <Text className="text-[10px] font-medium text-text-muted">Daily Rate</Text>
            <View className="flex-row items-baseline gap-1">
              <Text className="text-base font-black text-navy-900">{dailyPrice}</Text>
              <Text className="text-xs text-text-secondary">/ day</Text>
            </View>
          </View>

          <View className="items-end">
            <View className="flex-row items-center gap-1">
              <ShieldCheck size={12} color="#16a34a" />
              <Text className="text-[10px] font-bold text-emerald-700">Refundable</Text>
            </View>
            <Text className="text-xs font-semibold text-text-secondary">
              Deposit: {deposit}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
