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
  linkPushUser,
  MobileQueryProvider,
  onPushTap,
  ProviderCheckoutHost,
  reportError,
  startCrashReporting,
  startPush,
  useAuthStore,
  VersionGate,
} from "@vsolve/mobile-core";
import { ErrorState } from "@vsolve/mobile-ui";
import { Stack, useRouter, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

import { requestOpenNotifications } from "@/features/notifications/alerts-bus";
import { resolveCustomerPushData } from "@/features/notifications/push-routing";

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
startPush();
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

  // Link this phone to the signed-in customer in OneSignal (the web does the same), ask for
  // permission once, and report the subscription: Django pushes to customers with one only.
  useEffect(() => {
    if (status !== "signedIn") return;
    void linkPushUser({ appKind: "customer" });
  }, [status]);

  useEffect(() => {
    // A no-op in Expo Go and the browser. A tap that launched the app is delivered here too.
    return onPushTap((data) => {
      const destination = resolveCustomerPushData(data);
      if (destination.type === "route") router.push(destination.href as never);
      else requestOpenNotifications();
    });
  }, [router]);

  return null;
}
