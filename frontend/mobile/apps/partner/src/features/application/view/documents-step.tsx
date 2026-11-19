// Ported from frontend/apps/partner/features/application/view/documents-step.tsx
import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
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
import { isDocumentRejected } from "../model/status";
import { isListingTrack } from "../model/steps";
import { usePartnerApplication } from "../queries";
import { usePartnerDocumentAccess } from "../upload-queries";
import { StepFrame } from "./application-editor";
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
  const isMissing = Boolean(
    (query.error instanceof ApiRequestError && query.error.status === 404) ||
      (query.error && typeof query.error === "object" && (query.error as { status?: number }).status === 404),
  );
  const [replacingKind, setReplacingKind] = useState<DocumentKind | null>(null);
  const access = usePartnerDocumentAccess();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  /** A short-lived link to one of the person's own documents, as the website's "View document". */
  async function viewDocument(documentId: string) {
    setAccessError(null);
    setOpeningId(documentId);
    try {
      const response = await access.mutateAsync(documentId);
      if (response.access_url) await WebBrowser.openBrowserAsync(response.access_url);
      else setAccessError("Could not generate a preview link. Please try again.");
    } catch {
      setAccessError("Could not open this document right now. Please try again.");
    } finally {
      setOpeningId(null);
    }
  }

  const application = query.data ?? null;
  const required = requiredDocumentKinds(application);
  const allUploaded = required.every((kind) => {
    const document = application ? currentDocument(application, kind) : null;
    // A file that failed the security scan is rejected too, as on the website.
    return document !== null && !isDocumentRejected(document);
  });
  const anyUploaded = OFFERED.some((item) => application !== null && currentDocument(application, item.kind) !== null);

  const onCommit = useCallback(() => {
    router.push("/apply/review");
  }, [router]);

  useEffect(() => {
    registerDock({
      label: "Continue",
      // The step before Documents: your hours for services, About you for stays and rentals.
      backHref: isListingTrack(application?.track) ? "/apply/about" : "/apply/schedule",
      nextStepName: "Agree & send",
      onCommit,
      isSaving: false,
      proceedDisabled: false,
      saved: false,
      conflict: false,
      refusal: null,
      failed: false,
      requestId: null,
      fieldMessages: [],
    });
  }, [registerDock, onCommit, isListingTrack(application?.track)]);

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
    <StepFrame
      title="Documents"
      description="A reviewer checks these before you can take work."
    >
      <View style={styles.cardsContainer}>
        {[...OFFERED]
          .sort((a, b) => Number(required.includes(b.kind)) - Number(required.includes(a.kind)))
          .map((item) => {
          const document = application ? currentDocument(application, item.kind) : null;
          const isUploaded = document !== null;
          const isReplacing = replacingKind === item.kind;
          const isApproved = document?.status === "APPROVED";
          const isRejected = document !== null && isDocumentRejected(document);
          const isPending = document?.status === "PENDING";
          // Replaceable only when the server says so: a declined application refuses it with a 409.
          const canReplace = document?.can_replace ?? false;
          const isReplaceState = isRejected && canReplace;
          // Locked once sent: only a document the reviewer rejected can be swapped.
          const isLockedForReview =
            document !== null &&
            !canReplace &&
            (application?.status === "SUBMITTED" || application?.status === "UNDER_REVIEW");
          const isRequired = required.includes(item.kind);

          const hint =
            item.kind === "GOVERNMENT_ID"
              ? "Confirms who you are. If you upload Aadhaar, cover the first 8 digits."
              : "Any recent bill or statement showing your name and address.";

          return (
            <View key={item.kind} style={styles.card}>
              {/* Header row: Title + Subtitle and Status Pill */}
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleCol}>
                  <Text style={styles.cardTitle}>{item.label}</Text>
                  <Text style={styles.cardSubtitle}>
                    {isRequired ? "Required" : "Optional"}
                  </Text>
                </View>

                {isUploaded && !isReplacing ? (
                  isApproved ? (
                    <View style={styles.approvedPill}>
                      <Text style={styles.approvedPillText}>Approved</Text>
                    </View>
                  ) : isReplaceState ? (
                    <View style={styles.replacePill}>
                      <Text style={styles.replacePillText}>Replace</Text>
                    </View>
                  ) : (
                    <View style={styles.pendingPill}>
                      <Text style={styles.pendingPillText}>In review</Text>
                    </View>
                  )
                ) : (
                  <View style={styles.notUploadedPill}>
                    <Text style={styles.notUploadedPillText}>Not uploaded</Text>
                  </View>
                )}
              </View>

              {/* Hint text: only while there is nothing, or a rejection, to act on */}
              {!isUploaded || isRejected ? <Text style={styles.hintText}>{hint}</Text> : null}

              {/* Expired / Rejected Banner if Replace State */}
              {isUploaded && !isReplacing && isReplaceState ? (
                <View style={styles.expiredBanner}>
                  <AlertCircle size={15} color="#d32f1e" strokeWidth={2.2} />
                  <Text style={styles.expiredBannerText}>
                    {document?.scan_status === "REJECTED"
                      ? "This file failed our security check. Upload it again."
                      : `Reason: ${
                          document?.review_reason ||
                          "We could not verify this document. Upload a clearer photo or PDF."
                        }`}
                  </Text>
                </View>
              ) : null}

              {/* Render Uploaded File Body or Upload Box */}
              {isUploaded && !isReplacing ? (
                <View style={styles.fileContainer}>
                  <View style={styles.fileRow}>
                    <View style={[styles.fileTile, isApproved ? styles.fileTileBlue : styles.fileTileGray]}>
                      {item.kind === "GOVERNMENT_ID" ? (
                        <CreditCard size={20} color={isApproved ? "#2563eb" : "#64748b"} />
                      ) : (
                        <FileText size={20} color={isApproved ? "#2563eb" : "#64748b"} />
                      )}
                    </View>

                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName}>{document.file_name}</Text>
                      <Text style={styles.fileMeta}>
                        {Math.round(document.size_bytes / 1024)} KB · {document.content_type.split("/")[1]?.toUpperCase()} ·{" "}
                        {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
                          new Date(document.uploaded_at),
                        )}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="View document"
                    disabled={openingId === document.id}
                    onPress={() => void viewDocument(document.id)}
                    style={styles.reuploadButton}
                  >
                    <Text style={styles.reuploadButtonText}>
                      {openingId === document.id ? "Opening…" : "View document"}
                    </Text>
                  </Pressable>

                  {canReplace ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isRejected ? "Re-upload document" : "Replace file"}
                      onPress={() => setReplacingKind(item.kind)}
                      style={styles.reuploadButton}
                    >
                      <RotateCw size={15} color="#f87000" strokeWidth={2.4} />
                      <Text style={styles.reuploadButtonText}>{isRejected ? "Re-upload" : "Replace file"}</Text>
                    </Pressable>
                  ) : null}

                  {isLockedForReview ? (
                    <Text style={styles.hintText}>Locked while your application is being reviewed.</Text>
                  ) : null}
                </View>
              ) : (
                /* Empty / Upload Dropzone State */
                <View style={styles.uploadSection}>
                  <Text style={styles.uploadSubheading}>
                    Upload your {item.label.toLowerCase()}
                  </Text>
                  <DocumentUpload
                    kind={item.kind}
                    label={item.label}
                    expectedVersion={application?.version ?? null}
                    replacing={isReplacing || isReplaceState}
                    onSuccess={() => setReplacingKind(null)}
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
        {accessError ? (
          <Text accessibilityRole="alert" style={{ fontSize: 12, fontWeight: "600", color: "#be123c" }}>
            {accessError}
          </Text>
        ) : null}
      </View>
    </StepFrame>
  );
}

