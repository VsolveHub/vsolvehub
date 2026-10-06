// Ported from frontend/apps/customer/features/notifications/view/notification-panel.tsx
import { Button, Sheet, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Pressable, ScrollView } from "react-native";

import { targetHref } from "@/features/notifications/model/feed";
import { useMarkNotificationRead, useNotificationFeed } from "@/features/notifications/queries";

export function NotificationSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const feed = useNotificationFeed(open);
  const mark = useMarkNotificationRead();
  const router = useRouter();
  const rows = feed.data?.pages.flatMap((page) => page.results) ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Notifications" footer={<Button variant="ghost" onPress={() => mark.mutate({ all: true })}>Mark all read</Button>}>
      {feed.isPending ? <Spinner size="sm" /> : null}
      <ScrollView>
        {rows.map((notice) => {
          const href = targetHref(notice.target);
          return (
            <Pressable
              key={notice.id}
              onPress={() => {
                mark.mutate({ all: false, notificationId: notice.id });
                if (href) {
                  onOpenChange(false);
                  router.push(href as never);
                }
              }}
              className="border-b border-line py-3"
            >
              <Text className="text-base font-semibold text-text">{notice.title}</Text>
              <Text className="text-sm text-text-secondary">{notice.body}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}
