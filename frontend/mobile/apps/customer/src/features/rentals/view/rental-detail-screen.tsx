import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, COLOR_TOKENS, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Wrench,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatPaise } from "../model";
import { fetchRentalAsset } from "../queries";
import { RentalBookPanel } from "./rental-book-panel";

export function RentalDetailScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // W-020: Canonical slug redirect with query cache priming
  useEffect(() => {
    if (asset?.slug && slug !== asset.slug) {
      queryClient.setQueryData(["rental-asset", asset.slug], asset);
      router.replace(`/rentals/${encodeURIComponent(asset.slug)}` as never);
    }
  }, [asset, asset?.slug, queryClient, router, slug]);

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

  const structuredFields = asset.structured_fields || {};
  const fieldEntries = Object.entries(structuredFields).filter(
    ([_, val]) => val !== undefined && val !== null && val !== "",
  );

  const isOutOfStock = asset.quantity_available === 0;
  const partnerName =
    asset.partner_name ||
    asset.partner?.company_name ||
    asset.partner?.full_name ||
    "Verified Tool Host";

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-6 px-4 py-4 pb-24"
      showsVerticalScrollIndicator={false}
      style={{ paddingTop: Math.max(insets.top, 12) }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      {/* Top Breadcrumb / Back Navigation matching Web Image 1 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Equipment Rentals"
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace("/rentals" as never);
          }
        }}
        className="flex-row items-center gap-1.5 self-start py-1"
      >
        <ArrowLeft size={14} color={COLOR_TOKENS.textSecondary} />
        <Text className="text-xs font-bold text-text-secondary">
          Back to Equipment Rentals
        </Text>
      </Pressable>

      {/* Card 1: Equipment Details Card (Web 100% Parity) */}
      <View className="gap-4 rounded-2xl border border-line bg-surface p-6 shadow-xs">
        {/* Badges matching Web 100% */}
        <View className="flex-row items-center gap-2">
          <View className="flex-row items-center gap-1.5 self-start rounded-full border border-info-line bg-info-surface px-2.5 py-1">
            <Wrench size={12} color={COLOR_TOKENS.infoText} />
            <Text className="text-xs font-bold text-info-text">Verified Tool</Text>
          </View>
          <View className="flex-row items-center gap-1.5 self-start rounded-full border border-success-line bg-success-surface px-2.5 py-1">
            <ShieldCheck size={14} color={COLOR_TOKENS.success} />
            <Text className="text-xs font-bold text-success-text">Deposit Protected</Text>
          </View>
        </View>

        {/* Title */}
        <Text className="text-2xl font-extrabold text-navy-900 leading-tight">{asset.title}</Text>

        {/* Partner Attribution Line matching web */}
        <Text className="text-xs font-medium text-text-secondary">
          Offered by <Text className="font-bold text-navy-900">{partnerName}</Text>
        </Text>

        {/* Self Pickup Location Note matching web */}
        {asset.location_text ? (
          <View className="flex-row items-start gap-1.5 pt-0.5">
            <MapPin size={14} color={COLOR_TOKENS.action} className="mt-0.5" />
            <Text className="flex-1 text-xs text-text-secondary leading-snug">
              Self pickup: you collect it from the owner at{" "}
              <Text className="font-bold text-navy-900">{asset.location_text}</Text> and return it
              there.
            </Text>
          </View>
        ) : null}

        {/* Out of Stock Notice */}
        {isOutOfStock ? (
          <View className="flex-row items-center gap-2 rounded-xl border border-danger-line bg-danger-surface p-3">
            <AlertCircle size={16} color={COLOR_TOKENS.danger} />
            <Text className="flex-1 text-xs font-bold text-danger-text">Out of stock</Text>
          </View>
        ) : null}

        {/* About This Equipment Section matching web */}
        <View className="border-t border-line/70 pt-5 gap-2">
          <Text className="text-sm font-bold text-navy-900">About This Equipment</Text>
          <Text className="text-sm leading-relaxed text-text-secondary">
            {asset.description ||
              "Complete professional woodworking kit including claw hammer, precision chisels, block plane, try square, and heavy-duty clamps."}
          </Text>
        </View>

        {/* Specifications if present */}
        {fieldEntries.length > 0 ? (
          <View className="gap-2 border-t border-line/70 pt-4">
            <Text className="text-sm font-bold text-navy-900">Specifications</Text>
            <View className="rounded-xl border border-line bg-canvas p-3 divide-y divide-line/60">
              {fieldEntries.map(([k, v]) => (
                <View key={k} className="flex-row justify-between py-1.5">
                  <Text className="text-xs capitalize text-text-secondary">
                    {k.replaceAll("_", " ")}
                  </Text>
                  <Text className="text-xs font-bold text-navy-900">{String(v)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* 3-Column Sunken Pricing & Availability Grid matching web Image 1 100% */}
        <View className="mt-2 rounded-xl border border-line/60 bg-surface-muted p-4">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1 items-start">
              <Text className="text-xs font-medium text-text-secondary" numberOfLines={1}>
                Daily Rental Rate
              </Text>
              <View className="flex-row items-baseline gap-1 mt-1">
                <Text className="text-xl font-extrabold text-navy-900 tabular-nums">
                  {formatPaise(asset.daily_rate_paise)}
                </Text>
                <Text className="text-xs font-medium text-text-secondary">/ day</Text>
              </View>
            </View>

            <View className="flex-1 items-start">
              <Text className="text-xs font-medium text-text-secondary" numberOfLines={1}>
                Security Deposit
              </Text>
              <Text className="text-xl font-extrabold text-navy-900 tabular-nums mt-1">
                {formatPaise(asset.deposit_paise)}
              </Text>
              <Text className="text-[10px] font-semibold text-success mt-0.5">
                100% Refundable
              </Text>
            </View>

            <View className="flex-1 items-start">
              <Text className="text-xs font-medium text-text-secondary" numberOfLines={1}>
                Quantity available
              </Text>
              <Text className="text-xl font-extrabold text-navy-900 tabular-nums mt-1">
                {asset.quantity_available ?? 1}
              </Text>
              <Text className="text-[10px] font-semibold text-text-secondary mt-0.5">
                Identical units for rent
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Card 2: V Solve Hub Rental Guarantee matching Web 100% */}
      <View className="gap-4 rounded-2xl border border-line bg-surface p-6 shadow-xs">
        <View className="flex-row items-center gap-2">
          <ShieldCheck size={18} color={COLOR_TOKENS.success} />
          <Text className="text-sm font-bold text-navy-900">V Solve Hub Rental Guarantee</Text>
        </View>

        <View className="gap-3 pt-1">
          <View className="flex-row items-start gap-2.5">
            <CheckCircle2 size={16} color={COLOR_TOKENS.success} className="mt-0.5" />
            <Text className="flex-1 text-xs text-text-secondary leading-relaxed">
              <Text className="font-bold text-navy-900">Identity & Equipment Verification:</Text> Both
              customer and partner identities are verified before handover.
            </Text>
          </View>

          <View className="flex-row items-start gap-2.5">
            <CheckCircle2 size={16} color={COLOR_TOKENS.success} className="mt-0.5" />
            <Text className="flex-1 text-xs text-text-secondary leading-relaxed">
              <Text className="font-bold text-navy-900">Full Security Deposit Release:</Text> When you
              return the tool in good condition, your security deposit is released back immediately.
            </Text>
          </View>

          <View className="flex-row items-start gap-2.5">
            <CheckCircle2 size={16} color={COLOR_TOKENS.success} className="mt-0.5" />
            <Text className="flex-1 text-xs text-text-secondary leading-relaxed">
              <Text className="font-bold text-navy-900">Condition Checked:</Text> Inspect tool
              operation with the partner before signing off handover.
            </Text>
          </View>
        </View>
      </View>

      {/* Card 3: Interactive Rental Booking Panel matching Web */}
      <RentalBookPanel asset={asset} />
    </ScrollView>
  );
}
