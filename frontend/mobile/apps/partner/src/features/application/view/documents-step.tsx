// Ported from frontend/apps/partner/features/application/view/documents-step.tsx
import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { ErrorState, Spinner } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Check, RefreshCw } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useApplyDock } from "../model/dock-context";
import { usePartnerApplication } from "../queries";
import { DocumentUpload } from "./document-upload";

type Application = Schemas["PartnerApplication"];
type DocumentKind = Schemas["PartnerDocumentKindEnum"];

const REQUIRED: readonly { kind: DocumentKind; label: string }[] = [
  {
    kind: "GOVERNMENT_ID",
    label: "Government photo ID",
  },
  {
    kind: "ADDRESS_PROOF",
    label: "Proof of address",
  },
];

function currentDocument(application: Application, kind: DocumentKind): Schemas["PartnerDocument"] | null {
  const candidates = application.documents
    .filter((document) => document.kind === kind && document.status !== "SUPERSEDED")
    .sort((a, b) => b.version - a.version);
  return candidates[0] ?? null;
}

export function DocumentsStep() {
  const query = usePartnerApplication();
  const router = useRouter();
  const { registerDock } = useApplyDock();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;
  const [replacingKind, setReplacingKind] = useState<DocumentKind | null>(null);

  const application = query.data ?? null;
  const isEditable =
    application === null || application.status === "DRAFT" || application.status === "CHANGES_REQUIRED";

  const govtIdDoc = application ? currentDocument(application, "GOVERNMENT_ID") : null;
  const addressProofDoc = application ? currentDocument(application, "ADDRESS_PROOF") : null;

  const hasGovtId = govtIdDoc !== null && govtIdDoc.status !== "REJECTED";
  const hasAddressProof = addressProofDoc !== null && addressProofDoc.status !== "REJECTED";
  const allUploaded = hasGovtId && hasAddressProof;

  useEffect(() => {
    registerDock({
      label: "Continue",
      backHref: "/apply/consent",
      nextStepName: "Review and send",
      onCommit: () => router.push("/apply/review"),
      isSaving: false,
      proceedDisabled: !allUploaded,
      saved: false,
      conflict: false,
      refusal: null,
      failed: false,
      requestId: null,
      fieldMessages: [],
    });

    return () => {
      registerDock(null);
    };
  }, [registerDock, router, allUploaded]);

  if (query.isPending) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="sm" />
        <Text style={styles.loadingText}>Loading documents…</Text>
      </View>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title="Could not load documents"
        message="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void query.refetch()}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Title */}
      <View style={styles.header}>
        <Text style={styles.title}>Documents</Text>
      </View>

      {/* Cards List */}
      <View style={styles.cardsContainer}>
        {REQUIRED.map((item) => {
          const document = application ? currentDocument(application, item.kind) : null;
          const isUploaded = document !== null && document.status !== "REJECTED";
          const isReplacing = replacingKind === item.kind;

          return (
            <View key={item.kind} style={styles.card}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  {item.label} <Text style={styles.requiredAsterisk}>*</Text>
                </Text>
                {isUploaded ? (
                  <View style={styles.statusBadge}>
                    <Check size={12} color="#15803d" strokeWidth={3} />
                    <Text style={styles.statusBadgeText}>Uploaded</Text>
                  </View>
                ) : null}
              </View>

              {document?.status === "REJECTED" ? (
                <Text style={styles.rejectedText}>
                  ⚠️ {document.review_reason || "Document could not be verified. Please upload a clear photo or PDF."}
                </Text>
              ) : null}

              {isUploaded && !isReplacing ? (
                <View style={styles.uploadedBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.uploadedDocName}>
                      {item.label} (v{document.version})
                    </Text>
                    <Text style={styles.uploadedDocMeta}>
                      Status: {document.status === "APPROVED" ? "Approved" : "Waiting for review"}
                    </Text>
                  </View>
                  {isEditable ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setReplacingKind(item.kind)}
                      style={styles.replaceButton}
                    >
                      <RefreshCw size={13} color="#ea580c" />
                      <Text style={styles.replaceButtonText}>Replace</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={{ marginTop: 4 }}>
                  <DocumentUpload
                    kind={item.kind}
                    label={item.label}
                    expectedVersion={application?.version ?? null}
                    replacing={isReplacing || document?.status === "REJECTED"}
                  />
                  {isReplacing ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setReplacingKind(null)}
                      style={styles.cancelReplaceButton}
                    >
                      <Text style={styles.cancelReplaceText}>Keep current document</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
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
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#00112e",
    letterSpacing: -0.5,
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
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00112e",
  },
  requiredAsterisk: {
    color: "#ea580c",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 4,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803d",
  },
  rejectedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#be123c",
    marginBottom: 10,
  },
  uploadedBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
  },
  uploadedDocName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00112e",
  },
  uploadedDocMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  replaceButton: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#ffedd5",
  },
  replaceButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#c2410c",
  },
  cancelReplaceButton: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 6,
  },
  cancelReplaceText: {
    fontSize: 12,
    color: "#64748b",
    textDecorationLine: "underline",
  },
});
