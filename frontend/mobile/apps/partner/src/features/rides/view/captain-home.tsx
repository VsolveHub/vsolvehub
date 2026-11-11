import { request } from "@vsolve/api-client";
import { getApiClient, pushPermission } from "@vsolve/mobile-core";
import { Button, ErrorState, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";

import { goOffDuty } from "../duty";
import { offDutyMessage } from "../model/duty-setup";
import { blockedReasonTexts, vehicleTypeName, type CaptainStatus } from "../model/shell";
import { captainStatusKey, useCaptainStatus, useCurrentRide, type CaptainRide } from "../queries";

function useAlertsOff() {
  return useQuery({ queryKey: ["rides", "push-permission"], queryFn: pushPermission }).data === "denied";
}

function useTodayEarnings() {
  return useQuery({
    queryKey: ["rides", "earnings", "today"],
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/partner/rides/earnings/", { params: { query: { period: "today" } } }),
      ),
  });
}

function PassLine({ status }: { status: CaptainStatus }) {
  if (status.active_pass?.ends_at) {
    const ends = new Date(status.active_pass.ends_at);
    return (
      <Text className="text-sm text-text">
        {status.active_pass.plan.name} · ends {ends.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
      </Text>
    );
  }
  return <Text className="text-sm text-text-muted">No active pass</Text>;
}

const RIDE_STATE: Record<string, string> = {
  CAPTAIN_ASSIGNED: "Go to the pickup",
  CAPTAIN_ARRIVED: "At the pickup",
  IN_TRIP: "In trip",
  COMPLETED: "Collect the payment",
};

/** The ride the captain accepted. The trip steps arrive with the trip screens (Day 7). */
function YourRide({ ride }: { ride: CaptainRide }) {
  const phone = ride.rider.phone_number;
  return (
    <View className="rounded-2xl bg-[#00112e] p-4 gap-2">
      <Text className="text-xs font-semibold uppercase text-[#f87000]">Your ride</Text>
      <Text className="text-lg font-bold text-white">{RIDE_STATE[ride.state] ?? ride.state}</Text>
      <Text className="text-sm text-white">Pickup: {ride.pickup.address}</Text>
      <Text className="text-sm text-white/80">Drop: {ride.drop.address}</Text>
      <Text className="text-sm text-white">
        {ride.rider.name} · {formatMoney(ride.fare_paise)}
      </Text>
      {phone ? (
        <Button variant="outline" onPress={() => void Linking.openURL(`tel:${phone}`)}>
          Call rider
        </Button>
      ) : null}
    </View>
  );
}

/** The captain's Home: their ride, where they stand, what blocks duty, and today's money. */
export function CaptainHome() {
  const status = useCaptainStatus();
  const earnings = useTodayEarnings();
  const router = useRouter();
  const queryClient = useQueryClient();
  const alertsOff = useAlertsOff();
  const currentRide = useCurrentRide();
  const offDuty = useMutation({
    mutationFn: goOffDuty,
    onSettled: () => queryClient.invalidateQueries({ queryKey: captainStatusKey }),
  });

  if (status.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (status.isError) {
    return (
      <ErrorState
        title="We couldn't load your captain details"
        message={describeError(status.error).message}
        actionLabel="Try again"
        onAction={() => void status.refetch()}
      />
    );
  }

  const data = status.data;
  const blocked = blockedReasonTexts(data.blocked_reasons);
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={
        <RefreshControl
          refreshing={status.isRefetching}
          onRefresh={() => {
            void status.refetch();
            void earnings.refetch();
          }}
        />
      }
    >
      {currentRide.data?.ride ? <YourRide ride={currentRide.data.ride} /> : null}

      <View className="rounded-2xl bg-surface p-4 gap-1">
        <Text className="text-xs font-semibold uppercase text-text-muted">Today</Text>
        <Text className="text-3xl font-extrabold text-text">
          {earnings.data ? formatMoney(earnings.data.earned_paise) : "—"}
        </Text>
        <Text className="text-sm text-text-muted">
          {earnings.data ? `${earnings.data.rides} rides` : earnings.isError ? "Couldn't load earnings" : " "}
        </Text>
      </View>

      <View className="rounded-2xl bg-surface p-4 gap-2">
        <Text className="text-xs font-semibold uppercase text-text-muted">Duty</Text>
        <Text className="text-base font-bold text-text">{data.on_duty ? "You're on duty" : "You're off duty"}</Text>
        {!data.on_duty && offDutyMessage(data.last_duty_end?.reason) ? (
          <Text className="text-sm text-text">{offDutyMessage(data.last_duty_end?.reason)}</Text>
        ) : null}
        {blocked.map((line) => (
          <Text key={line} className="text-sm text-danger">
            {line}
          </Text>
        ))}
        {data.on_duty ? (
          <Button size="lg" block variant="outline" loading={offDuty.isPending} onPress={() => offDuty.mutate()}>
            Go off duty
          </Button>
        ) : (
          <Button size="lg" block disabled={blocked.length > 0} onPress={() => router.push("/rides/duty-setup")}>
            Go on duty
          </Button>
        )}
        {offDuty.isError ? (
          <Text className="text-sm text-danger">{describeError(offDuty.error, "mutation").message}</Text>
        ) : null}
        {alertsOff ? (
          <Text className="text-sm text-text-muted">
            {"Ride alerts won't ring when the app is closed. Turn on notifications for VSolve in Settings."}
          </Text>
        ) : null}
        <Pressable accessibilityRole="link" onPress={() => router.push("/rides/battery")}>
          <Text className="text-sm font-semibold text-[#c25600]">Battery help</Text>
        </Pressable>
      </View>

      <View className="rounded-2xl bg-surface p-4 gap-2">
        <Text className="text-xs font-semibold uppercase text-text-muted">Pass</Text>
        <PassLine status={data} />
        {data.queued_pass ? (
          <Text className="text-sm text-text-muted">Next: {data.queued_pass.plan.name}, starts when this one ends</Text>
        ) : null}
      </View>

      <View className="rounded-2xl bg-surface p-4 gap-1">
        <Text className="text-xs font-semibold uppercase text-text-muted">Vehicle</Text>
        {data.vehicle ? (
          <Text className="text-sm text-text">
            {vehicleTypeName(data.vehicle.vehicle_type)} · {data.vehicle.registration_number} · {data.vehicle.make_model},{" "}
            {data.vehicle.colour}
          </Text>
        ) : (
          <Text className="text-sm text-text-muted">No vehicle saved</Text>
        )}
      </View>
    </ScrollView>
  );
}
