import { Button, Field, Input, Text } from "@vsolve/mobile-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useParcelDraft } from "./draft";
import { isEndComplete, isPhoneValid, type MeetAt, type ParcelEnd, type Side } from "./model";
import { Toggle } from "./toggle";

/** The most the server keeps for each field (§4.1). */
const NAME_MAX = 80;
const BUILDING_MAX = 120;
const UNIT_MAX = 60;
const INSTRUCTIONS_MAX = 120;

/**
 * Pickup details / Dropoff details (D8, §5.2 item 5): who is there, the address, the building and
 * unit, how to meet, and an optional note for the captain. Save and continue goes back to Review.
 */
export function ParcelContactScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { side, address } = useLocalSearchParams<{ side?: string; address?: string }>();
  const which: Side = side === "drop" ? "drop" : "pickup";
  const { draft, setEnd } = useParcelDraft();
  const [end, setLocal] = useState<ParcelEnd>(draft[which]);
  const set = (patch: Partial<ParcelEnd>) => setLocal((current) => ({ ...current, ...patch }));

  const phoneWrong = end.phone.length > 0 && !isPhoneValid(end.phone);
  const title = which === "pickup" ? "Who's sending the package?" : "Who's receiving the package?";
  const save = () => {
    setEnd(which, { ...end, name: end.name.trim(), building: end.building.trim(), unit: end.unit.trim(), instructions: end.instructions.trim() });
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-extrabold text-text">{title}</Text>

        <Field label="Name" required>
          <Input
            value={end.name}
            onChangeText={(name) => set({ name })}
            maxLength={NAME_MAX}
            autoCapitalize="words"
            textContentType="name"
          />
        </Field>

        <Field label="Phone number" required error={phoneWrong ? "Enter a 10-digit mobile number." : undefined}>
          <View className="flex-row items-center gap-2">
            <View className="min-h-11 justify-center rounded-control border border-line bg-surface-sunken px-3">
              <Text className="text-base text-text">+91</Text>
            </View>
            <View className="flex-1">
              <Input
                value={end.phone}
                onChangeText={(value) => set({ phone: value.replace(/\D/g, "").slice(0, 10) })}
                keyboardType="number-pad"
                maxLength={10}
                textContentType="telephoneNumber"
              />
            </View>
          </View>
        </Field>

        {address ? (
          <View className="gap-0.5">
            <Text className="text-xs font-semibold uppercase text-text-muted">Address</Text>
            <Text className="text-base text-text">{address}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Store or building name" showOptional>
              <Input
                value={end.building}
                onChangeText={(building) => set({ building })}
                maxLength={BUILDING_MAX}
              />
            </Field>
          </View>
          <View className="flex-1">
            <Field label="Unit/floor" showOptional>
              <Input value={end.unit} onChangeText={(unit) => set({ unit })} maxLength={UNIT_MAX} />
            </Field>
          </View>
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-text">{which === "pickup" ? "Pickup options" : "Dropoff options"}</Text>
          <Toggle<MeetAt>
            label="How to meet"
            value={end.meet_at}
            options={[
              { value: "CURB", label: "Meet at curb" },
              { value: "DOOR", label: "Meet at door" },
            ]}
            onChange={(meet_at) => set({ meet_at })}
          />
        </View>

        <Field label="Instructions for the captain" showOptional description={`${end.instructions.length}/${INSTRUCTIONS_MAX}`}>
          <Input
            value={end.instructions}
            onChangeText={(instructions) => set({ instructions })}
            maxLength={INSTRUCTIONS_MAX}
          />
        </Field>
      </ScrollView>

      <View style={{ paddingBottom: Math.max(insets.bottom, 12) }} className="border-t border-line bg-surface px-4 pt-3">
        <Button size="lg" block disabled={!isEndComplete(end)} onPress={save}>
          Save and continue
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
