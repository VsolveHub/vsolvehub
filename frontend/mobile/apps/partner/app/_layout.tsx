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
  onPushReceived,
  onPushTap,
  ProviderCheckoutHost,
  reportError,
  startCrashReporting,
  startPush,
  useAuthStore,
  VersionGate,
} from "@vsolve/mobile-core";
import { ErrorState, I18nProvider, ToastProvider } from "@vsolve/mobile-ui";
import { queryKeys } from "@vsolve/query/native";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

import { catalogs } from "@/i18n/catalogs";
import { useLocaleStore } from "@/i18n/locale-store";
import { isOfferPush, resolvePartnerPushData } from "@/features/notifications/push-routing";
import { requestOpenAlerts } from "@/features/notifications/alerts-bus";

import { LogBox, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";

import "../global.css";

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

LogBox.ignoreAllLogs();
configureCore({ appKind: "partner" });
startCrashReporting();
startPush();
SplashScreen.preventAutoHideAsync();

/**
 * Shown in place of a screen that crashed while rendering, word for word the web's error page,
 * so a crash is a recoverable screen instead of a closed app. The error goes to Crashlytics.
 * It renders outside the app's providers, so it uses nothing that needs one.
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
  const locale = useLocaleStore((state) => state.locale);
  const isLocaleHydrated = useLocaleStore((state) => state.isHydrated);
  const hydrateLocale = useLocaleStore((state) => state.hydrate);

  const [loaded, error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    void hydrate();
    void hydrateLocale();
  }, [hydrate, hydrateLocale]);

  useEffect(() => {
    if ((loaded || error) && status !== "loading" && isLocaleHydrated) {
      void SplashScreen.hideAsync();
    }
  }, [loaded, error, status, isLocaleHydrated]);

  if ((!loaded && !error) || status === "loading" || !isLocaleHydrated) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <MobileQueryProvider>
        <I18nProvider locale={locale} catalog={catalogs[locale] ?? catalogs["en-IN"]}>
          <ToastProvider>
            <VersionGate>
              <PushRouting />
              <ProviderCheckoutHost>
                <Stack screenOptions={{ headerShown: false }} />
              </ProviderCheckoutHost>
            </VersionGate>
          </ToastProvider>
        </I18nProvider>
      </MobileQueryProvider>
    </SafeAreaProvider>
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

  // Link this phone to the signed-in partner in OneSignal (the web does the same), ask for
  // permission once, and report the subscription so dispatch counts this phone as reachable.
  useEffect(() => {
    if (status !== "signedIn") return;
    void linkPushUser({ appKind: "partner" });
  }, [status]);

  useEffect(() => {
    // No-ops in Expo Go and the browser, where OneSignal cannot run. A tap that launched the app
    // is delivered here too, once this listener is attached.
    const offTap = onPushTap((data) => {
      const destination = resolvePartnerPushData(data);
      if (destination.type === "route") router.push(destination.href as never);
      else requestOpenAlerts();
    });
    const offReceived = onPushReceived((data) => {
      if (isOfferPush(data)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.partner.offers() });
        void queryClient.invalidateQueries({ queryKey: ["partner", "dispatch-offers"] });
      }
    });
    return () => {
      offTap();
      offReceived();
    };
  }, [queryClient, router]);

  return null;
}
