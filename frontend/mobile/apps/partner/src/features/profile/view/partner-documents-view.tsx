// Ported from frontend/apps/partner/features/profile/view/partner-documents-view.tsx
import type { Schemas } from "@vsolve/api-client";
import { Badge, Button, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatBytes } from "@/features/application/model/upload";
import { usePartnerApplication } from "@/features/application/queries";
import { usePartnerDocumentAccess } from "@/features/application/upload-queries";
import { usePartnerProfile } from "@/features/profile/queries";
import {
  PARTNER_SUPPORT_HOURS,
  PARTNER_SUPPORT_PHONE,
  PARTNER_SUPPORT_PHONE_DISPLAY,
} from "@/features/support/contact";

type PartnerDocument = Schemas["PartnerApplication"]["documents"][number];

const KIND: Record<string, { title: string; subtitle: string }> = {
  GOVERNMENT_ID: { title: "Government Photo Identification", subtitle: "Aadhaar Card, PAN Card, or Passport" },
  ADDRESS_PROOF: {
    title: "Proof of Operating Address",
    subtitle: "Electricity bill, lease agreement, or property document",
  },
  BANK: { title: "Bank Passbook / Cancelled Cheque", subtitle: "Verified account for automated payout disbursement" },
  TAX: { title: "Tax & GST Registration", subtitle: "GSTIN certificate or commercial tax registration" },
  BACKGROUND_CHECK: { title: "Police Verification Clearance", subtitle: "Jurisdictional police background report" },
};
const OTHER_KIND = { title: "Trade & Supporting Document", subtitle: "Trade license, vocational certification, or credential" };

const TRACK: Record<string, string> = {
  SERVICES: "Services",
  STAY_HOST: "Stays",
  RENTAL_OWNER: "Rentals",
  EMPLOYER: "Employer",
};

const STATUS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  CHANGES_REQUIRED: "Changes needed",
  APPROVED: "Approved & active",
  REJECTED: "Not approved",
};

function purposeLabel(purpose: string): string {
  if (purpose === "partner_terms") return "V Solve Hub Partner Terms of Service";
  if (purpose === "privacy_notice") return "Partner Privacy Policy & Data Processing Agreement";
  return purpose.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? "—"
    : at.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The Partner's application, its documents and the agreements they signed: the web's
 * `/me/documents` (which `/me/application` also opens).
 */
export function PartnerDocumentsView() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const applicationQuery = usePartnerApplication();
  const profileQuery = usePartnerProfile();
  const documentAccess = usePartnerDocumentAccess();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [docError, setDocError] = useState<{ id: string; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function viewDocument(id: string) {
    setDocError(null);
    setViewingId(id);
    try {
      const response = await documentAccess.mutateAsync(id);
      if (response.access_url) await WebBrowser.openBrowserAsync(response.access_url);
      else setDocError({ id, message: "No preview link available for this document." });
    } catch {
      setDocError({ id, message: "Unable to open document. Please try again." });
    } finally {
      setViewingId(null);
    }
  }

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to profile"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/me" as never))}
      className="flex-row items-center gap-1.5 self-start"
    >
      <ChevronLeft size={18} color="#00112e" />
      <Text className="text-sm font-semibold text-text-secondary">Back to Profile</Text>
    </Pressable>
  );

  const container = (children: React.ReactNode) => (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-4 px-4"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await Promise.all([applicationQuery.refetch(), profileQuery.refetch()]);
            setRefreshing(false);
          }}
          colors={["#EA580C"]}
          tintColor="#EA580C"
        />
      }
    >
      {back}
      {children}
    </ScrollView>
  );

  if (applicationQuery.isPending || profileQuery.isPending) {
    return container(
      <>
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-56 w-full" />
      </>,
    );
  }
  if (applicationQuery.isError || !applicationQuery.data) {
    return container(
      <ErrorState
        title="We could not load your application records"
        message={describeError(applicationQuery.error, "read").message}
        actionLabel="Try again"
        onAction={() => void applicationQuery.refetch()}
      />,
    );
  }

  const app = applicationQuery.data;
  const profile = profileQuery.data;
  const documents = app.documents.filter((doc) => doc.status !== "SUPERSEDED");

  return container(
    <>
      <View>
        <Text className="text-2xl font-bold text-navy-900">Application & KYC Documents</Text>
        <Text className="mt-1 text-sm text-text-secondary">
          Official registration records, identity proofs, and regulatory verification on file.
        </Text>
      </View>

      <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-lg font-bold text-navy-900">
            {app.display_name || profile?.display_name || "Partner Application"}
          </Text>
          <Badge tone={app.status === "APPROVED" ? "success" : "neutral"}>{STATUS[app.status] ?? app.status}</Badge>
        </View>
        <Text className="text-xs text-text-secondary">
          {`${TRACK[app.track ?? "SERVICES"] ?? "Services"} • Reference #${app.id.slice(0, 8).toUpperCase()}`}
        </Text>
        <View className="flex-row flex-wrap gap-y-3 border-t border-line pt-3">
          {[
            ["Track", TRACK[app.track ?? "SERVICES"] ?? "Services"],
            ["Experience", app.experience_years > 0 ? `${app.experience_years} Years` : "Entry Level"],
            ["Created", formatDay(app.created_at)],
            ["Status", STATUS[app.status] ?? app.status],
          ].map(([label, value]) => (
            <View key={label} className="w-1/2">
              <Text className="text-[10px] font-semibold uppercase text-text-muted">{label}</Text>
              <Text className="mt-0.5 text-xs font-bold text-navy-900">{value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="gap-3">
        <View>
          <Text className="text-base font-bold text-navy-900">{`Documents (${documents.length})`}</Text>
          <Text className="text-xs text-text-secondary">Securely stored and checked by Operations</Text>
        </View>
        {documents.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-line bg-surface p-6">
            <Text className="text-sm font-bold text-navy-900">No documents on file</Text>
            <Text className="mt-1 text-center text-xs text-text-secondary">
              No verification documents have been uploaded to this account yet.
            </Text>
          </View>
        ) : (
          documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              isOpening={viewingId === doc.id}
              error={docError?.id === doc.id ? docError.message : null}
              onView={() => void viewDocument(doc.id)}
              onReupload={() => router.push("/apply/documents" as never)}
            />
          ))
        )}
      </View>

      <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
        <Text className="text-sm font-bold text-navy-900">{`Signed Agreements & Legal Consents (${app.consents.length})`}</Text>
        {app.consents.length === 0 ? (
          <Text className="text-xs italic text-text-secondary">No legal agreements recorded.</Text>
        ) : (
          app.consents.map((consent) => (
            <View key={consent.id} className="flex-row items-center justify-between gap-3 border-t border-line pt-3">
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-bold text-navy-900">{purposeLabel(consent.purpose)}</Text>
                <Text className="mt-0.5 text-[11px] text-text-muted">
                  {`Version ${consent.document_version} • Accepted on ${formatDay(consent.accepted_at)}`}
                </Text>
              </View>
              <Badge tone="success">Active</Badge>
            </View>
          ))
        )}
      </View>

      <View className="gap-3 rounded-2xl border border-line bg-surface-sunken p-4">
        <Text className="text-sm font-bold text-navy-900">Need to update verified documents?</Text>
        <Text className="text-xs leading-5 text-text-secondary">
          {`To renew an expired ID or update bank certificates, contact the Partner Operations desk at ${PARTNER_SUPPORT_PHONE_DISPLAY} (${PARTNER_SUPPORT_HOURS}).`}
        </Text>
        <Button onPress={() => void Linking.openURL(`tel:${PARTNER_SUPPORT_PHONE}`)}>Call Support Desk</Button>
      </View>
    </>,
  );
}

