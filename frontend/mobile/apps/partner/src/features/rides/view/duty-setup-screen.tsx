import { enablePush, kvSet } from "@vsolve/mobile-core";
import { Button, Text } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { MapPin } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { START_FAILED_MESSAGE, goOnDuty } from "../duty";
import { nextSetupStep, type SetupState } from "../model/duty-setup";
import { captainStatusKey } from "../queries";
import { BATTERY_SEEN, DISCLOSURE_SEEN, NOTIFICATIONS_ASKED, readSetup } from "../setup-state";
import { BatteryHelpSheet } from "./battery-help";

function Step({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <View className="gap-4">
      <Text className="text-xl font-bold text-text">{title}</Text>
      <Text className="text-base text-text">{body}</Text>
      {children}
    </View>
  );
}

/**
 * Everything between "Go on duty" and being on duty, in the brief's order. It re-reads the phone's
 * permissions whenever the app returns to the front (for example from Settings), and goes on duty
 * by itself once nothing is missing. Only a captain going on duty ever sees it.
 */
export function DutySetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const starting = useRef(false);
  const askingAlerts = useRef(false);

  const refresh = async () => setSetup(await readSetup());
  // Read the phone's state now, and again whenever the app returns (for example from Settings).
  useEffect(() => {
    let active = true;
    const load = () => {
      void readSetup().then((state) => {
        if (active) setSetup(state);
      });
    };
    load();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const step = setup ? nextSetupStep(setup) : null;

  // Once nothing is missing, go on duty by itself. One attempt at a time; a failure stays on
  // screen until the captain taps Try again.
  useEffect(() => {
    if (step !== "ready" || error !== null || starting.current) return;
    starting.current = true;
    goOnDuty()
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: captainStatusKey });
        router.replace("/rides");
      })
      .catch((failure: unknown) => {
        setError(
          failure instanceof Error && failure.message === START_FAILED_MESSAGE
            ? START_FAILED_MESSAGE
            : describeError(failure, "mutation").message,
        );
      })
      .finally(() => {
        starting.current = false;
      });
  }, [step, error, queryClient, router]);

  const markAndRefresh = async (key: string) => {
    await kvSet(key, "1");
    await refresh();
  };

  // Ride alerts: Android's own notification pop-up, once, with no page of our own before it.
  // Whatever the answer, it is never asked again and never blocks duty.
  useEffect(() => {
    if (step !== "notifications" || askingAlerts.current) return;
    askingAlerts.current = true;
    void (async () => {
      try {
        await enablePush();
      } catch {
        // Refused or unavailable: Home says so while on duty.
      }
      await kvSet(NOTIFICATIONS_ASKED, "1");
      setSetup(await readSetup());
      askingAlerts.current = false;
    })();
  }, [step]);

  let content: React.ReactNode;
  if (step === null) {
    content = <ActivityIndicator />;
  } else if (step === "disclosure") {
    content = (
      <Step
        title="How VSolve uses your location"
        body="While you are on duty, VSolve Rides uses your location, even when the app is closed or not in use, to send you nearby ride requests and to show riders where you are. It stops when you go off duty. We never use it when you are off duty."
      >
        <View className="items-center py-2">
          <MapPin size={40} color="#f87000" />
        </View>
        <Button size="lg" block onPress={() => void markAndRefresh(DISCLOSURE_SEEN)}>
          Continue
        </Button>
      </Step>
    );
  } else if (step === "location") {
    content = (
      <Step title="Allow location" body={'Choose "While using the app" and keep "Precise" on.'}>
        <Button
          size="lg"
          block
          onPress={async () => {
            await Location.requestForegroundPermissionsAsync();
            await refresh();
          }}
        >
          Allow location
        </Button>
      </Step>
    );
  } else if (step === "location_denied") {
    content = (
      <Step
        title="Location is off for VSolve"
        body={'You need location to go on duty. Open Settings → Permissions → Location, and choose "Allow only while using the app" with Precise on.'}
      >
        <Button size="lg" block onPress={() => void Linking.openSettings()}>
          Open settings
        </Button>
      </Step>
    );
  } else if (step === "precise") {
    content = (
      <Step
        title="Turn on precise location"
        body="Ride requests need your exact position: an approximate one can be over a kilometre off, and riders would wait for the wrong captain."
      >
        <Button
          size="lg"
          block
          onPress={async () => {
            await Location.requestForegroundPermissionsAsync();
            await refresh();
          }}
        >
          Use precise location
        </Button>
        <Button variant="outline" block onPress={() => void Linking.openSettings()}>
          Open settings
        </Button>
      </Step>
    );
  } else if (step === "notifications" || step === "battery") {
    // Android's alert pop-up, or the battery sheet, shows over this.
    content = <ActivityIndicator />;
  } else {
    content = error ? (
      <Step title="You're not on duty yet" body={error}>
        <Button size="lg" block onPress={() => setError(null)}>
          Try again
        </Button>
        <Button variant="ghost" block onPress={() => router.replace("/rides")}>
          Back
        </Button>
      </Step>
    ) : (
      <View className="items-center gap-3 py-10">
        <ActivityIndicator />
        <Text className="text-base text-text">Going on duty…</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
      >
        {content}
      </ScrollView>
      <BatteryHelpSheet
        open={step === "battery"}
        doneLabel="Done, go on duty"
        onClose={() => void markAndRefresh(BATTERY_SEEN)}
      />
    </>
  );
}
