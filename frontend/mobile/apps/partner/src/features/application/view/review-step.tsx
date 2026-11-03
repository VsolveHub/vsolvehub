// Ported from frontend/apps/partner/features/application/view/review-step.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { ErrorState, Spinner } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Check, CheckCircle2, ChevronRight, Edit3 } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useApplyDock } from "../model/dock-context";
import { canSubmit, isEditable, outstandingRequirements } from "../model/readiness";
import { isVersionConflict, usePartnerApplication, useSubmitApplication } from "../queries";
import { useApplicationReference } from "../reference-queries";

export function ReviewStep() {
  const router = useRouter();
  const query = usePartnerApplication();
  const reference = useApplicationReference();
  const submit = useSubmitApplication();
  const { registerDock } = useApplyDock();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  const application = query.data ?? null;
  const editable = application !== null && isEditable(application);
  const ready = application !== null && canSubmit(application);
  const isSubmitted = application?.status === "SUBMITTED" || application?.status === "UNDER_REVIEW";

  const submitMutateRef = useRef(submit.mutate);
  submitMutateRef.current = submit.mutate;
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;

  const onCommit = useCallback(() => {
    submitMutateRef.current(undefined, {
      onSuccess: () => {
        void refetchRef.current();
      },
    });
  }, []);

  useEffect(() => {
    if (!editable) {
      registerDock(null);
      return;
    }

    registerDock({
      label: "Submit application",
      backHref: "/apply/documents",
      nextStepName: null,
      onCommit,
      isSaving: submit.isPending,
      proceedDisabled: !ready || submit.isPending,
      saved: submit.isSuccess,
      conflict: isVersionConflict(submit.error),
      refusal: null,
      failed: submit.isError && !isVersionConflict(submit.error),
      requestId: null,
      fieldMessages: [],
    });
  }, [
    editable,
    ready,
    submit.isPending,
    submit.isSuccess,
    submit.isError,
    submit.error,
    registerDock,
    onCommit,
  ]);

  useEffect(() => {
    return () => {
      registerDock(null);
    };
  }, [registerDock]);

  if (query.isPending || reference.isPending) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="sm" />
        <Text style={styles.loadingText}>Loading your application summary…</Text>
      </View>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title="We could not load your application"
        message="Nothing you have saved is lost. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void query.refetch()}
      />
    );
  }

  if (application === null) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.title}>Review and send</Text>
        <Text style={styles.subtitle}>You have not started your application yet.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/apply/about")}
          style={styles.startButton}
        >
          <Text style={styles.startButtonText}>Start Your Application</Text>
        </Pressable>
      </View>
    );
  }

  const outstanding = outstandingRequirements(application);

  return (
    <View style={styles.container}>
      {/* Title */}
      <View style={styles.header}>
        <Text style={styles.title}>Review and send</Text>
        <Text style={styles.subtitle}>
          {isSubmitted
            ? "Your application has been received and is being processed."
            : "Please review your details before submitting for approval."}
        </Text>
      </View>

      {/* Submitted Status Banner */}
      {isSubmitted ? (
        <View style={styles.submittedBanner}>
          <CheckCircle2 size={24} color="#15803d" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.submittedTitle}>Application Under Review</Text>
            <Text style={styles.submittedBody}>
              Our partner operations team is reviewing your documents. We will notify you once your account is activated.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Outstanding Items Banner */}
      {!ready && editable ? (
        <View style={styles.outstandingBanner}>
          <Text style={styles.outstandingTitle}>Missing information to complete:</Text>
          {outstanding.map((item) => (
            <Pressable
              key={item.code}
              accessibilityRole="button"
              onPress={() => router.push(item.href as any)}
              style={styles.outstandingItem}
            >
              <Text style={styles.outstandingItemText}>• {item.label}</Text>
              <ChevronRight size={14} color="#c2410c" />
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Summary Cards */}
      <View style={styles.cardsContainer}>
        {/* Card 1: About you */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>1. About you</Text>
            {editable ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/apply/about")}
                style={styles.editButton}
              >
                <Edit3 size={13} color="#2563eb" />
                <Text style={styles.editText}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <Text style={styles.fieldValue}>{application.display_name || "Not entered"}</Text>
          </View>
          {application.biography ? (
            <View style={[styles.fieldRow, { marginTop: 8 }]}>
              <Text style={styles.fieldLabel}>Bio</Text>
              <Text style={styles.fieldValue}>{application.biography}</Text>
            </View>
          ) : null}
        </View>

        {/* Card 2: Agreements */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>2. Agreements</Text>
            {editable ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/apply/consent")}
                style={styles.editButton}
              >
                <Edit3 size={13} color="#2563eb" />
                <Text style={styles.editText}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          {application.consents.length > 0 ? (
            <View style={{ rowGap: 8 }}>
              {application.consents.map((c) => (
                <View key={c.purpose} style={styles.checkRow}>
                  <Check size={14} color="#15803d" strokeWidth={3} />
                  <Text style={styles.checkText}>
                    {c.purpose.replace(/_/g, " ")} (v{c.document_version})
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.unmetText}>No agreements signed yet</Text>
          )}
        </View>

        {/* Card 3: Documents */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>3. Documents</Text>
            {editable ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/apply/documents")}
                style={styles.editButton}
              >
                <Edit3 size={13} color="#2563eb" />
                <Text style={styles.editText}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={{ rowGap: 8 }}>
            <View style={styles.checkRow}>
              {application.documents.some((d) => d.kind === "GOVERNMENT_ID") ? (
                <>
                  <Check size={14} color="#15803d" strokeWidth={3} />
                  <Text style={styles.checkText}>Government photo ID uploaded</Text>
                </>
              ) : (
                <Text style={styles.unmetText}>Government photo ID missing</Text>
              )}
            </View>
            <View style={styles.checkRow}>
              {application.documents.some((d) => d.kind === "ADDRESS_PROOF") ? (
                <>
                  <Check size={14} color="#15803d" strokeWidth={3} />
                  <Text style={styles.checkText}>Proof of address uploaded</Text>
                </>
              ) : (
                <Text style={styles.unmetText}>Proof of address missing</Text>
              )}
            </View>
          </View>
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
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748b",
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: "center",
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#00112e",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 4,
  },
  startButton: {
    marginTop: 16,
    backgroundColor: "#ea580c",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  startButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  submittedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  submittedTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#166534",
  },
  submittedBody: {
    fontSize: 13,
    color: "#15803d",
    marginTop: 2,
  },
  outstandingBanner: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  outstandingTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#9a3412",
    marginBottom: 6,
  },
  outstandingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  outstandingItemText: {
    fontSize: 13,
    color: "#c2410c",
    fontWeight: "600",
  },
  cardsContainer: {
    flexDirection: "column",
    rowGap: 14,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 18,
    flexDirection: "column",
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
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
    paddingBottom: 10,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 4,
  },
  editText: {
    fontSize: 13,
    color: "#2563eb",
    fontWeight: "600",
  },
  fieldRow: {
    flexDirection: "column",
  },
  fieldLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
  },
  fieldValue: {
    fontSize: 14,
    color: "#00112e",
    fontWeight: "600",
    marginTop: 2,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
  },
  checkText: {
    fontSize: 14,
    color: "#00112e",
    fontWeight: "600",
    textTransform: "capitalize",
  },
  unmetText: {
    fontSize: 13,
    color: "#94a3b8",
    fontStyle: "italic",
  },
});
