import { Button, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError, useServerCountdown } from "@vsolve/query/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { shouldRing, useOfferRingtone } from "@/features/notifications/use-offer-ringtone";

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

  return (
    <ScrollView
      className="flex-1 bg-[#00112e]"
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 20 }}
    >
      <Text className="text-center text-sm font-semibold uppercase tracking-wider text-[#f87000]">
        New ride request
      </Text>

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
          <View className="items-center gap-1">
            <Text accessibilityLabel={`${seconds} seconds left`} className="text-6xl font-extrabold text-white">
              {seconds}
            </Text>
            <Text className="text-sm text-white/60">seconds to answer</Text>
          </View>

          <View className="items-center gap-1">
            <Text className="text-4xl font-extrabold text-white">{formatMoney(offer.fare_paise)}</Text>
            <Text className="text-sm text-white/70">
              Pickup {km(offer.pickup_distance_m)} away · Trip {km(offer.trip_distance_m)},{" "}
              {Math.round(offer.trip_duration_s / 60)} min
            </Text>
          </View>

          <View className="gap-4 rounded-2xl bg-white/10 p-4">
            <Place label="Pickup" address={offer.pickup.address} />
            <Place label="Drop" address={offer.drop.address} />
          </View>

          {accept.isError ? (
            <Text accessibilityRole="alert" className="text-center text-sm text-[#ffb4a8]">
              {describeError(accept.error, "mutation").message}
            </Text>
          ) : null}

          <Button size="lg" block loading={accept.isPending} disabled={busy} onPress={() => accept.mutate()}>
            Accept
          </Button>
          <Button size="lg" block variant="outline" loading={decline.isPending} disabled={busy} onPress={() => decline.mutate()}>
            Decline
          </Button>
        </>
      ) : null}
    </ScrollView>
  );
}
