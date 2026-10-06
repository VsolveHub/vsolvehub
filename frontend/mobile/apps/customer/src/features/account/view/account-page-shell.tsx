import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Text } from "@vsolve/mobile-ui";

import { requestOpenNotifications } from "@/features/notifications/alerts-bus";

export type AccountTabKey = "profile" | "addresses" | "messages" | "privacy" | "devices";

interface TabItem {
  key: AccountTabKey;
  label: string;
  href: string;
}

const TABS: TabItem[] = [
  { key: "profile", label: "Profile", href: "/account" },
  { key: "addresses", label: "Addresses", href: "/account/addresses" },
  { key: "messages", label: "Messages", href: "/account/messages" },
  { key: "privacy", label: "Privacy", href: "/account/privacy" },
  { key: "devices", label: "Devices", href: "/account/sessions" },
];

export function AccountPageShell({
  activeTab,
  children,
}: {
  activeTab: AccountTabKey;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="gap-4 px-4 pb-24 pt-5"
      showsVerticalScrollIndicator={false}
    >
      {/* Top Header matching customer portal */}
      <View className="flex-row items-start justify-between gap-3">
        <Text className="min-w-0 text-[1.875rem] font-extrabold leading-[1.15] tracking-tight text-navy-900">
          Your profile
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => requestOpenNotifications()}
          className="-mr-1.5 -mt-0.5 h-10 w-10 items-center justify-center rounded-full active:bg-surface-hover"
        >
          <Svg
            viewBox="0 0 24 24"
            width={22}
            height={22}
            fill="none"
            stroke="#071328"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </Svg>
        </Pressable>
      </View>

      <Text className="text-[15px] leading-relaxed text-text-secondary">
        Manage your details, communication preferences, and signed-in devices.
      </Text>

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
