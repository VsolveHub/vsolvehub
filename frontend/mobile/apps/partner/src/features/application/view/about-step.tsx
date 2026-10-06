// Ported from frontend/apps/partner/features/application/view/about-step.tsx
import { Field, Input, Text, Textarea } from "@vsolve/mobile-ui";
import { View } from "react-native";

import { useApplicationEditor, useProceedDisabled } from "./application-editor";

export function AboutStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();

  const trimmedName = draft.displayName.trim();
  const isNameInvalid = trimmedName.length > 0 && trimmedName.length < 2;
  const isExperienceMissing = draft.experienceYears <= 0;

  useProceedDisabled(trimmedName.length < 2 || isExperienceMissing);

  return (
    <View className="flex-col gap-5">
      <View className="flex-col gap-5">
        <Field required label="Full Name" error={isNameInvalid ? "Enter at least 2 characters." : undefined}>
          <Input
            autoComplete="name"
            maxLength={120}
            placeholder="e.g. Ramesh Kumar"
            value={draft.displayName}
            editable={!isReadOnly}
            onChangeText={(value) => update({ displayName: value })}
          />
        </Field>

        <Field required label="Years of Experience">
          <Input
            keyboardType="number-pad"
            placeholder="e.g. 5"
            value={draft.experienceYears === 0 ? "" : String(draft.experienceYears)}
            editable={!isReadOnly}
            onChangeText={(value) => {
              const parsed = Number.parseInt(value, 10);
              update({
                experienceYears: Number.isNaN(parsed) ? 0 : Math.min(80, Math.max(0, parsed)),
              });
            }}
          />
        </Field>
      </View>

      <Field label="About Your Work (Bio)" showOptional={false}>
        <Textarea
          maxLength={2000}
          rows={4}
          placeholder="Briefly describe your skills, specialities, or certifications (e.g. Certified electrician specializing in home wiring and switchboard repair)."
          value={draft.biography}
          editable={!isReadOnly}
          onChangeText={(value) => update({ biography: value })}
        />
        <View className="mt-1 flex-row justify-end">
          <Text className="text-[11px] text-text-muted">{draft.biography.length} / 2000</Text>
        </View>
      </Field>
    </View>
  );
}
