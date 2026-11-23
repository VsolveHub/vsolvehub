import { Text } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch, View } from "react-native";

import type { CaptainStatus } from "../model/shell";
import { captainStatusKey, setParcelPreference } from "../queries";

/**
 * "Take parcel orders" (brief §6.1, D17): on by default, for Bike and Auto captains only. With it
 * off the captain still gets rides, but no Pick up & Drop requests. A cab captain, or one with no
 * vehicle yet, does not see it at all.
 */
export function ParcelPreferenceCard({ status }: { status: CaptainStatus }) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: setParcelPreference,
    onSuccess: (answer) =>
      queryClient.setQueryData<CaptainStatus>(captainStatusKey, (old) =>
        old ? { ...old, takes_parcels: answer.takes_parcels } : old,
      ),
  });
  if (!status.vehicle || status.vehicle.vehicle_type === "CAB") return null;

  // While the change is on its way the switch already shows the new value.
  const on = change.isPending ? change.variables : status.takes_parcels;
  return (
    <View className="rounded-2xl bg-surface p-4 gap-1">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-bold text-text">Take parcel orders</Text>
          <Text className="text-sm text-text-muted">Get Pick up &amp; Drop requests as well as rides.</Text>
        </View>
        <Switch
          accessibilityLabel="Take parcel orders"
          value={on}
          disabled={change.isPending}
          onValueChange={(value) => change.mutate(value)}
          trackColor={{ true: "#f87000" }}
        />
      </View>
      {change.isError ? (
        <Text accessibilityRole="alert" className="text-sm text-danger">
          {describeError(change.error, "mutation").message}
        </Text>
      ) : null}
    </View>
  );
}
