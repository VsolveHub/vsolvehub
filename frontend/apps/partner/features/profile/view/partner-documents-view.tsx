"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Card, ErrorState, formatDate, Skeleton, useT } from "@vsolve/ui";
import {
  AlertTriangle,
  ArrowLeft,
  Building,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Info,
  Lock,
  MapPin,
  Phone,
  Shield,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { usePartnerApplication } from "@/features/application/queries";
import {
  PARTNER_SUPPORT_HOURS,
  PARTNER_SUPPORT_PHONE,
  PARTNER_SUPPORT_PHONE_DISPLAY,
} from "@/features/support/contact";
import { usePartnerProfile } from "../queries";

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl px-4 py-5 sm:px-6 lg:px-8 sm:py-8">
      <div className="flex flex-col gap-5 sm:gap-6">{children}</div>
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "1 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function trackLabel(track: string): string {
  switch (track) {
    case "SERVICES":
      return "Services & Skilled Trades";
    case "RENTAL_OWNER":
      return "Equipment & Tool Rentals";
    case "STAY_HOST":
      return "Accommodation & Stay Host";
    case "EMPLOYER":
      return "Employer & Job Listings";
    default:
      return "Partner Registration";
  }
}

function documentKindMeta(kind: string): {
  title: string;
  subtitle: string;
  Icon: typeof CreditCard;
  colorClass: string;
  iconBg: string;
} {
  switch (kind) {
    case "GOVERNMENT_ID":
      return {
        title: "Government Photo Identification",
        subtitle: "Aadhaar Card, PAN Card, or Passport",
        Icon: CreditCard,
        colorClass: "text-blue-600",
        iconBg: "bg-blue-50 border-blue-100/80",
      };
    case "ADDRESS_PROOF":
      return {
        title: "Proof of Operating Address",
        subtitle: "Electricity bill, lease agreement, or property document",
        Icon: MapPin,
        colorClass: "text-amber-600",
        iconBg: "bg-amber-50 border-amber-100/80",
      };
    case "BANK":
      return {
        title: "Bank Passbook / Cancelled Cheque",
        subtitle: "Verified account for automated payout disbursement",
        Icon: Building,
        colorClass: "text-emerald-600",
        iconBg: "bg-emerald-50 border-emerald-100/80",
      };
    case "TAX":
      return {
        title: "Tax & GST Registration",
        subtitle: "GSTIN certificate or commercial tax registration",
        Icon: FileSpreadsheet,
        colorClass: "text-purple-600",
        iconBg: "bg-purple-50 border-purple-100/80",
      };
    case "BACKGROUND_CHECK":
      return {
        title: "Police Verification Clearance",
        subtitle: "Jurisdictional police background report",
        Icon: ShieldCheck,
        colorClass: "text-teal-600",
        iconBg: "bg-teal-50 border-teal-100/80",
      };
    default:
      return {
        title: "Trade & Supporting Document",
        subtitle: "Trade license, vocational certification, or credential",
        Icon: FileText,
        colorClass: "text-navy-700",
        iconBg: "bg-navy-50 border-navy-100/80",
      };
  }
}

