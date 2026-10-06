// Ported from frontend/apps/customer/features/session/view/mobile-bottom-nav.tsx
// and site-header.tsx at phone width.
import { useAuthStore } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { usePathname, useRouter, Slot } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";

import { useCustomerProfile } from "@/features/account/queries";
import { useCart } from "@/features/checkout/queries";
import { subscribeOpenNotifications } from "@/features/notifications/alerts-bus";
import { NotificationSheet } from "@/features/notifications/view/notification-sheet";
import { appChromeLayout } from "@/features/session/app-chrome-layout";
import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";
import { isCustomerTabActive, requiresCustomerSignIn } from "@/features/session/navigation";

const TABS = [
  { name: "Home", href: "/" },
  { name: "Services", href: "/catalog" },
  { name: "Bookings", href: "/activity" },
  { name: "Profile", href: "/account" },
] as const;

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const chrome = appChromeLayout(pathname);
  const cart = useCart(status !== "loading");
  const cartCount = cart.data?.items.length ?? 0;
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const profile = useCustomerProfile(status === "signedIn");
  const profileName = profile.data?.display_name || profile.data?.full_name || "";
  const initials =
    profileName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "You";

  useEffect(() => subscribeOpenNotifications(() => setAlertsOpen(true)), []);

  useEffect(() => {
    if (status === "signedOut" && requiresCustomerSignIn(pathname)) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}` as never);
    }
  }, [pathname, router, status]);

  if (chrome.hideMobileChrome) {
    return (
      <View className="flex-1 bg-canvas">
        <Slot />
      </View>
    );
  }

  const hideHeader = pathname.startsWith("/account") || pathname.startsWith("/activity");

  return (
    <View className="flex-1 bg-canvas">
      {!hideHeader ? (
        <View className="min-h-16 flex-row items-center justify-between gap-2 border-b border-line bg-[#FAF9F7] px-4 py-3">
          <Pressable accessibilityRole="link" accessibilityLabel="V Solve Hub home" onPress={() => router.push("/")} className="flex-row items-center gap-2">
            <Image source={require("../../assets/logo-mark.png")} style={{ width: 28, height: 28 }} contentFit="contain" />
            <Text className="text-[1.15rem] font-extrabold tracking-tight text-navy-900">
              V Solve <Text className="text-[1.15rem] font-extrabold text-[#EA580C]">Hub</Text>
            </Text>
          </Pressable>
          <View className="flex-row items-center gap-2">
            <Pressable accessibilityRole="button" accessibilityLabel="View basket" onPress={() => router.push("/cart")} className="h-8 w-8 items-center justify-center">
              <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#6B6560" strokeWidth={1.9}>
                <Circle cx={8} cy={21} r={1} />
                <Circle cx={19} cy={21} r={1} />
                <Path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
              </Svg>
              {cartCount > 0 ? (
                <View className="absolute -right-1 -top-1 min-h-4 min-w-4 items-center justify-center rounded-full bg-[#EA580C] px-0.5">
                  <Text className="text-[8px] font-extrabold text-white">{cartCount}</Text>
                </View>
              ) : null}
            </Pressable>
            {status === "loading" ? null : status === "signedIn" ? (
              <>
                <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => setAlertsOpen(true)} className="h-8 w-8 items-center justify-center">
                  <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#6B6560" strokeWidth={1.9}>
                    <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </Svg>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push("/account")} className="h-8 w-8 items-center justify-center rounded-full bg-navy-900">
                  <Text className="text-xs font-bold text-white">{initials}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="Log in" onPress={() => setLoginOpen(true)}>
                <Text className="text-xs font-bold text-[#EA580C]">Log in</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
      <View className="flex-1">
        {status === "signedIn" || !requiresCustomerSignIn(pathname) ? <Slot /> : null}
      </View>
      <View className="flex-row items-center justify-around border-t border-line/80 bg-[#FAF9F7] px-2 py-3">
        {TABS.map((tab) => {
          const active = isCustomerTabActive(tab.href, pathname);
          const color = active ? "#EA580C" : "#6B6560";
          return (
            <Pressable key={tab.name} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => router.push(tab.href as never)} className="min-w-16 items-center gap-1 px-2 py-1">
              <TabIcon name={tab.name} color={color} />
              <Text className={active ? "text-[0.65rem] font-bold text-[#EA580C]" : "text-[0.65rem] font-semibold text-text-muted"}>{tab.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <NotificationSheet open={alertsOpen} onOpenChange={setAlertsOpen} />
      <CustomerLoginSheet open={loginOpen} onOpenChange={setLoginOpen} />
    </View>
  );
}

function TabIcon({ name, color }: { name: (typeof TABS)[number]["name"]; color: string }) {
  if (name === "Home") {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={color} strokeWidth={2} />
        <Polyline points="9 22 9 12 15 12 15 22" stroke={color} strokeWidth={2} />
      </Svg>
    );
  }
  if (name === "Services") {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Circle cx={11} cy={11} r={8} stroke={color} strokeWidth={2} />
        <Path d="m21 21-4.3-4.3" stroke={color} strokeWidth={2} />
      </Svg>
    );
  }
  if (name === "Bookings") {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Rect x={3} y={4} width={18} height={18} rx={2} stroke={color} strokeWidth={2} />
        <Line x1={16} x2={16} y1={2} y2={6} stroke={color} strokeWidth={2} />
        <Line x1={8} x2={8} y1={2} y2={6} stroke={color} strokeWidth={2} />
        <Line x1={3} x2={21} y1={10} y2={10} stroke={color} strokeWidth={2} />
      </Svg>
    );
  }
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={7} r={4} stroke={color} strokeWidth={2} />
    </Svg>
  );
}
