// Ported from frontend/apps/partner/features/application/view/documents-step.tsx
import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Badge, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform, useWindowDimensions, View } from "react-native";

import { useApplyDock } from "../model/dock-context";
import { usePartnerApplication } from "../queries";
import { DocumentUpload } from "./document-upload";

type Application = Schemas["PartnerApplication"];
type DocumentKind = Schemas["PartnerDocumentKindEnum"];

const REQUIRED: readonly { kind: DocumentKind; label: string; why: string }[] = [
  {
    kind: "GOVERNMENT_ID",
    label: "Government photo ID",
    why: "Confirms you are who you say you are before we send you to someone's home.",
  },
  {
    kind: "ADDRESS_PROOF",
    label: "Proof of address",
    why: "Any recent bill or statement showing your name and address.",
  },
];

const STATUS_TONE: Record<
  Schemas["PartnerDocumentStatusEnum"],
  { tone: "neutral" | "info" | "success" | "warning" | "danger"; label: string }
> = {
  PENDING: { tone: "info", label: "Waiting for review" },
  APPROVED: { tone: "success", label: "Approved" },
  REJECTED: { tone: "danger", label: "Needs replacing" },
  SUPERSEDED: { tone: "neutral", label: "Replaced" },
};

function currentDocument(application: Application, kind: DocumentKind): Schemas["PartnerDocument"] | null {
  const candidates = application.documents
    .filter((document) => document.kind === kind && document.status !== "SUPERSEDED")
    .sort((a, b) => b.version - a.version);
  return candidates[0] ?? null;
}

export function DocumentsStep() {
  const query = usePartnerApplication();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const { registerDock } = useApplyDock();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  const application = query.data ?? null;
  const isEditable =
    application === null || application.status === "DRAFT" || application.status === "CHANGES_REQUIRED";

  useEffect(() => {
    registerDock({
      label: "Continue to Working Hours",
      backHref: "/apply/consent",
      nextStepName: "Your hours",
      onCommit: () => router.push("/apply/schedule"),
      isSaving: false,
      proceedDisabled: false,
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
  }, [registerDock, router]);

  if (query.isPending) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8, paddingVertical: 32 }}>
        <Spinner size="sm" />
        <Text style={{ fontSize: 14, color: "#64748b" }}>Loading documents…</Text>
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
    <View style={{ flexDirection: "column", width: "100%" }}>
      <View
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: "#e7e2da",
          backgroundColor: "#ffffff",
          padding: isDesktop ? 36 : 22,
          ...(Platform.OS === "web"
            ? ({
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
              } as any)
            : {
                elevation: 2,
                shadowColor: "#00112e",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 3,
              }),
        }}
      >
        <View style={{ borderBottomWidth: 1, borderColor: "#f0ece4", paddingBottom: 18, marginBottom: 20 }}>
          <Text
            accessibilityRole="header"
            style={{
              fontSize: isDesktop ? 28 : 24,
              fontWeight: "800",
              letterSpacing: -0.5,
              color: "#00112e",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            Documents
          </Text>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 20,
              color: "#524d45",
              marginTop: 4,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            Upload your verification documents for account activation.
          </Text>
        </View>

        <View style={{ flexDirection: "column", rowGap: 16 }}>
          {REQUIRED.map((required) => {
            const document = application ? currentDocument(application, required.kind) : null;
            const status = document ? STATUS_TONE[document.status] : null;

            return (
              <View
                key={required.kind}
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  backgroundColor: "#ffffff",
                  padding: 16,
                  flexDirection: "column",
                  rowGap: 8,
                }}
              >
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#00112e" }}>
                    {required.label} <Text style={{ color: "#be123c" }}>*</Text>
                  </Text>
                  <Badge tone={status?.tone ?? "neutral"}>{status?.label ?? "Not uploaded"}</Badge>
                </View>

                {document?.status === "REJECTED" ? (
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#be123c" }}>
                    {document.review_reason ||
                      "Document could not be verified. Please upload a clear photo or PDF."}
                  </Text>
                ) : null}

                {document ? (
                  <Text style={{ fontSize: 12, color: "#78716c" }}>
                    Version {document.version} • Uploaded{" "}
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeZone: "Asia/Kolkata",
                    }).format(new Date(document.uploaded_at))}
                  </Text>
                ) : null}

                {isEditable ? (
                  <DocumentUpload
                    kind={required.kind}
                    label={required.label}
                    expectedVersion={application?.version ?? null}
                    replacing={document?.status === "REJECTED" || document?.scan_status === "REJECTED"}
                  />
                ) : (
                  <Text style={{ fontSize: 12, color: "#78716c" }}>
                    {document
                      ? "Locked while your application is being reviewed."
                      : "This was not required when your application was approved. Contact support if you need to add it."}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
