import { describeError } from "@vsolve/query/native";
import { Button, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { useCustomerReferral, useReferralAttributions } from "../queries";

export function ReferralScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const referralQuery = useCustomerReferral();
  const attributionsQuery = useReferralAttributions();

  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([referralQuery.refetch(), attributionsQuery.refetch()]);
    setRefreshing(false);
  };

  const summary = referralQuery.data;
  const referralCode = summary?.referral_code ?? "VSOLVE100";
  const shareUrl = `https://vsolvehub.com/?ref=${referralCode}`;

  const copyToClipboard = async () => {
    await Clipboard.setStringAsync(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Use my invite code ${referralCode} to get ₹100 off on your first service booking with V Solve Hub! ${shareUrl}`,
        url: shareUrl,
        title: "Join V Solve Hub",
      });
    } catch {
      // User cancelled or share failed
    }
  };

  const content = referralQuery.isPending ? (
    <View className="py-12 items-center justify-center">
      <Spinner size="sm" />
      <Text className="mt-2 text-sm text-[#64748B]">Loading your referral program…</Text>
    </View>
  ) : referralQuery.isError ? (
    <ErrorState
      title="Could not load referral details"
      message={referralQuery.error ? describeError(referralQuery.error, "read").message : "Please try again"}
      actionLabel="Try again"
      onAction={() => void referralQuery.refetch()}
    />
  ) : (
    <>
          {/* Share Hero Card */}
          <View className="overflow-hidden rounded-2xl bg-[#0B162C] p-5 shadow-sm">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              GIVE ₹100, GET ₹150
            </Text>
            <Text className="mt-1 text-2xl font-extrabold text-white">
              Invite friends to V Solve Hub
            </Text>
            <Text className="mt-1 text-xs text-[#94A3B8] leading-relaxed">
              Your friend gets ₹100 off on their first service, and you get ₹150 in your wallet or V Coins when they complete it.
            </Text>

            {/* Code Box */}
            <View className="mt-4 flex-row items-center justify-between rounded-xl border border-white/20 bg-white/10 px-4 py-3">
              <View>
                <Text className="text-[10px] font-medium text-[#94A3B8]">YOUR REFERRAL CODE</Text>
                <Text className="text-lg font-mono font-bold tracking-widest text-[#EA580C]">
                  {referralCode}
                </Text>
              </View>
              <Pressable
                onPress={copyToClipboard}
                className="rounded-lg bg-white px-3 py-1.5 active:bg-[#F2EFE9]"
              >
                <Text className="text-xs font-bold text-[#0B162C]">
                  {copied ? "Copied! ✓" : "Copy"}
                </Text>
              </Pressable>
            </View>

            {/* Share CTA */}
            <Button
              onPress={handleShare}
              className="mt-4 bg-[#EA580C]"
            >
              Share with friends
            </Button>
          </View>

          {/* Program Stats */}
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-2xl border border-[#F1EFEB] bg-white p-4 shadow-xs">
              <Text className="text-xs text-[#64748B]">Friends Invited</Text>
              <Text className="mt-1 text-2xl font-extrabold text-[#0F172A]">
                {summary?.invited_count ?? 0}
              </Text>
            </View>
            <View className="flex-1 rounded-2xl border border-[#F1EFEB] bg-white p-4 shadow-xs">
              <Text className="text-xs text-[#64748B]">Earned Rewards</Text>
              <Text className="mt-1 text-2xl font-extrabold text-emerald-600">
                ₹{((summary?.total_earned_paise ?? 0) / 100).toLocaleString("en-IN")}
              </Text>
            </View>
          </View>

          {/* Invited Friends / Attributions */}
          <View className="rounded-2xl border border-[#F1EFEB] bg-white p-4 shadow-xs">
            <Text className="text-base font-bold text-[#0F172A]">Friends invited</Text>
            {attributionsQuery.isPending ? (
              <View className="py-6 items-center">
                <Spinner size="sm" />
              </View>
            ) : attributionsQuery.data && attributionsQuery.data.length > 0 ? (
              <View className="mt-3 divide-y divide-[#F4F2EE]">
                {attributionsQuery.data.map((item) => (
                  <View key={item.id} className="flex-row items-center justify-between py-3">
                    <View className="flex-1 min-w-0 pr-2">
                      <Text className="text-sm font-semibold text-[#0F172A]">
                        {item.referee_display || "Invited friend"}
                      </Text>
                      <Text className="text-xs text-[#64748B] mt-0.5">
                        {new Date(item.attributed_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </Text>
                    </View>
                    <View className="rounded-full bg-emerald-50 px-2.5 py-0.5 border border-emerald-200">
                      <Text className="text-[11px] font-bold text-emerald-800">
                        {item.status.replace("_", " ")}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View className="py-8 items-center justify-center">
                <Svg viewBox="0 0 24 24" width={32} height={32} fill="none" stroke="#94A3B8" strokeWidth={1.5}>
                  <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <Circle cx={9} cy={7} r={4} />
                  <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </Svg>
                <Text className="mt-2 text-sm text-[#64748B]">No referrals yet</Text>
                <Text className="text-xs text-[#94A3B8]">Share your code to earn wallet cash and coins!</Text>
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
          <Text className="text-2xl font-extrabold text-[#0B1B3D]">Refer & Earn</Text>
          <Text className="text-xs text-[#64748B]">Invite friends to earn rewards</Text>
        </View>
      </View>

      {content}
    </ScrollView>
  );
}