function DocumentCard({
  doc,
  isOpening,
  error,
  onView,
  onReupload,
}: {
  doc: PartnerDocument;
  isOpening: boolean;
  error: string | null;
  onView: () => void;
  onReupload: () => void;
}) {
  const meta = KIND[doc.kind] ?? OTHER_KIND;
  const rejected = doc.status === "REJECTED";
  return (
    <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-bold text-navy-900">{meta.title}</Text>
        {doc.status === "APPROVED" ? <Badge tone="success">Approved</Badge> : null}
        {doc.status === "PENDING" ? <Badge tone="warning">Under Review</Badge> : null}
        {rejected ? <Badge tone="danger">Rejected</Badge> : null}
      </View>
      <Text className="text-xs text-text-secondary">{meta.subtitle}</Text>
      <Text className="text-[11px] text-text-muted">
        {`Uploaded: ${formatDay(doc.uploaded_at)} • Format: ${doc.content_type.split("/")[1]?.toUpperCase() || "DOC"} • Size: ${formatBytes(doc.size_bytes)}${doc.scan_status === "CLEAN" ? " • Scanned & Secure" : ""}`}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button variant="outline" size="sm" loading={isOpening} loadingLabel="Opening" onPress={onView}>
          View
        </Button>
        {rejected ? (
          <Button size="sm" onPress={onReupload}>
            Re-upload
          </Button>
        ) : null}
      </View>
      {error ? <Text className="text-xs text-danger-text">{error}</Text> : null}
      {rejected ? (
        <View className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <Text className="text-xs font-bold text-rose-950">Action Required: Document Needs Re-upload</Text>
          <Text className="mt-0.5 text-xs text-rose-800">
            {doc.review_reason || "This document could not be verified by Operations. Please re-upload a clear and valid copy."}
          </Text>
        </View>
      ) : doc.review_reason ? (
        <View className="rounded-xl border border-line bg-surface-sunken p-3">
          <Text className="text-xs text-text-secondary">{`Review Note: ${doc.review_reason}`}</Text>
        </View>
      ) : null}
    </View>
  );
}
