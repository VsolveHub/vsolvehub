import "@vsolve/mobile-core/polyfills";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { configureCore, MobileQueryProvider, registerForPush, useAuthStore, VersionGate } from "@vsolve/mobile-core";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

import { requestOpenNotifications } from "@/features/notifications/alerts-bus";
import { resolveCustomerPush } from "@/features/notifications/push-routing";

import { LogBox } from "react-native";
import "../global.css";

LogBox.ignoreAllLogs();

configureCore({ appKind: "customer" });
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const status = useAuthStore((state) => state.status);
  const hydrate = useAuthStore((state) => state.hydrate);
  const [loaded, error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if ((loaded || error) && status !== "loading") {
      void SplashScreen.hideAsync();
    }
  }, [loaded, error, status]);

  if ((!loaded && !error) || status === "loading") {
    return null;
  }

  return (
    <MobileQueryProvider>
      <VersionGate>
        <PushRouting />
        <Stack screenOptions={{ headerShown: false }} />
      </VersionGate>
    </MobileQueryProvider>
  );
}

function PushRouting() {
  const status = useAuthStore((state) => state.status);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== "signedIn") return;
    void registerForPush({ appKind: "customer" });
  }, [status]);

  useEffect(() => {
    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      const data = event.notification.request.content.data as { target?: { kind: string; id?: string } | null };
      const destination = resolveCustomerPush(data.target ?? null);
      if (destination.type === "route") router.push(destination.href as never);
      else requestOpenNotifications();
    });
    return () => response.remove();
  }, [queryClient, router]);

  return null;
}
