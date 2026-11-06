// Ported from frontend/apps/partner/features/application/view/documents-step.tsx
import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileText,
  RotateCw,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { useApplyDock } from "../model/dock-context";
import { requiredDocumentKinds } from "../model/readiness";
import { isListingTrack } from "../model/steps";
import { usePartnerApplication } from "../queries";
import { DocumentUpload } from "./document-upload";

type Application = Schemas["PartnerApplication"];
type DocumentKind = Schemas["PartnerDocumentKindEnum"];

const OFFERED: readonly { kind: DocumentKind; label: string }[] = [
  { kind: "GOVERNMENT_ID", label: "Government photo ID" },
  { kind: "ADDRESS_PROOF", label: "Proof of address" },
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
  const required = requiredDocumentKinds(application);
  const allUploaded = required.every((kind) => {
    const document = application ? currentDocument(application, kind) : null;
    return document !== null && document.status !== "REJECTED";
  });
  const anyUploaded = OFFERED.some((item) => application !== null && currentDocument(application, item.kind) !== null);

  const onCommit = useCallback(() => {
    router.push("/apply/review");
  }, [router]);

  useEffect(() => {
    registerDock({
      label: anyUploaded ? "Continue" : "Continue →",
      // The step before Documents: your hours for services, About you for stays and rentals.
      backHref: isListingTrack(application?.track) ? "/apply/about" : "/apply/schedule",
      nextStepName: "Agree & send",
      onCommit,
      isSaving: false,
      proceedDisabled: !allUploaded,
      saved: false,
      conflict: false,
      refusal: null,
      failed: false,
      requestId: null,
      fieldMessages: [],
    });
  }, [registerDock, onCommit, allUploaded, anyUploaded, application?.track]);

  useEffect(() => {
    return () => {
      registerDock(null);
    };
  }, [registerDock]);

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
      {/* Title & Subtitle Matching Mockups */}
      <View style={styles.header}>
        <Text style={styles.title}>Documents</Text>
        <Text style={styles.subtitle}>
          Upload the required documents to verify your identity and address.
        </Text>
      </View>

      {/* Cards List */}
      <View style={styles.cardsContainer}>
        {OFFERED.map((item) => {
          const document = application ? currentDocument(application, item.kind) : null;
          const isUploaded = document !== null;
          const isReplacing = replacingKind === item.kind;
          const isApproved = document?.status === "APPROVED";
          const isRejected = document?.status === "REJECTED";
          const isPending = document?.status === "PENDING";
          // Replaceable only when the server says so: a declined application refuses it with a 409.
          const canReplace = document?.can_replace ?? false;
          const isReplaceState = isRejected && canReplace;

          return (
            <View key={item.kind} style={styles.card}>
              {/* Card Header Row: Title + Status Pill */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  {item.label}{" "}
                  {required.includes(item.kind) ? <Text style={styles.requiredAsterisk}>*</Text> : <Text>(optional)</Text>}
                </Text>

                {isUploaded && !isReplacing ? (
                  isApproved ? (
                    <View style={styles.approvedPill}>
                      <CheckCircle2 size={13} color="#2fa84f" strokeWidth={2.4} />
                      <Text style={styles.approvedPillText}>Approved</Text>
                    </View>
                  ) : isReplaceState ? (
                    <View style={styles.replacePill}>
                      <AlertTriangle size={13} color="#d32f1e" strokeWidth={2.4} />
                      <Text style={styles.replacePillText}>Replace</Text>
                    </View>
                  ) : (
                    <View style={styles.pendingPill}>
                      <Text style={styles.pendingPillText}>In review</Text>
                    </View>
                  )
                ) : null}
              </View>

              {/* Expired / Rejected Banner if Replace State */}
              {isUploaded && !isReplacing && isReplaceState ? (
                <View style={styles.expiredBanner}>
                  <AlertCircle size={15} color="#d32f1e" strokeWidth={2.2} />
                  <Text style={styles.expiredBannerText}>
                    {document?.review_reason || "This document was not accepted."}
                  </Text>
                </View>
              ) : null}

              {/* Render Uploaded File Body or Upload Box */}
              {isUploaded && !isReplacing ? (
                <View style={styles.fileContainer}>
                  {/* File Metadata Tile Row */}
                  <View style={styles.fileRow}>
                    <View style={[styles.fileTile, isApproved ? styles.fileTileBlue : styles.fileTileGray]}>
                      {item.kind === "GOVERNMENT_ID" ? (
                        <CreditCard size={20} color={isApproved ? "#2563eb" : "#64748b"} />
                      ) : (
                        <FileText size={20} color={isApproved ? "#2563eb" : "#64748b"} />
                      )}
                    </View>

                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName}>
                        {document.file_name}
                      </Text>
                      <Text style={styles.fileMeta}>
                        {Math.round(document.size_bytes / 1024)} KB · {document.content_type.split("/")[1]?.toUpperCase()}
                      </Text>
                    </View>

                  </View>

                  {/* Re-upload Outline Button (Screen 4 Replace Tile) */}
                  {isReplaceState ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Re-upload document"
                      onPress={() => setReplacingKind(item.kind)}
                      style={styles.reuploadButton}
                    >
                      <RotateCw size={15} color="#f26a0f" strokeWidth={2.4} />
                      <Text style={styles.reuploadButtonText}>Re-upload</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                /* Empty / Upload State (Screen 3) */
                <View style={{ marginTop: 8 }}>
                  <DocumentUpload
                    kind={item.kind}
                    label={item.label}
                    expectedVersion={application?.version ?? null}
                    replacing={isReplacing || isReplaceState}
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
    color: "#6b7280",
  },
  header: {
    marginBottom: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0b1b3a",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
    lineHeight: 20,
  },
  cardsContainer: {
    flexDirection: "column",
    rowGap: 16,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    padding: 20,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 1px 4px rgba(11, 27, 58, 0.05)",
        } as any)
      : {
          elevation: 2,
          shadowColor: "#0b1b3a",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        }),
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0b1b3a",
  },
  requiredAsterisk: {
    color: "#f26a0f",
  },
  approvedPill: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 5,
    backgroundColor: "#e8f7ec",
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  approvedPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2fa84f",
  },
  replacePill: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 5,
    backgroundColor: "#fdecec",
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  replacePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#d32f1e",
  },
  pendingPill: {
    backgroundColor: "#e0f2fe",
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0369a1",
  },
  expiredBanner: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
    backgroundColor: "#fdecec",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  expiredBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#d32f1e",
  },
  fileContainer: {
    marginTop: 14,
    flexDirection: "column",
    rowGap: 12,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 12,
  },
  fileTile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fileTileBlue: {
    backgroundColor: "#eff6ff",
  },
  fileTileGray: {
    backgroundColor: "#f1f5f9",
  },
  fileInfo: {
    flex: 1,
    flexDirection: "column",
  },
  fileName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0b1b3a",
  },
  fileMeta: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 5,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0b1b3a",
  },
  reuploadButton: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#f26a0f",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 8,
    marginTop: 4,
  },
  reuploadButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#f26a0f",
  },
  cancelReplaceButton: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  cancelReplaceText: {
    fontSize: 13,
    color: "#6b7280",
    textDecorationLine: "underline",
  },
});
