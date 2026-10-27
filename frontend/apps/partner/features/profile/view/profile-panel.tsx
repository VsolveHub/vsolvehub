"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Card, ErrorState, formatDate, Skeleton, useT, type Translator } from "@vsolve/ui";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Briefcase,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  ExternalLink,
  FileText,
  Lock,
  MapPin,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import {
  PARTNER_SUPPORT_HOURS_KEY,
  PARTNER_SUPPORT_PHONE,
  PARTNER_SUPPORT_PHONE_DISPLAY,
} from "@/features/support/contact";
import { isNoProfileYet, usePartnerProfile, type PartnerProfile } from "../queries";
import { EditLocationDialog } from "./edit-location-dialog";
import { EditNameDialog } from "./edit-name-dialog";

function approvalCopyFor(
  status: string,
  t: Translator["t"],
): { title: string; body: string; tone: "good" | "wait" | "stop" } | null {
  switch (status) {
    case "APPROVED":
      return {
        title: t("me.profile.approval.approved.title"),
        body: t("me.profile.approval.approved.body"),
        tone: "good",
      };
    case "SUBMITTED":
      return {
        title: t("me.profile.approval.submitted.title"),
        body: t("me.profile.approval.submitted.body"),
        tone: "wait",
      };
    case "UNDER_REVIEW":
      return {
        title: t("me.profile.approval.underReview.title"),
        body: t("me.profile.approval.underReview.body"),
        tone: "wait",
      };
    case "CHANGES_REQUIRED":
      return {
        title: t("me.profile.approval.changesRequired.title"),
        body: t("me.profile.approval.changesRequired.body"),
        tone: "stop",
      };
    case "DRAFT":
      return {
        title: t("me.profile.approval.draft.title"),
        body: t("me.profile.approval.draft.body"),
        tone: "stop",
      };
    case "REJECTED":
      return {
        title: t("me.profile.approval.rejected.title"),
        body: t("me.profile.approval.rejected.body"),
        tone: "stop",
      };
    default:
      return null;
  }
}

const TONE_CONFIG = {
  good: {
    container: "border-emerald-200/90 bg-emerald-50/70 text-emerald-950",
    iconBg: "bg-emerald-100/90 text-emerald-700 border border-emerald-200",
    badge: "border-emerald-300 bg-emerald-100 text-emerald-800",
    Icon: CheckCircle2,
    badgeText: "Verified & Active",
  },
  wait: {
    container: "border-amber-200/90 bg-amber-50/70 text-amber-950",
    iconBg: "bg-amber-100/90 text-amber-700 border border-amber-200",
    badge: "border-amber-300 bg-amber-100 text-amber-800",
    Icon: Clock,
    badgeText: "Pending Review",
  },
  stop: {
    container: "border-rose-200/90 bg-rose-50/70 text-rose-950",
    iconBg: "bg-rose-100/90 text-rose-700 border border-rose-200",
    badge: "border-rose-300 bg-rose-100 text-rose-800",
    Icon: AlertTriangle,
    badgeText: "Action Needed",
  },
};

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl px-4 py-4 sm:px-6 lg:px-8 sm:py-8">
      <div className="flex flex-col gap-4 sm:gap-6">{children}</div>
    </main>
  );
}

