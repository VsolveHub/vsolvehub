// Ported from frontend/apps/partner/features/application/view/documents-step.tsx
import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Badge, Button, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { View } from "react-native";

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
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <View className="flex-row items-center gap-2 py-8">
        <Spinner size="sm" />
        <Text className="text-sm text-text-secondary">Loading documents…</Text>
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

  const application = query.data ?? null;
  const isEditable =
    application === null || application.status === "DRAFT" || application.status === "CHANGES_REQUIRED";

  return (
    <View className="flex-col gap-6">
      <View className="flex-col gap-4">
        {REQUIRED.map((required) => {
          const document = application ? currentDocument(application, required.kind) : null;
          const status = document ? STATUS_TONE[document.status] : null;

          return (
            <View key={required.kind} className="rounded-control border border-line bg-surface p-4">
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <Text className="text-sm font-bold text-navy-900">
                  {required.label} <Text className="text-danger-text">*</Text>
                </Text>
                <Badge tone={status?.tone ?? "neutral"}>{status?.label ?? "Not uploaded"}</Badge>
              </View>

              {document?.status === "REJECTED" ? (
                <Text className="mt-2 text-xs font-semibold text-danger-text">
                  {document.review_reason ||
                    "Document could not be verified. Please upload a clear photo or PDF."}
                </Text>
              ) : null}

              {document ? (
                <Text className="mt-2 text-xs text-text-muted">
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
                <Text className="mt-2 text-xs text-text-muted">
                  {document
                    ? "Locked while your application is being reviewed."
                    : "This was not required when your application was approved. Contact support if you need to add it."}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      <View className="flex-row items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="outline" size="lg" className="h-12 px-5" onPress={() => router.push("/apply/consent")}>
          Back
        </Button>
        <Button size="lg" className="h-12 px-5 shadow-md" onPress={() => router.push("/apply/schedule")}>
          Continue to Working Hours
        </Button>
      </View>
    </View>
  );
}
