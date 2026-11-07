// Ported from frontend/apps/customer/features/notifications/view/notification-panel.tsx
import { useAuthStore } from "@vsolve/mobile-core";
import { BlurBackdrop, Button, cn, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Bell, CheckCheck, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIsDesktop } from "@/lib/responsive";
import { isUnread, targetHref } from "@/features/notifications/model/feed";
import {
  useMarkNotificationRead,
  useNotificationFeed,
  useUnreadNotificationCount,
  type Notification,
} from "@/features/notifications/queries";

export interface NotificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequireLogin?: () => void;
}

export function NotificationSheet({ open, onOpenChange, onRequireLogin }: NotificationSheetProps) {
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const isAuthenticated = status === "signedIn";

  const feed = useNotificationFeed(open && isAuthenticated);
  const count = useUnreadNotificationCount(open && isAuthenticated);
  const markRead = useMarkNotificationRead();

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [dismissedAll, setDismissedAll] = useState(false);

  // Reset local dismissals when sheet is closed
  useEffect(() => {
    if (!open) {
      setDismissedIds(new Set());
      setDismissedAll(false);
    }
  }, [open]);

  const rawRows = (feed.data?.pages ?? []).flatMap((page) => page.results);
  const rows = dismissedAll ? [] : rawRows.filter((item) => !dismissedIds.has(item.id));

  const unreadTotal = count.data?.unread ?? 0;
  const canMarkAll = (unreadTotal > 0 || rows.some(isUnread)) && !markRead.isPending;

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    markRead.mutate({ all: false, notificationId: id });
  };

  const handleDismissAll = () => {
    setDismissedAll(true);
    markRead.mutate({ all: true });
  };

  const handleOpenNotice = (notice: Notification) => {
    if (isUnread(notice)) {
      markRead.mutate({ all: false, notificationId: notice.id });
    }
    const href = targetHref(notice.target);
    if (href) {
      onOpenChange(false);
      router.push(href as never);
    }
  };

  const renderFeedContent = () => {
    if (!isAuthenticated) {
      return (
        <View className="flex-1 py-12 items-center justify-center px-6">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF7ED] mb-3.5">
            <Bell size={26} color="#EA580C" />
          </View>
          <Text className="text-base font-bold text-navy-900">Sign in for notifications</Text>
          <Text className="mt-1.5 text-center text-xs text-text-muted leading-relaxed max-w-[260px]">
            Sign in with your mobile number to view updates about your bookings and projects.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onOpenChange(false);
              onRequireLogin?.();
            }}
            className="mt-5 rounded-2xl bg-[#FF5500] px-6 py-3 active:bg-[#E04B00] cursor-pointer"
          >
            <Text className="text-sm font-bold text-white">Log in</Text>
          </Pressable>
        </View>
      );
    }

    if (feed.isPending) {
      return (
        <View className="gap-2.5">
          {[1, 2, 3].map((k) => (
            <View
              key={k}
              className="rounded-2xl border border-[#E5E7EB] bg-[#FAF8F5] p-3.5"
            >
              <View className="flex-row items-center justify-between">
                <View className="h-4 w-36 rounded bg-gray-200 animate-pulse" />
                <View className="h-3.5 w-3.5 rounded bg-gray-200 animate-pulse" />
              </View>
              <View className="mt-2.5 h-3.5 w-full rounded bg-gray-100 animate-pulse" />
              <View className="mt-1.5 h-3.5 w-4/5 rounded bg-gray-100 animate-pulse" />
              <View className="mt-2 h-3 w-16 rounded bg-gray-100 animate-pulse" />
            </View>
          ))}
        </View>
      );
    }

    if (feed.isError) {
      return (
        <View className="flex-1 py-10 items-center justify-center px-4">
          <Text className="text-sm font-semibold text-danger-text">
            Could not load notifications
          </Text>
          <Text className="mt-1 text-xs text-text-muted text-center">
            Please check your connection and try again.
          </Text>
          <Pressable
            onPress={() => void feed.refetch()}
            className="mt-3 rounded-full bg-navy-900 px-4 py-2 cursor-pointer"
          >
            <Text className="text-xs font-semibold text-white">Try again</Text>
          </Pressable>
        </View>
      );
    }

    if (rows.length === 0) {
      return (
        <View className="flex-1 py-16 items-center justify-center px-6">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF7ED] mb-3.5">
            <Bell size={26} color="#EA580C" />
          </View>
          <Text className="text-base font-bold text-navy-900">Nothing new</Text>
          <Text className="mt-1.5 text-center text-xs text-text-muted leading-relaxed max-w-[260px]">
            When a professional responds, work needs checking or a booking updates, it appears here.
          </Text>
        </View>
      );
    }

    return (
      <>
        {rows.map((notice) => {
          const unread = isUnread(notice);
          return (
            <View
              key={notice.id}
              className={cn(
                "rounded-2xl border p-3.5 mb-2.5 transition",
                unread
                  ? "border-[#E5E1DC] bg-[#FAF8F5]"
                  : "border-[#E5E7EB] bg-white",
              )}
            >
              <View className="flex-row items-start justify-between gap-2">
                <Pressable
                  onPress={() => handleOpenNotice(notice)}
                  className="flex-1 min-w-0 cursor-pointer"
                >
                  {/* Card Header Row with Orange Bullet */}
                  <View className="flex-row items-center gap-2">
                    {unread ? (
                      <View className="h-2 w-2 rounded-full bg-[#EA580C] shrink-0" />
                    ) : null}
                    <Text className="flex-1 text-sm font-bold text-navy-950">
                      {notice.title}
                    </Text>
                  </View>

                  {/* Card Body */}
                  <Text className="mt-1 text-xs text-[#475569] leading-relaxed">
                    {notice.body}
                  </Text>

                  {/* Card Timestamp */}
                  <Text className="mt-1.5 text-[11px] text-[#94A3B8]">
                    {relativeWhen(notice.created_at)}
                  </Text>
                </Pressable>

                {/* Dismiss Button */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Dismiss notification: ${notice.title}`}
                  onPress={() => handleDismiss(notice.id)}
                  hitSlop={8}
                  className="p-1 -mr-1 -mt-0.5 rounded-full hover:bg-slate-200 cursor-pointer active:scale-95"
                >
                  <X size={14} color="#94A3B8" />
                </Pressable>
              </View>
            </View>
          );
        })}

        {feed.hasNextPage ? (
          <View className="mt-2 mb-4">
            <Button
              variant="outline"
              onPress={() => void feed.fetchNextPage()}
              loading={feed.isFetchingNextPage}
              loadingLabel="Loading older"
            >
              Show older
            </Button>
          </View>
        ) : null}
      </>
    );
  };

  const renderFooter = () => (
    <View className="flex-row items-center justify-between px-4 py-3 bg-white border-t border-[#F1F3F5]">
      <View className="flex-row items-center gap-1.5">
        {unreadTotal > 0 ? (
          <Text className="text-xs font-medium text-text-secondary">
            {unreadTotal} unread {unreadTotal === 1 ? "notice" : "notices"}
          </Text>
        ) : (
          <Text className="text-xs text-text-muted">All caught up</Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mark all as read"
        onPress={handleDismissAll}
        disabled={!canMarkAll}
        hitSlop={8}
        className="py-1 px-2 flex-row items-center gap-1.5 cursor-pointer hover:opacity-80 active:opacity-60"
      >
        {markRead.isPending ? (
          <ActivityIndicator size="small" color="#EA580C" />
        ) : (
          <CheckCheck size={15} color={canMarkAll ? "#EA580C" : "#9CA3AF"} />
        )}
        <Text
          className={cn(
            "text-xs font-semibold",
            canMarkAll ? "text-[#EA580C]" : "text-[#9CA3AF]"
          )}
        >
          Mark all read
        </Text>
      </Pressable>
    </View>
  );

  // Desktop View: 100% pixel-accurate floating dropdown popover anchored below bell icon
  if (isDesktop) {
    return (
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => onOpenChange(false)}
      >
        <View className="flex-1">
          {/* Subtle dimmed overlay backdrop */}
          <Pressable
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.2)",
            }}
            onPress={() => onOpenChange(false)}
            accessibilityLabel="Close notifications backdrop"
          />

          {/* Floating Popover Container Anchored Top-Right */}
          <View
            style={{
              position: "absolute",
              top: 64,
              right: 24,
              width: 380,
              maxHeight: 520,
              height: 500,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.15,
              shadowRadius: 25,
              elevation: 12,
            }}
            className="rounded-2xl border border-[#E5E1DC] bg-white overflow-hidden flex-col z-50"
          >
            {/* Header matching Web Customer Portal 100% */}
            <View className="px-4 pt-3.5 pb-2.5 bg-white border-b border-[#F1F3F5]">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-bold text-navy-950">
                  Notifications
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close notifications"
                  onPress={() => onOpenChange(false)}
                  hitSlop={8}
                  className="p-1 rounded-md hover:bg-slate-100 cursor-pointer active:bg-slate-200"
                >
                  <X size={16} color="#475569" strokeWidth={2} />
                </Pressable>
              </View>
              <Text className="mt-0.5 text-xs text-[#6B7280]" numberOfLines={1}>
                Updates about your requests, bookings and projects.
              </Text>
            </View>

            {/* Scrollable Feed List */}
            <ScrollView
              className="flex-1 px-3.5 pt-3"
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: 12 }}
            >
              {renderFeedContent()}
            </ScrollView>

            {/* Footer */}
            {renderFooter()}
          </View>
        </View>
      </Modal>
    );
  }

  // Mobile Phone View: Bottom Sheet Modal
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={() => onOpenChange(false)}
    >
      <View className="flex-1 justify-end">
        <BlurBackdrop
          onPress={() => onOpenChange(false)}
          accessibilityLabel="Close notifications backdrop"
        />

        <View
          className="w-full rounded-t-[28px] bg-white shadow-2xl overflow-hidden flex-col"
          style={{
            height: "72%",
            minHeight: 380,
            maxHeight: "88%",
            paddingBottom: Math.max(12, insets.bottom),
          }}
        >
          {/* Mobile Header with Badge */}
          <View className="px-5 pt-4 pb-3 bg-white border-b border-[#E5E7EB]">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Text className="text-[19px] font-bold text-navy-900 tracking-tight">
                  Notifications
                </Text>
                {unreadTotal > 0 ? (
                  <View className="rounded-full bg-[#FF5500] px-2 py-0.5">
                    <Text className="text-[11px] font-bold text-white">
                      {unreadTotal > 99 ? "99+" : unreadTotal} new
                    </Text>
                  </View>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close notifications"
                onPress={() => onOpenChange(false)}
                hitSlop={12}
                className="h-8 w-8 items-center justify-center rounded-full bg-[#F3F4F6] active:bg-[#E5E7EB]"
              >
                <X size={16} color="#475569" strokeWidth={2.2} />
              </Pressable>
            </View>
            <Text className="mt-0.5 text-xs text-[#6B7280]" numberOfLines={1}>
              Updates about your requests, bookings and projects.
            </Text>
          </View>

          {/* Mobile Scrollable Feed List */}
          <ScrollView
            className="flex-1 px-4 pt-3.5"
            showsVerticalScrollIndicator={true}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
          >
            {renderFeedContent()}
          </ScrollView>

          {/* Mobile Footer */}
          {renderFooter()}
        </View>
      </View>
    </Modal>
  );
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function absoluteWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function relativeWhen(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";

  const elapsed = Date.now() - at;
  if (elapsed < 0) return "Just now";
  if (elapsed < MINUTE_MS) return "Just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} hr ago`;
  return absoluteWhen(iso);
}
