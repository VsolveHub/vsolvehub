import { useQuery } from "@tanstack/react-query";
import { Badge, Button, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Store,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatPaise } from "../model";
import { fetchRentalAsset } from "../queries";
import { RentalBookSheet } from "./rental-book-sheet";

const FALLBACK_TOOL_IMAGE =
  "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?q=80&w=800&auto=format&fit=crop";

export function RentalDetailScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [bookSheetOpen, setBookSheetOpen] = useState(false);

  const {
    data: asset,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["rental-asset", slug],
    queryFn: () => fetchRentalAsset(slug),
    enabled: Boolean(slug),
  });

  useEffect(() => {
    if (asset?.slug && slug !== asset.slug) {
      router.replace(`/rentals/${encodeURIComponent(asset.slug)}` as never);
    }
  }, [asset?.slug, router, slug]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-canvas p-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-4 h-64 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-12 w-3/4" />
      </View>
    );
  }

  if (error || !asset) {
    return (
      <View className="flex-1 bg-canvas p-6 justify-center">
        <ErrorState
          title="Equipment not found"
          message="This rental listing does not exist or has been retired."
          onAction={() => void refetch()}
        />
      </View>
    );
  }

  const imageUrl = asset.media?.[0]?.url || asset.thumbnail_url || FALLBACK_TOOL_IMAGE;
  const structuredFields = (asset.structured_fields || {}) as Record<string, any>;
  const fieldEntries = Object.entries(structuredFields).filter(
    ([_, val]) => val !== undefined && val !== null && val !== ""
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView className="flex-1" contentContainerClassName="pb-32">
        {/* Header Photo */}
        <View className="relative h-72 w-full bg-[#f0ede6]">
          <Image
            source={{ uri: imageUrl }}
            contentFit="cover"
            style={{ width: "100%", height: "100%" }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            className="absolute left-4 top-4 size-10 items-center justify-center rounded-full bg-navy-900/60 backdrop-blur-md active:bg-navy-900"
          >
            <ArrowLeft size={18} color="#ffffff" />
          </Pressable>
        </View>

        <View className="gap-6 p-5">
          {/* Title & Badges */}
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <Badge tone="brand">
                <Text className="text-[10px] font-bold">Verified Tool</Text>
              </Badge>
              <Badge tone="success">
                <Text className="text-[10px] font-bold">100% Deposit Protected</Text>
              </Badge>
            </View>

            <Text className="text-2xl font-black text-navy-900">{asset.title}</Text>

            {asset.location_text ? (
              <View className="flex-row items-center gap-1.5">
                <MapPin size={14} color="#6B6560" />
                <Text className="text-xs text-text-secondary">{asset.location_text}</Text>
              </View>
            ) : null}
          </View>

          {/* Pricing Highlight Tile */}
          <View className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-[10px] uppercase tracking-wider text-text-muted">Daily Rate</Text>
                <View className="flex-row items-baseline gap-1">
                  <Text className="text-2xl font-black text-navy-900">
                    {formatPaise(asset.daily_rate_paise)}
                  </Text>
                  <Text className="text-xs text-text-secondary">/ day</Text>
                </View>
              </View>

              <View className="items-end">
                <Text className="text-[10px] uppercase tracking-wider text-text-muted">
                  Refundable Deposit
                </Text>
                <Text className="text-lg font-black text-emerald-700">
                  {formatPaise(asset.deposit_paise)}
                </Text>
              </View>
            </View>

            <View className="mt-3 flex-row items-center gap-2 rounded-xl bg-canvas p-2.5">
              <ShieldCheck size={16} color="#16a34a" />
              <Text className="flex-1 text-[11px] leading-tight text-text-secondary">
                Security deposit is released back into your source account within 24 hours of return.
              </Text>
            </View>
          </View>

          {/* Description */}
          {asset.description ? (
            <View className="gap-2">
              <Text className="text-sm font-extrabold text-navy-900">About this gear</Text>
              <Text className="text-xs leading-relaxed text-text-secondary">
                {asset.description}
              </Text>
            </View>
          ) : null}

          {/* Specifications */}
          {fieldEntries.length > 0 ? (
            <View className="gap-2">
              <Text className="text-sm font-extrabold text-navy-900">Specifications</Text>
              <View className="rounded-2xl border border-line bg-surface p-3 divide-y divide-line/60">
                {fieldEntries.map(([k, v]) => (
                  <View key={k} className="flex-row justify-between py-2">
                    <Text className="text-xs capitalize text-text-secondary">
                      {k.replaceAll("_", " ")}
                    </Text>
                    <Text className="text-xs font-bold text-navy-900">{String(v)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Partner / Provider Information */}
          <View className="rounded-2xl border border-line bg-surface p-4">
            <View className="flex-row items-center gap-3">
              <View className="size-10 items-center justify-center rounded-full bg-brand/10">
                <Store size={18} color="#EA580C" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-extrabold text-navy-900">
                  {asset.partner?.company_name || asset.partner?.full_name || "Verified Tool Host"}
                </Text>
                <Text className="text-[10px] text-text-secondary">
                  Inspected & maintenance certified
                </Text>
              </View>
            </View>
          </View>

          {/* Safe Rental Checklist */}
          <View className="gap-2.5 rounded-2xl bg-[#FFF9F5] p-4 border border-brand/20">
            <Text className="text-xs font-black uppercase tracking-wider text-brand">
              Safe Rental Protocol
            </Text>
            <View className="gap-2">
              <View className="flex-row items-start gap-2">
                <CheckCircle2 size={14} color="#EA580C" />
                <Text className="flex-1 text-xs text-text-secondary">
                  Test the equipment upon physical pickup at partner counter.
                </Text>
              </View>
              <View className="flex-row items-start gap-2">
                <CheckCircle2 size={14} color="#EA580C" />
                <Text className="flex-1 text-xs text-text-secondary">
                  Provide digital PIN confirmation to start possession timer.
                </Text>
              </View>
              <View className="flex-row items-start gap-2">
                <CheckCircle2 size={14} color="#EA580C" />
                <Text className="flex-1 text-xs text-text-secondary">
                  Return clean and undamaged to claim instant deposit release.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Booking Bar */}
      <View
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface px-4 pt-3 shadow-raised"
      >
        <View className="flex-row items-center justify-between gap-4">
          <View>
            <Text className="text-[10px] text-text-muted">Daily rate</Text>
            <Text className="text-lg font-black text-navy-900">
              {formatPaise(asset.daily_rate_paise)}
            </Text>
          </View>

          <Button
            size="lg"
            variant="primary"
            onPress={() => setBookSheetOpen(true)}
            className="flex-1 rounded-xl py-3.5"
          >
            Rent Equipment Now
          </Button>
        </View>
      </View>

      {/* Booking Modal */}
      <RentalBookSheet
        asset={asset}
        open={bookSheetOpen}
        onOpenChange={setBookSheetOpen}
      />
    </View>
  );
}
