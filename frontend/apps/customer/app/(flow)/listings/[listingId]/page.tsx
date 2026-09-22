"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Clock } from "lucide-react";
import { PHONE_COUNTRIES, toNationalDigits } from "@vsolve/ui";

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
import {
  ApplyPanel,
  JdSections,
  ReportDialog,
  RoleFacts,
  RoleHeader,
} from "@/features/listings/view";
import { useCustomerSession } from "@/features/session/queries";

export default function ListingDetailPage() {
  const params = useParams<{ listingId: string }>();
  const listingId = params.listingId;
  const queryClient = useQueryClient();
  const session = useCustomerSession();

  const { data: listing, isLoading, error } = useQuery({
    queryKey: ["listing", listingId],
    queryFn: () => fetchListing(listingId),
  });

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
    mutationFn: () => submitListingApplication(listingId, form),
    onSuccess: () => {
      setFieldErrors({});
      queryClient.invalidateQueries({ queryKey: ["listing", listingId] });
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
      <main className="mx-auto flex w-full max-w-5xl items-center justify-center py-20 text-slate-400">
        <Clock className="h-6 w-6 animate-spin text-slate-400" />
        <span className="ml-2 text-sm">Loading listing details...</span>
      </main>
    );
  }

  if (error || !listing) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-12 w-12 text-rose-500" />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">Listing Not Available</h2>
        <p className="mt-1 text-sm text-slate-500">
          This listing may have expired, closed, or is temporarily under review.
        </p>
        <Link
          href="/listings"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Return to Job Board
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <RoleHeader listing={listing} />
          <hr className="border-slate-100" />
          <RoleFacts listing={listing} />
          <JdSections listing={listing} onOpenReport={() => setReportModalOpen(true)} />
        </section>

        <ApplyPanel
          key={session.userId || "anon"}
          posterName={listing.poster_name}
          isSuccess={apply.isSuccess}
          activeApplication={activeApplication}
          isAuthenticated={session.isAuthenticated}
          form={form}
          fieldErrors={fieldErrors}
          isPending={apply.isPending}
          serverError={
            apply.error && Object.keys(fieldErrors).length === 0
              ? (apply.error as Error).message
              : undefined
          }
          onFieldChange={updateField}
          onSubmit={handleApply}
        />
      </div>

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
