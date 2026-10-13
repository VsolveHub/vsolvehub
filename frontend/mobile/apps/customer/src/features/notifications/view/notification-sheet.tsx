// Ported from frontend/apps/customer/features/notifications/view/notification-panel.tsx
import { BlurBackdrop, Button, cn, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line } from "react-native-svg";

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
}

export function NotificationSheet({ open, onOpenChange }: NotificationSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const feed = useNotificationFeed(open);
  const count = useUnreadNotificationCount(open);
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
          className="w-full max-h-[86%] rounded-t-[28px] bg-white shadow-2xl overflow-hidden flex-col"
          style={{ paddingBottom: Math.max(12, insets.bottom) }}
        >
          {/* Header */}
          <View className="px-5 pt-4 pb-3 bg-white">
            <View className="flex-row items-center justify-between">
              <Text className="text-[19px] font-bold text-navy-900 tracking-tight">
                Notifications
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close notifications"
                onPress={() => onOpenChange(false)}
                hitSlop={10}
                className="h-8 w-8 items-center justify-center rounded-full active:bg-gray-100"
              >
                <Svg
                  width={18}
                  height={18}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#374151"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Line x1={18} y1={6} x2={6} y2={18} />
                  <Line x1={6} y1={6} x2={18} y2={18} />
                </Svg>
              </Pressable>
            </View>
            <Text className="mt-0.5 text-xs text-[#6B7280]" numberOfLines={1}>
              Updates about your requests, bookings and projects.
            </Text>
          </View>

          {/* Thin separator line below header */}
          <View className="h-px w-full bg-[#E5E7EB]" />

          {/* Content / Feed List */}
          <ScrollView
            className="flex-1 px-4 pt-3.5"
            showsVerticalScrollIndicator={true}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {feed.isPending ? (
              <View className="gap-3">
                {[1, 2, 3].map((k) => (
                  <View
                    key={k}
                    className="rounded-2xl border border-[#E5E7EB] bg-white p-4"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="h-4 w-36 rounded bg-gray-200" />
                      <View className="h-3.5 w-3.5 rounded bg-gray-200" />
                    </View>
                    <View className="mt-2.5 h-3.5 w-full rounded bg-gray-100" />
                    <View className="mt-1.5 h-3.5 w-4/5 rounded bg-gray-100" />
                    <View className="mt-2.5 h-3 w-16 rounded bg-gray-100" />
                  </View>
                ))}
              </View>
            ) : feed.isError ? (
              <View className="py-10 items-center justify-center px-4">
                <Text className="text-sm font-semibold text-danger-text">
                  Could not load notifications
                </Text>
                <Text className="mt-1 text-xs text-text-muted text-center">
                  Please check your connection and try again.
                </Text>
                <Pressable
                  onPress={() => void feed.refetch()}
                  className="mt-3 rounded-full bg-navy-900 px-4 py-2"
                >
                  <Text className="text-xs font-semibold text-white">Try again</Text>
                </Pressable>
              </View>
            ) : rows.length === 0 ? (
              <View className="py-16 items-center justify-center px-6">
                <Text className="text-base font-bold text-navy-900">Nothing new</Text>
                <Text className="mt-1.5 text-center text-xs text-text-muted leading-relaxed">
                  When a professional responds, work needs checking or a booking updates, it appears here.
                </Text>
              </View>
            ) : (
              rows.map((notice) => (
                <Pressable
                  key={notice.id}
                  onPress={() => handleOpenNotice(notice)}
                  className="rounded-2xl border border-[#E5E7EB] bg-white p-4 mb-3 active:bg-gray-50/60"
                  style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.04,
                    shadowRadius: 2,
                    elevation: 1,
                  }}
                >
                  {/* Card Header Row */}
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 text-[15px] font-bold text-[#1E293B] pr-2">
                      {notice.title}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Dismiss notification: ${notice.title}`}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDismiss(notice.id);
                      }}
                      hitSlop={8}
                      className="h-6 w-6 items-center justify-center rounded-full active:bg-gray-100 -mr-1 -mt-0.5"
                    >
                      <Svg
                        width={14}
                        height={14}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#6B7280"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <Line x1={18} y1={6} x2={6} y2={18} />
                        <Line x1={6} y1={6} x2={18} y2={18} />
                      </Svg>
                    </Pressable>
                  </View>

                  {/* Card Body */}
                  <Text className="mt-1.5 text-sm text-[#4B5563] leading-[21px]">
                    {notice.body}
                  </Text>

                  {/* Card Timestamp */}
                  <Text className="mt-2 text-xs text-[#78716C]">
                    {relativeWhen(notice.created_at)}
                  </Text>
                </Pressable>
              ))
            )}

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
          </ScrollView>

          {/* Footer */}
          <View className="flex-row justify-end px-5 py-3 bg-white border-t border-[#F1F3F5]">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
              onPress={handleDismissAll}
              disabled={!canMarkAll}
              hitSlop={8}
              className="py-1 px-2 active:opacity-70"
            >
              <Text
                className={cn(
                  "text-sm font-semibold",
                  canMarkAll ? "text-[#52525B]" : "text-[#9CA3AF]"
                )}
              >
                Mark all read
              </Text>
            </Pressable>
          </View>
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
