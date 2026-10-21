// Ported from frontend/apps/partner/features/notifications/view/notification-panel.tsx
import { Button, EmptyState, Sheet, Text, cn } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { AsyncSection, asyncStateFrom } from "@/components/async-section";

import { isUnread, targetHref } from "../model/feed";
import {
  useMarkNotificationRead,
  useNotificationFeed,
  type Notification,
  type NotificationPage,
} from "../queries";

export function NotificationPanel({
  open,
  onOpenChange,
  workspaceKeys,
  unreadCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceKeys: readonly string[];
  unreadCount: number | null;
}) {
  const [visitId, setVisitId] = useState(0);
  return (
    <NotificationPanelBody
      key={visitId}
      open={open}
      onOpenChange={(next) => {
        if (!next) setVisitId((id) => id + 1);
        onOpenChange(next);
      }}
      workspaceKeys={workspaceKeys}
      unreadCount={unreadCount}
    />
  );
}

function NotificationPanelBody({
  open,
  onOpenChange,
  workspaceKeys,
  unreadCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceKeys: readonly string[];
  unreadCount: number | null;
}) {
  const feed = useNotificationFeed(open);
  const markRead = useMarkNotificationRead();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [dismissedAll, setDismissedAll] = useState(false);
  const state = asyncStateFrom<NotificationPage, NotificationPage>(feed, (page) => page);
  const hasUnread = unreadCount !== null && unreadCount > 0;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      description="Updates about your bookings, jobs and activity"
      footer={
        <View className="flex-row items-center justify-between w-full">
          {hasUnread ? (
            <Button
              variant="ghost"
              size="sm"
              loading={markRead.isPending}
              loadingLabel="Marking read..."
              onPress={() => {
                setDismissedAll(true);
                markRead.mutate({ all: true });
              }}
            >
              Mark all read
            </Button>
          ) : (
            <View />
          )}
          <Button
            variant="outline"
            size="sm"
            onPress={() => onOpenChange(false)}
            className="px-4"
          >
            Close
          </Button>
        </View>
      }
    >
      <View className="flex-1 min-h-0">
        {markRead.isError ? (
          <Text className="mb-2 text-sm text-danger-text">We could not mark that as read. It is still unread.</Text>
        ) : null}
        <AsyncSection
          state={state}
          label="Loading your notifications"
          isEmpty={(page) =>
            dismissedAll || page.results.filter((item) => !dismissedIds.has(item.id)).length === 0
          }
          onRetry={() => {
            setDismissedIds(new Set());
            setDismissedAll(false);
            void feed.refetch();
          }}
          empty={
            <EmptyState
              compact
              title="Nothing to read yet"
              description="Vsolve tells you here when a job is confirmed, when a customer answers, and when money moves. There is nothing you need to do."
            />
          }
        >
          {(page) => {
            const visible = dismissedAll ? [] : page.results.filter((item) => !dismissedIds.has(item.id));
            return (
              <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingBottom: 12 }}
                keyboardShouldPersistTaps="handled"
              >
                {visible.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    workspaceKeys={workspaceKeys}
                    onOpened={() => onOpenChange(false)}
                    onMarkRead={() => {
                      setDismissedIds((prev) => new Set(prev).add(notification.id));
                      markRead.mutate({ notificationId: notification.id });
                    }}
                  />
                ))}
                {page.next === null ? null : (
                  <Text className="text-sm leading-6 text-text-secondary mt-1">
                    Only your most recent notices are shown here. Older ones stay on the job they belong to.
                  </Text>
                )}
              </ScrollView>
            );
          }}
        </AsyncSection>
      </View>
    </Sheet>
  );
}

function NotificationRow({
  notification,
  workspaceKeys,
  onOpened,
  onMarkRead,
}: {
  notification: Notification;
  workspaceKeys: readonly string[];
  onOpened: () => void;
  onMarkRead: () => void;
}) {
  const router = useRouter();
  const href = targetHref(notification.target, workspaceKeys);
  const unread = isUnread(notification);
  return (
    <View
      className={cn(
        "gap-1.5 rounded-card border p-3.5",
        unread
          ? "border-navy-200 bg-surface shadow-xs"
          : "border-line bg-surface-sunken opacity-90"
      )}
    >
      <View className="flex-row items-center justify-between">
        <Text className={cn("text-sm flex-1", unread ? "font-bold text-navy-950" : "font-semibold text-text")}>
          {notification.title}
        </Text>
        {unread ? (
          <View className="h-2 w-2 rounded-full bg-brand ml-2" />
        ) : null}
      </View>
      <Text className="text-xs text-text-secondary leading-relaxed">{notification.body}</Text>
      <View className="mt-1 flex-row items-center gap-3">
        {href ? (
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            className="py-1"
            onPress={() => {
              if (unread) onMarkRead();
              onOpened();
              router.push(href as never);
            }}
          >
            <Text className="text-xs font-bold text-brand">Open</Text>
          </Pressable>
        ) : null}
        {unread ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            className="py-1"
            onPress={onMarkRead}
          >
            <Text className="text-xs font-semibold text-text-secondary">Mark read</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
