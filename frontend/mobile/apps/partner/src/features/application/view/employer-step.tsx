// Ported from frontend/apps/partner/features/application/view/employer-step.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { describeError, queryKeys } from "@vsolve/query/native";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import {
  toBusinessProfileInput,
  type BusinessCategory,
  type BusinessProfileInput,
} from "@/features/capability/adapters/wire";
import { usePartnerBusinessProfile, useSaveBusinessProfile } from "@/features/capability/queries";

import { useApplyDock } from "../model/dock-context";
import { nextStep } from "../model/steps";
import { usePartnerApplication } from "../queries";
import { StepFrame } from "./application-editor";

const CATEGORIES: readonly { value: BusinessCategory; label: string }[] = [
  { value: "SHOP", label: "Shop" },
  { value: "CLINIC", label: "Clinic" },
  { value: "OFFICE", label: "Office" },
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "OTHER", label: "Other" },
];
/** 15 characters: 2-digit state code, then 13 letters and numbers. Same rule as the website. */
const GSTIN = /^[0-9]{2}[A-Z0-9]{13}$/;

type Problem = "name" | "category" | "city" | "gstin";

/** What the server will refuse at submit, said before saving. */
function problemsIn(input: BusinessProfileInput): Set<Problem> {
  const problems = new Set<Problem>();
  if (!input.legal_name.trim()) problems.add("name");
  if (!input.business_category) problems.add("category");
  if (!input.city.trim()) problems.add("city");
  if (input.gstin.trim() && !GSTIN.test(input.gstin.trim())) problems.add("gstin");
  return problems;
}

/**
 * "Business details", the employer's own step ("I want to hire staff"): the business name its
 * jobs are shown under, the kind of business and the city, plus an optional address and GSTIN.
 * Saved through the business profile as an `EMPLOYER`; the application's
 * `business_details_complete` then marks the step done.
 */
export function EmployerStep() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { registerDock, scrollFieldIntoView } = useApplyDock();
  const application = usePartnerApplication();
  const profile = usePartnerBusinessProfile();
  const save = useSaveBusinessProfile();
  const [draft, setDraft] = useState<BusinessProfileInput | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const track = application.data?.track ?? null;
  const editable = application.data?.can_edit ?? false;
  const current = draft ?? toBusinessProfileInput(profile.data ?? null);
  const problems = problemsIn(current);
  const update = (patch: Partial<BusinessProfileInput>) => setDraft({ ...current, ...patch });
  const next = nextStep("/apply/employer", track)?.href ?? "/apply";

  const onCommit = useCallback(() => {
    if (!editable) {
      router.push(next as never);
      return;
    }
    if (problems.size > 0) {
      setShowProblems(true);
      return;
    }
    const gstin = current.gstin.trim().toUpperCase();
    save.mutate(
      {
        ...current,
        business_type: "EMPLOYER",
        legal_name: current.legal_name.trim(),
        city: current.city.trim(),
        address: current.address.trim(),
        gstin,
        // The server takes a GSTIN only with "GST registered" ticked.
        gst_registered: Boolean(gstin),
      },
      {
        onSuccess: async () => {
          // The checklist reads `business_details_complete` from the application.
          await queryClient.invalidateQueries({ queryKey: queryKeys.partner.application() });
          router.push(next as never);
        },
      },
    );
  }, [current, editable, next, problems.size, queryClient, router, save]);

  useEffect(() => {
    registerDock({
      label: "Continue",
      backHref: "/apply/about",
      nextStepName: "Documents",
      onCommit,
      isSaving: save.isPending,
      proceedDisabled: false,
      saved: false,
      conflict: false,
      refusal: save.error ? { title: "We could not save this", message: describeError(save.error, "mutation").message } : null,
      failed: false,
      requestId: null,
      fieldMessages: [],
    });
  }, [registerDock, onCommit, save.isPending, save.error]);

  useEffect(() => () => registerDock(null), [registerDock]);

  const missing = application.error instanceof ApiRequestError && application.error.status === 404;
  if (application.isPending || profile.isPending) {
    return (
      <View style={styles.center}>
        <Spinner size="sm" />
        <Text style={styles.muted}>Loading your business details…</Text>
      </View>
    );
  }
  if ((application.isError && !missing) || profile.isError) {
    return (
      <ErrorState
        title="We could not load your business details"
        message="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => {
          void application.refetch();
          void profile.refetch();
        }}
      />
    );
  }
  // Only employers are asked.
  if (missing || track !== "EMPLOYER") return <Redirect href="/apply" />;

  const show = (problem: Problem) => showProblems && problems.has(problem);

  return (
    <StepFrame title="Business details" description="Your jobs are shown under this business name.">
      <View style={styles.fields}>
        <Field label="Business name" required error={show("name") ? "Enter your business name." : null}>
          <TextInput
            onFocus={scrollFieldIntoView}
            value={current.legal_name}
            maxLength={200}
            placeholder="e.g. Sri Sai Mobiles"
            placeholderTextColor="#78716c"
            editable={editable}
            autoComplete="organization"
            onChangeText={(value) => update({ legal_name: value })}
            style={[styles.input, show("name") ? styles.inputError : null]}
          />
        </Field>

        <Field label="Type of business" required error={show("category") ? "Choose the type of business." : null}>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {CATEGORIES.map((category) => {
              const selected = current.business_category === category.value;
              return (
                <Pressable
                  key={category.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: !editable }}
                  disabled={!editable}
                  onPress={() => update({ business_category: category.value })}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{category.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="City" required error={show("city") ? "Enter the city." : null}>
          <TextInput
            onFocus={scrollFieldIntoView}
            value={current.city}
            maxLength={80}
            placeholderTextColor="#78716c"
            editable={editable}
            onChangeText={(value) => update({ city: value })}
            style={[styles.input, show("city") ? styles.inputError : null]}
          />
        </Field>

        <Field label="Business address" optional>
          <TextInput
            onFocus={scrollFieldIntoView}
            value={current.address}
            maxLength={240}
            editable={editable}
            onChangeText={(value) => update({ address: value })}
            style={styles.input}
          />
        </Field>

        <Field label="GSTIN" optional error={show("gstin") ? "A GSTIN has 15 letters and numbers." : null}>
          <TextInput
            onFocus={scrollFieldIntoView}
            value={current.gstin}
            maxLength={15}
            autoCapitalize="characters"
            editable={editable}
            onChangeText={(value) => update({ gstin: value.toUpperCase() })}
            style={[styles.input, show("gstin") ? styles.inputError : null]}
          />
        </Field>
      </View>
    </StepFrame>
  );
}

function Field({
  label,
  required,
  optional,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
        {optional ? <Text style={styles.optional}> (optional)</Text> : null}
      </Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 48, rowGap: 12 },
  muted: { fontSize: 13, color: "#756c5e" },
  fields: { rowGap: 18 },
  label: { fontSize: 15, fontWeight: "700", color: "#00112e", marginBottom: 8 },
  required: { color: "#dc2626", fontWeight: "700" },
  optional: { fontSize: 14, fontWeight: "400", color: "#78716c" },
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
  inputError: { borderColor: "#dc2626" },
  error: { fontSize: 12, color: "#dc2626", marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "#e7e2da",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
  },
  chipSelected: { borderColor: "#00112e", backgroundColor: "#00112e" },
  chipText: { fontSize: 14, fontWeight: "600", color: "#00112e" },
  chipTextSelected: { color: "#ffffff" },
});
