import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { ErrorState, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";

import { blockedReasonTexts, vehicleTypeName, type CaptainStatus } from "../model/shell";
import { useCaptainStatus } from "../queries";

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

/** The captain's Home: where they stand, what blocks duty, and today's money. */
export function CaptainHome() {
  const status = useCaptainStatus();
  const earnings = useTodayEarnings();

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
        {blocked.map((line) => (
          <Text key={line} className="text-sm text-danger">
            {line}
          </Text>
        ))}
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
