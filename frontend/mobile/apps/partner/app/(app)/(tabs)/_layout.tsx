// Ported from frontend/apps/partner/features/session/partner-shell.tsx BottomTabBar
import { Logo, Text, cn } from "@vsolve/mobile-ui";
import { useRouter, usePathname, Slot } from "expo-router";
import { ArrowLeft, Bell, UserCircle2, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NotificationPanel } from "@/features/notifications/view/notification-panel";
import { JobAlertsBanner } from "@/features/notifications/view/job-alerts-banner";
import { subscribeOpenAlerts } from "@/features/notifications/alerts-bus";
import { unreadBadgeDisplay, unreadBadgeLabel } from "@/features/notifications/model/feed";
import { useUnreadNotificationCount } from "@/features/notifications/queries";
import { focusedHeaderTitle, getPartnerChromeMode } from "@/features/session/chrome";
import { handleFocusedBack } from "@/features/session/focused-back";
import {
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
  const chrome = getPartnerChromeMode(pathname);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const count = useUnreadNotificationCount(chrome === "full");
  const grants = usePartnerWorkspaceGrants();
  const unread = count.isSuccess && count.data !== undefined ? count.data.unread : null;
  const badge = unreadBadgeDisplay(unread);

  const specialty = specialtyShellHome(resolveWorkspaces(grants.grants ?? []));
  const isDarkHero = (pathname === "/home" && (specialty as string) === "work") || pathname.startsWith("/work");

  useEffect(() => subscribeOpenAlerts(() => setAlertsOpen(true)), []);

  // The job pages (post a job, a job's applicants) carry their own back control and title, so they
  // get no bar of their own, only room for the status bar.
  if (chrome === "focused" && pathname.startsWith("/listings/")) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <Slot />
      </View>
    );
  }

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
  // Home leads the bar as an ordinary tab, then the rest in their registry order.
  const homeItems = activeNav.filter((item) => item.href === "/home" || item.label === "Home");
  const otherItems = activeNav.filter((item) => item.href !== "/home" && item.label !== "Home");
  const tabItems = [...homeItems, ...otherItems];

  return (
    <View className={cn("flex-1", isDarkHero ? "bg-[#00112e]" : "bg-canvas")}>
      {/* Top header: logo on the left, alerts and account on the right */}
      {chrome === "full" ? (
        <View
          style={{ paddingTop: insets.top + 8 }}
          className={cn(
            "z-30 flex-row items-center justify-between border-b px-4 pb-3",
            isDarkHero ? "border-white/10 bg-[#00112e]" : "border-line bg-surface",
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

          <View className="flex-row items-center gap-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={unreadBadgeLabel(unread)}
              onPress={() => setAlertsOpen(true)}
              className={cn(
                "relative size-10 items-center justify-center rounded-full",
                isDarkHero ? "active:bg-white/10" : "active:bg-surface-hover",
              )}
            >
              <Bell size={21} color={isDarkHero ? "#ffffff" : "#071328"} strokeWidth={1.9} />
              {badge ? (
                <View className="absolute right-0.5 top-0.5 min-h-4 min-w-4 items-center justify-center rounded-full bg-[#f87000] px-1">
                  <Text className="text-[9px] font-extrabold text-white">{badge}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Account"
              onPress={() => router.push("/me" as never)}
              className={cn(
                "size-10 items-center justify-center rounded-full",
                isDarkHero ? "active:bg-white/10" : "active:bg-surface-hover",
              )}
            >
              <UserCircle2 size={24} color={isDarkHero ? "#ffffff" : "#071328"} strokeWidth={1.7} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Job Alerts Permission Banner */}
      <JobAlertsBanner />

      {/* Main Content Area */}
      <View className="flex-1">
        <Slot />
      </View>

      {/* Bottom tab bar: flat, equal tabs */}
      {chrome === "full" ? (
        <View
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
          className="border-t border-line bg-surface px-2 pt-1.5"
        >
          <View className="mx-auto w-full max-w-md flex-row items-end">
            {tabItems.map((item) => renderTab(item, pathname, router, setAlertsOpen, unread, badge))}
          </View>
        </View>
      ) : null}

      <NotificationPanel
        open={alertsOpen}
        onOpenChange={setAlertsOpen}
        unreadCount={unread}
        workspaceKeys={(grants.grants ?? []).map((grant) => grant.workspaceKey)}
      />
    </View>
  );
}

function renderTab(
  item: WorkspaceNavItem,
  pathname: string,
  router: ReturnType<typeof useRouter>,
  setAlertsOpen: (open: boolean) => void,
  unread: number | null,
  badge: string | null,
) {
  const Icon = item.icon as LucideIcon;
  const tabClass = "relative min-h-[3.25rem] flex-1 items-center justify-center gap-1 px-1 active:opacity-70";

  if (item.kind === "notifications") {
    return (
      <Pressable
        key={item.href}
        accessibilityRole="button"
        accessibilityLabel={unreadBadgeLabel(unread)}
        onPress={() => setAlertsOpen(true)}
        className={tabClass}
      >
        <Icon size={22} color="#756c5e" strokeWidth={1.8} />
        <Text className="text-[0.6875rem] font-medium text-text-muted">{item.label}</Text>
        {badge ? (
          <View className="absolute right-4 top-0.5 min-h-4 min-w-4 items-center justify-center rounded-full bg-[#f87000] px-1">
            <Text className="text-[9px] font-extrabold text-white">{badge}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  const owned = item.activePrefix ?? item.href;
  const isCurrent = item.href === "/home" ? pathname === "/home" : pathname === owned || pathname.startsWith(`${owned}/`);

  return (
    <Pressable
      key={item.href}
      accessibilityRole="tab"
      accessibilityState={{ selected: isCurrent }}
      onPress={() => router.push(item.href as never)}
      className={tabClass}
    >
      {isCurrent ? <View className="absolute -top-1.5 h-0.5 w-8 rounded-full bg-[#f87000]" /> : null}
      <Icon size={22} color={isCurrent ? "#071328" : "#756c5e"} strokeWidth={isCurrent ? 2.3 : 1.8} />
      <Text className={cn("text-[0.6875rem]", isCurrent ? "font-bold text-text" : "font-medium text-text-muted")}>
        {item.label}
      </Text>
    </Pressable>
  );
}
