import { describeError } from "@vsolve/query/native";
import { Button, ErrorState, Input, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { useInitiateWalletTopUp, useWallet, useWalletTransactions } from "../queries";

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2000];

export function WalletScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const walletQuery = useWallet();
  const txnsQuery = useWalletTransactions();
  const topUp = useInitiateWalletTopUp();

  const [customAmount, setCustomAmount] = useState("500");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([walletQuery.refetch(), txnsQuery.refetch()]);
    setRefreshing(false);
  };

  const handleTopUp = (amountPaise: number) => {
    setSuccessMessage(null);
    topUp.mutate(
      { amount_paise: amountPaise },
      {
        onSuccess: async () => {
          setSuccessMessage(`Successfully added ₹${(amountPaise / 100).toLocaleString("en-IN")} to your wallet!`);
          await Promise.all([walletQuery.refetch(), txnsQuery.refetch()]);
          setTimeout(() => setSuccessMessage(null), 4000);
        },
      }
    );
  };

  const amountNumber = Math.max(0, parseInt(customAmount, 10) || 0);

  const content = walletQuery.isPending ? (
    <View className="py-12 items-center justify-center">
      <Spinner size="sm" />
      <Text className="mt-2 text-sm text-[#64748B]">Loading your wallet…</Text>
    </View>
  ) : walletQuery.isError ? (
    <ErrorState
      title="Could not load wallet"
      message={walletQuery.error ? describeError(walletQuery.error, "read").message : "Please try again"}
      actionLabel="Try again"
      onAction={() => void walletQuery.refetch()}
    />
  ) : (
    <>
          {/* Balance Hero Card */}
          <View className="overflow-hidden rounded-2xl bg-[#0B162C] p-5 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  AVAILABLE BALANCE
                </Text>
                <Text className="mt-1 text-3xl font-extrabold text-white">
                  ₹{((walletQuery.data?.available_balance_paise ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <View className="size-12 items-center justify-center rounded-xl bg-[#EA580C]/20 border border-[#EA580C]/40">
                <Svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="#EA580C" strokeWidth={2}>
                  <Path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                  <Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
                </Svg>
              </View>
            </View>

            <View className="mt-4 flex-row items-center justify-between border-t border-white/10 pt-3">
              <Text className="text-xs text-[#94A3B8]">
                Total balance: ₹{((walletQuery.data?.balance_paise ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </Text>
              <Text className="text-xs text-[#94A3B8]">
                Reserved: ₹{((walletQuery.data?.reserved_paise ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>

          {/* Top Up Section */}
          <View className="rounded-2xl border border-[#F1EFEB] bg-white p-4 shadow-xs">
            <Text className="text-base font-bold text-[#0F172A]">Top up wallet</Text>
            <Text className="mt-0.5 text-xs text-[#64748B]">Add funds for instant 1-click checkout and automated refunds.</Text>

            {/* Quick Chips */}
            <View className="mt-3 flex-row flex-wrap gap-2">
              {QUICK_AMOUNTS.map((amt) => (
                <Pressable
                  key={amt}
                  onPress={() => setCustomAmount(amt.toString())}
                  className={`rounded-xl border px-3.5 py-1.5 ${
                    amountNumber === amt
                      ? "border-[#EA580C] bg-[#EA580C]/10"
                      : "border-[#E5E7EB] bg-[#FAF9F7] active:bg-[#F2EFE9]"
                  }`}
                >
                  <Text className={`text-xs font-bold ${amountNumber === amt ? "text-[#EA580C]" : "text-[#0F172A]"}`}>
                    +₹{amt}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="mt-3.5 flex-row items-center gap-2">
              <View className="flex-1">
                <Input
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  placeholder="Amount in ₹"
                  keyboardType="numeric"
                />
              </View>
              <Button
                loading={topUp.isPending}
                loadingLabel="Adding…"
                disabled={amountNumber <= 0 || topUp.isPending}
                onPress={() => handleTopUp(amountNumber * 100)}
                className="bg-[#EA580C] px-5"
              >
                Top up
              </Button>
            </View>

            {successMessage ? (
              <View className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-2.5">
                <Text className="text-xs font-semibold text-emerald-800">{successMessage}</Text>
              </View>
            ) : null}

            {topUp.isError ? (
              <View className="mt-3 rounded-xl bg-red-50 border border-red-200 p-2.5">
                <Text className="text-xs font-semibold text-red-700">{describeError(topUp.error, "mutation").message}</Text>
              </View>
            ) : null}
          </View>

          {/* Transactions List */}
          <View className="rounded-2xl border border-[#F1EFEB] bg-white p-4 shadow-xs">
            <Text className="text-base font-bold text-[#0F172A]">Recent transactions</Text>
            {txnsQuery.isPending ? (
              <View className="py-6 items-center">
                <Spinner size="sm" />
              </View>
            ) : txnsQuery.data && txnsQuery.data.length > 0 ? (
              <View className="mt-3 divide-y divide-[#F4F2EE]">
                {txnsQuery.data.map((txn) => {
                  const isCredit = txn.kind === "TOP_UP" || txn.kind === "REFUND" || txn.kind === "CASHBACK";
                  const formattedDate = new Date(txn.created_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <View key={txn.id} className="flex-row items-center justify-between py-3">
                      <View className="flex-1 min-w-0 pr-2">
                        <Text className="text-sm font-semibold text-[#0F172A]">{txn.kind.replace("_", " ")}</Text>
                        <Text className="text-xs text-[#64748B] mt-0.5">{formattedDate}</Text>
                        {txn.idempotency_key ? (
                          <Text className="text-[10px] text-[#94A3B8] font-mono mt-0.5" numberOfLines={1}>
                            Ref: {txn.idempotency_key}
                          </Text>
                        ) : null}
                      </View>
                      <Text className={`text-base font-bold ${isCredit ? "text-emerald-600" : "text-[#0F172A]"}`}>
                        {isCredit ? "+" : "-"}₹{(txn.amount_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View className="py-8 items-center justify-center">
                <Svg viewBox="0 0 24 24" width={32} height={32} fill="none" stroke="#94A3B8" strokeWidth={1.5}>
                  <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </Svg>
                <Text className="mt-2 text-sm text-[#64748B]">No transactions yet</Text>
                <Text className="text-xs text-[#94A3B8]">Your top-ups and payments will appear here.</Text>
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
          <Text className="text-2xl font-extrabold text-[#0B1B3D]">Wallet</Text>
          <Text className="text-xs text-[#64748B]">Transactions & top-ups</Text>
        </View>
      </View>

      {content}
    </ScrollView>
  );
}
