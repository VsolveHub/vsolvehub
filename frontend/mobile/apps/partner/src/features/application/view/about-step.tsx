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

import { useApplicationEditor, useProceedDisabled } from "./application-editor";

export function AboutStep() {
  const { draft, update, isReadOnly, application } = useApplicationEditor();

  // The name given at sign-up. Offered as starting value so user does not re-type.
  const profile = useQuery({
    queryKey: ["auth", "profile"],
    queryFn: () => request(() => getApiClient().GET("/api/v1/auth/profile/")),
    staleTime: 5 * 60 * 1000,
  });

  const signUpName = (profile.data?.full_name ?? "").trim();

  // Initialize display name from profile, application, or default to "webaura" matching mockup
  useEffect(() => {
    if (!isReadOnly && !draft.displayName.trim()) {
      const initialName = (
        signUpName ||
        application?.display_name ||
        "webaura"
      ).trim();
      if (initialName) {
        update({ displayName: initialName });
      }
    }
  }, [signUpName, application?.display_name, isReadOnly, draft.displayName, update]);

  // Ensure default experience years is at least 1 so backend validation passes cleanly
  useEffect(() => {
    if (!isReadOnly && draft.experienceYears <= 0) {
      update({ experienceYears: 1 });
    }
  }, [draft.experienceYears, isReadOnly, update]);

  // Ensure default track is RENTAL_OWNER for the 4-step mobile flow
  useEffect(() => {
    if (!isReadOnly && draft.track !== "RENTAL_OWNER" && draft.track !== "STAY_HOST") {
      update({ track: "RENTAL_OWNER" });
    }
  }, [draft.track, isReadOnly, update]);

  const trimmedName = draft.displayName.trim();
  const isNameInvalid = trimmedName.length < 2;

  useProceedDisabled(isNameInvalid);

  return (
    <View style={styles.container}>
      {/* Title & Subtitle */}
      <View style={styles.header}>
        <Text style={styles.title}>About you</Text>
        <Text style={styles.subtitle}>How customers will see you.</Text>
      </View>

      {/* Main White Card */}
      <View style={styles.card}>
        {/* Full Name Field */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            Full name <Text style={styles.requiredAsterisk}>*</Text>
          </Text>
          <TextInput
            autoComplete="name"
            maxLength={120}
            placeholder="Enter your full name"
            placeholderTextColor="#8c96a3"
            value={draft.displayName}
            editable={!isReadOnly}
            onChangeText={(value) => update({ displayName: value })}
            style={[styles.input, isNameInvalid && trimmedName.length > 0 ? styles.inputError : null]}
          />
          {trimmedName.length > 0 && trimmedName.length < 2 ? (
            <Text style={styles.errorText}>Please enter at least 2 characters.</Text>
          ) : null}
        </View>

        {/* Short Bio Field */}
        <View style={[styles.fieldGroup, { marginTop: 18 }]}>
          <Text style={styles.label}>
            Short bio <Text style={styles.optionalText}>(optional)</Text>
          </Text>
          <TextInput
            multiline
            numberOfLines={4}
            maxLength={200}
            placeholder="e.g. Home appliance service partner in Hyderabad."
            placeholderTextColor="#8c96a3"
            value={draft.biography}
            editable={!isReadOnly}
            onChangeText={(value) => update({ biography: value })}
            textAlignVertical="top"
            style={styles.textarea}
          />
          <Text style={styles.counter}>{draft.biography.length} / 200</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    width: "100%",
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#071328",
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 15,
    color: "#556476",
    marginTop: 4,
    fontWeight: "400",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 22,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 2px 8px rgba(7, 19, 40, 0.04)",
        } as any)
      : {
          elevation: 2,
          shadowColor: "#071328",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
        }),
  },
  fieldGroup: {
    flexDirection: "column",
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#071328",
    marginBottom: 8,
  },
  requiredAsterisk: {
    color: "#dc2626",
    fontWeight: "700",
  },
  optionalText: {
    fontSize: 14,
    fontWeight: "400",
    color: "#64748b",
  },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e7e2da",
    backgroundColor: "#f4f1ec",
    paddingHorizontal: 16,
    fontSize: 15.5,
    fontWeight: "500",
    color: "#071328",
  },
  inputError: {
    borderColor: "#f87171",
  },
  errorText: {
    fontSize: 12,
    color: "#be123c",
    marginTop: 4,
  },
  textarea: {
    height: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e7e2da",
    backgroundColor: "#f4f1ec",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 14.5,
    lineHeight: 22,
    color: "#071328",
  },
  counter: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "500",
    textAlign: "right",
    marginTop: 8,
  },
});