const styles = StyleSheet.create({
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
  cardsContainer: {
    flexDirection: "column",
    rowGap: 16,
    width: "100%",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e7e2da",
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  cardTitleCol: {
    flex: 1,
    flexDirection: "column",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#00112e",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#453f37",
    marginTop: 2,
  },
  notUploadedPill: {
    backgroundColor: "#f4f1ec",
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  notUploadedPillText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#453f37",
  },
  approvedPill: {
    backgroundColor: "#dcfce7",
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  approvedPillText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#15803d",
  },
  replacePill: {
    backgroundColor: "#fee2e2",
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  replacePillText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#b91c1c",
  },
  pendingPill: {
    backgroundColor: "#fef3c7",
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pendingPillText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#b45309",
  },
  hintText: {
    fontSize: 13,
    color: "#453f37",
    lineHeight: 18,
    marginTop: 8,
  },
  uploadSection: {
    marginTop: 12,
    flexDirection: "column",
  },
  uploadSubheading: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00112e",
    marginBottom: 8,
  },
  expiredBanner: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
    backgroundColor: "#fee2e2",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  expiredBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#b91c1c",
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
    color: "#00112e",
  },
  fileMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  reuploadButton: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#f87000",
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
    color: "#f87000",
  },
  cancelReplaceButton: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  cancelReplaceText: {
    fontSize: 13,
    color: "#64748b",
    textDecorationLine: "underline",
  },
});