export function ProfilePanel() {
  const t = useT();
  const profileQuery = usePartnerProfile();
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);

  if (profileQuery.isPending) {
    return (
      <Page>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-24 rounded-lg" />
        </div>
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
      </Page>
    );
  }

  if (profileQuery.isError) {
    return (
      <Page>
        {isNoProfileYet(profileQuery.error) ? (
          <ErrorState
            severity="warning"
            title={t("me.profile.noProfileTitle")}
            message={t("me.profile.noProfileMessage")}
            actionLabel={t("me.profile.openApplication")}
            onAction={() => {
              window.location.href = "/apply";
            }}
          />
        ) : (
          <ErrorState
            title={t("me.profile.loadErrorTitle")}
            message={friendlyErrorMessage(profileQuery.error)}
            actionLabel={t("common.tryAgain")}
            onAction={() => void profileQuery.refetch()}
          />
        )}
      </Page>
    );
  }

  const profile = profileQuery.data;
  const approval = profile.approval_status;
  const status = approval === null ? null : approvalCopyFor(approval, t);
  const primaryCraft = profile.skills[0] ?? null;

  return (
    <Page>
      {/* Top Breadcrumb / Back Bar */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/me"
          className="group inline-flex min-h-10 items-center gap-2 rounded-xl text-sm font-semibold text-text-secondary hover:text-navy-900 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-action"
        >
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-surface border border-line group-hover:border-navy-300 transition-colors shadow-2xs shrink-0">
            <ArrowLeft className="h-4 w-4 text-text-secondary group-hover:text-navy-900" aria-hidden />
          </div>
          <span>{t("me.language.backToAccount")}</span>
        </Link>

        {approval === "APPROVED" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 shadow-2xs shrink-0">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            Verified Partner
          </span>
        )}
      </div>

      {/* Hero Partner Identity Card */}
      <Card className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4 sm:p-6 shadow-xs">
        {/* Soft background glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-navy-100/40 blur-2xl"
        />

        <div className="relative">
          {/* Top Row: Avatar + Details + Edit Action */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
              {/* Avatar with Status Indicator */}
              <div className="relative shrink-0">
                <span
                  aria-hidden
                  className="flex size-14 sm:size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-800 to-navy-950 text-xl sm:text-2xl font-extrabold text-white shadow-xs"
                >
                  {initialOf(profile)}
                </span>
                <span
                  title={approval === "APPROVED" ? "Active & Verified" : "Review Pending"}
                  className={`absolute -bottom-0.5 -right-0.5 size-3.5 sm:size-4 rounded-full border-2 border-surface ${
                    approval === "APPROVED" ? "bg-emerald-500 ring-2 ring-emerald-200/60" : "bg-amber-500"
                  }`}
                />
              </div>

              {/* Partner Details */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h1 className="truncate text-lg sm:text-xl font-bold text-navy-900 tracking-tight">
                    {profile.display_name}
                  </h1>
                  {approval === "APPROVED" && (
                    <ShieldCheck
                      className="size-4 shrink-0 text-emerald-600"
                      aria-label="Verified Partner"
                    />
                  )}
                </div>

                <div className="mt-1 flex items-center gap-1.5 flex-wrap text-xs sm:text-sm text-text-secondary font-medium">
                  <span className="flex items-center gap-1">
                    <Phone className="size-3.5 shrink-0 text-text-muted" aria-hidden />
                    <span>{profile.phone_number}</span>
                  </span>
                  <span className="inline-block rounded-md bg-surface-sunken border border-line px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                    Primary ID
                  </span>
                </div>
              </div>
            </div>

            {/* Edit Action Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingName(true)}
              className="rounded-xl border-line-strong/30 hover:border-navy-400 font-semibold gap-1.5 shadow-2xs shrink-0 min-h-9 px-3"
            >
              <Edit3 className="size-3.5 text-navy-700" aria-hidden />
              <span className="text-xs">{t("common.edit")}</span>
            </Button>
          </div>

          {/* Trade & Experience Row (spanning full width cleanly) */}
          {(primaryCraft || profile.experience_years > 0) && (
            <div className="mt-3.5 pt-3 border-t border-line/60 flex flex-wrap items-center gap-2">
              {primaryCraft && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1 text-xs font-semibold text-blue-800">
                  <Briefcase className="size-3 text-blue-600 shrink-0" aria-hidden />
                  <span className="truncate max-w-[240px] sm:max-w-none">{primaryCraft}</span>
                </span>
              )}
              {profile.experience_years > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-sunken px-2.5 py-1 text-xs font-medium text-text-secondary">
                  <Award className="size-3 text-text-muted shrink-0" aria-hidden />
                  <span>{profile.experience_years}y experience</span>
                </span>
              )}
            </div>
          )}

          {/* Credential Security Notice */}
          <div className="mt-3 pt-3 border-t border-line/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-text-secondary">
            <p className="flex items-start gap-1.5 leading-relaxed text-text-secondary">
              <Lock className="size-3.5 shrink-0 text-text-muted mt-0.5" aria-hidden />
              <span>{t("me.profile.phoneChangeNote")}</span>
            </p>
            <a
              href={`tel:${PARTNER_SUPPORT_PHONE}`}
              className="shrink-0 inline-flex items-center gap-1 font-semibold text-navy-700 hover:text-navy-900 hover:underline pt-0.5 sm:pt-0"
            >
              Call Support
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </div>
      </Card>

      {/* Approval & Verification Banner */}
      {status !== null && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-2xl border p-4 sm:p-5 shadow-2xs ${
            TONE_CONFIG[status.tone].container
          }`}
        >
          <div className="flex items-start gap-3.5">
            <div
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                TONE_CONFIG[status.tone].iconBg
              }`}
            >
              {(() => {
                const IconComponent = TONE_CONFIG[status.tone].Icon;
                return <IconComponent className="h-5 w-5" aria-hidden />;
              })()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-base font-bold leading-tight">{status.title}</p>
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    TONE_CONFIG[status.tone].badge
                  }`}
                >
                  {TONE_CONFIG[status.tone].badgeText}
                </span>
              </div>
              <p className="mt-1 text-sm opacity-90 leading-relaxed">{status.body}</p>
            </div>
          </div>

          {status.tone !== "good" && (
            <Link
              href="/me/documents"
              className="inline-flex min-h-10 items-center justify-center shrink-0 rounded-xl bg-navy-900 px-4 text-xs font-bold text-white hover:bg-navy-800 transition-colors shadow-xs"
            >
              View Application
            </Link>
          )}
        </div>
      )}

      {/* Key Micro-Stats Ribbon */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Experience */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-2xs">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100/80">
            <Award className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Experience
            </p>
            <p className="text-sm font-bold text-navy-900 mt-0.5">
              {profile.experience_years > 0
                ? t("me.profile.experienceYears", { count: profile.experience_years })
                : "Entry / Direct"}
            </p>
          </div>
        </div>

        {/* Member Since */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-2xs">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100/80">
            <Calendar className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {t("me.profile.withUsSinceLabel")}
            </p>
            <p className="text-sm font-bold text-navy-900 mt-0.5">
              {formatDate(profile.member_since)}
            </p>
          </div>
        </div>

        {/* Direct Payouts */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-2xs">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
              profile.has_payout_account
                ? "bg-emerald-50 text-emerald-600 border-emerald-100/80"
                : "bg-rose-50 text-rose-600 border-rose-100/80"
            }`}
          >
            <Wallet className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Bank Account
            </p>
            <p
              className={`text-sm font-bold mt-0.5 ${
                profile.has_payout_account ? "text-emerald-700" : "text-rose-600"
              }`}
            >
              {profile.has_payout_account ? "Linked & Ready" : "Pending Setup"}
            </p>
          </div>
        </div>
      </div>

      {/* Main Details Section */}
      <div className="flex flex-col gap-4">
        {/* Base Dispatch Location Card */}
        <Card className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100/80">
                <MapPin className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <h2 className="text-sm font-bold text-navy-900 leading-tight">
                  {t("me.profile.pickupLocationLabel")}
                </h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  Used for arrival distance estimation & rental ad prefill
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingLocation(true)}
              className="rounded-xl border-line-strong/30 hover:border-navy-400 font-semibold gap-1.5 shadow-2xs shrink-0"
            >
              {profile.default_location_text?.trim() ? (
                <>
                  <Edit3 className="h-3.5 w-3.5" aria-hidden />
                  {t("common.edit")}
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {t("me.profile.addAction")}
                </>
              )}
            </Button>
          </div>

          <div className="mt-3.5 rounded-xl border border-line/80 bg-surface-sunken p-3.5">
            {profile.default_location_text?.trim() ? (
              <div className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 shrink-0 text-navy-700 mt-0.5" aria-hidden />
                <span className="text-sm font-medium text-navy-900 leading-snug">
                  {profile.default_location_text}
                </span>
              </div>
            ) : (
              <p className="text-xs text-text-secondary italic">
                {t("me.profile.locationNotSet")}
              </p>
            )}
          </div>
        </Card>

        {/* Skills & Trades Card with Categories, Instant Search & Pagination */}
        <SkillsCard
          skills={profile.skills}
          label={t("me.profile.whatYouDoLabel")}
          hint="Work categories and trade capabilities verified on your account"
          emptyText={t("me.profile.notSetYet")}
        />

        {/* Coverage & Service Areas Card with Search & Pagination */}
        <ServiceAreasCard
          areas={profile.service_areas}
          label={t("me.profile.whereYouWorkLabel")}
          hint="Service hubs and city zones where you receive dispatches"
          emptyText={t("me.profile.notSetYet")}
        />

        {/* Banking & Settlement Card */}
        <Card className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100/80">
                <Wallet className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <h2 className="text-sm font-bold text-navy-900 leading-tight">
                  {t("me.profile.gettingPaidLabel")}
                </h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  Direct bank deposit configuration for job earnings
                </p>
              </div>
            </div>

            <Link
              href="/money"
              className="inline-flex items-center gap-1 text-xs font-bold text-navy-700 hover:text-navy-900 hover:underline"
            >
              Open Money
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          <div
            className={`flex items-start gap-3 rounded-xl border p-3.5 ${
              profile.has_payout_account
                ? "border-emerald-200 bg-emerald-50/60 text-emerald-950"
                : "border-rose-200 bg-rose-50/60 text-rose-950"
            }`}
          >
            {profile.has_payout_account ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold">{t("me.profile.bankReady")}</p>
                  <p className="text-xs text-emerald-800/90 mt-0.5">
                    Completed booking payments are automatically deposited into your verified bank account.
                  </p>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold">Action Needed: Bank Account Missing</p>
                  <p className="text-xs text-rose-800/90 mt-0.5">{t("me.profile.bankNotReady")}</p>
                  <Link
                    href="/money"
                    className="inline-flex items-center gap-1 mt-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition-colors shadow-2xs"
                  >
                    Add Bank Details
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Quick Management Shortcuts */}
        <Card className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-navy-700" aria-hidden />
            <h2 className="text-sm font-bold text-navy-900 leading-tight">
              {t("me.profile.manageHeading")}
            </h2>
          </div>

          <div className="overflow-hidden rounded-xl border border-line bg-surface divide-y divide-line/70">
            <Link
              href="/work/all"
              className="flex items-center justify-between p-3.5 hover:bg-surface-sunken transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-action"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                  <Briefcase className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-bold text-navy-900">{t("me.profile.myBookings")}</p>
                  <p className="text-[11px] text-text-secondary">View active, scheduled, and past customer jobs</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden />
            </Link>

            <Link
              href="/me/documents"
              className="flex items-center justify-between p-3.5 hover:bg-surface-sunken transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-action"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-50 text-purple-600 border border-purple-100">
                  <FileText className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-bold text-navy-900">{t("me.profile.myApplication")}</p>
                  <p className="text-[11px] text-text-secondary">Review uploaded KYC credentials and approval history</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden />
            </Link>

            <Link
              href="/money"
              className="flex items-center justify-between p-3.5 hover:bg-surface-sunken transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-action"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <Wallet className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-bold text-navy-900">{t("me.profile.myMoney")}</p>
                  <p className="text-[11px] text-text-secondary">View earnings passbook, daily balances, and settlements</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden />
            </Link>
          </div>
        </Card>

        {/* Partner Support / Helpline Card */}
        <div className="rounded-2xl border border-line bg-surface-sunken/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 border border-teal-100">
              <Phone className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-bold text-navy-900">Partner Helpline & Updates</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {PARTNER_SUPPORT_PHONE_DISPLAY} • {t(PARTNER_SUPPORT_HOURS_KEY)}
              </p>
            </div>
          </div>

          <a
            href={`tel:${PARTNER_SUPPORT_PHONE}`}
            className="inline-flex min-h-10 items-center justify-center shrink-0 rounded-xl border border-line bg-surface px-4 text-xs font-bold text-navy-900 hover:bg-surface-sunken transition-colors shadow-2xs"
          >
            Call Support
          </a>
        </div>
      </div>

      {/* Modals */}
      <EditNameDialog
        open={isEditingName}
        currentName={profile.display_name}
        onClose={() => setIsEditingName(false)}
      />
      <EditLocationDialog
        open={isEditingLocation}
        currentLocation={profile.default_location_text ?? ""}
        onClose={() => setIsEditingLocation(false)}
      />
    </Page>
  );
}

