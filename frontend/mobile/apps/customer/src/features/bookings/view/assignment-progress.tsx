// Ported from frontend/apps/customer/features/bookings/view/assignment-progress.tsx
import { Text, buttonStyles } from "@vsolve/mobile-ui";
import { Link } from "expo-router";
import { Pressable, View } from "react-native";

import type { BookingGroup } from "../queries";
import { GROUP_STATUS_MEANING, RECOVERY_LABELS, heldUnitCount } from "./group-status";

export function AssignmentProgress({ group }: { group: BookingGroup }) {
  const recovery = RECOVERY_LABELS[group.recovery_action];
  const held = heldUnitCount(group);
  const total = group.units.length;

  return (
    <View className="gap-3">
      <Text className="sr-only">Progress</Text>
      <View className="rounded-xl border border-line bg-surface-sunken p-4">
        <Text className="text-sm font-medium text-text">{GROUP_STATUS_MEANING[group.status]}</Text>
        {total > 1 ? (
          <Text className="mt-2 text-xs text-text-secondary">
            {held} of {total} visits have a professional held. They are booked together or not at all.
          </Text>
        ) : null}
      </View>
      {recovery !== null ? (
        <Text className="text-sm font-medium text-text">{recovery}</Text>
      ) : null}
      {group.recovery_action === "REPLAN" ? (
        <Link href="/cart" asChild>
          <Pressable className={buttonStyles({ variant: "outline" })}>
            <Text className="text-sm font-semibold text-text">Choose a new arrangement</Text>
          </Pressable>
        </Link>
      ) : null}
      {group.recovery_action === "PAYMENT_REQUIRED" && group.checkout_id !== null ? (
        <Link href={`/bookings/${group.id}/pay`} asChild>
          <Pressable className={buttonStyles({ className: "w-full justify-center bg-orange-600" })}>
            <Text className="text-sm font-bold text-action-text">Pay now</Text>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}
