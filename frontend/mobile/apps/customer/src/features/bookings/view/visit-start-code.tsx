// Ported from frontend/apps/customer/features/bookings/view/visit-start-code.tsx
import type { Schemas } from "@vsolve/api-client";
import { describeError } from "@vsolve/query/native";
import { Button, Text } from "@vsolve/mobile-ui";
import { useEffect } from "react";
import { View } from "react-native";

import { useRequestStartOtp, useVisit } from "@/features/visit/queries";

/** Whether a visit at this status has a start code to show. Callers draw no frame around nothing. */
export function showsStartCode(status: Schemas["BookingStatusEnum"] | string): boolean {
  return status === "ARRIVED";
}

/**
 * The code the customer reads out to let work begin.
 *
 * It appears by itself the moment the professional arrives: nobody should have to hunt for a
 * button while someone waits at the door. Django issues the code on demand and rate-limits it;
 * asking again inside the cooldown returns the same live code, so re-opening the screen never
 * leaves the customer with nothing to read out.
 *
 * The code comes back in the response (`code`, contract 1.82.0) to this customer and nobody else,
 * so a job never waits on an SMS. It is sent with the visit's own current version, as on the web;
 * a hard-coded version once made every request fail the moment the booking had moved on.
 */
export function VisitStartCode({ bookingId, status }: { bookingId: string; status: string }) {
  const visit = useVisit(bookingId);
  const requestOtp = useRequestStartOtp();
  const visible = showsStartCode(status);
  const version = visit.data?.version ?? null;
  const { isIdle, mutate } = requestOtp;

  useEffect(() => {
    if (visible && version !== null && isIdle) {
      mutate({ bookingId, expectedVersion: version });
    }
  }, [visible, version, isIdle, mutate, bookingId]);

  if (!visible) return null;

  const code = requestOtp.data?.code ?? null;

  return (
    <View accessibilityLiveRegion="polite" className="rounded-2xl bg-navy-950 p-4 shadow-sm">
      <Text className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Your start code</Text>
      <Text className="mt-0.5 text-xs text-stone-200">Tell it only to your professional, once they are at your door.</Text>

      {code !== null ? (
        <View accessibilityLabel={`Start code ${code.split("").join(" ")}`} className="mt-3 flex-row justify-center gap-2.5">
          {code.split("").map((digit, index) => (
            <View key={index} className="h-16 w-12 items-center justify-center rounded-xl bg-navy-900">
              <Text className="text-3xl font-extrabold text-white">{digit}</Text>
            </View>
          ))}
        </View>
      ) : requestOtp.isError ? (
        <View className="mt-3 gap-2">
          <Text className="text-xs text-rose-300">{describeError(requestOtp.error, "mutation").message}</Text>
          <View className="self-start">
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 bg-white"
              onPress={() => {
                if (version !== null) mutate({ bookingId, expectedVersion: version });
              }}
            >
              Try again
            </Button>
          </View>
        </View>
      ) : (
        <View className="mt-3 flex-row justify-center gap-2.5">
          {[0, 1, 2, 3].map((index) => (
            <View key={index} className="h-16 w-12 rounded-xl bg-navy-900 opacity-60" />
          ))}
        </View>
      )}
    </View>
  );
}