function initialOf(profile: PartnerProfile): string {
  return profile.display_name?.trim().charAt(0).toUpperCase() || "P";
}

function getSkillCategory(skill: string): string {
  const s = skill.toLowerCase();
  if (
    s.startsWith("ac ") ||
    s.includes(" ac ") ||
    s.includes("air condition") ||
    s.includes("refrigerator") ||
    s.includes("appliance") ||
    s.includes("microwave") ||
    s.includes("washing machine") ||
    s.includes("cooler") ||
    s.includes("geyser") ||
    s.includes("heater")
  ) {
    return "AC & Appliances";
  }
  if (
    s.includes("facial") ||
    s.includes("makeup") ||
    s.includes("mehendi") ||
    s.includes("hair") ||
    s.includes("wax") ||
    s.includes("skin") ||
    s.includes("acne") ||
    s.includes("beauty") ||
    s.includes("salon") ||
    s.includes("massage") ||
    s.includes("spa") ||
    s.includes("manicure") ||
    s.includes("pedicure") ||
    s.includes("bleach") ||
    s.includes("threading")
  ) {
    return "Beauty & Wellness";
  }
  if (
    s.includes("clean") ||
    s.includes("wash") ||
    s.includes("pest") ||
    s.includes("ant ") ||
    s.includes("cockroach") ||
    s.includes("termite") ||
    s.includes("disinfect") ||
    s.includes("sanitize") ||
    s.includes("deep clean") ||
    s.includes("sofa") ||
    s.includes("carpet")
  ) {
    return "Cleaning & Pest";
  }
  if (
    s.includes("alexa") ||
    s.includes("access point") ||
    s.includes("wifi") ||
    s.includes("cctv") ||
    s.includes("camera") ||
    s.includes("network") ||
    s.includes("smart home") ||
    s.includes("router") ||
    s.includes("computer") ||
    s.includes("laptop")
  ) {
    return "Smart Home & IT";
  }
  if (
    s.includes("plumb") ||
    s.includes("pipe") ||
    s.includes("tap") ||
    s.includes("motor") ||
    s.includes("leak") ||
    s.includes("drain") ||
    s.includes("electric") ||
    s.includes("wire") ||
    s.includes("switch") ||
    s.includes("inverter") ||
    s.includes("mcb")
  ) {
    return "Plumbing & Electrical";
  }
  if (
    s.includes("carpent") ||
    s.includes("wood") ||
    s.includes("door") ||
    s.includes("lock") ||
    s.includes("furniture") ||
    s.includes("repair") ||
    s.includes("paint") ||
    s.includes("mason") ||
    s.includes("ignition") ||
    s.includes("auto")
  ) {
    return "Repairs & Maintenance";
  }
  return "Specialized Services";
}

