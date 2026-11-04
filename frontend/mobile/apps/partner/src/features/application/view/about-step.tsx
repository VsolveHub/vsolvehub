// Ported from frontend/apps/partner/features/application/view/about-step.tsx
import { useQuery } from "@tanstack/react-query";
import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { useEffect } from "react";
import {
  Platform,
  StyleSheet,
  Text,
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

  // Ensure default experience years is at least 1 so backend validation passes cleanly
  useEffect(() => {
    if (!isReadOnly && draft.experienceYears <= 0) {
      update({ experienceYears: 1 });
    }
  }, [draft.experienceYears, isReadOnly, update]);

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
            placeholderTextColor="#94a3b8"
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
          <Text style={styles.label}>Short bio (optional)</Text>
          <TextInput
            multiline
            numberOfLines={4}
            maxLength={200}
            placeholder="e.g. Home appliance service partner in Hyderabad."
            placeholderTextColor="#94a3b8"
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
    marginBottom: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#00112e",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 4,
    fontWeight: "400",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 20,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.05)",
        } as any)
      : {
          elevation: 2,
          shadowColor: "#00112e",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        }),
  },
  fieldGroup: {
    flexDirection: "column",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00112e",
    marginBottom: 8,
  },
  requiredAsterisk: {
    color: "#ea580c",
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "500",
    color: "#00112e",
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 14,
    fontSize: 14,
    color: "#00112e",
  },
  counter: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "600",
    textAlign: "right",
    marginTop: 6,
  },
});
