// Ported from frontend/apps/customer/features/engagement/view/engagement-timeline.tsx
import { describeError } from "@vsolve/query/native";
import { EmptyState, ErrorState, Skeleton, Text, Timeline, TimelineEvent } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { toEngagementEvents } from "@/features/engagement/adapters";
import { useEngagementEvents } from "@/features/engagement/queries";

export function EngagementTimeline({ engagementId }: { engagementId: string }) {
  const query = useEngagementEvents(engagementId);
  const events = query.data === undefined ? null : toEngagementEvents(query.data);
  const [open, setOpen] = useState(false);
  return (
    <View className="mt-6 overflow-hidden rounded-card border border-line bg-surface shadow-sm">
      <Pressable accessibilityRole="button" onPress={() => setOpen((current) => !current)} className="min-h-16 justify-center px-4 py-3">
        <Text className="text-sm font-extrabold text-text">Project activity</Text>
        <Text className="text-xs font-medium text-text-secondary">
          {events === null ? "Loading the shared record" : `${events.length} recorded update${events.length === 1 ? "" : "s"}`}
        </Text>
      </Pressable>
      {open ? (
        <View className="border-t border-line bg-canvas px-4 py-4">
          {query.isPending ? (
            <View>
              <Text className="sr-only">Loading the record</Text>
              <Skeleton className="h-32 w-full" />
            </View>
          ) : events === null ? (
            <ErrorState
              title={describeError(query.error, "read").title}
              message={`${describeError(query.error, "read").message} The record itself is safe — this is only our reading of it.`}
              severity={describeError(query.error, "read").severity}
              actionLabel="Try again"
              onAction={() => void query.refetch()}
              reference={describeError(query.error, "read").reference}
              inline
            />
          ) : events.length === 0 ? (
            <EmptyState
              title="Nothing has happened yet"
              compact
              description="Every step on this job is recorded here as it happens, for both of you."
            />
          ) : (
            <Timeline label="Everything that has happened on this job">
              {events.map((event) => (
                <TimelineEvent
                  key={event.eventId}
                  title={event.title}
                  timestamp={event.at ?? ""}
                  actor={event.actorIsSystem ? "Automatic — no one had to do anything" : "Somebody decided this"}
                >
                  {event.transition}
                </TimelineEvent>
              ))}
            </Timeline>
          )}
        </View>
      ) : null}
    </View>
  );
}
