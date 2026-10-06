// Ported from frontend/apps/customer/features/bookings/view/visit-start-code.tsx
import { Button, Text } from "@vsolve/mobile-ui";
import { getApiClient } from "@vsolve/mobile-core";
import { describeError } from "@vsolve/query/native";
import { request } from "@vsolve/api-client";
import { useState } from "react";
import { View } from "react-native";

export function VisitStartCode({
  bookingId,
  status,
}: {
  bookingId: string;
  status: string;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "ARRIVED") return null;

  async function handleGetCode() {
    setLoading(true);
    setError(null);
    try {
      const res = await request(() =>
        getApiClient().POST("/api/v1/bookings/{booking_id}/start-otp/", {
          params: { path: { booking_id: bookingId } },
          body: { expected_version: 1 },
        }),
      );
      if (res?.development_code) {
        setCode(res.development_code);
      }
    } catch (err) {
      setError(describeError(err, "mutation").message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="rounded-2xl bg-navy-950 p-4 shadow-sm">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
            Start code
          </Text>
          <Text className="mt-0.5 text-xs text-stone-200">
            Read this out to start the work — and only once they are with you.
          </Text>
        </View>

        {code === null ? (
          <Button
            size="sm"
            variant="outline"
            className="border-amber-300 bg-white"
            loading={loading}
            onPress={handleGetCode}
          >
            Show code
          </Button>
        ) : (
          <View className="rounded-xl bg-navy-900 px-4 py-2">
            <Text className="text-xl font-extrabold tracking-[0.25em] text-white">
              {code}
            </Text>
          </View>
        )}
      </View>
      {error ? <Text className="mt-2 text-xs text-rose-300">{error}</Text> : null}
    </View>
  );
}
