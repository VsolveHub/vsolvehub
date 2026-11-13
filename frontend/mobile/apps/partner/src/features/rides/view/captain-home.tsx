import { request } from "@vsolve/api-client";
import { getApiClient, pushPermission } from "@vsolve/mobile-core";
import { Button, ErrorState, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";

import { START_FAILED_MESSAGE, goOffDuty, goOnDuty, locationSwitchOn, turnOnLocation } from "../duty";
import { nextSetupStep, offDutyMessage } from "../model/duty-setup";
import { blockedReasonTexts, vehicleTypeName, type CaptainStatus } from "../model/shell";
import { captainStatusKey, useCaptainStatus, useCurrentRide, type CaptainRide } from "../queries";
import { readSetup } from "../setup-state";
import { BatteryHelpSheet } from "./battery-help";

function useAlertsOff() {
  return useQuery({ queryKey: ["rides", "push-permission"], queryFn: pushPermission }).data === "denied";
}

/**
 * The phone's own location switch, looked at every few seconds while on duty: with it off nothing
 * is sent, riders cannot see the captain, and duty ends after 2 minutes.
 */
function useLocationSwitch(onDuty: boolean) {
  return useQuery({
    queryKey: ["rides", "location-switch"],
    queryFn: () => Location.hasServicesEnabledAsync(),
    enabled: onDuty,
    refetchInterval: 4000,
  });
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

/** Rides already opened full screen this session, so going back to Home never loops. */
const openedRides = new Set<string>();

/** The ride the captain is on, with the way back into the trip screen. */
function YourRide({ ride }: { ride: CaptainRide }) {
  const router = useRouter();
  const phone = ride.rider.phone_number;
  // Reopening the app mid-ride lands on the ride (brief §7.3, scenario 19).
  useEffect(() => {
    if (openedRides.has(ride.id)) return;
    openedRides.add(ride.id);
    router.push("/rides/trip");
  }, [ride.id, router]);
  return (
    <View className="rounded-2xl bg-[#00112e] p-4 gap-2">
      <Text className="text-xs font-semibold uppercase text-[#f87000]">Your ride</Text>
      <Text className="text-lg font-bold text-white">{RIDE_STATE[ride.state] ?? ride.state}</Text>
      <Text className="text-sm text-white">Pickup: {ride.pickup.address}</Text>
      <Text className="text-sm text-white/80">Drop: {ride.drop.address}</Text>
      <Text className="text-sm text-white">
        {ride.rider.name} · {formatMoney(ride.fare_paise)}
      </Text>
      <Button onPress={() => router.push("/rides/trip")}>Open ride</Button>
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
  // Set when the captain declined Android's "turn on location" pop-up after tapping Go on duty.
  const [needsLocation, setNeedsLocation] = useState(false);
  const [startingDuty, setStartingDuty] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [batteryOpen, setBatteryOpen] = useState(false);
  const locationSwitch = useLocationSwitch(status.data?.on_duty === true);
  const locationOff = locationSwitch.data === false;
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
  // With the phone's location off, the tap shows Android's own pop-up first. Then, if this phone
  // has already done the one-time setup, duty starts right here, the button showing it is busy;
  // only a missing step opens the setup screen. Declining the pop-up stays here with one line.
  const startDuty = async () => {
    setNeedsLocation(false);
    setStartError(null);
    if (!(await locationSwitchOn())) {
      await turnOnLocation();
      if (!(await locationSwitchOn())) {
        setNeedsLocation(true);
        return;
      }
    }
    if (nextSetupStep(await readSetup()) !== "ready") {
      router.push("/rides/duty-setup");
      return;
    }
    setStartingDuty(true);
    try {
      await goOnDuty();
      await queryClient.invalidateQueries({ queryKey: captainStatusKey });
    } catch (failure) {
      setStartError(
        failure instanceof Error && failure.message === START_FAILED_MESSAGE
          ? START_FAILED_MESSAGE
          : describeError(failure, "mutation").message,
      );
    } finally {
      setStartingDuty(false);
    }
  };
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
      {data.on_duty && locationOff ? (
        <View className="gap-2 rounded-2xl border border-line bg-surface p-4">
          <Text className="text-base font-bold text-danger">Location is off</Text>
          <Text className="text-sm text-text">You won&apos;t get ride requests until your phone&apos;s location is on.</Text>
          <Button
            size="lg"
            block
            onPress={async () => {
              await turnOnLocation();
              void locationSwitch.refetch();
            }}
          >
            Turn on location
          </Button>
        </View>
      ) : null}

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
        {data.on_duty && currentRide.data?.ride ? (
          // Going off duty stops the GPS, and the ride needs it until the end.
          <Text className="text-sm text-text-muted">Finish your ride before going off duty.</Text>
        ) : data.on_duty ? (
          <Button size="lg" block variant="outline" loading={offDuty.isPending} onPress={() => offDuty.mutate()}>
            Go off duty
          </Button>
        ) : (
          <Button size="lg" block disabled={blocked.length > 0} loading={startingDuty} onPress={() => void startDuty()}>
            Go on duty
          </Button>
        )}
        {startError ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            {startError}
          </Text>
        ) : null}
        {needsLocation ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            Turn on your phone&apos;s location to go on duty.
          </Text>
        ) : null}
        {offDuty.isError ? (
          <Text className="text-sm text-danger">{describeError(offDuty.error, "mutation").message}</Text>
        ) : null}
        {alertsOff ? (
          <Text className="text-sm text-text-muted">
            {"Ride alerts won't ring when the app is closed. Turn on notifications for VSolve in Settings."}
          </Text>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => setBatteryOpen(true)}>
          <Text className="text-sm font-semibold text-[#c25600]">Battery help</Text>
        </Pressable>
        <BatteryHelpSheet open={batteryOpen} onClose={() => setBatteryOpen(false)} />
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