function purposeLabel(purpose: string): string {
  switch (purpose) {
    case "partner_terms":
      return "V Solve Hub Partner Terms of Service";
    case "privacy_notice":
      return "Partner Privacy Policy & Data Processing Agreement";
    default:
      return purpose.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function PartnerDocumentsView() {
  const t = useT();
  const applicationQuery = usePartnerApplication();
  const profileQuery = usePartnerProfile();

  if (applicationQuery.isPending || profileQuery.isPending) {
    return (
      <Page>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-28 rounded-lg" />
        </div>
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </Page>
    );
  }

  if (applicationQuery.isError) {
    return (
      <Page>
        <div className="flex items-center">
          <Link
            href="/me/profile"
            className="group inline-flex min-h-11 items-center gap-2 rounded-xl px-2 -ml-2 text-sm font-semibold text-text-secondary hover:text-navy-900 transition-colors"
          >
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-surface border border-line">
              <ArrowLeft className="h-4 w-4" />
            </div>
            <span>Back to Profile</span>
          </Link>
        </div>
        <ErrorState
          title="We could not load your application records"
          message={friendlyErrorMessage(applicationQuery.error)}
          actionLabel={t("common.tryAgain")}
          onAction={() => void applicationQuery.refetch()}
        />
      </Page>
    );
  }

  const app = applicationQuery.data;
  const profile = profileQuery.data;
  const isApproved = app.status === "APPROVED";
  const activeDocuments = app.documents.filter((d) => d.status !== "SUPERSEDED");

  return (
    <Page>
      {/* Top Header & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/me/profile"
          className="group inline-flex min-h-11 items-center gap-2 rounded-xl px-2 -ml-2 text-sm font-semibold text-text-secondary hover:text-navy-900 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-action"
        >
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-surface border border-line group-hover:border-navy-300 transition-colors shadow-2xs">
            <ArrowLeft className="h-4 w-4 text-text-secondary group-hover:text-navy-900" aria-hidden />
          </div>
          <span>Back to Profile</span>
        </Link>

        {isApproved && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 shadow-2xs">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            Verified & Compliant
          </span>
        )}
      </div>

      {/* Main Title Banner */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-navy-900 tracking-tight">
          Application & KYC Documents
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Official registration records, identity proofs, and regulatory verification on file.
        </p>
      </div>

      {/* Application Master File Card */}
      <Card className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-navy-800 to-navy-950 text-white shadow-xs">
              <UserCheck className="h-6 w-6 text-white" aria-hidden />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-navy-900 leading-tight">
                  {app.display_name || profile?.display_name || "Partner Application"}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  {app.status}
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                {trackLabel(app.track)} • Reference #{app.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-sunken px-3 py-1.5 text-xs font-medium text-navy-900">
              <Lock className="h-3.5 w-3.5 text-text-muted" />
              Locked for Compliance
            </span>
          </div>
        </div>

        {/* Timeline Grid */}
        <div className="mt-5 pt-4 border-t border-line/70 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">
              Track
            </p>
            <p className="font-bold text-navy-900 mt-0.5">{trackLabel(app.track)}</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">
              Experience
            </p>
            <p className="font-bold text-navy-900 mt-0.5">
              {app.experience_years > 0 ? `${app.experience_years} Years` : "Entry Level"}
            </p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">
              Created
            </p>
            <p className="font-bold text-navy-900 mt-0.5">{formatDate(app.created_at)}</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wider text-text-muted text-[10px]">
              Status
            </p>
            <p className="font-bold text-emerald-700 mt-0.5">Approved & Active</p>
          </div>
        </div>
      </Card>

      {/* Uploaded Verification Documents Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
              <FileCheck2 className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-bold text-navy-900 leading-tight">
                Verified Documents ({activeDocuments.length})
              </h2>
              <p className="text-xs text-text-secondary">
                Securely encrypted and verified by Operations
              </p>
            </div>
          </div>
        </div>

        {activeDocuments.length === 0 ? (
          <Card className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface-sunken text-text-muted">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-bold text-navy-900">No documents on file</h3>
            <p className="mt-1 text-xs text-text-secondary max-w-sm mx-auto">
              No verification documents have been uploaded to this account yet.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {activeDocuments.map((doc) => {
              const meta = documentKindMeta(doc.kind);
              const Icon = meta.Icon;
              const isDocApproved = doc.status === "APPROVED";
              const isDocPending = doc.status === "PENDING";
              const isDocRejected = doc.status === "REJECTED";

              return (
                <Card
                  key={doc.id}
                  className="rounded-2xl border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${meta.iconBg}`}
                      >
                        <Icon className={`h-5 w-5 ${meta.colorClass}`} aria-hidden />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-navy-900 leading-tight">
                            {meta.title}
                          </h3>

                          {isDocApproved && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              Approved
                            </span>
                          )}

                          {isDocPending && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                              <Clock className="h-3 w-3 text-amber-600" />
                              Under Review
                            </span>
                          )}

                          {isDocRejected && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                              <AlertTriangle className="h-3 w-3 text-rose-600" />
                              Rejected
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-text-secondary mt-1">{meta.subtitle}</p>

                        {/* File Details Tag Row */}
                        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-text-muted flex-wrap">
                          <span>Uploaded: {formatDate(doc.uploaded_at)}</span>
                          <span>•</span>
                          <span>Format: {doc.content_type.split("/")[1]?.toUpperCase() || "DOC"}</span>
                          <span>•</span>
                          <span>Size: {formatBytes(doc.size_bytes)}</span>
                          {doc.scan_status === "CLEAN" && (
                            <>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                                Scanned & Secure
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 self-start sm:self-center">
                      <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-sunken px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
                        <Lock className="h-3 w-3 text-text-muted" />
                        Verified on Record
                      </span>
                    </div>
                  </div>

                  {/* Review reason if any */}
                  {doc.review_reason && (
                    <div className="mt-3.5 rounded-xl border border-line/70 bg-surface-sunken p-3 text-xs text-text-secondary flex items-start gap-2">
                      <Info className="h-4 w-4 text-navy-600 shrink-0 mt-0.5" aria-hidden />
                      <div>
                        <strong className="font-semibold text-navy-900">Review Note: </strong>
                        <span>{doc.review_reason}</span>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Platform Legal Consents Card */}
      <Card className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
        <div className="flex items-center gap-3 mb-3.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100/80">
            <Shield className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-bold text-navy-900 leading-tight">
              Signed Agreements & Legal Consents ({app.consents.length})
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Digital contracts and terms acknowledged on this partner profile
            </p>
          </div>
        </div>

        {app.consents.length === 0 ? (
          <p className="text-xs text-text-secondary italic">No legal agreements recorded.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line divide-y divide-line/70">
            {app.consents.map((consent) => (
              <div
                key={consent.id}
                className="flex items-center justify-between p-3.5 bg-surface hover:bg-surface-sunken/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-navy-900 truncate">
                      {purposeLabel(consent.purpose)}
                    </p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Version {consent.document_version} • Accepted on{" "}
                      {formatDate(consent.accepted_at)}
                    </p>
                  </div>
                </div>

                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Active
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Document Updates & Partner Helpline Card */}
      <div className="rounded-2xl border border-line bg-surface-sunken/60 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
            <Phone className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-bold text-navy-900">Need to update verified documents?</h3>
            <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
              To renew an expired ID or update bank certificates, contact the Partner Operations
              desk at <strong className="font-semibold">{PARTNER_SUPPORT_PHONE_DISPLAY}</strong> ({PARTNER_SUPPORT_HOURS}).
            </p>
          </div>
        </div>

        <a
          href={`tel:${PARTNER_SUPPORT_PHONE}`}
          className="inline-flex min-h-11 items-center justify-center shrink-0 rounded-xl bg-navy-900 px-5 text-xs font-bold text-white hover:bg-navy-800 transition-colors shadow-xs"
        >
          Call Support Desk
        </a>
      </div>
    </Page>
  );
}
