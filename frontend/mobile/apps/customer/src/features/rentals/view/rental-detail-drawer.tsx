import { useQuery } from "@tanstack/react-query";
import { COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ArrowRight, MapPin, ShieldCheck, Wrench, X } from "lucide-react-native";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { formatPaise, type RentalAsset } from "../model";
import { fetchRentalAsset } from "../queries";
import { RentalBookPanel } from "./rental-book-panel";

export interface RentalDetailDrawerProps {
  asset: RentalAsset;
  onClose: () => void;
}

export function RentalDetailDrawer({ asset, onClose }: RentalDetailDrawerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const submitRef = useRef<(() => void) | null>(null);
  const [submitState, setSubmitState] = useState({
    disabled: false,
    pending: false,
    label: "Confirm booking",
  });

  const detailQuery = useQuery({
    queryKey: ["rental-asset-drawer", asset.slug || asset.id],
    queryFn: () => fetchRentalAsset(asset.slug || asset.id),
    initialData: asset,
    staleTime: 30_000,
  });

  const displayAsset = detailQuery.data ?? asset;
  const imageUrl = resolveImageUrl(
    displayAsset.media?.[0]?.url || displayAsset.thumbnail_url,
  );
  const partnerDisplay =
    displayAsset.partner_name ||
    displayAsset.partner?.company_name ||
    displayAsset.partner?.full_name ||
    null;

  return (
    <View style={{ flex: 1, minHeight: 0 }} className="bg-white">
      {/* Header */}
      <View className="flex-row items-start justify-between gap-3 border-b border-[#e7e2da] px-5 pb-3 pt-4">
        <View className="flex-1 min-w-0">
          <View className="flex-row flex-wrap items-center gap-1.5 mb-1">
            <View className="flex-row items-center gap-1 rounded-full border border-navy-900/15 bg-navy-900/10 px-2.5 py-0.5">
              <Wrench size={11} color="#0B1B3D" />
              <Text className="text-[10px] font-bold text-navy-900">
                Verified Tool
              </Text>
            </View>
            <View className="flex-row items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5">
              <ShieldCheck size={11} color="#047857" />
              <Text className="text-[10px] font-bold text-emerald-800">
                Deposit Protected
              </Text>
            </View>
          </View>

          <Text className="text-base font-extrabold leading-snug tracking-tight text-navy-900">
            {displayAsset.title}
          </Text>

          {partnerDisplay ? (
            <Text className="mt-0.5 text-[12px] text-text-secondary">
              Offered by{" "}
              <Text className="font-semibold text-navy-900">{partnerDisplay}</Text>
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close rental details"
          onPress={onClose}
          hitSlop={8}
          className="size-8 items-center justify-center rounded-full active:bg-[#FAF9F7]"
        >
          <X size={16} color="#64748B" strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Scrollable Body */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerClassName="gap-4 px-5 py-4 pb-6"
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        {imageUrl ? (
          <View className="aspect-[16/10] w-full overflow-hidden rounded-xl border border-[#e7e2da] bg-white p-3">
            <Image
              source={{ uri: imageUrl }}
              contentFit="contain"
              style={{ width: "100%", height: "100%" }}
            />
          </View>
        ) : null}

        {displayAsset.location_text ? (
          <View className="flex-row items-start gap-2 rounded-xl border border-[#e7e2da] bg-[#FAF9F7] px-3 py-2 text-[12px]">
            <MapPin size={14} color="#EA580C" style={{ marginTop: 2 }} />
            <Text className="flex-1 text-[12px] text-text-secondary" numberOfLines={2}>
              Pickup from{" "}
              <Text className="font-bold text-navy-900">
                {displayAsset.location_text}
              </Text>
              {displayAsset.delivery_available ? " · Delivery available" : ""}
            </Text>
          </View>
        ) : null}

        {displayAsset.description ? (
          <View className="gap-1">
            <Text className="text-[13px] font-extrabold text-navy-900">
              About this equipment
            </Text>
            <Text className="text-[12px] leading-relaxed text-text-secondary">
              {displayAsset.description}
            </Text>
          </View>
        ) : null}

        <RentalBookPanel
          asset={displayAsset}
          hideSubmitButton={true}
          onSubmitRef={submitRef}
          onSubmitStateChange={setSubmitState}
          embedded={true}
        />
      </ScrollView>

      {/* Sticky Footer */}
      <View
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        className="gap-2.5 border-t border-[#e7e2da] bg-white px-5 py-4"
      >
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-[11px] font-semibold text-text-secondary">
              Daily rate
            </Text>
            <View className="flex-row items-baseline gap-1 mt-0.5">
              <Text className="text-xl font-extrabold tabular-nums text-navy-900">
                {formatPaise(displayAsset.daily_rate_paise)}
              </Text>
              <Text className="text-sm font-semibold text-text-secondary">/day</Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={submitState.disabled || submitState.pending}
            onPress={() => submitRef.current?.()}
            className={`min-h-[44px] min-w-[136px] flex-row items-center justify-center gap-2 rounded-xl bg-navy-900 px-5 py-2.5 shadow-xs active:bg-navy-800 ${
              submitState.disabled ? "opacity-50" : ""
            }`}
          >
            {submitState.pending ? (
              <ActivityIndicator size="small" color={COLOR_TOKENS.textInverse} />
            ) : null}
            <Text className="text-sm font-bold text-white">
              {submitState.label}
            </Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            router.push(`/rentals/${displayAsset.slug || displayAsset.id}` as never);
          }}
          className="flex-row items-center gap-1 self-start pt-1 active:opacity-70"
        >
          <Text className="text-[12px] font-semibold text-navy-900">
            See full equipment details
          </Text>
          <ArrowRight size={13} color="#0B1B3D" />
        </Pressable>
      </View>
    </View>
  );
}