function SkillsCard({
  skills,
  label,
  hint,
  emptyText,
}: {
  skills: readonly string[];
  label: string;
  hint: string;
  emptyText: string;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  // Categorization
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    skills.forEach((s) => {
      const cat = getSkillCategory(s);
      map.set(cat, (map.get(cat) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [skills]);

  // Filtered skills
  const filtered = useMemo(() => {
    return skills.filter((s) => {
      const matchSearch =
        search.trim() === "" || s.toLowerCase().includes(search.toLowerCase().trim());
      const matchCategory = category === "ALL" || getSkillCategory(s) === category;
      return matchSearch && matchCategory;
    });
  }, [skills, search, category]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const hasFilter = search.trim() !== "" || category !== "ALL";

  return (
    <Card className="rounded-2xl border border-line bg-surface p-5 shadow-xs flex flex-col gap-3.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100/80">
            <Briefcase className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-bold text-navy-900 leading-tight">{label}</h2>
            <p className="text-xs text-text-secondary mt-0.5">{hint}</p>
          </div>
        </div>

        {skills.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 border border-purple-200/80 px-2.5 py-1 text-xs font-bold text-purple-800">
            <CheckCircle2 size={13} className="text-purple-600" />
            {skills.length} Verified
          </span>
        )}
      </div>

      {skills.length === 0 ? (
        <p className="text-xs text-text-secondary italic">{emptyText}</p>
      ) : (
        <>
          {/* Controls: Search and Filters (shown if skills > 6) */}
          {skills.length > 6 && (
            <div className="flex flex-col gap-2.5 pt-1">
              {/* Search Bar */}
              <div className="relative flex items-center">
                <Search size={15} className="absolute left-3 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Filter skills or services (e.g. AC, Facial, Cleaning)..."
                  className="w-full h-10 rounded-xl border border-line bg-surface-sunken pl-9 pr-9 text-xs text-navy-900 placeholder:text-text-muted focus:border-purple-500 focus:bg-surface focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                    aria-label="Clear search"
                    className="absolute right-2.5 grid h-6 w-6 place-items-center rounded-full text-text-muted hover:bg-surface hover:text-navy-900 transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Category Filter Pills (if multiple categories exist) */}
              {categories.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setCategory("ALL");
                      setPage(1);
                    }}
                    className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      category === "ALL"
                        ? "bg-purple-700 text-white shadow-xs"
                        : "bg-surface-sunken text-navy-800 hover:bg-surface border border-line/80"
                    }`}
                  >
                    All ({skills.length})
                  </button>

                  {categories.map(([catName, count]) => (
                    <button
                      key={catName}
                      type="button"
                      onClick={() => {
                        setCategory(catName);
                        setPage(1);
                      }}
                      className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold transition-all ${
                        category === catName
                          ? "bg-purple-700 text-white shadow-xs"
                          : "bg-surface-sunken text-navy-800 hover:bg-surface border border-line/80"
                      }`}
                    >
                      {catName} ({count})
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* List of Skills */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-line/80 bg-surface-sunken p-6 text-center flex flex-col items-center justify-center gap-2">
              <Search size={22} className="text-text-muted" />
              <p className="text-xs font-semibold text-navy-900">
                No skills matching &ldquo;{search}&rdquo;
              </p>
              <p className="text-[11px] text-text-secondary">
                Try searching for a different keyword or trade name.
              </p>
              {hasFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setCategory("ALL");
                    setPage(1);
                  }}
                  className="mt-1 text-xs font-bold text-purple-700 hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              {paginated.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 rounded-full border border-purple-200/90 bg-purple-50/80 px-3 py-1.5 text-xs font-semibold text-purple-950 shadow-2xs hover:bg-purple-100/90 transition-colors"
                >
                  <Check className="h-3 w-3 text-purple-600 shrink-0" aria-hidden />
                  <span>{skill}</span>
                </span>
              ))}
            </div>
          )}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="mt-1 pt-3 border-t border-line/70 flex items-center justify-between gap-3 text-xs flex-wrap">
              <span className="text-[11px] font-medium text-text-secondary">
                Showing {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length} skills
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-navy-900 hover:bg-surface-sunken disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                    if (
                      totalPages > 6 &&
                      p !== 1 &&
                      p !== totalPages &&
                      Math.abs(p - currentPage) > 1
                    ) {
                      if (p === 2 || p === totalPages - 1) {
                        return (
                          <span key={p} className="text-text-muted px-0.5 text-xs">
                            …
                          </span>
                        );
                      }
                      return null;
                    }

                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className={`h-7 min-w-7 px-1.5 rounded-md text-xs font-bold transition-colors ${
                          p === currentPage
                            ? "bg-purple-700 text-white shadow-2xs"
                            : "text-navy-800 hover:bg-surface-sunken"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-navy-900 hover:bg-surface-sunken disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ServiceAreasCard({
  areas,
  label,
  hint,
  emptyText,
}: {
  areas: readonly string[];
  label: string;
  hint: string;
  emptyText: string;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filtered = useMemo(() => {
    return areas.filter(
      (a) => search.trim() === "" || a.toLowerCase().includes(search.toLowerCase().trim()),
    );
  }, [areas, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <Card className="rounded-2xl border border-line bg-surface p-5 shadow-xs flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600 border border-teal-100/80">
            <Building2 className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-bold text-navy-900 leading-tight">{label}</h2>
            <p className="text-xs text-text-secondary mt-0.5">{hint}</p>
          </div>
        </div>

        {areas.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-200/80 px-2.5 py-1 text-xs font-bold text-teal-800">
            <MapPin size={12} className="text-teal-600" />
            {areas.length} Hubs
          </span>
        )}
      </div>

      {areas.length === 0 ? (
        <p className="text-xs text-text-secondary italic">{emptyText}</p>
      ) : (
        <>
          {areas.length > 6 && (
            <div className="relative flex items-center">
              <Search size={15} className="absolute left-3 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search operating areas / zones..."
                className="w-full h-10 rounded-xl border border-line bg-surface-sunken pl-9 pr-9 text-xs text-navy-900 placeholder:text-text-muted focus:border-teal-500 focus:bg-surface focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                  aria-label="Clear search"
                  className="absolute right-2.5 grid h-6 w-6 place-items-center rounded-full text-text-muted hover:bg-surface hover:text-navy-900 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-xs text-text-secondary italic py-2">
              No service areas matching &ldquo;{search}&rdquo;
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              {paginated.map((area) => (
                <span
                  key={area}
                  className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50/70 px-3 py-1.5 text-xs font-medium text-teal-950 shadow-2xs"
                >
                  <MapPin className="h-3 w-3 text-teal-600 shrink-0" aria-hidden />
                  <span>{area}</span>
                </span>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="pt-2 border-t border-line/70 flex items-center justify-between text-xs">
              <span className="text-[11px] font-medium text-text-secondary">
                Showing {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length} hubs
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface text-navy-900 disabled:opacity-40 transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-bold text-navy-900 px-1">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="grid h-7 w-7 place-items-center rounded-md border border-line bg-surface text-navy-900 disabled:opacity-40 transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
