// Ported from frontend/apps/customer/features/visit/view/reschedule-visit-sheet.tsx
import { Button, ErrorState, Sheet, Skeleton, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import { PreferredStartPicker } from "@/features/booking/view/preferred-start-picker";

import { describeRescheduleFailure } from "../reasons";
import { useRescheduleVisit, useRescheduleWindows, type Visit } from "../queries";

export function RescheduleVisitSheet({
  visit,
  open,
  onOpenChange,
}: {
  visit: Visit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open) return null;
  return <RescheduleSheetBody visit={visit} onOpenChange={onOpenChange} />;
}

function RescheduleSheetBody({
  visit,
  onOpenChange,
}: {
  visit: Visit;
  onOpenChange: (open: boolean) => void;
}) {
  const windows = useRescheduleWindows(visit.id);
  const reschedule = useRescheduleVisit();
  const [selected, setSelected] = useState<string | null>(null);

  function close() {
    onOpenChange(false);
  }

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Reschedule this visit"
      description="Pick a new arrival window. We will keep your professional if they are free, and find someone else if they are not."
      dismissable={!reschedule.isPending}
      footer={
        <View className="flex-row gap-2 justify-end w-full">
          <Button variant="ghost" disabled={reschedule.isPending} onPress={close}>
            Keep the current time
          </Button>
          <Button
            disabled={selected === null}
            loading={reschedule.isPending}
            loadingLabel="Rescheduling"
            onPress={() =>
              selected !== null &&
              reschedule.mutate(
                {
                  bookingId: visit.id,
                  expectedVersion: visit.version,
                  newRequestedStart: selected,
                },
                { onSuccess: close },
              )
            }
          >
            Reschedule
          </Button>
        </View>
      }
    >
      {reschedule.isError ? (
        <ErrorState
          inline
          className="mb-4"
          title="We could not reschedule this visit"
          message={describeRescheduleFailure(reschedule.error)}
        />
      ) : null}

      {windows.isError ? (
        <ErrorState
          title="We could not load available times"
          message="Nothing has changed and your visit is still booked for its original time."
          actionLabel="Try again"
          onAction={() => void windows.refetch()}
        />
      ) : windows.isPending ? (
        <View className="gap-2 p-4">
          <Text className="text-sm text-text-secondary">Loading available times…</Text>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-28 w-full" />
        </View>
      ) : windows.data ? (
        <PreferredStartPicker
          windows={windows.data}
          selectedStart={selected}
          onSelect={setSelected}
          footnote="Rescheduling is free. If nobody can take the window you pick, we will say so and leave this visit exactly as it is."
        />
      ) : null}
    </Sheet>
  );
}

