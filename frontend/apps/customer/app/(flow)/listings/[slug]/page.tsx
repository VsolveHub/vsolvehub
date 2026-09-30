"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock } from "lucide-react";
import { friendlyErrorMessage } from "@vsolve/query";
import { Card, EmptyState, PHONE_COUNTRIES, toE164, toNationalDigits } from "@vsolve/ui";

import {
  applySchema,
  issuesToFieldErrors,
  serverFieldErrors,
  type ApplyFormState,
} from "@/features/listings/model";
import {
  fetchListing,
  fetchMyApplications,
  reportListing,
  submitListingApplication,
} from "@/features/listings/queries";
import { ApplySteps } from "@/features/listings/apply-steps";
import {
  JdSections,
  ReportDialog,
  RoleFacts,
  RoleHeader,
} from "@/features/listings/view";
import { useCustomerSession } from "@/features/session/queries";
import { LISTINGS_HREF } from "@/lib/routes";
import { useCanonicalSlug } from "@/lib/use-canonical-slug";

export default function ListingDetailPage() {
  // The page slug; links shared before slugs carry the listing id, which still resolves.
  const params = useParams<{ slug: string }>();
  const pageKey = params.slug;
  const queryClient = useQueryClient();
  const session = useCustomerSession();

  const { data: listing, isLoading, error } = useQuery({
    queryKey: ["listing", pageKey],
    queryFn: () => fetchListing(pageKey),
  });
  // Actions (apply, report, résumé upload) address the listing by its id.
  const listingId = listing?.id ?? "";
  useCanonicalSlug(LISTINGS_HREF, pageKey, listing?.slug, () =>
    queryClient.setQueryData(["listing", listing?.slug], listing),
  );

  const myApplicationsQuery = useQuery({
    queryKey: ["my-listing-applications"],
    queryFn: fetchMyApplications,
    enabled: session.isAuthenticated,
  });

  const activeApplication = (() => {
    const rows = (myApplicationsQuery.data ?? []) as Array<{
      listing?: string;
      status?: string;
      created_at?: string;
    }>;
    return rows.find(
      (row) => row.listing === listingId && row.status !== "WITHDRAWN" && row.status !== "EXPIRED",
    );
  })();

  const [form, setForm] = useState<ApplyFormState>(() => ({
    name: session.fullName || session.displayName || "",
    phone: toNationalDigits(session.phoneNumber ?? "", PHONE_COUNTRIES.IN),
    email: session.email || "",
    experience: "",
    cover_note: "",
    resume_url: "",
  }));

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("spam_or_abuse");
  const [reportDetail, setReportDetail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const apply = useMutation({
    mutationFn: () =>
      submitListingApplication(listingId, {
        ...form,
        phone: toE164(form.phone, PHONE_COUNTRIES.IN),
      }),
    onSuccess: () => {
      setFieldErrors({});
      queryClient.invalidateQueries({ queryKey: ["listing", pageKey] });
      queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
    },
    onError: (err) => setFieldErrors(serverFieldErrors(err)),
  });

  const report = useMutation({
    mutationFn: () => reportListing(listingId, reportReason, reportDetail),
    onSuccess: () => {
      setReportModalOpen(false);
      setReportDetail("");
    },
  });

  const updateField = (key: keyof ApplyFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => (current[key] ? { ...current, [key]: "" } : current));
  };

  const handleApply = () => {
    const parsed = applySchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(issuesToFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    apply.mutate();
  };

  if (isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-5xl items-center justify-center py-20 text-text-muted">
        <Clock className="size-6 animate-spin text-text-muted" />
        <span className="ml-2 text-sm">Loading listing details...</span>
      </main>
    );
  }

  if (error || !listing) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center py-16 text-center">
        <EmptyState
          title="Listing Not Available"
          description="This listing may have expired, closed, or is temporarily under review."
          action={
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 rounded-control bg-navy-900 px-4 py-2 text-sm font-semibold text-warm-0 hover:bg-navy-800"
            >
              <ArrowLeft className="size-4" /> Return to Job Board
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 pb-20 lg:pb-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card padding="lg" className="flex flex-col gap-6">
          <RoleHeader listing={listing} />
          <hr className="border-line" />
          <RoleFacts listing={listing} />
          <JdSections listing={listing} onOpenReport={() => setReportModalOpen(true)} />
        </Card>

        <ApplySteps
          listingId={listingId}
          posterName={listing.poster_name}
          isAuthenticated={session.isAuthenticated}
          isSuccess={apply.isSuccess}
          activeApplication={activeApplication}
          form={form}
          fieldErrors={fieldErrors}
          isPending={apply.isPending}
          serverError={
            apply.error && Object.keys(fieldErrors).length === 0
              ? friendlyErrorMessage(apply.error)
              : undefined
          }
          onFieldChange={updateField}
          onErrors={setFieldErrors}
          onSubmit={handleApply}
        />
      </div>

      {/* Sticky Apply Bar on mobile (< lg) */}
      {!activeApplication && !apply.isSuccess && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-surface/95 p-3 backdrop-blur-xs shadow-raised pb-safe">
          <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
            <div className="min-w-0">
              <p className="text-xs font-bold text-text truncate">
                {listing.title}
              </p>
              <p className="text-[11px] text-text-muted truncate">
                {listing.poster_name || "Verified Employer"}
              </p>
            </div>
            <a
              href="#apply-panel"
              className="inline-flex items-center justify-center rounded-control bg-action px-5 py-2 text-xs font-bold text-action-text shadow-card transition hover:bg-action-hover active:bg-action-active shrink-0"
            >
              Apply Now
            </a>
          </div>
        </div>
      )}

      <ReportDialog
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        reason={reportReason}
        onReasonChange={setReportReason}
        detail={reportDetail}
        onDetailChange={setReportDetail}
        onSubmit={() => report.mutate()}
        isPending={report.isPending}
        error={report.error ? (report.error as Error).message : undefined}
      />
    </main>
  );
}
