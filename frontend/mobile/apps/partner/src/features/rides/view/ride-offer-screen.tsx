import { Button, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError, useServerCountdown } from "@vsolve/query/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { shouldRing, useOfferRingtone } from "@/features/notifications/use-offer-ringtone";

import { vehicleTypeName } from "../model/shell";
import {
  acceptOffer,
  captainStatusKey,
  currentOfferKey,
  currentRideKey,
  declineOffer,
  useCurrentOffer,
  type RideOffer,
} from "../queries";

function km(metres: number): string {
  return `${(metres / 1000).toFixed(1)} km`;
}

function Place({ label, address }: { label: string; address: string }) {
  return (
    <View className="gap-0.5">
      <Text className="text-xs font-semibold uppercase text-white/60">{label}</Text>
      <Text className="text-base text-white">{address}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-0.5 rounded-2xl bg-white/10 p-3">
      <Text className="text-xs font-semibold uppercase text-white/60">{label}</Text>
      <Text className="text-base font-bold text-white">{value}</Text>
    </View>
  );
}

/** How much of the answer window is left, 0 to 1, from the server's own two timestamps. */
function shareLeft(offer: RideOffer | null, remainingMs: number): number {
  if (!offer) return 0;
  const windowMs = Date.parse(offer.expires_at) - Date.parse(offer.offered_at);
  return windowMs > 0 ? Math.min(1, Math.max(0, remainingMs / windowMs)) : 0;
}

/**
 * A ride request, full screen, with the ringtone and the server's 15-second countdown (brief
 * §5.11). The countdown runs on the server clock, so a wrong phone clock cannot stretch it.
 */
export function RideOfferScreen({ offerId }: { offerId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const current = useCurrentOffer(true);
  const offer: RideOffer | null = current.data?.offer?.id === offerId ? current.data.offer : null;
  const countdown = useServerCountdown(offer?.expires_at ?? null, 250);
  const seconds = countdown ? Math.ceil(countdown.remainingMs / 1000) : 0;
  const left = shareLeft(offer, countdown?.remainingMs ?? 0);
  useOfferRingtone(offer !== null && shouldRing("PENDING", seconds));

  // Forget the request before leaving, so the screen behind cannot open it again.
  const leave = async (to: "/rides" | "/rides/trip" = "/rides") => {
    queryClient.setQueryData(currentOfferKey, (data: unknown) =>
      data && typeof data === "object" ? { ...data, offer: null } : data,
    );
    await queryClient.invalidateQueries({ queryKey: captainStatusKey });
    await queryClient.invalidateQueries({ queryKey: currentRideKey });
    router.replace(to);
  };
  const accept = useMutation({ mutationFn: () => acceptOffer(offerId), onSuccess: () => leave("/rides/trip") });
  const decline = useMutation({ mutationFn: () => declineOffer(offerId), onSettled: () => leave() });
  const busy = accept.isPending || decline.isPending || accept.isSuccess;

  const ended = !busy && !current.isPending && (offer === null || seconds <= 0);

  const live = offer !== null && !ended && !current.isPending;

  return (
    <View className="flex-1 bg-[#00112e]" style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }}>
      {/* The answer window, draining. */}
      <View className="mx-5 h-1.5 overflow-hidden rounded-full bg-white/15">
        {live ? <View className="h-full rounded-full bg-[#f87000]" style={{ width: `${left * 100}%` }} /> : null}
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 20 }}>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold uppercase tracking-wider text-[#f87000]">New ride request</Text>
          {live ? (
            <Text accessibilityLabel={`${seconds} seconds left`} className="text-base font-bold text-white">
              {`${seconds} s`}
            </Text>
          ) : null}
        </View>

        {current.isPending ? (
          <ActivityIndicator color="#ffffff" />
        ) : ended ? (
          <View className="gap-4">
            <Text className="text-center text-xl font-bold text-white">
              {accept.isError ? describeError(accept.error, "mutation").message : "This ride request has ended."}
            </Text>
            <Button size="lg" block variant="outline" onPress={() => void leave()}>
              Back
            </Button>
          </View>
        ) : offer ? (
          <>
            <View className="items-center gap-2">
              <View className="rounded-full bg-white/10 px-3 py-1">
                <Text className="text-xs font-bold uppercase tracking-wider text-white">
                  {vehicleTypeName(offer.vehicle_type)}
                </Text>
              </View>
              <Text className="text-5xl font-extrabold text-white">{formatMoney(offer.fare_paise)}</Text>
              <Text className="text-sm text-white/60">Cash or UPI from the rider</Text>
            </View>

            <View className="flex-row gap-3">
              <Stat label="Pickup" value={`${km(offer.pickup_distance_m)} away`} />
              <Stat
                label="Trip"
                value={`${km(offer.trip_distance_m)} · ${Math.round(offer.trip_duration_s / 60)} min`}
              />
            </View>

            <View className="flex-row gap-3 rounded-2xl bg-white/10 p-4">
              {/* Pickup dot, the way, the drop square. */}
              <View className="items-center py-1.5">
                <View className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
                <View className="my-1 w-0.5 flex-1 bg-white/25" />
                <View className="h-2.5 w-2.5 bg-white" />
              </View>
              <View className="flex-1 gap-4">
                <Place label="Pickup" address={offer.pickup.address} />
                <Place label="Drop" address={offer.drop.address} />
              </View>
            </View>

            {accept.isError ? (
              <Text accessibilityRole="alert" className="text-center text-sm text-[#ffb4a8]">
                {describeError(accept.error, "mutation").message}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {live ? (
        <View className="gap-1 px-5 pt-2">
          <Button size="lg" block loading={accept.isPending} disabled={busy} onPress={() => accept.mutate()}>
            Accept
          </Button>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => decline.mutate()}
            className="min-h-12 items-center justify-center active:opacity-60"
          >
            <Text className="text-base font-semibold text-white/80">{decline.isPending ? "Declining…" : "Decline"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
