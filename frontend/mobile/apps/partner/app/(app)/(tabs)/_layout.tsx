// Ported from frontend/apps/partner/features/session/partner-shell.tsx BottomTabBar
import { useMobileLogout } from "@vsolve/mobile-core";
import { Logo, Text, cn } from "@vsolve/mobile-ui";
import { useRouter, usePathname, Slot } from "expo-router";
import { ArrowLeft, Home, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NotificationPanel } from "@/features/notifications/view/notification-panel";
import { LiveOfferSheet } from "@/features/crew-offer/view/live-offer-sheet";
import { subscribeOpenAlerts } from "@/features/notifications/alerts-bus";
import { unreadBadgeDisplay, unreadBadgeLabel } from "@/features/notifications/model/feed";
import { useUnreadNotificationCount } from "@/features/notifications/queries";
import { focusedHeaderTitle, getPartnerChromeMode } from "@/features/session/chrome";
import { handleFocusedBack } from "@/features/session/focused-back";
import {
  TAP_FIRST_NAV,
  primaryShellNavFor,
  dockNavFor,
  resolveWorkspaces,
  specialtyShellHome,
  type WorkspaceNavItem,
} from "@/features/workspace/registry";
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signOut = useMobileLogout();
  const chrome = getPartnerChromeMode(pathname);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const count = useUnreadNotificationCount(chrome === "full");
  const grants = usePartnerWorkspaceGrants();
  const unread = count.isSuccess && count.data !== undefined ? count.data.unread : null;
  const badge = unreadBadgeDisplay(unread);

  const specialty = specialtyShellHome(resolveWorkspaces(grants.grants ?? []));
  const isDarkHero = (pathname === "/home" && (specialty as string) === "work") || pathname.startsWith("/work");

  useEffect(() => subscribeOpenAlerts(() => setAlertsOpen(true)), []);

  if (chrome === "focused") {
    return (
      <View className="flex-1 bg-canvas">
        <View
          style={{
            paddingTop: Math.max(insets.top, 16) + 10,
            elevation: 4,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 10,
          }}
          className="rounded-b-[2.25rem] bg-surface px-4 pb-4 flex-row items-center justify-between"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => handleFocusedBack(() => router.back())}
            className="h-11 w-11 items-center justify-center rounded-control active:bg-surface-hover"
          >
            <ArrowLeft size={20} color="#071328" />
          </Pressable>
          <Text className="flex-1 px-2 text-center text-base font-semibold text-text" numberOfLines={1}>
            {focusedHeaderTitle(pathname, null)}
          </Text>
          <View className="h-11 w-11" />
        </View>
        <Slot />
      </View>
    );
  }

  const rawNav = primaryShellNavFor(grants.grants ?? []);
  const activeNav = dockNavFor(rawNav);
  const homeItem = activeNav.find((item) => item.href === "/home" || item.label === "Home");
  const sideItems = activeNav.filter((item) => item.href !== "/home" && item.label !== "Home");
  const isUtilityTab = (item: WorkspaceNavItem) =>
    item.kind === "notifications" ||
    item.href === "#notifications" ||
    item.href === "/me" ||
    item.label === "Alerts" ||
    item.label === "Me";
  const leftItems = sideItems.filter((item) => !isUtilityTab(item));
  const rightItems = sideItems.filter(isUtilityTab);

  const isHomeActive = pathname === "/home";

  return (
    <View className="flex-1 bg-canvas">
      {/* Top Header for Full Chrome */}
      {chrome === "full" ? (
        <View
          style={{
            paddingTop: Math.max(insets.top, 16) + 14,
            elevation: isDarkHero ? 0 : 5,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDarkHero ? 0 : 0.07,
            shadowRadius: 14,
          }}
          className={cn(
            "flex-row items-center justify-between px-6 pb-5 z-30",
            isDarkHero
              ? "bg-[#00112e] border-b border-[#001a4e]"
              : "rounded-b-[2.25rem] bg-surface"
          )}
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Home"
            onPress={() => router.push("/home")}
            className="flex-row items-center active:opacity-80"
          >
            <Logo dark={isDarkHero} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign Out"
            onPress={() => void signOut()}
            className="py-1.5 px-2 active:opacity-70"
          >
            <Text
              className={cn(
                "text-[15px] font-semibold tracking-tight",
                isDarkHero ? "text-white/80" : "text-navy-900"
              )}
            >
              Sign Out
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Main Content Area */}
      <View className="flex-1 pb-24">
        <Slot />
      </View>

      {/* Curved Bottom Dock with Floating Raised Center Home Button */}
      {chrome === "full" ? (
        <View className="absolute inset-x-0 bottom-0 z-40 bg-transparent">
          <View className="relative mx-auto w-full max-w-md">
            {/* Raised Circular Floating Center Home Button */}
            {homeItem ? (
              <View className="absolute inset-x-0 -top-7 z-50 items-center justify-center pointer-events-box-none">
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel="Home"
                  accessibilityState={{ selected: isHomeActive }}
                  onPress={() => router.push("/home")}
                  className={cn(
                    "size-[4.25rem] items-center justify-center rounded-full bg-[#f87000] shadow-2xl active:scale-95",
                    isHomeActive ? "ring-4 ring-[#f87000]/40" : ""
                  )}
                  style={{
                    elevation: 10,
                    shadowColor: "#f87000",
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.45,
                    shadowRadius: 12,
                  }}
                >
                  <Home size={26} color="#00112e" strokeWidth={2.6} />
                </Pressable>
              </View>
            ) : null}

            {/* Main Curved Dock Bar */}
            <View
              style={{ paddingBottom: Math.max(insets.bottom, 22) }}
              className="rounded-t-[1.75rem] bg-[#00112e] px-2 pt-3 shadow-2xl"
            >
              <View className="flex-row items-end">
                {/* Left Side Tabs (Work, Money) */}
                <View className="flex-1 flex-row items-end justify-around">
                  {leftItems.map((item) => renderSideTab(item, pathname, router, setAlertsOpen, unread, badge))}
                </View>

                {/* Center Gap Spacer for Raised Home Button */}
                <View className="w-[72px] shrink-0" pointerEvents="none" />

                {/* Right Side Tabs (Alerts, Me) */}
                <View className="flex-1 flex-row items-end justify-around">
                  {rightItems.map((item) => renderSideTab(item, pathname, router, setAlertsOpen, unread, badge))}
                </View>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <NotificationPanel
        open={alertsOpen}
        onOpenChange={setAlertsOpen}
        unreadCount={unread}
        workspaceKeys={(grants.grants ?? []).map((grant) => grant.workspaceKey)}
      />

      <LiveOfferSheet />
    </View>
  );
}

function renderSideTab(
  item: WorkspaceNavItem,
  pathname: string,
  router: ReturnType<typeof useRouter>,
  setAlertsOpen: (open: boolean) => void,
  unread: number | null,
  badge: string | null
) {
  if (item.kind === "notifications") {
    return (
      <Pressable
        key={item.href}
        accessibilityRole="button"
        accessibilityLabel={unreadBadgeLabel(unread)}
        onPress={() => setAlertsOpen(true)}
        className="relative min-h-[3.25rem] flex-1 items-center justify-center gap-1 px-1 active:opacity-80"
      >
        <item.icon size={22} color="rgba(255,255,255,0.7)" strokeWidth={1.9} />
        <Text className="text-[0.625rem] font-semibold text-white/70">{item.label}</Text>
        {badge ? (
          <View className="absolute right-2 top-0 min-h-4 min-w-4 items-center justify-center rounded-full bg-[#f87000] px-1">
            <Text className="text-[9px] font-extrabold text-white">{badge}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  const owned = item.activePrefix ?? item.href;
  const isCurrent = pathname === owned || pathname.startsWith(`${owned}/`);
  const Icon = item.icon as LucideIcon;

  return (
    <Pressable
      key={item.href}
      accessibilityRole="tab"
      accessibilityState={{ selected: isCurrent }}
      onPress={() => router.push(item.href as never)}
      className="relative min-h-[3.25rem] flex-1 items-center justify-center gap-1 px-1 active:opacity-80"
    >
      {/* Glowing top line when active */}
      {isCurrent ? (
        <View className="absolute -top-3 h-0.5 w-6 rounded-full bg-[#f87000] shadow-[0_0_8px_rgba(248,112,0,0.85)]" />
      ) : null}
      <Icon size={22} color={isCurrent ? "#ffffff" : "rgba(255,255,255,0.45)"} strokeWidth={isCurrent ? 2.5 : 1.8} />
      <Text className={cn("text-[0.625rem] tracking-wide", isCurrent ? "font-bold text-white" : "font-semibold text-white/45")}>
        {item.label}
      </Text>
    </Pressable>
  );
}
