import { describeError } from "@vsolve/query/native";
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { useCoinTransactions, useCustomerCoins } from "../queries";

export function CoinsScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const coinsQuery = useCustomerCoins();
  const txnsQuery = useCoinTransactions();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([coinsQuery.refetch(), txnsQuery.refetch()]);
    setRefreshing(false);
  };

  const summary = coinsQuery.data;

  const content = coinsQuery.isPending ? (
    <View className="py-12 items-center justify-center">
      <Spinner size="sm" />
      <Text className="mt-2 text-sm text-[#64748B]">Loading your V Coins…</Text>
    </View>
  ) : coinsQuery.isError ? (
    <ErrorState
      title="Could not load V Coins"
      message={coinsQuery.error ? describeError(coinsQuery.error, "read").message : "Please try again"}
      actionLabel="Try again"
      onAction={() => void coinsQuery.refetch()}
    />
  ) : (
    <>
          {/* Balance Hero Card */}
          <View className="overflow-hidden rounded-2xl bg-[#0B162C] p-5 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  SPENDABLE V COINS
                </Text>
                <Text className="mt-1 text-3xl font-extrabold text-white">
                  {(summary?.spendable_coins ?? 0).toLocaleString("en-IN")} <Text className="text-lg font-bold text-[#EA580C]">Coins</Text>
                </Text>
              </View>
              <View className="size-12 items-center justify-center rounded-xl bg-[#EA580C]/20 border border-[#EA580C]/40">
                <Svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="#EA580C" strokeWidth={2}>
                  <Circle cx={12} cy={12} r={9} />
                  <Path d="m8.5 8.5 3.5 7 3.5-7" />
                </Svg>
              </View>
            </View>

            <View className="mt-4 grid grid-cols-2 flex-row gap-2 border-t border-white/10 pt-3">
              <View className="flex-1">
                <Text className="text-[11px] text-[#94A3B8]">Pending</Text>
                <Text className="text-sm font-bold text-white">
                  {(summary?.pending_coins ?? 0).toLocaleString("en-IN")}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-[11px] text-[#94A3B8]">Expiring soon</Text>
                <Text className="text-sm font-bold text-[#EA580C]">
                  {(summary?.expiring_soon_coins ?? 0).toLocaleString("en-IN")}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-[11px] text-[#94A3B8]">Locked</Text>
                <Text className="text-sm font-bold text-[#94A3B8]">
                  {(summary?.locked_coins ?? 0).toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
          </View>

          {/* How V Coins Work */}
          <View className="rounded-2xl border border-[#F1EFEB] bg-white p-4 shadow-xs gap-3">
            <Text className="text-base font-bold text-[#0F172A]">How V Coins work</Text>

            <View className="flex-row items-start gap-3">
              <View className="size-8 items-center justify-center rounded-lg bg-[#FFF6ED] shrink-0 mt-0.5">
                <Text className="text-xs font-bold text-[#EA580C]">1</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-[#0F172A]">Earn on completed bookings</Text>
                <Text className="text-xs text-[#64748B] mt-0.5">Get 5% back in V Coins automatically whenever your booking is finished.</Text>
              </View>
            </View>

            <View className="flex-row items-start gap-3">
              <View className="size-8 items-center justify-center rounded-lg bg-[#FFF6ED] shrink-0 mt-0.5">
                <Text className="text-xs font-bold text-[#EA580C]">2</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-[#0F172A]">Redeem 1:1 for instant discounts</Text>
                <Text className="text-xs text-[#64748B] mt-0.5">1 V Coin = ₹1 discount. Use coins right at the checkout screen.</Text>
              </View>
            </View>

            <View className="flex-row items-start gap-3">
              <View className="size-8 items-center justify-center rounded-lg bg-[#FFF6ED] shrink-0 mt-0.5">
                <Text className="text-xs font-bold text-[#EA580C]">3</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-[#0F172A]">Never expire while active</Text>
                <Text className="text-xs text-[#64748B] mt-0.5">Keep your account active with at least one booking every 180 days.</Text>
              </View>
            </View>
          </View>

          {/* Coins Transactions */}
          <View className="rounded-2xl border border-[#F1EFEB] bg-white p-4 shadow-xs">
            <Text className="text-base font-bold text-[#0F172A]">Coin activity</Text>
            {txnsQuery.isPending ? (
              <View className="py-6 items-center">
                <Spinner size="sm" />
              </View>
            ) : txnsQuery.data && txnsQuery.data.length > 0 ? (
              <View className="mt-3 divide-y divide-[#F4F2EE]">
                {txnsQuery.data.map((txn) => {
                  const isEarned = !["BURN", "RESERVE", "EXPIRE", "CANCEL", "REVERSE"].includes(txn.kind);
                  const formattedDate = new Date(txn.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                  return (
                    <View key={txn.id} className="flex-row items-center justify-between py-3">
                      <View className="flex-1 min-w-0 pr-2">
                        <Text className="text-sm font-semibold text-[#0F172A]">{txn.notes || txn.kind.replace("_", " ")}</Text>
                        <Text className="text-xs text-[#64748B] mt-0.5">{formattedDate}</Text>
                      </View>
                      <Text className={`text-base font-bold ${isEarned ? "text-emerald-600" : "text-[#EA580C]"}`}>
                        {isEarned ? "+" : "-"}{txn.amount} Coins
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View className="py-8 items-center justify-center">
                <Svg viewBox="0 0 24 24" width={32} height={32} fill="none" stroke="#94A3B8" strokeWidth={1.5}>
                  <Circle cx={12} cy={12} r={9} />
                </Svg>
                <Text className="mt-2 text-sm text-[#64748B]">No coin transactions yet</Text>
                <Text className="text-xs text-[#94A3B8]">Complete a service booking to start earning V Coins.</Text>
              </View>
            )}
          </View>
        </>
      );

  if (embedded) {
    return <View className="gap-5">{content}</View>;
  }

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      style={{ paddingTop: Math.max(insets.top, 20) }}
      contentContainerClassName="px-4 pb-24 pt-2 gap-4"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      {/* Header with Back Button */}
      <View className="flex-row items-center gap-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/account");
            }
          }}
          className="size-9 items-center justify-center rounded-full border border-[#E5E7EB] bg-white shadow-2xs active:bg-[#F2EFE9]"
        >
          <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#0F172A" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="m15 18-6-6 6-6" />
          </Svg>
        </Pressable>

        <View className="flex-1 min-w-0">
          <Text className="text-2xl font-extrabold text-[#0B1B3D]">V Coins</Text>
          <Text className="text-xs text-[#64748B]">Earn, redeem & gifting</Text>
        </View>
      </View>

      {content}
    </ScrollView>
  );
}
