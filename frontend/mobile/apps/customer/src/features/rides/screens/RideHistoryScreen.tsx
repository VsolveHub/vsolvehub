import { EmptyState, ErrorState, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";

import { Package } from "lucide-react-native";

import { useRideHistory, type RideHistoryRow } from "../queries";
import { VEHICLES } from "../vehicles";

const STATE_LABEL: Record<string, string> = {
  SEARCHING: "Finding a captain",
  CAPTAIN_ASSIGNED: "Captain on the way",
  CAPTAIN_ARRIVED: "Captain at pickup",
  IN_TRIP: "In trip",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_CAPTAIN_FOUND: "No captain found",
  RETURNING: "Returning",
  RETURNED: "Returned",
};

/** A parcel is Delivered where a ride is Completed. */
const PARCEL_STATE_LABEL: Record<string, string> = { ...STATE_LABEL, COMPLETED: "Delivered" };

function Row({ ride, onPress }: { ride: RideHistoryRow; onPress: () => void }) {
  const parcel = ride.kind === "PARCEL";
  const labels = parcel ? PARCEL_STATE_LABEL : STATE_LABEL;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="gap-1 rounded-2xl border border-line bg-surface p-4 active:opacity-80"
    >
      <View className="flex-row justify-between">
        <View className="flex-1 flex-row items-center gap-1.5">
          {parcel ? <Package size={16} color="#f87000" /> : null}
          <Text className="text-sm font-semibold text-slate-900">
            {parcel ? "Pick up & Drop" : (VEHICLES[ride.vehicle_type]?.name ?? ride.vehicle_type)} ·{" "}
            {labels[ride.state] ?? ride.state}
          </Text>
        </View>
        <Text className="text-sm font-bold text-slate-900">{formatMoney(ride.final_fare_paise ?? ride.fare_paise)}</Text>
      </View>
      <Text className="text-sm text-slate-700" numberOfLines={1}>
        {ride.pickup_address} → {ride.drop_address}
      </Text>
      <Text className="text-xs text-slate-500">
        {new Date(ride.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
      </Text>
    </Pressable>
  );
}

/** The rider's rides, newest first. A tap opens the ride screen, which also shows past rides. */
export function RideHistoryScreen() {
  const router = useRouter();
  const history = useRideHistory();

  if (history.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }
  if (history.isError) {
    return (
      <ErrorState
        title="We couldn't load your rides"
        message={describeError(history.error, "read").message}
        actionLabel="Try again"
        onAction={() => void history.refetch()}
      />
    );
  }
  return (
    <FlatList
      className="bg-canvas"
      data={history.data.results}
      keyExtractor={(ride) => ride.id}
      renderItem={({ item }) => (
        <Row
          ride={item}
          onPress={() => router.push({ pathname: "/rides/ride/[rideId]", params: { rideId: item.id, from: "history" } } as never)}
        />
      )}
      contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={history.isRefetching} onRefresh={() => void history.refetch()} />}
      ListEmptyComponent={<EmptyState title="No rides yet" description="Rides you book show up here." />}
    />
  );
}
