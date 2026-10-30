// Ported from frontend/apps/customer/features/session/view/mobile-bottom-nav.tsx
// and site-header.tsx at phone width.
import { useAuthStore, useMobileLogout } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { usePathname, useRouter, Slot } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";

import { useCustomerProfile } from "@/features/account/queries";
import { useCart } from "@/features/checkout/queries";
import { subscribeOpenNotifications } from "@/features/notifications/alerts-bus";
import { unreadBadgeLabel } from "@/features/notifications/model/feed";
import { useUnreadNotificationCount } from "@/features/notifications/queries";
import { NotificationSheet } from "@/features/notifications/view/notification-sheet";
import { appChromeLayout } from "@/features/session/app-chrome-layout";
import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";
import { isCustomerTabActive, requiresCustomerSignIn } from "@/features/session/navigation";
import { useIsDesktop } from "@/lib/responsive";

type TabIconType = "home" | "services" | "bookings" | "login" | "profile";

interface TabItem {
  name: string;
  href: string | null;
  icon: TabIconType;
}

export default function TabsLayout() {
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const rawPathname = usePathname();
  const pathname = rawPathname.replace(/\/\([^)]+\)/g, "");
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const signOut = useMobileLogout();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const chrome = appChromeLayout(pathname);
  const cart = useCart(status !== "loading");
  const cartCount = cart.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? cart.data?.items.length ?? 0;
  const unreadCount = useUnreadNotificationCount(status === "signedIn");
  const unreadTotal = unreadCount.data?.unread ?? 0;
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
  const profile = useCustomerProfile(status === "signedIn");
  const profileName = profile.data?.display_name || profile.data?.full_name || "";
  const initials =
    profileName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "You";
  const userInitial =
    (profile.data?.display_name || profile.data?.full_name || "")
      .trim()
      .charAt(0)
      .toUpperCase() || (initials && initials !== "You" ? initials.charAt(0) : "R");

  const handleSignout = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      router.replace("/");
    } catch (err) {
      console.error("Signout failed:", err);
    } finally {
      setIsSigningOut(false);
    }
  };

  useEffect(() => subscribeOpenNotifications(() => setAlertsOpen(true)), []);

  useEffect(() => {
    if (status === "signedOut" && requiresCustomerSignIn(pathname)) {
      router.replace("/");
    }
  }, [pathname, router, status]);

  const tabs: TabItem[] = [
    { name: "Home", href: "/", icon: "home" },
    { name: "Search", href: "/catalog", icon: "services" },
    { name: "Bookings", href: "/activity", icon: "bookings" },
    status === "signedIn"
      ? { name: "Profile", href: "/account", icon: "profile" }
      : { name: "Log in", href: null, icon: "login" },
  ];

  const handleTabPress = (tab: TabItem) => {
    if (tab.name === "Bookings") {
      if (status === "signedIn") {
        router.push("/activity");
      } else {
        setPendingRedirect("/activity");
        setLoginOpen(true);
      }
      return;
    }

    if (tab.name === "Log in") {
      setPendingRedirect("/account");
      setLoginOpen(true);
      return;
    }

    if (tab.href) {
      router.push(tab.href as never);
    }
  };

  if (
    pathname.startsWith("/bookings/") ||
    pathname.startsWith("/requests") ||
    pathname.startsWith("/book/")
  ) {
    if (!isDesktop || chrome.hideMobileChrome) {
      return (
        <View className="flex-1 bg-canvas">
          <Slot />
        </View>
      );
    }
  }

  if (!isDesktop && chrome.hideMobileChrome) {
    return (
      <View className="flex-1 bg-canvas">
        <Slot />
      </View>
    );
  }

  const hideHeader =
    !isDesktop &&
    (pathname.startsWith("/account") ||
      pathname.startsWith("/activity") ||
      pathname.startsWith("/listings"));

  const desktopNavLinks = [
    { label: "Services", href: "/catalog" },
    { label: "Rentals", href: "/rentals" },
    { label: "Stays", href: "/stays" },
    { label: "Careers", href: "/listings" },
    { label: "Bookings", href: "/activity", requiresAuth: true },
  ];

  return (
    <View className="flex-1 bg-canvas">
      {/* Desktop Header */}
      {isDesktop ? (
        <View className="sticky top-0 z-20 w-full border-b border-[#EAE8E4] bg-white">
          <View className="mx-auto min-h-16 w-full max-w-[1216px] flex-row items-center px-4 py-3 sm:px-6 lg:px-8">
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="V Solve Hub home"
              onPress={() => router.push("/")}
              className="flex-row items-center gap-2 shrink-0 cursor-pointer mr-6"
            >
              <Image source={require("../../assets/logo-mark.png")} style={{ width: 28, height: 28 }} contentFit="contain" />
              <Text className="text-xl font-extrabold tracking-tight text-navy-900">
                V Solve <Text className="text-xl font-extrabold text-[#EA580C]">Hub</Text>
              </Text>
            </Pressable>

            {/* Desktop Center Links */}
            <View className="flex-row items-center gap-1">
              {desktopNavLinks.map((link) => {
                const active = isCustomerTabActive(link.href, pathname);
                return (
                  <Pressable
                    key={link.href}
                    accessibilityRole="link"
                    accessibilityLabel={link.label}
                    onPress={() => {
                      if (link.requiresAuth && status !== "signedIn") {
                        setPendingRedirect(link.href);
                        setLoginOpen(true);
                        return;
                      }
                      router.push(link.href as never);
                    }}
                    className={`rounded-lg px-3.5 py-1.5 cursor-pointer border ${
                      active
                        ? "bg-[#FAF8F5] border-[#E5E1DC] shadow-xs"
                        : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        active
                          ? "font-extrabold text-navy-900"
                          : "font-semibold text-[#475569] hover:text-navy-900"
                      }`}
                    >
                      {link.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="flex-1" />

            {/* Right Side Actions */}
            <View className="flex-row items-center gap-4">
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="View basket"
                onPress={() => router.push("/cart")}
                className="relative size-10 items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#1E293B" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                  <Circle cx={8} cy={21} r={1} />
                  <Circle cx={19} cy={21} r={1} />
                  <Path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                </Svg>
                {cartCount > 0 ? (
                  <View className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EA580C] px-1 ring-2 ring-white">
                    <Text className="text-[10px] font-extrabold text-white">{cartCount}</Text>
                  </View>
                ) : null}
              </Pressable>

              {status === "loading" ? null : status === "signedIn" ? (
                <View className="flex-row items-center gap-3">
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={unreadBadgeLabel(unreadTotal)}
                    onPress={() => setAlertsOpen(true)}
                    className="relative size-10 items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer"
                  >
                    <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#1E293B" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </Svg>
                    {unreadTotal > 0 ? (
                      <View className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EA580C] px-1 ring-2 ring-white">
                        <Text className="text-[10px] font-extrabold text-white">
                          {unreadTotal > 99 ? "99+" : unreadTotal}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>

                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Open profile"
                    onPress={() => router.push("/account")}
                    className="size-9 items-center justify-center rounded-full bg-[#EEF2F8] border border-[#EA580C] cursor-pointer hover:opacity-90"
                  >
                    <Text className="text-sm font-extrabold text-[#0B1B3D]">{userInitial}</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sign out"
                    onPress={handleSignout}
                    disabled={isSigningOut}
                    className="cursor-pointer px-1 py-1 hover:opacity-80"
                  >
                    <Text className="text-sm font-semibold text-[#0B2545]">
                      {isSigningOut ? "Signing out..." : "Sign out"}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Log in"
                  onPress={() => {
                    setPendingRedirect("/account");
                    setLoginOpen(true);
                  }}
                  className="rounded-full bg-[#EA580C] px-5 py-2 shadow-xs hover:bg-[#d65e00] cursor-pointer"
                >
                  <Text className="text-sm font-bold text-white">Log in</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      ) : !hideHeader ? (
        <View
          style={{ paddingTop: Math.max(insets.top, 24) + 10 }}
          className="min-h-[76px] flex-row items-center justify-between gap-2 border-b border-line bg-[#FAF9F7] px-4 pb-3.5"
        >
          <Pressable accessibilityRole="link" accessibilityLabel="V Solve Hub home" onPress={() => router.push("/")} className="flex-row items-center gap-2">
            <Image source={require("../../assets/logo-mark.png")} style={{ width: 30, height: 30 }} contentFit="contain" />
            <Text className="text-[1.2rem] font-extrabold tracking-tight text-navy-900">
              V Solve <Text className="text-[1.2rem] font-extrabold text-[#EA580C]">Hub</Text>
            </Text>
          </Pressable>
          <View className="flex-row items-center gap-2.5">
            <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="View basket" onPress={() => router.push("/cart")} className="h-9 w-9 items-center justify-center">
              <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#6B6560" strokeWidth={1.9}>
                <Circle cx={8} cy={21} r={1} />
                <Circle cx={19} cy={21} r={1} />
                <Path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
              </Svg>
              {cartCount > 0 ? (
                <View className="absolute -right-0.5 -top-0.5 min-h-4 min-w-4 items-center justify-center rounded-full bg-[#EA580C] px-1">
                  <Text className="text-[8px] font-extrabold text-white">{cartCount}</Text>
                </View>
              ) : null}
            </Pressable>
            {status === "loading" ? null : status === "signedIn" ? (
              <>
                <Pressable
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={unreadBadgeLabel(unreadTotal)}
                  onPress={() => setAlertsOpen(true)}
                  className="h-9 w-9 items-center justify-center"
                >
                  <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#6B6560" strokeWidth={1.9}>
                    <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </Svg>
                  {unreadTotal > 0 ? (
                    <View className="absolute -right-0.5 -top-0.5 min-h-4 min-w-4 items-center justify-center rounded-full bg-[#EA580C] px-1">
                      <Text className="text-[8px] font-extrabold text-white">
                        {unreadTotal > 99 ? "99+" : unreadTotal}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push("/account")} className="h-8 w-8 items-center justify-center rounded-full bg-navy-900">
                  <Text className="text-xs font-bold text-white">{initials}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log in"
                onPress={() => {
                  setPendingRedirect("/account");
                  setLoginOpen(true);
                }}
                className="rounded-full bg-orange-50 px-3.5 py-1.5"
              >
                <Text className="text-xs font-bold text-[#EA580C]">Log in</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}

      <View className="flex-1">
        {status === "signedIn" || !requiresCustomerSignIn(pathname) ? <Slot /> : null}
      </View>

      {/* Bottom Tab Bar (Mobile Only) */}
      {!isDesktop && !chrome.hideMobileFooter ? (
        <View
          className="flex-row items-center justify-around border-t border-[#EAE8E4] bg-white px-2 pt-2"
          style={{ paddingBottom: Math.max(8, insets.bottom) }}
        >
          {tabs.map((tab) => {
            const active = tab.href ? isCustomerTabActive(tab.href, pathname) : false;
            const iconColor = active ? "#EA580C" : "#6B6560";
            return (
              <Pressable
                key={tab.name}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => handleTabPress(tab)}
                className="min-w-16 items-center gap-1 px-2 py-0.5"
              >
                <View className="h-7 w-7 items-center justify-center">
                  <TabIcon type={tab.icon} color={iconColor} />
                </View>
                <Text
                  className={
                    active
                      ? "text-[11px] font-bold text-[#EA580C]"
                      : "text-[11px] font-medium text-[#6B6560]"
                  }
                >
                  {tab.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <NotificationSheet
        open={alertsOpen}
        onOpenChange={setAlertsOpen}
        onRequireLogin={() => {
          setAlertsOpen(false);
          setPendingRedirect(null);
          setLoginOpen(true);
        }}
      />
      <CustomerLoginSheet
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => {
          if (pendingRedirect) {
            const target = pendingRedirect;
            setPendingRedirect(null);
            router.push(target as never);
          }
        }}
      />
    </View>
  );
}

function TabIcon({ type, color }: { type: TabIconType; color: string }) {
  if (type === "home") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Polyline points="9 22 9 12 15 12 15 22" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (type === "services") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Circle cx={11} cy={11} r={8} stroke={color} strokeWidth={2} />
        <Path d="m21 21-4.3-4.3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (type === "bookings") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Rect x={3} y={4} width={18} height={18} rx={2} stroke={color} strokeWidth={2} />
        <Line x1={16} x2={16} y1={2} y2={6} stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Line x1={8} x2={8} y1={2} y2={6} stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Line x1={3} x2={21} y1={10} y2={10} stroke={color} strokeWidth={2} />
      </Svg>
    );
  }
  if (type === "login") {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Polyline points="10 17 15 12 10 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Line x1={15} y1={12} x2={3} y2={12} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={7} r={4} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

