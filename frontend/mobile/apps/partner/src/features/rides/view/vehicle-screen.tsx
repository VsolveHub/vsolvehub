import { describeError } from "@vsolve/query/native";
import { Button, ErrorState, Field, Input, Text, cn } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  EMPTY_VEHICLE,
  VEHICLE_TYPES,
  canEditVehicle,
  vehicleProblems,
  type VehicleDraft,
} from "../model/vehicle";
import { useCaptainStatus, useSaveVehicle } from "../queries";

/**
 * The captain's "Your vehicle" step, between Documents and Agree & send. Saving moves on to the
 * agreements; the server refuses an application sent without a vehicle.
 */
export function VehicleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const status = useCaptainStatus();
  const save = useSaveVehicle();
  const [draft, setDraft] = useState<VehicleDraft>(EMPTY_VEHICLE);
  const [showProblems, setShowProblems] = useState(false);

  // Fill the form from the saved vehicle once, so a background refresh never wipes typing.
  const saved = status.data?.vehicle ?? null;
  const filled = useRef(false);
  useEffect(() => {
    if (saved && !filled.current) {
      filled.current = true;
      setDraft({
        vehicle_type: saved.vehicle_type,
        registration_number: saved.registration_number,
        make_model: saved.make_model,
        colour: saved.colour,
      });
    }
  }, [saved]);

  const editable = canEditVehicle(status.data?.approval);
  const problems = vehicleProblems(draft);
  const set = (field: keyof VehicleDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const onSave = () => {
    setShowProblems(true);
    if (Object.keys(problems).length > 0 || draft.vehicle_type === "") return;
    save.mutate(
      { ...draft, vehicle_type: draft.vehicle_type },
      { onSuccess: () => router.push("/apply/review") },
    );
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-2 px-4 pb-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to documents"
          onPress={() => router.push("/apply/documents")}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-surface-hover"
        >
          <ArrowLeft size={20} color="#071328" />
        </Pressable>
        <Text className="text-lg font-bold text-text">Your vehicle</Text>
      </View>

      {status.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : status.isError ? (
        <ErrorState
          title="We couldn't load your details"
          message={describeError(status.error).message}
          actionLabel="Try again"
          onAction={() => void status.refetch()}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }}>
          <Text className="text-sm text-text-muted">
            {"The vehicle you'll drive for VSolve Rides. It must match your RC and insurance."}
          </Text>

          {!editable ? (
            <View className="rounded-2xl bg-surface-sunken p-4">
              <Text className="text-sm text-text">
                {"Your vehicle can't be changed while your application is being reviewed. Contact support if it is wrong."}
              </Text>
            </View>
          ) : null}

          <Field label="Vehicle type" required error={showProblems ? problems.vehicle_type : undefined}>
            <View className="flex-row gap-2">
              {VEHICLE_TYPES.map(({ type, label }) => {
                const chosen = draft.vehicle_type === type;
                return (
                  <Pressable
                    key={type}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: chosen, disabled: !editable }}
                    disabled={!editable}
                    onPress={() => set("vehicle_type")(type)}
                    className={cn(
                      "flex-1 items-center rounded-xl border py-3",
                      chosen ? "border-[#f87000] bg-[#fff4ea]" : "border-line bg-surface",
                    )}
                  >
                    <Text className={cn("font-semibold", chosen ? "text-[#c25600]" : "text-text")}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field
            label="Registration number"
            required
            description="As on your RC."
            error={showProblems ? problems.registration_number : undefined}
          >
            <Input
              value={draft.registration_number}
              onChangeText={set("registration_number")}
              placeholder="TS 09 AB 1234"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
              editable={editable}
            />
          </Field>

          <Field label="Make and model" required error={showProblems ? problems.make_model : undefined}>
            <Input
              value={draft.make_model}
              onChangeText={set("make_model")}
              placeholder="Honda Shine"
              maxLength={120}
              editable={editable}
            />
          </Field>

          <Field label="Colour" required error={showProblems ? problems.colour : undefined}>
            <Input
              value={draft.colour}
              onChangeText={set("colour")}
              placeholder="Black"
              maxLength={40}
              editable={editable}
            />
          </Field>

          {save.isError ? (
            <Text accessibilityRole="alert" className="text-sm text-danger">
              {describeError(save.error, "mutation").message}
            </Text>
          ) : null}

          {editable ? (
            <Button size="lg" block onPress={onSave} loading={save.isPending}>
              Save and continue
            </Button>
          ) : (
            <Button size="lg" block variant="outline" onPress={() => router.push("/apply/review")}>
              Continue
            </Button>
          )}
        </ScrollView>
      )}
    </View>
  );
}
