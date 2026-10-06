// Ported from frontend/apps/customer/features/session/view/login-screen.tsx
import { safeNextPath } from "@vsolve/query/native";
import { useAuthStore, useMobileOtpFlow } from "@vsolve/mobile-core";
import { OtpForm, Text } from "@vsolve/mobile-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, View } from "react-native";

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const status = useAuthStore((state) => state.status);
  const flow = useMobileOtpFlow();
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);

  useEffect(() => {
    if (status !== "signedIn") return;
    router.replace((next ?? "/bookings") as never);
  }, [next, router, status]);

  if (status === "loading" || status === "signedIn") {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-4">
        <Text className="text-text-secondary">{status === "signedIn" ? "Taking you to your bookings…" : "Checking your session…"}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas px-4 pt-16">
      <Text className="text-sm text-text-secondary">Verify your mobile number to view bookings and checkout</Text>
      <View className="mt-4">
        <OtpForm
          {...flow}
          heading="Your mobile number"
          verifyLabel="Verify & continue"
          footer={
            <Pressable onPress={() => router.push("/catalog")}>
              <Text className="text-sm text-text-secondary">
                New here? <Text className="font-semibold text-info-text">Browse services</Text> — you can add to your basket before signing in.
              </Text>
            </Pressable>
          }
        />
      </View>
    </View>
  );
}
