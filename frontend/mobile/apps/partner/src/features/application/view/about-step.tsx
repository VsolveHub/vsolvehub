// Ported from frontend/apps/partner/features/application/view/about-step.tsx
import { useQuery } from "@tanstack/react-query";
import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { Field, Input, Text, Textarea } from "@vsolve/mobile-ui";
import { useEffect } from "react";
import { Platform, useWindowDimensions, View } from "react-native";

import { useApplicationEditor, useProceedDisabled } from "./application-editor";

export function AboutStep() {
  const { draft, update, isReadOnly } = useApplicationEditor();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  // The name given at sign-up. Offered as starting value so user does not re-type.
  const profile = useQuery({
    queryKey: ["auth", "profile"],
    queryFn: () => request(() => getApiClient().GET("/api/v1/auth/profile/")),
    staleTime: 5 * 60 * 1000,
  });

  const signUpName = (profile.data?.full_name ?? "").trim();
  useEffect(() => {
    if (!isReadOnly && signUpName && !draft.displayName.trim()) {
      update({ displayName: signUpName });
    }
  }, [signUpName, isReadOnly]);

  const trimmedName = draft.displayName.trim();
  const isNameInvalid = trimmedName.length > 0 && trimmedName.length < 2;
  const isExperienceMissing = draft.experienceYears <= 0;

  useProceedDisabled(trimmedName.length < 2 || isExperienceMissing);

  return (
    <View style={{ flexDirection: "column", rowGap: 20 }}>
      {/* Two columns on desktop for short fields */}
      <View
        style={{
          flexDirection: isDesktop ? "row" : "column",
          columnGap: 16,
          rowGap: 20,
        }}
      >
        <View style={{ flex: 1 }}>
          <Field
            required
            label="Full Name"
            error={isNameInvalid ? "Enter at least 2 characters." : undefined}
          >
            <Input
              autoComplete="name"
              maxLength={120}
              placeholder="e.g. Ramesh Kumar"
              value={draft.displayName}
              editable={!isReadOnly}
              onChangeText={(value) => update({ displayName: value })}
            />
          </Field>
        </View>

        <View style={{ flex: 1 }}>
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
      </View>

      {/* Bio / About Your Work */}
      <View>
        <Field label="About Your Work (Bio)" required={false} showOptional={true}>
          <Textarea
            maxLength={2000}
            rows={4}
            placeholder="Briefly describe your skills, specialities, or certifications (e.g. Certified electrician specializing in home wiring and switchboard repair)."
            value={draft.biography}
            editable={!isReadOnly}
            onChangeText={(value) => update({ biography: value })}
          />
          <View style={{ marginTop: 4, flexDirection: "row", justifyContent: "flex-end" }}>
            <Text style={{ fontSize: 11, color: "#a89f90" }}>{draft.biography.length} / 2000</Text>
          </View>
        </Field>
      </View>
    </View>
  );
}
