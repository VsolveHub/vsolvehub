// Ported from frontend/apps/customer/features/visit/view/visit-actions.tsx
import { Button, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import { canCancel, canReschedule, rescheduleBlockedReason, type Visit } from "../queries";
import { CancelVisitSheet } from "./cancel-visit-sheet";
import { RescheduleVisitSheet } from "./reschedule-visit-sheet";

export function VisitActions({ visit }: { visit: Visit }) {
  const [cancelling, setCancelling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const offersReschedule = canReschedule(visit);
  const offersCancel = canCancel(visit);
  const blockedReason = offersReschedule ? "" : rescheduleBlockedReason(visit);

  if (!offersCancel && !offersReschedule) return null;

  return (
    <View className="mt-6 border-t border-line pt-5 gap-3">
      <View className="flex-row flex-wrap gap-3">
        {offersReschedule ? (
          <Button variant="outline" onPress={() => setRescheduling(true)}>
            Reschedule
          </Button>
        ) : null}
        {offersCancel ? (
          <Button variant="ghost" onPress={() => setCancelling(true)}>
            Cancel this visit
          </Button>
        ) : null}
      </View>
      {blockedReason ? (
        <Text className="text-sm leading-6 text-text-secondary">{blockedReason}</Text>
      ) : null}
      {visit.status === "RECOVERY_REQUIRED" ? (
        <Text className="text-sm leading-6 text-text-secondary">
          You do not have to decide now — if we cannot find anyone, we cancel this visit and
          refund it in full on our own.
        </Text>
      ) : null}

      {offersCancel ? (
        <CancelVisitSheet visit={visit} open={cancelling} onOpenChange={setCancelling} />
      ) : null}
      {offersReschedule ? (
        <RescheduleVisitSheet visit={visit} open={rescheduling} onOpenChange={setRescheduling} />
      ) : null}
    </View>
  );
}

