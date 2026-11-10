import { EmptyState, ErrorState, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";

import { useCaptainHistory, type RideHistoryRow } from "../queries";

const STATE_LABEL: Record<string, string> = {
  SEARCHING: "Searching",
  CAPTAIN_ASSIGNED: "On the way",
  CAPTAIN_ARRIVED: "At pickup",
  IN_TRIP: "In trip",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_CAPTAIN_FOUND: "No captain",
};

function Row({ ride }: { ride: RideHistoryRow }) {
  const amount = ride.final_fare_paise ?? ride.fare_paise;
  return (
    <View className="rounded-2xl bg-surface p-4 gap-1">
      <View className="flex-row justify-between">
        <Text className="text-sm font-semibold text-text">{STATE_LABEL[ride.state] ?? ride.state}</Text>
        <Text className="text-sm font-bold text-text">{formatMoney(amount)}</Text>
      </View>
      <Text className="text-sm text-text" numberOfLines={1}>
        {ride.pickup_address} → {ride.drop_address}
      </Text>
      <Text className="text-xs text-text-muted">
        {new Date(ride.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
      </Text>
    </View>
  );
}

/** The captain's rides, newest first. */
export function RideHistory() {
  const history = useCaptainHistory();

  if (history.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (history.isError) {
    return (
      <ErrorState
        title="We couldn't load your rides"
        message={describeError(history.error).message}
        actionLabel="Try again"
        onAction={() => void history.refetch()}
      />
    );
  }
  return (
    <FlatList
      data={history.data.results}
      keyExtractor={(ride) => ride.id}
      renderItem={({ item }) => <Row ride={item} />}
      contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={history.isRefetching} onRefresh={() => void history.refetch()} />}
      ListEmptyComponent={
        <EmptyState title="No rides yet" description="Rides you take show up here." />
      }
    />
  );
}
