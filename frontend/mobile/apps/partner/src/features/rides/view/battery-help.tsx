import { Button, Sheet, Text } from "@vsolve/mobile-ui";
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

/**
 * Battery help as a bottom sheet: the steps for this phone's maker, so the phone does not stop the
 * app while on duty. Closing it, by Done or a swipe, counts as read.
 */
export function BatteryHelpSheet({
  open,
  onClose,
  doneLabel = "Done",
}: {
  open: boolean;
  onClose: () => void;
  doneLabel?: string;
}) {
  const steps = batterySteps(Device.manufacturer);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Keep VSolve running"
      description="So ride requests reach you, even with the screen off."
      footer={
        <Button size="lg" block onPress={onClose}>
          {doneLabel}
        </Button>
      }
    >
      <View className="gap-4">
        <Text className="text-sm text-text-muted">
          {"Some phones stop apps to save battery. Do this once and you won't miss rides."}
        </Text>
        <View className="gap-3">
          {steps.map((step, index) => (
            <View key={step} className="flex-row items-start gap-3">
              <View className="h-6 w-6 items-center justify-center rounded-full bg-[#fff4ea]">
                <Text className="text-xs font-bold text-[#c25600]">{index + 1}</Text>
              </View>
              <Text className="flex-1 text-sm leading-5 text-text">{step}</Text>
            </View>
          ))}
        </View>
        <Button variant="outline" block onPress={() => void openBatterySettings()}>
          Open battery settings
        </Button>
      </View>
    </Sheet>
  );
}
