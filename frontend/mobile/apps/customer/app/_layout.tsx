import "@vsolve/mobile-core/polyfills";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import {
  configureCore,
  getNotifications,
  MobileQueryProvider,
  ProviderCheckoutHost,
  registerForPush,
  reportError,
  startCrashReporting,
  useAuthStore,
  VersionGate,
} from "@vsolve/mobile-core";
import { ErrorState } from "@vsolve/mobile-ui";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

import { requestOpenNotifications } from "@/features/notifications/alerts-bus";
import { resolveCustomerPush } from "@/features/notifications/push-routing";

import { LogBox, Platform, View } from "react-native";
import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";
import "../global.css";

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

LogBox.ignoreAllLogs();

configureCore({ appKind: "customer" });
startCrashReporting();
SplashScreen.preventAutoHideAsync();

/**
 * Shown in place of a screen that crashed while rendering, word for word the web's error page,
 * so a crash is a recoverable screen instead of a closed app. The error goes to Crashlytics.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, "root error boundary");
  }, [error]);
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#FAF9F7" }}>
      <ErrorState
        title="Something went wrong"
        message="The page ran into an unexpected error. Nothing was charged or changed."
        actionLabel="Try again"
        onAction={() => void retry()}
      />
    </View>
  );
}

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
        <ProviderCheckoutHost>
          <Stack screenOptions={{ headerShown: false }} />
        </ProviderCheckoutHost>
      </VersionGate>
    </MobileQueryProvider>
  );
}

/** Push taps and arrivals only exist on a phone; the web preview renders nothing here. */
function PushRouting() {
  if (Platform.OS === "web") return null;
  return <NativePushRouting />;
}

function NativePushRouting() {
  const status = useAuthStore((state) => state.status);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== "signedIn") return;
    void registerForPush({ appKind: "customer" });
  }, [status]);

  useEffect(() => {
    // Null in Expo Go on Android, where the notifications package cannot load.
    const Notifications = getNotifications();
    if (Notifications === null) return;
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
