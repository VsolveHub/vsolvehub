// Ported from frontend/apps/partner/features/notifications/view/notification-panel.tsx
import { Button, EmptyState, Sheet, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

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
      footer={
        hasUnread ? (
          <Button
            variant="ghost"
            loading={markRead.isPending}
            loadingLabel="Marking everything read"
            onPress={() => {
              setDismissedAll(true);
              markRead.mutate({ all: true });
            }}
          >
            Mark all read
          </Button>
        ) : undefined
      }
    >
      <View className="gap-3">
        {markRead.isError ? (
          <Text className="text-sm text-danger-text">We could not mark that as read. It is still unread.</Text>
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
              <View className="gap-2">
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
                  <Text className="text-sm leading-6 text-text-secondary">
                    Only your most recent notices are shown here. Older ones stay on the job they belong to.
                  </Text>
                )}
              </View>
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
    <View className={unread ? "gap-1 rounded-card border border-line bg-surface p-3" : "gap-1 rounded-card border border-line bg-surface-sunken p-3"}>
      <Text className="text-sm font-semibold text-text">{notification.title}</Text>
      <Text className="text-sm text-text-secondary">{notification.body}</Text>
      {href ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            if (unread) onMarkRead();
            onOpened();
            router.push(href as never);
          }}
        >
          <Text className="text-sm font-semibold text-action">Open</Text>
        </Pressable>
      ) : unread ? (
        <Pressable accessibilityRole="button" onPress={onMarkRead}>
          <Text className="text-sm font-semibold text-action">Mark read</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
