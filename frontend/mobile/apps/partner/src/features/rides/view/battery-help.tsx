import { Button, Text } from "@vsolve/mobile-ui";
import * as Device from "expo-device";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking, View } from "react-native";

import { batterySteps } from "../model/duty-setup";

async function openBatterySettings(): Promise<void> {
  try {
    // The list of apps' battery settings. We never ask for REQUEST_IGNORE_BATTERY_OPTIMIZATIONS:
    // Google Play restricts it (brief §5.13).
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
  } catch {
    await Linking.openSettings();
  }
}

/** Steps for this phone's maker, so the phone does not stop the app while on duty. */
export function BatteryHelp({ onDone, doneLabel = "Done" }: { onDone: () => void; doneLabel?: string }) {
  const steps = batterySteps(Device.manufacturer);
  return (
    <View className="gap-4">
      <Text className="text-xl font-bold text-text">Keep VSolve running on duty</Text>
      <Text className="text-sm text-text-muted">
        {"Many phones stop apps to save battery. If yours stops VSolve while you're on duty, you'll miss ride requests and go off duty."}
      </Text>
      <View className="gap-2 rounded-2xl bg-surface p-4">
        {steps.map((step, index) => (
          <Text key={step} className="text-sm text-text">
            {index + 1}. {step}
          </Text>
        ))}
      </View>
      <Button variant="outline" block onPress={() => void openBatterySettings()}>
        Open battery settings
      </Button>
      <Button block onPress={onDone}>
        {doneLabel}
      </Button>
    </View>
  );
}
