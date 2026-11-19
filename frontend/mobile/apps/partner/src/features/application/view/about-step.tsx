// Ported from frontend/apps/partner/features/application/view/about-step.tsx
import { Text } from "@vsolve/mobile-ui";
import { useQuery } from "@tanstack/react-query";
import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { useEffect } from "react";
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { isListingTrack } from "../model/steps";
import { useApplicationEditor, useProceedDisabled } from "./application-editor";

export function AboutStep() {
  const { draft, update, isReadOnly, application } = useApplicationEditor();
  const isStayHost = application?.track === "STAY_HOST";
  const isRentalOwner = application?.track === "RENTAL_OWNER";
  const isEmployer = application?.track === "EMPLOYER";
  const isListing = isListingTrack(application?.track);

  // The name given at sign-up. Offered as starting value so user does not re-type.
  const profile = useQuery({
    queryKey: ["auth", "profile"],
    queryFn: () => request(() => getApiClient().GET("/api/v1/auth/profile/")),
    staleTime: 5 * 60 * 1000,
  });

  const signUpName = (profile.data?.full_name ?? "").trim();

  // Prefill the display name with the person's own name (sign-up, else the saved application).
  // With neither, the field stays empty for them to fill: never a placeholder name they might submit.
  useEffect(() => {
    if (!isReadOnly && !draft.displayName.trim()) {
      const initialName = (signUpName || application?.display_name || "").trim();
      if (initialName) {
        update({ displayName: initialName });
      }
    }
  }, [signUpName, application?.display_name, isReadOnly, draft.displayName, update]);

  // A stay host, rental owner or employer is not asked for experience, and the server does not
  // need it. Nothing is filled in for them: this used to write 1 year into their application, a
  // number nobody gave. Someone offering services answers for themselves below.
  const trimmedName = draft.displayName.trim();
  const isNameInvalid = trimmedName.length > 0 && trimmedName.length < 2;
  const isExperienceMissing = !isListing && draft.experienceYears <= 0;

  useProceedDisabled(trimmedName.length < 2 || isExperienceMissing);

  const bioPlaceholder = isStayHost
    ? "A line guests will see, e.g. Running this PG for working women since 2018."
    : isRentalOwner
    ? "A line customers will see, e.g. Tools and equipment for site work in Hyderabad."
    : isEmployer
    ? "Tell us about your business and the kind of people you want to hire."
    : "A line customers will see, e.g. Home appliance repairs in Madhapur since 2019.";

  return (
    <View style={styles.fieldsContainer}>
      {/* Full Name Field */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          Full Name <Text style={styles.requiredAsterisk}>*</Text>
        </Text>
        <TextInput
          autoComplete="name"
          maxLength={120}
          placeholder="e.g. Ramesh Kumar"
          placeholderTextColor="#78716c"
          value={draft.displayName}
          editable={!isReadOnly}
          onChangeText={(value) => update({ displayName: value })}
          style={[styles.input, isNameInvalid ? styles.inputError : null]}
        />
        {isNameInvalid ? (
          <Text style={styles.errorText}>Enter at least 2 characters.</Text>
        ) : null}
      </View>

      {/* Years of experience: services only, and the server requires it */}
      {!isListing ? (
        <View style={[styles.fieldGroup, { marginTop: 18 }]}>
          <Text style={styles.label}>
            Years of Experience <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <TextInput
            keyboardType="number-pad"
            maxLength={2}
            placeholder="e.g. 5"
            placeholderTextColor="#78716c"
            value={draft.experienceYears > 0 ? String(draft.experienceYears) : ""}
            editable={!isReadOnly}
            onChangeText={(value) => update({ experienceYears: Number(value.replace(/\D/g, "")) })}
            style={styles.input}
          />
        </View>
      ) : null}

      {/* Bio / About you Field */}
      <View style={[styles.fieldGroup, { marginTop: 18 }]}>
        <Text style={styles.label}>
          {isListing ? "About you (optional)" : "About Your Work (Bio)"}{" "}
          <Text style={styles.optionalText}>(optional)</Text>
        </Text>
        <TextInput
          multiline
          numberOfLines={4}
          maxLength={2000}
          placeholder={bioPlaceholder}
          placeholderTextColor="#78716c"
          value={draft.biography}
          editable={!isReadOnly}
          onChangeText={(value) => update({ biography: value })}
          textAlignVertical="top"
          style={styles.textarea}
        />
        <Text style={styles.counter}>{draft.biography.length} / 2000</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldsContainer: {
    flexDirection: "column",
    width: "100%",
  },
  fieldGroup: {
    flexDirection: "column",
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
    marginBottom: 8,
  },
  requiredAsterisk: {
    color: "#dc2626",
    fontWeight: "700",
  },
  optionalText: {
    fontSize: 14,
    fontWeight: "400",
    color: "#78716c",
  },
  input: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#756c5e",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#00112e",
  },
  inputError: {
    borderColor: "#dc2626",
  },
  errorText: {
    fontSize: 12,
    color: "#dc2626",
    marginTop: 4,
  },
  textarea: {
    height: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#756c5e",
    backgroundColor: "#ffffff",
    padding: 14,
    fontSize: 15,
    lineHeight: 22,
    color: "#00112e",
  },
  counter: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "500",
    textAlign: "right",
    marginTop: 6,
  },
});
