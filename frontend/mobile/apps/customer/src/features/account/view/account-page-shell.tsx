import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Text } from "@vsolve/mobile-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { requestOpenNotifications } from "@/features/notifications/alerts-bus";
import { useIsDesktop } from "@/lib/responsive";
import { DesktopAccountNav } from "./desktop-account-nav";
import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";

export type AccountTabKey =
  | "profile"
  | "wallet"
  | "coins"
  | "referrals"
  | "addresses"
  | "messages"
  | "documents"
  | "privacy"
  | "devices";

interface TabItem {
  key: AccountTabKey;
  label: string;
  href: string;
}

const TABS: TabItem[] = [
  { key: "profile", label: "Profile", href: "/account" },
  { key: "wallet", label: "Wallet", href: "/account/wallet" },
  { key: "coins", label: "V Coins", href: "/account/coins" },
  { key: "referrals", label: "Refer", href: "/account/referrals" },
  { key: "addresses", label: "Addresses", href: "/account/addresses" },
  { key: "messages", label: "Messages", href: "/account/messages" },
  { key: "documents", label: "Documents", href: "/account/documents" },
  { key: "privacy", label: "Privacy", href: "/account/privacy" },
  { key: "devices", label: "Devices", href: "/account/sessions" },
];

export function AccountPageShell({
  activeTab,
  children,
  onRefresh,
  refreshing,
}: {
  activeTab: AccountTabKey;
  children: ReactNode;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
}) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();

  if (isDesktop) {
    return (
      <ScrollView
        className="flex-1 bg-[#FAF9F7]"
        contentContainerClassName="pb-0"
        showsVerticalScrollIndicator={true}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              colors={["#EA580C"]}
              tintColor="#EA580C"
            />
          ) : undefined
        }
      >
        <View className="mx-auto w-full max-w-[1216px] px-6 lg:px-8 pt-8 pb-16 min-h-[calc(100vh-180px)]">
          {/* Heading Section */}
          <View>
            <Text className="text-[2.5rem] font-extrabold leading-[1.15] tracking-tight text-[#0B1B3D]">
              Your profile
            </Text>
            <Text className="mt-2 text-[1.05rem] leading-relaxed text-[#64748B]">
              Manage your details, preferences and devices.
            </Text>
          </View>

          {/* Two-column layout */}
          <View className="mt-8 flex-row items-start gap-10 lg:gap-12">
            {/* Left Nav */}
            <DesktopAccountNav activeKey={activeTab} />

            {/* Right Subpage Content */}
            <View className="min-w-0 flex-1">{children}</View>
          </View>
        </View>

        <DesktopSiteFooter />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="gap-4 px-4 pb-24"
      contentContainerStyle={{
        paddingTop: Math.max(insets.top + 16, 36),
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            colors={["#EA580C"]}
            tintColor="#EA580C"
          />
        ) : undefined
      }
    >
      {/* Top Back Navigation matching user profile design */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.push("/account");
          }
        }}
        className="flex-row items-center gap-1.5 self-start py-1.5 mt-1 active:opacity-70"
      >
        <Svg
          viewBox="0 0 24 24"
          width={18}
          height={18}
          fill="none"
          stroke="#071328"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="m15 18-6-6 6-6" />
        </Svg>
        <Text className="text-sm font-semibold text-navy-900">Back</Text>
      </Pressable>

      {/* Heading & Subtitle */}
      <View className="gap-1.5 pt-0.5">
        <Text className="text-[28px] font-extrabold tracking-tight text-navy-950">
          Your profile
        </Text>
        <Text className="text-[14px] leading-relaxed text-text-secondary">
          Manage your details, communication preferences, and signed-in devices.
        </Text>
      </View>

      {/* Account Navigation Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 py-0.5"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => {
                if (!isActive) {
                  router.push(tab.href as never);
                }
              }}
              className={`min-h-11 flex-row items-center gap-1.5 rounded-full border px-3.5 ${
                isActive
                  ? "border-[#EA580C] bg-[#EA580C]"
                  : "border-[#e7e2da] bg-white active:bg-surface-hover"
              }`}
            >
              {tab.key === "profile" ? (
                <Svg
                  viewBox="0 0 24 24"
                  width={16}
                  height={16}
                  fill="none"
                  stroke={isActive ? "#FFFFFF" : "#071328"}
                  strokeWidth={2.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <Circle cx={12} cy={7} r={4} />
                </Svg>
              ) : null}
              {tab.key === "wallet" ? (
                <Svg
                  viewBox="0 0 24 24"
                  width={16}
                  height={16}
                  fill="none"
                  stroke={isActive ? "#FFFFFF" : "#071328"}
                  strokeWidth={2.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                  <Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
                </Svg>
              ) : null}
              {tab.key === "coins" ? (
                <Svg
                  viewBox="0 0 24 24"
                  width={16}
                  height={16}
                  fill="none"
                  stroke={isActive ? "#FFFFFF" : "#071328"}
                  strokeWidth={2.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Circle cx={12} cy={12} r={9} />
                  <Path d="m8.5 8.5 3.5 7 3.5-7" />
                </Svg>
              ) : null}
              {tab.key === "referrals" ? (
                <Svg
                  viewBox="0 0 24 24"
                  width={16}
                  height={16}
                  fill="none"
                  stroke={isActive ? "#FFFFFF" : "#071328"}
                  strokeWidth={2.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <Circle cx={9} cy={7} r={4} />
                  <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </Svg>
              ) : null}
              {tab.key === "documents" ? (
                <Svg
                  viewBox="0 0 24 24"
                  width={16}
                  height={16}
                  fill="none"
                  stroke={isActive ? "#FFFFFF" : "#071328"}
                  strokeWidth={2.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <Path d="M14 2v6h6" />
                </Svg>
              ) : null}
              {tab.key === "addresses" ? (
                <Svg
                  viewBox="0 0 24 24"
                  width={16}
                  height={16}
                  fill="none"
                  stroke={isActive ? "#FFFFFF" : "#071328"}
                  strokeWidth={2.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <Circle cx={12} cy={10} r={3} />
                </Svg>
              ) : null}
              {tab.key === "messages" ? (
                <Svg
                  viewBox="0 0 24 24"
                  width={16}
                  height={16}
                  fill="none"
                  stroke={isActive ? "#FFFFFF" : "#071328"}
                  strokeWidth={2.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                </Svg>
              ) : null}
              {tab.key === "privacy" ? (
                <Svg
                  viewBox="0 0 24 24"
                  width={16}
                  height={16}
                  fill="none"
                  stroke={isActive ? "#FFFFFF" : "#071328"}
                  strokeWidth={2.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </Svg>
              ) : null}
              {tab.key === "devices" ? (
                <Svg
                  viewBox="0 0 24 24"
                  width={16}
                  height={16}
                  fill="none"
                  stroke={isActive ? "#FFFFFF" : "#071328"}
                  strokeWidth={2.1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Rect width={14} height={20} x={5} y={2} rx={2} ry={2} />
                  <Path d="M12 18h.01" />
                </Svg>
              ) : null}
              <Text
                className={`text-sm ${
                  isActive ? "font-bold text-white" : "font-semibold text-navy-900"
                }`}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Main Page Content */}
      {children}
    </ScrollView>
  );
}
